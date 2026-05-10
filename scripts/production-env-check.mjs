#!/usr/bin/env node
/**
 * Safe production/staging environment checklist (no secret values printed).
 * Reads process.env only — does not load .env files (production injects env vars).
 *
 *   node scripts/production-env-check.mjs              # relaxed
 *   node scripts/production-env-check.mjs --production # production rules (simulation OK)
 *   node scripts/production-env-check.mjs --strict    # alias
 */
import process from "node:process";
import {
  assertAuthBypassHostSafety,
  parseTrustProxy,
  isLoopbackHost,
} from "../server/lib/security-config.js";

const argv = process.argv.slice(2);
const argvStrict = argv.includes("--production") || argv.includes("--strict");
const nodeEnv = process.env.NODE_ENV || "";
const envIsProduction = nodeEnv === "production";
/** Run production security rules (real prod or --production simulation). */
const productionIntent = argvStrict || envIsProduction;

let failed = 0;
let warned = 0;

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

function warn(msg) {
  warned += 1;
  console.warn(`[WARN] ${msg}`);
}

function fail(msg) {
  failed += 1;
  console.log(`[FAIL] ${msg}`);
}

function parseCsvEnv(value = "") {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function originLooksLocal(origin) {
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "[::1]" ||
      h === "::1"
    );
  } catch {
    return false;
  }
}

function runChecks() {
  const explicitAuthBypass = Object.prototype.hasOwnProperty.call(
    process.env,
    "APP_ALLOW_AUTH_BYPASS"
  );
  const rawAuthBypass = process.env.APP_ALLOW_AUTH_BYPASS;

  const allowAuthBypassRelaxed =
    rawAuthBypass === undefined
      ? !envIsProduction
      : rawAuthBypass === "true";

  const serverHost = String(process.env.APP_SERVER_HOST || "127.0.0.1").trim();
  const trustRaw = String(process.env.APP_TRUST_PROXY || "").trim();
  const configuredDevToken = String(process.env.APP_DEV_TOKEN || "").trim();
  const allowedOrigins = parseCsvEnv(process.env.APP_ALLOWED_ORIGINS || "");
  const serverPortRaw = process.env.APP_SERVER_PORT;
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const aiProvider = String(process.env.APP_AI_PROVIDER || "openai").trim().toLowerCase();
  const openAiKey = process.env.OPENAI_API_KEY || "";
  const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET || "";

  console.log(
    `\nproduction-env-check: productionIntent=${productionIntent} (NODE_ENV="${nodeEnv || "unset"}")\n`
  );

  if (argvStrict && !envIsProduction) {
    warn(
      "Simulating production checks without NODE_ENV=production — real servers must export NODE_ENV=production."
    );
  }

  if (!productionIntent) {
    pass("Relaxed mode: pass --production or set NODE_ENV=production for full checks.");
    if (configuredDevToken === "local-dev-token") {
      warn("APP_DEV_TOKEN is still the default local-dev-token.");
    }
    if (allowAuthBypassRelaxed && !isLoopbackHost(serverHost)) {
      fail("APP_ALLOW_AUTH_BYPASS=true requires APP_SERVER_HOST to be loopback.");
    } else {
      pass("APP_ALLOW_AUTH_BYPASS vs APP_SERVER_HOST (quick check).");
    }
    try {
      parseTrustProxy(trustRaw === "" ? undefined : trustRaw);
      pass("APP_TRUST_PROXY parses.");
    } catch (e) {
      fail(`APP_TRUST_PROXY: ${e?.message || e}`);
    }

    const portNum = Number(serverPortRaw);
    if (serverPortRaw !== undefined && serverPortRaw !== "") {
      if (!Number.isFinite(portNum) || portNum <= 0) {
        warn(`APP_SERVER_PORT is not a positive number.`);
      }
    }

    console.log("");
    console.log(`production-env-check: OK (${warned} warning(s)).`);
    return;
  }

  if (envIsProduction) {
    pass('NODE_ENV is "production".');
  } else if (argvStrict) {
    pass(
      "NODE_ENV is not production — checks use production rules because of --production (set NODE_ENV=production on real servers)."
    );
  } else {
    fail('NODE_ENV must be "production" for production deployment.');
  }

  if (!explicitAuthBypass) {
    fail(
      "APP_ALLOW_AUTH_BYPASS must be explicitly set (to false) in production — matches server/config.js."
    );
  } else if (rawAuthBypass === "true") {
    fail("APP_ALLOW_AUTH_BYPASS must be false in production.");
  } else {
    pass("APP_ALLOW_AUTH_BYPASS is explicitly false.");
  }

  try {
    assertAuthBypassHostSafety({
      allowAuthBypass: rawAuthBypass === "true",
      host: serverHost,
    });
    pass("APP_SERVER_HOST vs APP_ALLOW_AUTH_BYPASS is consistent (loopback rule).");
  } catch (e) {
    fail(String(e?.message || e));
  }

  if (configuredDevToken !== "") {
    fail(
      `APP_DEV_TOKEN must be empty in production (currently set, length ${configuredDevToken.length}).`
    );
  } else {
    pass("APP_DEV_TOKEN is empty (required for production).");
  }

  if (allowedOrigins.length === 0) {
    fail("APP_ALLOWED_ORIGINS must list at least one origin in production.");
  } else {
    pass(`APP_ALLOWED_ORIGINS has ${allowedOrigins.length} entr(y/ies).`);
  }

  const originsBlob = allowedOrigins.join(" ");
  if (originsBlob.includes("*")) {
    fail("APP_ALLOWED_ORIGINS must not use wildcard '*'.");
  }

  for (const o of allowedOrigins) {
    if (o === "*") {
      fail("APP_ALLOWED_ORIGINS must not be '*'.");
    }
    if (originLooksLocal(o)) {
      warn(
        "At least one origin looks like localhost/loopback — only acceptable for staging."
      );
    }
    try {
      const u = new URL(o);
      if (u.protocol === "http:" && !originLooksLocal(o)) {
        fail(
          "Each non-local APP_ALLOWED_ORIGINS entry must use https:// in production."
        );
      }
    } catch {
      fail("APP_ALLOWED_ORIGINS entries must be valid URLs.");
    }
  }

  try {
    parseTrustProxy(trustRaw === "" ? undefined : trustRaw);
    pass(`APP_TRUST_PROXY parses (${trustRaw === "" ? "empty ⇒ false" : "set"}).`);
    if (trustRaw === "" || trustRaw === "false") {
      warn(
        "APP_TRUST_PROXY is false/empty: fine when Node listens directly; behind a reverse proxy set to 1 or true per README."
      );
    }
  } catch (e) {
    fail(`APP_TRUST_PROXY: ${e?.message || e}`);
  }

  if (!databaseUrl) {
    warn(
      "DATABASE_URL is empty — OK for JSON file store; typical SaaS uses PostgreSQL."
    );
  } else {
    pass("DATABASE_URL is set (value not shown).");
  }

  if (stripeSecret.trim() && !stripeWebhook.trim()) {
    fail(
      "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing — webhook verification will fail."
    );
  }
  if (!stripeSecret.trim() && stripeWebhook.trim()) {
    warn(
      "STRIPE_WEBHOOK_SECRET without STRIPE_SECRET_KEY — verify this is intentional."
    );
  }
  if (!stripeSecret.trim() && !stripeWebhook.trim()) {
    warn(
      "Stripe keys absent — OK if billing is manual/off; otherwise set STRIPE_*."
    );
  }

  const externalAi =
    aiProvider &&
    aiProvider !== "off" &&
    aiProvider !== "disabled" &&
    aiProvider !== "none";

  if (externalAi && !String(openAiKey).trim()) {
    warn(
      "External AI configured but OPENAI_API_KEY is missing — expect AI fallbacks."
    );
  }

  const settingsSecret = process.env.APP_SETTINGS_SECRET || "";
  if (!String(settingsSecret).trim()) {
    warn(
      "APP_SETTINGS_SECRET is empty — often required for signed multi-tenant settings."
    );
  }

  const portNum = Number(serverPortRaw);
  if (serverPortRaw !== undefined && serverPortRaw !== "") {
    if (!Number.isFinite(portNum) || portNum <= 0) {
      warn("APP_SERVER_PORT should be a positive integer.");
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(
      `production-env-check: ${failed} failure(s), ${warned} warning(s).`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`production-env-check: OK (${warned} warning(s)).`);
}

runChecks();
