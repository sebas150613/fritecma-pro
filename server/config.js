import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

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

const parsePositiveNumberEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const environment = process.env.NODE_ENV || "development";
const isProduction = environment === "production";
const appDataDir = String(process.env.APP_DATA_DIR || "").trim();
const appUploadsDir = String(process.env.APP_UPLOADS_DIR || "").trim();

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

export const serverConfig = {
  environment,
  isProduction,
  allowedOrigins,
  uploadMaxFileSizeMb,
  uploadMaxFileSizeBytes: Math.round(uploadMaxFileSizeMb * 1024 * 1024),
  port: Number(process.env.APP_SERVER_PORT || 3000),
  host: process.env.APP_SERVER_HOST || "127.0.0.1",
  dataDir: appDataDir || path.join(__dirname, "data"),
  uploadsDir: appUploadsDir || path.join(__dirname, "uploads"),
  publicUploadsDir: path.join(appUploadsDir || path.join(__dirname, "uploads"), "public"),
  privateUploadsDir: path.join(appUploadsDir || path.join(__dirname, "uploads"), "private"),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: process.env.APP_DATABASE_SSL === "true",
  devToken,
  allowAuthBypass,
  publicSignupEnabled: process.env.APP_PUBLIC_SIGNUP_ENABLED !== "false",
  requireEmailVerification: process.env.APP_REQUIRE_EMAIL_VERIFICATION === "true",
  appId: process.env.APP_ID || process.env.VITE_APP_ID || "local-app",
  aiProvider: process.env.APP_AI_PROVIDER || "openai",
  aiBaseUrl: (process.env.APP_AI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/+$/,
    ""
  ),
  aiApiKey: process.env.OPENAI_API_KEY || "",
  aiModel: process.env.APP_AI_MODEL || "gpt-5-mini",
  aiVisionModel:
    process.env.APP_AI_VISION_MODEL ||
    process.env.APP_AI_MODEL ||
    "gpt-5-mini",
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
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
};
