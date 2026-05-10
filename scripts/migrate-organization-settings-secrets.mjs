#!/usr/bin/env node
/**
 * Migrate plaintext OrganizationSettings secrets to enc:v1 (AES-256-GCM).
 *
 * Default: dry-run (no writes). Use --write to persist.
 * Requires APP_SETTINGS_SECRET (same as production server).
 * JSON file store only; skips when DATABASE_URL is set (logs message).
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  decryptOrganizationSettingsFromStorage,
  encryptOrganizationSettingsForStorage,
} from "../server/lib/tenant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const writeMode = argv.includes("--write");

const run = async () => {
  if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) {
    console.log(
      "migrate-organization-settings-secrets: DATABASE_URL is set — migration targets JSON file store only. Skip."
    );
    process.exitCode = 0;
    return;
  }

  const secret = String(process.env.APP_SETTINGS_SECRET || "").trim();
  if (!secret || secret.length < 32) {
    console.error(
      "migrate-organization-settings-secrets: APP_SETTINGS_SECRET must be set (min 32 chars)."
    );
    process.exitCode = 1;
    return;
  }

  const dataDir = String(process.env.APP_DATA_DIR || "").trim()
    ? path.resolve(process.env.APP_DATA_DIR)
    : path.join(root, "server", "data");
  const filePath = path.join(dataDir, "entities", "OrganizationSettings.json");

  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") {
      console.log(
        `migrate-organization-settings-secrets: no file at ${filePath} — nothing to do.`
      );
      process.exitCode = 0;
      return;
    }
    throw e;
  }

  const records = JSON.parse(raw);
  if (!Array.isArray(records)) {
    console.error("migrate-organization-settings-secrets: invalid JSON shape.");
    process.exitCode = 1;
    return;
  }

  let changed = 0;
  const next = records.map((row) => {
    const decrypted = decryptOrganizationSettingsFromStorage(row);
    const reencrypted = encryptOrganizationSettingsForStorage(decrypted);
    const same = JSON.stringify(row) === JSON.stringify(reencrypted);
    if (!same) {
      changed += 1;
    }
    return reencrypted;
  });

  console.log(
    `migrate-organization-settings-secrets: records=${records.length} would_change=${changed} write=${writeMode}`
  );

  if (writeMode && changed > 0) {
    await fs.writeFile(filePath, JSON.stringify(next, null, 2), "utf8");
    console.log("migrate-organization-settings-secrets: file updated.");
  } else if (!writeMode && changed > 0) {
    console.log(
      "migrate-organization-settings-secrets: dry-run only — pass --write to persist."
    );
  }

  process.exitCode = 0;
};

run().catch((e) => {
  console.error("migrate-organization-settings-secrets: FAILED", e?.message || e);
  process.exitCode = 1;
});
