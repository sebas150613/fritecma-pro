import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { HttpError } from "../lib/http-error.js";
import { createJsonFileStore } from "../lib/json-store.js";
import { getEffectiveEmailSettings } from "./platform-settings-service.js";

const deliveryLogStore = createJsonFileStore("email-deliveries.json", []);

let cachedTransporter = null;
let cachedTransporterFingerprint = "";

const isProductionLikeEnv = () =>
  process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";

/**
 * Stub sin SMTP solo cuando no estamos en entorno production-like, o cuando
 * se fuerza explícitamente (p. ej. tests locales). En production-like, si el
 * correo está habilitado y falta SMTP, se rechaza con 503 para no simular éxito.
 */
const allowStubWithoutSmtp = () => {
  if (process.env.APP_EMAIL_STUB_WITHOUT_SMTP === "true") {
    return true;
  }
  if (process.env.APP_EMAIL_STUB_WITHOUT_SMTP === "false") {
    return false;
  }
  return !isProductionLikeEnv();
};

const hasSmtpConfig = (settings) =>
  Boolean(settings?.smtp_host && settings?.email_from);

const normalizeRecipients = (value) => {
  if (!value) {
    return [];
  }

  const rawItems = Array.isArray(value) ? value : [value];

  return rawItems
    .flatMap((item) =>
      String(item)
        .split(",")
        .map((part) => part.trim())
    )
    .filter(Boolean);
};

const buildAttachmentMeta = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { attachment_count: 0, attachment_filenames: [] };
  }

  const attachment_filenames = attachments
    .map((a) => {
      if (!a || typeof a !== "object") {
        return null;
      }
      if (a.filename) {
        return String(a.filename);
      }
      if (a.path) {
        return pathBasename(String(a.path));
      }
      return "(unnamed)";
    })
    .filter(Boolean);

  return {
    attachment_count: attachments.length,
    attachment_filenames: attachment_filenames.slice(0, 20),
  };
};

const pathBasename = (p) => {
  const normalized = String(p).replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
};

/**
 * Metadatos seguros para auditoría (sin cuerpo HTML, texto completo ni adjuntos).
 */
const buildSafeDeliveryMeta = (payload, message) => {
  const textSource = payload.body || payload.text || "";
  const htmlSource = payload.html || "";

  return {
    recipients: {
      to_count: normalizeRecipients(payload.to).length,
      cc_count: normalizeRecipients(payload.cc).length,
      bcc_count: normalizeRecipients(payload.bcc).length,
    },
    subject: message.subject || "(sin asunto)",
    content: {
      has_text: Boolean(textSource),
      has_html: Boolean(htmlSource),
      text_byte_length: Buffer.byteLength(String(textSource), "utf8"),
      html_byte_length: Buffer.byteLength(String(htmlSource), "utf8"),
    },
    ...buildAttachmentMeta(payload.attachments),
  };
};

const appendDeliveryLog = async (entry) => {
  const current = await deliveryLogStore.read();
  const next = Array.isArray(current) ? current : [];
  next.push({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...entry,
  });
  await deliveryLogStore.write(next.slice(-200));
};

const getTransporter = async (settings) => {
  const fingerprint = JSON.stringify({
    host: settings.smtp_host || "",
    port: Number(settings.smtp_port || 587),
    secure: settings.smtp_secure === true,
    user: settings.smtp_user || "",
    pass: settings.smtp_pass || "",
  });

  if (!cachedTransporter || cachedTransporterFingerprint !== fingerprint) {
    cachedTransporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: Number(settings.smtp_port || 587),
      secure: settings.smtp_secure === true,
      auth: settings.smtp_user
        ? {
            user: settings.smtp_user,
            pass: settings.smtp_pass,
          }
        : undefined,
    });
    cachedTransporterFingerprint = fingerprint;
  }

  return cachedTransporter;
};

const buildFromHeader = (emailSettings) => {
  const addr = emailSettings.email_from || "";
  const name = String(emailSettings.email_from_name || "").trim();
  if (name && addr) {
    return `${name} <${addr}>`;
  }
  return addr;
};

/** Cabecera From por envío (p. ej. pedidos empresa); si no hay datos, SMTP global */
const buildFromHeaderForPayload = (payload, emailSettings) => {
  const addr = String(payload.fromEmail || "").trim();
  if (addr) {
    const name = String(payload.fromName || "").trim();
    if (name) {
      return `${name} <${addr}>`;
    }
    return addr;
  }
  return buildFromHeader(emailSettings);
};

export const sendEmail = async (payload = {}) => {
  const emailSettings = await getEffectiveEmailSettings();

  const to = normalizeRecipients(payload.to);
  const cc = normalizeRecipients(payload.cc);
  const bcc = normalizeRecipients(payload.bcc);

  if (emailSettings.email_enabled === false) {
    const disabledResult = {
      success: true,
      queued: false,
      provider: "disabled",
      message_id: randomUUID(),
    };
    await appendDeliveryLog({
      provider: "disabled",
      status: "skipped",
      ...buildSafeDeliveryMeta(payload, {
        subject: payload.subject || "(sin asunto)",
      }),
      result: disabledResult,
    });
    return disabledResult;
  }

  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    throw new HttpError(400, 'Email payload requires at least one recipient in "to", "cc" or "bcc".');
  }

  const fromHeader = buildFromHeaderForPayload(payload, emailSettings);
  let replyToEffective;
  if (Object.prototype.hasOwnProperty.call(payload, "replyTo")) {
    const explicit = String(payload.replyTo ?? "").trim();
    replyToEffective =
      explicit || String(emailSettings.email_reply_to || "").trim() || undefined;
  } else {
    replyToEffective = String(emailSettings.email_reply_to || "").trim() || undefined;
  }

  const message = {
    from: fromHeader,
    replyTo: replyToEffective,
    to: to.length > 0 ? to.join(", ") : undefined,
    cc: cc.length > 0 ? cc.join(", ") : undefined,
    bcc: bcc.length > 0 ? bcc.join(", ") : undefined,
    subject: payload.subject || "(sin asunto)",
    text: payload.body || payload.text || undefined,
    html: payload.html || undefined,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : undefined,
  };

  const safeMeta = buildSafeDeliveryMeta(payload, message);

  if (!hasSmtpConfig(emailSettings)) {
    if (!allowStubWithoutSmtp()) {
      throw new HttpError(
        503,
        "Outbound email is enabled but SMTP is not configured. Configure SMTP in the owner panel or set environment variables."
      );
    }

    const fallbackResult = {
      success: true,
      queued: true,
      provider: "stub",
      message_id: randomUUID(),
      note: "No SMTP configured; message not sent (development/stub mode).",
    };

    await appendDeliveryLog({
      provider: "stub",
      status: "queued_stub",
      ...safeMeta,
      result: {
        success: fallbackResult.success,
        queued: fallbackResult.queued,
        provider: fallbackResult.provider,
        message_id: fallbackResult.message_id,
      },
    });

    return fallbackResult;
  }

  if (!fromHeader) {
    throw new HttpError(500, "Email from address is required before sending mail.");
  }

  const transporter = await getTransporter(emailSettings);
  const info = await transporter.sendMail(message);
  const result = {
    success: true,
    queued: false,
    provider: "smtp",
    message_id: info.messageId || randomUUID(),
    accepted: Array.isArray(info.accepted) ? info.accepted : [],
    rejected: Array.isArray(info.rejected) ? info.rejected : [],
  };

  await appendDeliveryLog({
    provider: "smtp",
    status: "sent",
    ...safeMeta,
    result: {
      success: result.success,
      queued: result.queued,
      provider: result.provider,
      message_id: result.message_id,
      accepted_count: Array.isArray(result.accepted) ? result.accepted.length : 0,
      rejected_count: Array.isArray(result.rejected) ? result.rejected.length : 0,
    },
  });

  return result;
};
