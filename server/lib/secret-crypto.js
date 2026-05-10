import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { serverConfig } from "../config.js";

const PREFIX = "enc:v1";

export const isEncryptedSecret = (value) =>
  typeof value === "string" && value.startsWith(`${PREFIX}:`);

const deriveKey = (secretMaterial) =>
  createHash("sha256").update(String(secretMaterial), "utf8").digest();

const resolveSecret = (options = {}) => {
  if (options.secret !== undefined && options.secret !== null) {
    const trimmed = String(options.secret).trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return String(serverConfig.appSettingsSecret || "").trim();
};

/**
 * AES-256-GCM. Format: enc:v1:<ivBase64>:<tagBase64>:<ciphertextBase64>
 * Does not double-encrypt values already in enc:v1: form.
 */
export const encryptSecret = (value, options = {}) => {
  if (value === undefined || value === null) {
    return value;
  }
  if (value === "") {
    return "";
  }
  const str = String(value);
  if (isEncryptedSecret(str)) {
    return str;
  }
  const secret = resolveSecret(options);
  if (!secret) {
    throw new Error(
      "APP_SETTINGS_SECRET is required to encrypt organization secrets"
    );
  }
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(str, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
};

export const decryptSecret = (value, options = {}) => {
  if (value === undefined || value === null) {
    return value;
  }
  const str = String(value);
  if (!isEncryptedSecret(str)) {
    return str;
  }
  const secret = resolveSecret(options);
  if (!secret) {
    throw new Error(
      "APP_SETTINGS_SECRET is required to decrypt organization secrets"
    );
  }
  const parts = str.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    return str;
  }
  const ivB64 = parts[2];
  const tagB64 = parts[3];
  const ctB64 = parts[4];
  const key = deriveKey(secret);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

/**
 * Decrypt enc:v1 values when possible; legacy plaintext unchanged.
 * On decrypt failure (wrong key), returns the stored string unchanged.
 */
export const maybeDecryptSecret = (value, options = {}) => {
  if (value === undefined || value === null) {
    return value;
  }
  const str = String(value);
  if (!isEncryptedSecret(str)) {
    return str;
  }
  try {
    return decryptSecret(str, options);
  } catch {
    return str;
  }
};
