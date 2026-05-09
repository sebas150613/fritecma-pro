import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createJsonFileStore } from "../lib/json-store.js";
import { serverConfig } from "../config.js";

const platformSettingsStore = createJsonFileStore("platform-settings.json", {
  email: {},
});

const EMAIL_SETTINGS_KEYS = [
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_pass",
  "email_from",
  "email_from_name",
  "email_reply_to",
  "email_enabled",
];

const buildEncryptionKey = () => {
  const secret = String(serverConfig.appSettingsSecret || "").trim();
  if (!secret) {
    return null;
  }

  return createHash("sha256").update(secret).digest();
};

const encryptSecret = (value) => {
  const key = buildEncryptionKey();
  if (!key || !value) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

const decryptSecret = (value) => {
  if (!value) {
    return "";
  }

  if (!String(value).startsWith("enc:")) {
    return String(value);
  }

  const key = buildEncryptionKey();
  if (!key) {
    return "";
  }

  const [, ivHex, authTagHex, encryptedHex] = String(value).split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
};

const normalizeEmailSettingsPatch = (payload = {}, existing = {}) => {
  const patch = {};

  for (const key of EMAIL_SETTINGS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      continue;
    }

    const rawValue = payload[key];

    if (key === "smtp_port") {
      const port = Number(rawValue);
      patch[key] = Number.isFinite(port) && port > 0 ? port : 587;
      continue;
    }

    if (key === "smtp_secure") {
      patch[key] = rawValue === true || rawValue === "true";
      continue;
    }

    if (key === "email_enabled") {
      patch[key] = rawValue === true || rawValue === "true";
      continue;
    }

    if (key === "smtp_pass") {
      const normalizedSecret = String(rawValue ?? "");
      if (normalizedSecret === "") {
        patch[key] = "";
      } else {
        patch[key] = encryptSecret(normalizedSecret) || normalizedSecret;
      }
      continue;
    }

    patch[key] = String(rawValue ?? "").trim();
  }

  return {
    ...existing,
    ...patch,
  };
};

const mergeWithEnvDefaults = (emailSettings = {}) => ({
  smtp_host: emailSettings.smtp_host || serverConfig.smtpHost,
  smtp_port: Number(emailSettings.smtp_port || serverConfig.smtpPort || 587),
  smtp_secure:
    emailSettings.smtp_secure === true || serverConfig.smtpSecure === true,
  smtp_user: emailSettings.smtp_user || serverConfig.smtpUser,
  smtp_pass: decryptSecret(emailSettings.smtp_pass) || serverConfig.smtpPass,
  email_from: emailSettings.email_from || serverConfig.emailFrom,
  email_from_name: String(emailSettings.email_from_name || "").trim(),
  email_reply_to: emailSettings.email_reply_to || serverConfig.emailReplyTo,
  email_enabled: emailSettings.email_enabled !== false,
});

export const getPlatformSettings = async () => {
  const settings = await platformSettingsStore.read();
  return settings && typeof settings === "object" ? settings : { email: {} };
};

export const getEffectiveEmailSettings = async () => {
  const settings = await getPlatformSettings();
  return mergeWithEnvDefaults(settings.email || {});
};

export const getOwnerEmailSettings = async () => {
  const settings = await getPlatformSettings();
  const emailSettings = settings.email || {};
  const effective = mergeWithEnvDefaults(emailSettings);

  return {
    smtp_host: effective.smtp_host || "",
    smtp_port: effective.smtp_port || 587,
    smtp_secure: effective.smtp_secure === true,
    smtp_user: effective.smtp_user || "",
    smtp_pass_configured: Boolean(effective.smtp_pass),
    email_from: effective.email_from || "",
    email_from_name: effective.email_from_name || "",
    email_reply_to: effective.email_reply_to || "",
    email_enabled: effective.email_enabled !== false,
    uses_env_fallback:
      !emailSettings.smtp_host &&
      !emailSettings.smtp_user &&
      !emailSettings.smtp_pass &&
      !emailSettings.email_from,
    secrets_encrypted: Boolean(serverConfig.appSettingsSecret),
  };
};

export const updateOwnerEmailSettings = async (payload = {}) => {
  const current = await getPlatformSettings();
  const nextEmailSettings = normalizeEmailSettingsPatch(payload, current.email || {});
  const next = {
    ...current,
    email: nextEmailSettings,
    updated_at: new Date().toISOString(),
  };

  await platformSettingsStore.write(next);
  return getOwnerEmailSettings();
};
