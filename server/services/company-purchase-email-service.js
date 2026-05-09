import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { HttpError } from "../lib/http-error.js";
import { createJsonFileStore } from "../lib/json-store.js";

const deliveryLogStore = createJsonFileStore("company-purchase-email-deliveries.json", []);

/**
 * Solo para smoke/tests locales: simula envío sin conectar (no usa SMTP global FRIGEST).
 */
export const allowCompanyPurchaseSmtpStub = () =>
  process.env.APP_COMPANY_PURCHASE_SMTP_STUB === "true";

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

const buildSafeLogMeta = (payload, message) => ({
  recipients: {
    to_count: normalizeRecipients(payload.to).length,
  },
  subject: message.subject || "(sin asunto)",
  attachment_count: Array.isArray(payload.attachments) ? payload.attachments.length : 0,
});

const appendDeliveryLog = async (entry) => {
  try {
    const current = await deliveryLogStore.read();
    const next = Array.isArray(current) ? current : [];
    next.push({
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...entry,
    });
    await deliveryLogStore.write(next.slice(-200));
  } catch {
    /* no bloquear envío por fallo de log */
  }
};

const buildFromHeader = (settings) => {
  const addr = String(settings.pedidos_email_from || "").trim();
  const name = String(settings.pedidos_email_from_name || "").trim();
  if (name && addr) {
    return `${name} <${addr}>`;
  }
  return addr;
};

/**
 * Envío de correos de pedidos a proveedores usando únicamente SMTP configurado en OrganizationSettings de la empresa.
 * No usa getEffectiveEmailSettings ni SMTP global de plataforma.
 */
export async function sendCompanyPurchaseOrderMail(organizationSettings, payload = {}) {
  const to = normalizeRecipients(payload.to);
  if (to.length === 0) {
    throw new HttpError(400, 'Se requiere al menos un destinatario en "to".');
  }

  const host = String(organizationSettings?.pedidos_smtp_host || "").trim();
  const port = Number(organizationSettings?.pedidos_smtp_port || 587);
  const secure = organizationSettings?.pedidos_smtp_secure === true;
  const smtpUser = String(organizationSettings?.pedidos_smtp_user || "").trim();
  const smtpPass = String(organizationSettings?.pedidos_smtp_pass || "");

  const fromHeader = buildFromHeader(organizationSettings);
  const replyTo =
    String(organizationSettings?.pedidos_reply_to || "").trim() ||
    String(organizationSettings?.pedidos_email_from || "").trim() ||
    undefined;

  const message = {
    from: fromHeader,
    replyTo,
    to: to.join(", "),
    subject: payload.subject || "(sin asunto)",
    text: payload.body || payload.text || undefined,
    html: payload.html || undefined,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : undefined,
  };

  const safeMeta = buildSafeLogMeta(payload, message);

  if (!fromHeader) {
    throw new HttpError(422, "Falta el remitente de pedidos (email de la empresa).");
  }

  if (allowCompanyPurchaseSmtpStub()) {
    const stubResult = {
      success: true,
      queued: false,
      provider: "company_smtp_stub",
      message_id: randomUUID(),
      note: "APP_COMPANY_PURCHASE_SMTP_STUB: sin conexión SMTP real.",
    };
    await appendDeliveryLog({
      provider: "company_smtp_stub",
      status: "sent_stub",
      ...safeMeta,
      result: {
        success: stubResult.success,
        provider: stubResult.provider,
        message_id: stubResult.message_id,
      },
    });
    return stubResult;
  }

  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new HttpError(422, "SMTP de pedidos incompleto (servidor/puerto).");
  }

  if (smtpUser && !smtpPass) {
    throw new HttpError(
      422,
      "El SMTP de pedidos requiere contraseña cuando hay usuario configurado."
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  try {
    const info = await transporter.sendMail(message);
    const result = {
      success: true,
      queued: false,
      provider: "company_smtp",
      message_id: info.messageId || randomUUID(),
    };
    await appendDeliveryLog({
      provider: "company_smtp",
      status: "sent",
      ...safeMeta,
      result: {
        success: result.success,
        provider: result.provider,
        message_id: result.message_id,
      },
    });
    return result;
  } catch (err) {
    await appendDeliveryLog({
      provider: "company_smtp",
      status: "error",
      ...safeMeta,
      result: {
        success: false,
        error_message: err?.message ? String(err.message).slice(0, 500) : "send_failed",
      },
    });
    throw err;
  }
}

const PEDIDOS_SMTP_CONFIG_MSG =
  "Configura el SMTP de pedidos de esta empresa antes de tramitar pedidos.";

/**
 * Valida ajustes de OrganizationSettings (con contraseña en servidor) antes de tramitar.
 */
export function assertPedidosSmtpReadyForSend(settings) {
  if (!settings || settings.pedidos_smtp_enabled !== true) {
    throw new HttpError(422, PEDIDOS_SMTP_CONFIG_MSG);
  }
  const host = String(settings.pedidos_smtp_host || "").trim();
  const port = Number(settings.pedidos_smtp_port);
  const from = String(settings.pedidos_email_from || "").trim();
  if (!host || !Number.isFinite(port) || port <= 0 || !from) {
    throw new HttpError(422, PEDIDOS_SMTP_CONFIG_MSG);
  }
  const user = String(settings.pedidos_smtp_user || "").trim();
  const hasPass =
    typeof settings.pedidos_smtp_pass === "string" && settings.pedidos_smtp_pass.length > 0;
  if (user && !hasPass) {
    throw new HttpError(422, PEDIDOS_SMTP_CONFIG_MSG);
  }
}
