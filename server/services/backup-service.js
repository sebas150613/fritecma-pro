import pg from "pg";
import { createGzip, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { encryptSecret, decryptSecret } from "../lib/secret-crypto.js";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { serverConfig } from "../config.js";

const { Pool } = pg;

const MAX_BACKUPS = 5;
const BACKUP_VERSION = 1;
// filename: backup_2026-05-18T03-00-00.json.gz
const FILENAME_RE = /^backup_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json\.gz$/;

let _pool = null;

const getPool = () => {
  if (!serverConfig.databaseUrl) return null;
  if (!_pool) {
    _pool = new Pool({
      connectionString: serverConfig.databaseUrl,
      ssl: serverConfig.databaseSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return _pool;
};

const requirePool = () => {
  const pool = getPool();
  if (!pool) throw new Error("PostgreSQL no está configurado; backup no disponible.");
  return pool;
};

// Sanitize org ID → safe directory name (no path traversal)
const safeOrgSegment = (orgId) => {
  const safe = String(orgId).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!safe || safe.length > 128) throw new Error("Identificador de organización inválido.");
  return safe;
};

const getOrgBackupDir = (orgId) =>
  path.join(serverConfig.backupDir, safeOrgSegment(orgId));

// ── List ──────────────────────────────────────────────────────────────────────

export const listBackups = async (orgId) => {
  const dir = getOrgBackupDir(orgId);
  let files;
  try {
    files = await fs.readdir(dir);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }

  const backupFiles = files
    .filter((f) => FILENAME_RE.test(f))
    .sort()
    .reverse()
    .slice(0, MAX_BACKUPS);

  return Promise.all(
    backupFiles.map(async (filename) => {
      const stat = await fs.stat(path.join(dir, filename));
      // "backup_2026-05-18T03-00-00.json.gz" → "2026-05-18T03:00:00"
      const iso = filename
        .replace("backup_", "")
        .replace(".json.gz", "")
        .replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
      return { filename, created_at: iso, size_bytes: stat.size };
    })
  );
};

// ── Rotate (keep at most MAX_BACKUPS - 1 before adding a new one) ────────────

const rotateBackups = async (orgId) => {
  const dir = getOrgBackupDir(orgId);
  let files;
  try {
    files = await fs.readdir(dir);
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  const backupFiles = files.filter((f) => FILENAME_RE.test(f)).sort(); // oldest first
  while (backupFiles.length >= MAX_BACKUPS) {
    await fs.unlink(path.join(dir, backupFiles.shift()));
  }
};

// ── Create ────────────────────────────────────────────────────────────────────

export const createBackup = async (orgId) => {
  const pool = requirePool();

  const dir = getOrgBackupDir(orgId);
  await fs.mkdir(dir, { recursive: true });
  await fs.chmod(dir, 0o700);

  await rotateBackups(orgId);

  const result = await pool.query(
    `SELECT entity_name, record_id, payload, created_at, updated_at
     FROM app_entity_records
     WHERE payload->>'organization_id' = $1`,
    [orgId]
  );

  const records = result.rows;
  const recordsJson = JSON.stringify(records);
  const checksum = createHash("sha256").update(recordsJson).digest("hex");

  const backupPayload = JSON.stringify({
    version: BACKUP_VERSION,
    org_id: orgId,
    created_at: new Date().toISOString(),
    record_count: records.length,
    checksum,
    records,
  });

  const encryptedPayload = encryptSecret(backupPayload, {
    secret: serverConfig.backupSecret,
  });

  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const filename = `backup_${timestamp}.json.gz`;
  const filePath = path.join(dir, filename);

  await pipeline(
    Readable.from([encryptedPayload]),
    createGzip({ level: 9 }),
    createWriteStream(filePath)
  );
  await fs.chmod(filePath, 0o600);

  const stat = await fs.stat(filePath);
  return {
    filename,
    created_at: new Date().toISOString(),
    record_count: records.length,
    size_bytes: stat.size,
    checksum,
  };
};

// ── Restore ───────────────────────────────────────────────────────────────────

export const restoreBackup = async (orgId, filename) => {
  if (!FILENAME_RE.test(filename)) {
    throw new Error("Nombre de archivo de backup inválido.");
  }

  const pool = requirePool();
  const dir = getOrgBackupDir(orgId);
  const filePath = path.join(dir, filename);

  // Prevent path traversal: resolved path must start with the backup dir
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    throw new Error("Acceso denegado.");
  }

  // Read + decompress + decrypt
  const compressed = await fs.readFile(resolvedFile);
  const raw = gunzipSync(compressed);
  const decryptedRaw = decryptSecret(raw.toString("utf8"), {
    secret: serverConfig.backupSecret,
  });
  const backup = JSON.parse(decryptedRaw);

  // Validate version
  if (backup.version !== BACKUP_VERSION) {
    throw new Error(`Versión de backup incompatible: ${backup.version}`);
  }

  // Validate org ownership — backup must match requested org
  if (backup.org_id !== orgId) {
    throw new Error("El backup no corresponde a esta organización.");
  }

  // Verify checksum integrity
  const checksum = createHash("sha256")
    .update(JSON.stringify(backup.records))
    .digest("hex");
  if (checksum !== backup.checksum) {
    throw new Error("El backup está corrupto (checksum no coincide).");
  }

  // Verify every record belongs to this org — prevents cross-org contamination
  for (const record of backup.records) {
    if (record.payload?.organization_id !== orgId) {
      throw new Error(
        "El backup contiene registros de otra organización. Restauración abortada."
      );
    }
  }

  // Safety net: create a pre-restore snapshot of current state
  try {
    await createBackup(orgId);
  } catch (_) {
    // Non-fatal: log but continue
    console.error("[backup] No se pudo crear snapshot pre-restauración.");
  }

  // Transactional restore
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM app_entity_records WHERE payload->>'organization_id' = $1`,
      [orgId]
    );

    for (const record of backup.records) {
      await client.query(
        `INSERT INTO app_entity_records
           (entity_name, record_id, payload, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
         ON CONFLICT (entity_name, record_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
        [
          record.entity_name,
          record.record_id,
          JSON.stringify(record.payload),
          record.created_at,
          record.updated_at,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return {
    restored_records: backup.records.length,
    backup_date: backup.created_at,
  };
};

// ── Run all (for cron) ────────────────────────────────────────────────────────

export const createBackupsForAllOrgs = async () => {
  const pool = requirePool();

  const result = await pool.query(
    `SELECT DISTINCT payload->>'organization_id' AS org_id
     FROM app_entity_records
     WHERE payload->>'organization_id' IS NOT NULL
       AND payload->>'organization_id' <> ''`
  );

  const orgIds = result.rows.map((r) => r.org_id).filter(Boolean);
  const results = [];

  for (const orgId of orgIds) {
    try {
      const info = await createBackup(orgId);
      console.log(`[backup] OK org=${orgId} file=${info.filename} records=${info.record_count}`);
      results.push({ org_id: orgId, success: true, filename: info.filename });
    } catch (e) {
      console.error(`[backup] FAIL org=${orgId}:`, e.message);
      results.push({ org_id: orgId, success: false, error: e.message });
    }
  }

  return { total: orgIds.length, results };
};
