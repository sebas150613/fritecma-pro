#!/usr/bin/env node
/**
 * Reconcile `organization_id` on Invoice records that predate per-tenant
 * VeriFactu scoping (numbering + hash chain are now per organization).
 *
 * The authoritative owner of an invoice is the organization of its
 * intervention. Legacy data may have invoices that are (a) missing the field
 * entirely, or (b) attributed to the wrong organization by an earlier batch
 * backfill. Both cases must collapse onto the intervention's organization so
 * the obligado tributario keeps a single, unbroken chain.
 *
 * Resolution order:
 *   1. The invoice's intervention (`Intervention.organization_id`) — authoritative.
 *   2. The invoice's existing `organization_id` (when no intervention match).
 *   3. DEFAULT_ORGANIZATION_ID (legacy single-tenant fallback).
 *
 * Changing `organization_id` does NOT affect hash integrity: the fingerprint is
 * derived from invoice number, date, NIF, totals and previous hash — never the
 * organization id.
 *
 * Default: dry-run (no writes). Use --write to persist.
 * JSON file store only; skips when DATABASE_URL is set (logs message).
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Mirrors DEFAULT_ORGANIZATION_ID in server/lib/tenant.js. Inlined so this
// ops script stays dependency-free (no pg import chain) and runnable in a
// minimal environment.
const DEFAULT_ORGANIZATION_ID = "org-frigest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const writeMode = argv.includes("--write");

const readJsonArray = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    if (e?.code === "ENOENT") {
      return [];
    }
    throw e;
  }
};

const run = async () => {
  if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) {
    console.log(
      "migrate-verifactu-per-organization: DATABASE_URL is set — migration targets JSON file store only. Skip."
    );
    process.exitCode = 0;
    return;
  }

  const dataDir = String(process.env.APP_DATA_DIR || "").trim()
    ? path.resolve(process.env.APP_DATA_DIR)
    : path.join(root, "server", "data");

  const invoicePath = path.join(dataDir, "entities", "Invoice.json");
  const interventionPath = path.join(dataDir, "entities", "Intervention.json");

  const invoices = await readJsonArray(invoicePath);
  if (invoices === null) {
    console.error("migrate-verifactu-per-organization: invalid Invoice.json shape.");
    process.exitCode = 1;
    return;
  }
  if (invoices.length === 0) {
    console.log(`migrate-verifactu-per-organization: no invoices at ${invoicePath} — nothing to do.`);
    process.exitCode = 0;
    return;
  }

  const interventions = (await readJsonArray(interventionPath)) || [];
  const interventionOrgById = new Map(
    interventions
      .filter((it) => it && it.id)
      .map((it) => [it.id, it.organization_id])
  );

  let changed = 0;
  const next = invoices.map((invoice) => {
    if (!invoice || typeof invoice !== "object") {
      return invoice;
    }

    const resolved =
      interventionOrgById.get(invoice.intervention_id) ||
      invoice.organization_id ||
      DEFAULT_ORGANIZATION_ID;

    if (resolved !== invoice.organization_id) {
      changed += 1;
      console.log(
        `  ${invoice.invoice_number || invoice.id}: organization_id ${
          invoice.organization_id || "(vacío)"
        } → ${resolved}`
      );
      return { ...invoice, organization_id: resolved };
    }
    return invoice;
  });

  console.log(
    `migrate-verifactu-per-organization: invoices=${invoices.length} would_change=${changed} write=${writeMode}`
  );

  if (writeMode && changed > 0) {
    await fs.writeFile(invoicePath, JSON.stringify(next, null, 2), "utf8");
    console.log("migrate-verifactu-per-organization: Invoice.json updated.");
  } else if (!writeMode && changed > 0) {
    console.log(
      "migrate-verifactu-per-organization: dry-run only — pass --write to persist."
    );
  }

  process.exitCode = 0;
};

run().catch((e) => {
  console.error("migrate-verifactu-per-organization: FAILED", e?.message || e);
  process.exitCode = 1;
});
