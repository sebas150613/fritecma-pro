import { randomUUID } from "node:crypto";
import { createJsonFileStore } from "../lib/json-store.js";
import { sendEmail } from "./email-service.js";

const emailVerificationStore = createJsonFileStore("auth-email-verifications.json", []);
const passwordResetStore = createJsonFileStore("auth-password-resets.json", []);

const EMAIL_VERIFICATION_TTL_HOURS = 48;
const PASSWORD_RESET_TTL_MINUTES = 60;

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

export const sendPasswordResetEmail = async ({ user, resetUrl }) =>
  sendEmail({
    to: user.email,
    subject: "Restablece tu contraseña de FRIGEST",
    text: [
      `Hola ${user.full_name || user.email},`,
      "",
      "Hemos recibido una solicitud para restablecer tu contraseña.",
      resetUrl,
      "",
      "Si no has solicitado el cambio, ignora este mensaje.",
    ].join("\n"),
    html: `
      <p>Hola ${user.full_name || user.email},</p>
      <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
      <p><a href="${resetUrl}">Restablecer contraseña</a></p>
      <p>Si no has solicitado el cambio, ignora este mensaje.</p>
    `,
  });

export const sendInvitationEmail = async ({
  to,
  organizationName,
  invitedBy,
  role,
  activationUrl,
  loginUrl,
  requiresActivation,
}) =>
  sendEmail({
    to,
    subject: `Invitación a ${organizationName || "FRIGEST"}`,
    text: [
      `Has sido invitado a ${organizationName || "FRIGEST"}${invitedBy ? ` por ${invitedBy}` : ""}.`,
      `Rol asignado: ${role}.`,
      "",
      requiresActivation
        ? "Activa tu acceso desde este enlace:"
        : "Ya tienes cuenta. Accede desde este enlace:",
      requiresActivation ? activationUrl : loginUrl,
    ].join("\n"),
    html: `
      <p>Has sido invitado a <strong>${organizationName || "FRIGEST"}</strong>${invitedBy ? ` por ${invitedBy}` : ""}.</p>
      <p>Rol asignado: <strong>${role}</strong>.</p>
      <p>
        <a href="${requiresActivation ? activationUrl : loginUrl}">
          ${requiresActivation ? "Activar acceso" : "Ir al login"}
        </a>
      </p>
    `,
  });
