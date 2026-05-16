import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { createJsonFileStore } from "../lib/json-store.js";
import { HttpError } from "../lib/http-error.js";
import { serverConfig } from "../config.js";
import { sendEmail } from "./email-service.js";

const emailVerificationStore = createJsonFileStore("auth-email-verifications.json", []);
const passwordResetStore = createJsonFileStore("auth-password-resets.json", []);
const inviteActivationOtpStore = createJsonFileStore("auth-invite-activation-otps.json", []);
const inviteOtpNonceStore = createJsonFileStore("auth-invite-otp-nonces.json", []);
const inviteActivationAuditStore = createJsonFileStore("auth-invite-activation-audit.json", []);

const EMAIL_VERIFICATION_TTL_HOURS = 48;
const PASSWORD_RESET_TTL_MINUTES = 60;
const INVITE_OTP_TTL_MS = 10 * 60 * 1000;
const INVITE_OTP_MAX_ATTEMPTS = 3;
const INVITE_OTP_NONCE_TTL_MS = 15 * 60 * 1000;

const addHours = (date, hours) => {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next.toISOString();
};

const addMinutes = (date, minutes) => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next.toISOString();
};

const pruneExpiredTokens = (items = []) => {
  const now = Date.now();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const expiresAt = new Date(item?.expires_at || 0).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
};

const createTokenRecord = ({
  userId,
  email,
  purpose,
  expiresAt,
}) => ({
  id: randomUUID(),
  token: randomUUID(),
  user_id: userId,
  email: String(email || "").trim().toLowerCase(),
  purpose,
  created_at: new Date().toISOString(),
  expires_at: expiresAt,
});

const readTokenStore = async (store) => pruneExpiredTokens(await store.read());

const writeTokenStore = async (store, items) => store.write(pruneExpiredTokens(items));

export const createEmailVerificationToken = async ({ userId, email }) => {
  const current = await readTokenStore(emailVerificationStore);
  const next = current.filter((item) => item.user_id !== userId);
  const record = createTokenRecord({
    userId,
    email,
    purpose: "email_verification",
    expiresAt: addHours(new Date(), EMAIL_VERIFICATION_TTL_HOURS),
  });
  next.push(record);
  await writeTokenStore(emailVerificationStore, next);
  return record;
};

export const consumeEmailVerificationToken = async (token) => {
  const current = await readTokenStore(emailVerificationStore);
  const match = current.find((item) => item.token === token) || null;
  await writeTokenStore(
    emailVerificationStore,
    current.filter((item) => item.token !== token)
  );
  return match;
};

export const createPasswordResetToken = async ({ userId, email }) => {
  const current = await readTokenStore(passwordResetStore);
  const next = current.filter((item) => item.user_id !== userId);
  const record = createTokenRecord({
    userId,
    email,
    purpose: "password_reset",
    expiresAt: addMinutes(new Date(), PASSWORD_RESET_TTL_MINUTES),
  });
  next.push(record);
  await writeTokenStore(passwordResetStore, next);
  return record;
};

export const consumePasswordResetToken = async (token) => {
  const current = await readTokenStore(passwordResetStore);
  const match = current.find((item) => item.token === token) || null;
  await writeTokenStore(
    passwordResetStore,
    current.filter((item) => item.token !== token)
  );
  return match;
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildPremiumEmailDocument = ({
  preheader = "",
  title,
  paragraphs = [],
  ctaLabel = "",
  ctaHref = "",
  secondaryNote = "",
  footerLine = "Este correo ha sido enviado automáticamente por FRIGEST.",
}) => {
  const safePre = escapeHtml(preheader);
  const safeTitle = escapeHtml(title);
  const paraHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.6;">${p}</p>`)
    .join("");
  const ctaBlock =
    ctaLabel && ctaHref
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:14px;background:linear-gradient(135deg,#0f766e 0%,#0b4f54 100%);">
      <a href="${ctaHref}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">
        ${escapeHtml(ctaLabel)}
      </a>
    </td>
  </tr>
</table>`
      : "";
  const secondary = secondaryNote
    ? `<p style="margin:0;color:#64748b;font-size:13px;line-height:1.55;">${secondaryNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${safePre}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:28px 28px 8px;background:linear-gradient(135deg,#0f766e 0%,#0b4f54 100%);color:#f8fafc;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">FRIGEST · Gestión Técnica</p>
              <h1 style="margin:12px 0 0;font-size:24px;line-height:1.25;font-weight:700;">${safeTitle}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              ${paraHtml}
              ${ctaBlock}
              ${secondary}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;">
              <p style="margin:0;padding-top:20px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">${escapeHtml(footerLine)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const formatInvitationRoleEs = (role) => {
  const key = String(role || "")
    .trim()
    .toLowerCase();
  const map = {
    admin: "Administrador",
    oficina: "Oficina",
    tecnico: "Técnico",
    ayudante: "Ayudante",
    encargado: "Encargado",
    superadmin: "Administrador global",
  };
  return map[key] || key || "Usuario";
};

export const sendVerificationEmail = async ({
  user,
  organizationName,
  verificationUrl,
}) =>
  sendEmail({
    to: user.email,
    subject: `Verifica tu acceso a ${organizationName || "FRIGEST"}`,
    text: [
      `Hola ${user.full_name || user.email},`,
      "",
      `Verifica tu email para activar completamente tu acceso a ${organizationName || "FRIGEST"}.`,
      verificationUrl,
      "",
      "Si no has solicitado este acceso, ignora este mensaje.",
    ].join("\n"),
    html: `
      <p>Hola ${user.full_name || user.email},</p>
      <p>Verifica tu email para activar completamente tu acceso a <strong>${organizationName || "FRIGEST"}</strong>.</p>
      <p><a href="${verificationUrl}">Verificar email</a></p>
      <p>Si no has solicitado este acceso, ignora este mensaje.</p>
    `,
  });

export const sendPasswordResetEmail = async ({ user, resetUrl }) => {
  const greeting = escapeHtml(String(user.full_name || user.email || "usuario"));
  const html = buildPremiumEmailDocument({
    preheader: "Restablece el acceso a tu cuenta FRIGEST.",
    title: "Restablece tu contraseña",
    paragraphs: [
      `Hola <strong>${greeting}</strong>,`,
      "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en FRIGEST.",
      "Pulsa el botón para elegir una contraseña nueva. El enlace caduca en breve por seguridad.",
    ],
    ctaLabel: "Restablecer contraseña",
    ctaHref: resetUrl,
    secondaryNote:
      "Si no has solicitado este cambio, puedes ignorar este correo con tranquilidad. Nadie modificará tu acceso sin usar este enlace.",
  });

  return sendEmail({
    to: user.email,
    subject: "Restablece tu contraseña en FRIGEST",
    text: [
      `Hola ${user.full_name || user.email},`,
      "",
      "Hemos recibido una solicitud para restablecer tu contraseña en FRIGEST.",
      resetUrl,
      "",
      "Si no has solicitado el cambio, ignora este mensaje.",
    ].join("\n"),
    html,
  });
};

export const sendInvitationEmail = async ({
  to,
  organizationName,
  invitedBy,
  role,
  activationUrl,
  loginUrl,
  requiresActivation,
}) => {
  const orgLabel = String(organizationName || "").trim() || "FRIGEST";
  const roleEs = formatInvitationRoleEs(role);
  const subject = orgLabel && orgLabel !== "FRIGEST"
    ? `Invitación para acceder a ${orgLabel}`
    : "Activa tu acceso a FRIGEST";

  const invitedLine = invitedBy
    ? `Te ha invitado <strong>${escapeHtml(invitedBy)}</strong>.`
    : "Has recibido una invitación para unirte a la plataforma.";

  const href = requiresActivation ? activationUrl : loginUrl;
  const ctaLabel = requiresActivation ? "Activar mi acceso" : "Ir al inicio de sesión";

  const html = buildPremiumEmailDocument({
    preheader: requiresActivation
      ? `Confirma tu email y crea tu contraseña para ${orgLabel}.`
      : `Accede a ${orgLabel} con tu cuenta FRIGEST.`,
    title: "Activa tu cuenta",
    paragraphs: [
      invitedLine,
      `Has sido invitado a acceder a <strong>${escapeHtml(orgLabel)}</strong> con el rol <strong>${escapeHtml(roleEs)}</strong>.`,
      "Por seguridad, tendrás que confirmar tu email con un código de un solo uso antes de crear tu contraseña.",
    ],
    ctaLabel,
    ctaHref: href,
    secondaryNote:
      "Si no esperabas esta invitación, puedes ignorar este correo. Nadie podrá activar el acceso sin controlar la bandeja de entrada invitada.",
  });

  const textLines = [
    `Has sido invitado a ${orgLabel} con el rol ${roleEs}.`,
    invitedBy ? `Invitación enviada por ${invitedBy}.` : "",
    "",
    requiresActivation
      ? "Por seguridad, confirma tu email con el código que recibirás al solicitar la activación, y luego crea tu contraseña."
      : "Ya tienes cuenta. Accede desde el enlace de inicio de sesión.",
    "",
    requiresActivation ? activationUrl : loginUrl,
    "",
    "Si no esperabas esta invitación, ignora este mensaje.",
  ].filter(Boolean);

  return sendEmail({
    to,
    subject,
    text: textLines.join("\n"),
    html,
  });
};

const getInviteOtpPepper = () => {
  const s = String(serverConfig.inviteOtpSecret || "").trim();
  if (!s) {
    throw new HttpError(
      500,
      "Falta configuración de seguridad para invitaciones (secreto de plataforma)."
    );
  }
  return s;
};

const normalizeProfileBindingInput = (firstName, lastName, dni) =>
  [
    String(firstName || "")
      .trim()
      .toLowerCase(),
    String(lastName || "")
      .trim()
      .toLowerCase(),
    String(dni || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase(),
  ].join("|");

const computeInviteProfileBindingHash = (firstName, lastName, dni) => {
  const pepper = getInviteOtpPepper();
  return createHmac("sha256", pepper)
    .update(`profile|${normalizeProfileBindingInput(firstName, lastName, dni)}`)
    .digest("hex");
};

const hashInviteOtpCode = (salt, code) => {
  const pepper = getInviteOtpPepper();
  return createHmac("sha256", pepper)
    .update(`otp|${salt}|${String(code).trim()}`)
    .digest("hex");
};

const writeInviteOtps = async (items) => {
  const arr = Array.isArray(items) ? items : [];
  await inviteActivationOtpStore.write(arr.slice(-400));
};

const writeInviteNonces = async (items) => {
  const arr = Array.isArray(items) ? items : [];
  await inviteOtpNonceStore.write(arr.slice(-400));
};

export const logInviteActivationAudit = async ({ event, userId, meta = {} }) => {
  const current = await inviteActivationAuditStore.read();
  const next = Array.isArray(current) ? current : [];
  next.push({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    event: String(event || "unknown"),
    user_id: userId || null,
    meta: typeof meta === "object" && meta !== null ? meta : {},
  });
  await inviteActivationAuditStore.write(next.slice(-500));
};

const generateSixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/**
 * Crea un OTP de activación; invalida OTP anteriores no consumidos del mismo usuario.
 * @returns {{ plainCode: string, recordId: string }}
 */
export const createInviteActivationOtp = async ({
  userId,
  firstName,
  lastName,
  dni,
}) => {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new HttpError(400, "Solicitud no válida.");
  }

  const current = await inviteActivationOtpStore.read();
  const list = Array.isArray(current) ? current : [];
  const withoutPending = list.filter((row) => {
    if (row?.user_id !== uid) {
      return true;
    }
    if (row?.consumed_at) {
      return true;
    }
    return false;
  });

  const salt = randomBytes(16).toString("hex");
  const plainCode = generateSixDigitCode();
  const otp_hash = hashInviteOtpCode(salt, plainCode);
  const profile_binding_hash = computeInviteProfileBindingHash(firstName, lastName, dni);
  const record = {
    id: randomUUID(),
    user_id: uid,
    purpose: "invite_activation",
    salt,
    otp_hash,
    profile_binding_hash,
    attempts: 0,
    consumed_at: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + INVITE_OTP_TTL_MS).toISOString(),
  };

  withoutPending.push(record);
  await writeInviteOtps(withoutPending);

  await logInviteActivationAudit({
    event: "invite_otp_requested",
    userId: uid,
    meta: { dni_suffix: String(dni || "").replace(/\s+/g, "").slice(-2) || null },
  });

  return { plainCode, recordId: record.id };
};

export const sendInviteOtpEmail = async ({ to, organizationName, code }) => {
  const org = String(organizationName || "").trim() || "FRIGEST";
  const safeCode = escapeHtml(String(code || "").trim());

  const html = buildPremiumEmailDocument({
    preheader: `Tu código FRIGEST es ${String(code).trim()}. Caduca en 10 minutos.`,
    title: "Código de verificación",
    paragraphs: [
      `Tu código de un solo uso para continuar con la activación en <strong>${escapeHtml(org)}</strong> es:`,
      `<span style="display:inline-block;margin:8px 0 0;padding:14px 22px;border-radius:12px;background:#f0fdfa;border:1px solid #99f6e4;font-size:28px;font-weight:800;letter-spacing:0.18em;color:#0f766e;">${safeCode}</span>`,
      "Introduce este código en la página de activación. Caduca en 10 minutos y admite un número limitado de intentos.",
    ],
    secondaryNote:
      "Si no estabas activando un acceso a FRIGEST, ignora este mensaje. Nadie puede continuar sin el enlace de invitación original.",
  });

  return sendEmail({
    to,
    subject: `Tu código FRIGEST: ${String(code).trim()}`,
    text: [
      `Tu código de verificación para ${org} es: ${String(code).trim()}`,
      "",
      "El código caduca en 10 minutos.",
      "",
      "Si no solicitaste este código, ignora este correo.",
    ].join("\n"),
    html,
  });
};

const inviteOtpVerifyPayload = (message, attemptsRemaining, codeExhausted) =>
  new HttpError(422, message, {
    invite_otp: true,
    attempts_remaining: attemptsRemaining,
    code_exhausted: codeExhausted,
  });

/**
 * Verifica OTP y emite nonce de un solo uso para completar la activación con contraseña.
 * Un intento fallido no consume el código salvo que se agoten los intentos o caduque.
 */
export const verifyInviteActivationOtp = async ({ userId, otp }) => {
  const uid = String(userId || "").trim();
  const code = String(otp || "").trim();
  if (!uid || !/^\d{6}$/.test(code)) {
    throw new HttpError(422, "Introduce un código de 6 dígitos.");
  }

  const current = await inviteActivationOtpStore.read();
  const list = Array.isArray(current) ? current : [];
  const candidates = list
    .filter(
      (row) =>
        row?.user_id === uid &&
        !row?.consumed_at &&
        new Date(row?.expires_at || 0) > new Date()
    )
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const active = candidates[0] || null;
  if (!active) {
    await logInviteActivationAudit({
      event: "invite_otp_verify_failed",
      userId: uid,
      meta: { reason: "no_active_otp" },
    });
    throw inviteOtpVerifyPayload("Código caducado. Solicita uno nuevo.", 0, true);
  }

  const expected = Buffer.from(String(active.otp_hash || ""), "hex");
  const actual = Buffer.from(hashInviteOtpCode(active.salt, code), "hex");

  if (expected.length === 0 || actual.length !== expected.length || !timingSafeEqual(expected, actual)) {
    const nextAttempts = Number(active.attempts || 0) + 1;
    const nextList = list.map((row) =>
      row.id === active.id ? { ...row, attempts: nextAttempts } : row
    );
    await writeInviteOtps(nextList);

    await logInviteActivationAudit({
      event: "invite_otp_verify_failed",
      userId: uid,
      meta: { reason: "bad_code", attempts: nextAttempts },
    });

    if (nextAttempts >= INVITE_OTP_MAX_ATTEMPTS) {
      const invalidated = nextList.map((row) =>
        row.id === active.id ? { ...row, consumed_at: new Date().toISOString() } : row
      );
      await writeInviteOtps(invalidated);
      await logInviteActivationAudit({
        event: "invite_otp_exhausted",
        userId: uid,
        meta: { attempts: nextAttempts },
      });
      throw inviteOtpVerifyPayload(
        "Has agotado los intentos de este código. Solicita uno nuevo.",
        0,
        true
      );
    }

    const remaining = INVITE_OTP_MAX_ATTEMPTS - nextAttempts;
    throw inviteOtpVerifyPayload("Código incorrecto.", remaining, false);
  }

  const latest = await inviteActivationOtpStore.read();
  const latestList = Array.isArray(latest) ? latest : [];
  const consumedList = latestList.map((row) =>
    row.id === active.id ? { ...row, consumed_at: new Date().toISOString() } : row
  );
  await writeInviteOtps(consumedList);

  const nonce = randomUUID();
  const nonceRow = {
    id: randomUUID(),
    nonce,
    user_id: uid,
    profile_binding_hash: active.profile_binding_hash,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + INVITE_OTP_NONCE_TTL_MS).toISOString(),
    consumed_at: null,
  };

  const nonces = await inviteOtpNonceStore.read();
  const nonceList = Array.isArray(nonces) ? nonces : [];
  const cleaned = nonceList.filter(
    (row) => row?.user_id !== uid || row?.consumed_at || new Date(row?.expires_at || 0) < new Date()
  );
  cleaned.push(nonceRow);
  await writeInviteNonces(cleaned);

  await logInviteActivationAudit({
    event: "invite_otp_verified",
    userId: uid,
    meta: {},
  });

  return { otp_verified_nonce: nonce };
};

const inviteNonceMissingError = () =>
  new HttpError(422, "Debes verificar el código antes de crear la contraseña.");

/**
 * Localiza un nonce de activación pendiente (sin consumir, no caducado, perfil coincidente).
 * @returns {Promise<{ row: object, list: object[] } | { error: HttpError }>}
 */
const findPendingInviteActivationNonceContext = async ({
  nonce,
  userId,
  firstName,
  lastName,
  dni,
}) => {
  const uid = String(userId || "").trim();
  const n = String(nonce || "").trim();
  if (!uid || !n) {
    return { error: inviteNonceMissingError() };
  }

  const expectedBinding = computeInviteProfileBindingHash(firstName, lastName, dni);
  const current = await inviteOtpNonceStore.read();
  const list = Array.isArray(current) ? current : [];
  const row =
    list.find(
      (item) =>
        item?.nonce === n &&
        item?.user_id === uid &&
        !item?.consumed_at &&
        new Date(item?.expires_at || 0) > new Date()
    ) || null;

  if (!row || String(row.profile_binding_hash || "") !== expectedBinding) {
    return { error: inviteNonceMissingError() };
  }

  return { row, list };
};

/**
 * Comprueba que el nonce OTP sigue vigente antes de persistir la contraseña.
 * No consume el nonce (así un fallo al guardar no bloquea un nuevo intento con el mismo nonce).
 */
export const assertInviteActivationNonceValid = async (args) => {
  const ctx = await findPendingInviteActivationNonceContext(args);
  if (ctx.error) {
    throw ctx.error;
  }
};

/**
 * Consume el nonce tras completar la activación (un solo uso).
 */
export const consumeInviteActivationNonce = async (args) => {
  const ctx = await findPendingInviteActivationNonceContext(args);
  if (ctx.error) {
    throw ctx.error;
  }

  const { row, list } = ctx;
  const uid = String(args.userId || "").trim();

  const next = list.map((item) =>
    item.id === row.id ? { ...item, consumed_at: new Date().toISOString() } : item
  );
  await writeInviteNonces(next);

  await logInviteActivationAudit({
    event: "invite_otp_nonce_consumed",
    userId: uid,
    meta: {},
  });

  return true;
};

// ─── Registro público con verificación OTP ────────────────────────────────────

const SIGNUP_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const SIGNUP_OTP_MAX_ATTEMPTS = 3;

const signupOtpStore = createJsonFileStore("auth-signup-otps.json", []);

const writeSignupOtps = async (items) => {
  const arr = Array.isArray(items) ? items : [];
  await signupOtpStore.write(arr.slice(-400));
};

const pruneSignupOtps = (list) =>
  (Array.isArray(list) ? list : []).filter(
    (row) => row?.expires_at && new Date(row.expires_at) > new Date()
  );

/**
 * Genera y almacena un OTP para el registro público.
 * Invalida OTPs anteriores no consumidos para el mismo email.
 * @returns {{ plainCode: string, pendingId: string }}
 */
export const createSignupOtp = async ({ email, organizationName, fullName }) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new HttpError(400, "Email requerido.");

  const current = pruneSignupOtps(await signupOtpStore.read());
  const withoutPending = current.filter(
    (row) => row?.email !== normalizedEmail || row?.consumed_at
  );

  const salt = randomBytes(16).toString("hex");
  const plainCode = generateSixDigitCode();
  const otp_hash = hashInviteOtpCode(salt, plainCode);

  const record = {
    id: randomUUID(),
    email: normalizedEmail,
    organization_name: String(organizationName || "").trim(),
    full_name: String(fullName || "").trim(),
    salt,
    otp_hash,
    attempts: 0,
    consumed_at: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + SIGNUP_OTP_TTL_MS).toISOString(),
  };

  withoutPending.push(record);
  await writeSignupOtps(withoutPending);

  return { plainCode, pendingId: record.id };
};

/**
 * Verifica el OTP de registro. Devuelve los datos pendientes si es correcto.
 * @returns {{ email: string, organization_name: string, full_name: string }}
 */
export const verifySignupOtp = async ({ pendingId, otp }) => {
  const id = String(pendingId || "").trim();
  const code = String(otp || "").trim();

  if (!id || !/^\d{6}$/.test(code)) {
    throw new HttpError(422, "Introduce un código de 6 dígitos.");
  }

  const current = pruneSignupOtps(await signupOtpStore.read());
  const record = current.find(
    (row) => row?.id === id && !row?.consumed_at
  );

  if (!record) {
    throw new HttpError(422, "El código ha expirado o ya fue usado. Solicita uno nuevo.");
  }

  if (record.attempts >= SIGNUP_OTP_MAX_ATTEMPTS) {
    throw new HttpError(422, "Número de intentos agotado. Solicita un nuevo código.", {
      code_exhausted: true,
      attempts_remaining: 0,
    });
  }

  const expected = Buffer.from(String(record.otp_hash || ""), "hex");
  const actual = Buffer.from(hashInviteOtpCode(record.salt, code), "hex");

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    record.attempts += 1;
    await writeSignupOtps(current);
    const remaining = SIGNUP_OTP_MAX_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      throw new HttpError(422, "Código incorrecto. No quedan más intentos.", {
        code_exhausted: true,
        attempts_remaining: 0,
      });
    }
    throw new HttpError(422, `Código incorrecto. Quedan ${remaining} intento${remaining !== 1 ? "s" : ""}.`, {
      code_exhausted: false,
      attempts_remaining: remaining,
    });
  }

  record.consumed_at = new Date().toISOString();
  await writeSignupOtps(current);

  return {
    email: record.email,
    organization_name: record.organization_name,
    full_name: record.full_name,
  };
};

export const sendSignupOtpEmail = async ({ to, organizationName, code }) => {
  const org = String(organizationName || "").trim() || "FRIGEST";
  const safeCode = escapeHtml(String(code || "").trim());

  const html = buildPremiumEmailDocument({
    preheader: `Tu código de verificación FRIGEST es ${String(code).trim()}. Caduca en 10 minutos.`,
    title: "Verifica tu email",
    paragraphs: [
      `Para completar el registro de <strong>${escapeHtml(org)}</strong> en FRIGEST, introduce el siguiente código:`,
      `<span style="display:inline-block;margin:8px 0 0;padding:14px 22px;border-radius:12px;background:#f0fdfa;border:1px solid #99f6e4;font-size:28px;font-weight:800;letter-spacing:0.18em;color:#0f766e;">${safeCode}</span>`,
      "El código caduca en 10 minutos y solo admite 3 intentos. Si no lo introduces a tiempo, tendrás que solicitar uno nuevo.",
    ],
    secondaryNote:
      "Si no estás creando una cuenta en FRIGEST, ignora este mensaje. No es necesaria ninguna acción.",
  });

  return sendEmail({
    to,
    subject: `Tu código de verificación FRIGEST: ${String(code).trim()}`,
    text: [
      `Código de verificación para completar el registro en FRIGEST: ${String(code).trim()}`,
      "",
      "El código caduca en 10 minutos.",
      "",
      "Si no solicitaste este código, ignora este correo.",
    ].join("\n"),
    html,
  });
};
