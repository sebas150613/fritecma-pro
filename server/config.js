import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  assertAuthBypassHostSafety,
  parseTrustProxy,
} from "./lib/security-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const protectedEnvKeys = new Set(Object.keys(process.env));

const applyEnvFile = (envPath, { canOverrideLoadedEnv = false } = {}) => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const parsed = dotenv.parse(fs.readFileSync(envPath));

  for (const [key, value] of Object.entries(parsed)) {
    if (protectedEnvKeys.has(key)) {
      continue;
    }

    if (process.env[key] === undefined || canOverrideLoadedEnv) {
      process.env[key] = value;
    }
  }
};

applyEnvFile(path.join(workspaceRoot, ".env"));
applyEnvFile(path.join(workspaceRoot, ".env.local"), {
  canOverrideLoadedEnv: true,
});

const parseCsvEnv = (value = "") =>
  String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// Claves de IA con conmutación por error. Cada proveedor (OpenAI, Anthropic,
// DeepSeek) puede tener varias claves: en la variable principal separadas por
// comas/espacios, y/o en variantes numeradas _2.._9. Si una clave falla (sin
// saldo, inválida, rate-limit...) se prueba la siguiente; si fallan todas las
// de un proveedor, se pasa al siguiente proveedor. Las claves no contienen
// comas ni espacios, así que el split es seguro.
const parseAiApiKeys = (primaryVar) => {
  const keys = [];
  for (const raw of String(process.env[primaryVar] || "").split(/[\s,]+/)) {
    const trimmed = raw.trim();
    if (trimmed) keys.push(trimmed);
  }
  for (let i = 2; i <= 9; i += 1) {
    const extra = String(process.env[`${primaryVar}_${i}`] || "").trim();
    if (extra) keys.push(extra);
  }
  return [...new Set(keys)];
};

const stripTrailingSlashes = (value) => String(value).replace(/\/+$/, "");

const parsePositiveNumberEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const environment = process.env.NODE_ENV || "development";
const isProduction = environment === "production";
const appDataDir = String(process.env.APP_DATA_DIR || "").trim();
const appUploadsDir = String(process.env.APP_UPLOADS_DIR || "").trim();
const seedDemoUsersRaw = String(process.env.APP_SEED_DEMO_USERS || "")
  .trim()
  .toLowerCase();
const seedDemoUsers =
  seedDemoUsersRaw === "true" ? true : seedDemoUsersRaw === "false" ? false : null;

if (isProduction && !Object.prototype.hasOwnProperty.call(process.env, "APP_ALLOW_AUTH_BYPASS")) {
  throw new Error(
    "Unsafe production configuration: APP_ALLOW_AUTH_BYPASS must be explicitly set to false when NODE_ENV=production."
  );
}

const configuredAuthBypass = process.env.APP_ALLOW_AUTH_BYPASS;
const allowAuthBypass =
  configuredAuthBypass === undefined
    ? !isProduction
    : configuredAuthBypass === "true";

const serverConfigHost = String(process.env.APP_SERVER_HOST || "127.0.0.1").trim();

assertAuthBypassHostSafety({ allowAuthBypass, host: serverConfigHost });

const trustProxyRaw = String(process.env.APP_TRUST_PROXY || "").trim();
const trustProxy = parseTrustProxy(trustProxyRaw);
const configuredDevToken = String(process.env.APP_DEV_TOKEN || "").trim();
const devToken = configuredDevToken || (isProduction ? "" : "local-dev-token");
const allowedOrigins = parseCsvEnv(process.env.APP_ALLOWED_ORIGINS);
const uploadMaxFileSizeMb = parsePositiveNumberEnv(
  process.env.APP_UPLOAD_MAX_FILE_SIZE_MB,
  25
);

if (isProduction && allowAuthBypass) {
  throw new Error(
    "Unsafe production configuration: APP_ALLOW_AUTH_BYPASS must be false when NODE_ENV=production."
  );
}

if (isProduction && !configuredDevToken && devToken !== "") {
  throw new Error("Unsafe production configuration: APP_DEV_TOKEN must be empty when NODE_ENV=production.");
}

if (isProduction && allowedOrigins.length === 0) {
  throw new Error(
    "Unsafe production configuration: APP_ALLOWED_ORIGINS must list the allowed frontend origins when NODE_ENV=production."
  );
}

if (isProduction && !process.env.APP_HIDDEN_OWNER_PASSWORD_HASH) {
  throw new Error(
    "Unsafe production configuration: APP_HIDDEN_OWNER_PASSWORD_HASH must be set when NODE_ENV=production."
  );
}

export const serverConfig = {
  environment,
  isProduction,
  allowedOrigins,
  uploadMaxFileSizeMb,
  uploadMaxFileSizeBytes: Math.round(uploadMaxFileSizeMb * 1024 * 1024),
  port: Number(process.env.APP_SERVER_PORT || 3000),
  host: serverConfigHost,
  trustProxy,
  dataDir: appDataDir || path.join(__dirname, "data"),
  uploadsDir: appUploadsDir || path.join(__dirname, "uploads"),
  publicUploadsDir: path.join(appUploadsDir || path.join(__dirname, "uploads"), "public"),
  privateUploadsDir: path.join(appUploadsDir || path.join(__dirname, "uploads"), "private"),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: process.env.APP_DATABASE_SSL === "true",
  devToken,
  allowAuthBypass,
  seedDemoUsers,
  publicSignupEnabled: process.env.APP_PUBLIC_SIGNUP_ENABLED !== "false",
  requireEmailVerification: process.env.APP_REQUIRE_EMAIL_VERIFICATION === "true",
  appId: process.env.APP_ID || process.env.VITE_APP_ID || "local-app",
  // Orden de conmutación entre proveedores. Solo participan los que tengan
  // clave(s) configurada(s). Para peticiones con imagen (OCR de albaranes) se
  // omiten los proveedores sin visión (DeepSeek).
  aiProviderOrder: parseCsvEnv(
    process.env.APP_AI_PROVIDER_ORDER || "openai,anthropic,deepseek"
  ).map((id) => id.toLowerCase()),
  // OpenAI (Responses API)
  aiBaseUrl: stripTrailingSlashes(process.env.APP_AI_BASE_URL || "https://api.openai.com/v1"),
  aiApiKeys: parseAiApiKeys("OPENAI_API_KEY"),
  aiModel: process.env.APP_AI_MODEL || "gpt-4o-mini",
  aiVisionModel:
    process.env.APP_AI_VISION_MODEL ||
    process.env.APP_AI_MODEL ||
    "gpt-4o-mini",
  // Anthropic (Messages API) — con visión y salida estructurada via tool-use
  anthropicApiKeys: parseAiApiKeys("ANTHROPIC_API_KEY"),
  anthropicBaseUrl: stripTrailingSlashes(
    process.env.APP_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1"
  ),
  anthropicModel: process.env.APP_ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
  anthropicVisionModel:
    process.env.APP_ANTHROPIC_VISION_MODEL || "claude-sonnet-4-5-20250929",
  // DeepSeek (Chat Completions, compatible OpenAI) — SOLO texto, sin visión
  deepseekApiKeys: parseAiApiKeys("DEEPSEEK_API_KEY"),
  deepseekBaseUrl: stripTrailingSlashes(
    process.env.APP_DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
  ),
  deepseekModel: process.env.APP_DEEPSEEK_MODEL || "deepseek-chat",
  aiTimeoutMs: Number(process.env.APP_AI_TIMEOUT_MS || 90000),
  smtpHost: process.env.APP_SMTP_HOST || "",
  smtpPort: Number(process.env.APP_SMTP_PORT || 587),
  smtpSecure: process.env.APP_SMTP_SECURE === "true",
  smtpUser: process.env.APP_SMTP_USER || "",
  smtpPass: process.env.APP_SMTP_PASS || "",
  emailFrom: process.env.APP_EMAIL_FROM || "",
  emailReplyTo: process.env.APP_EMAIL_REPLY_TO || "",
  salesEmail: process.env.APP_SALES_EMAIL || "",
  appSettingsSecret: process.env.APP_SETTINGS_SECRET || "",
  /** Secreto para HMAC de OTP de invitación; por defecto APP_SETTINGS_SECRET. */
  inviteOtpSecret: process.env.APP_INVITE_OTP_SECRET || process.env.APP_SETTINGS_SECRET || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
  sessionTtlMs:
    parsePositiveNumberEnv(process.env.APP_SESSION_TTL_DAYS, 30) *
    24 * 60 * 60 * 1000,
  backupDir: String(process.env.APP_BACKUP_DIR || "/var/backups/frigest").trim(),
  backupSecret: String(process.env.APP_BACKUP_SECRET || "").trim(),
  hiddenOwnerPasswordHash: process.env.APP_HIDDEN_OWNER_PASSWORD_HASH || "",
};
