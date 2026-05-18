import express from "express";
import { timingSafeEqual } from "node:crypto";
import { asyncHandler } from "../lib/async-handler.js";
import { canAccessHiddenUsers, requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { serverConfig } from "../config.js";
import {
  listBackups,
  createBackup,
  restoreBackup,
  createBackupsForAllOrgs,
} from "../services/backup-service.js";

const router = express.Router();

// ── Cron endpoint — NO session auth, protected by secret header ───────────────
// POST /api/backups/cron/run-all

router.post(
  "/cron/run-all",
  asyncHandler(async (req, res) => {
    const secret = serverConfig.backupSecret;
    if (!secret) {
      throw new HttpError(503, "Backup secret no configurado en este servidor.");
    }
    const provided = String(req.headers["x-backup-secret"] || "");
    // Pad to same length for timingSafeEqual (must have equal lengths)
    const expBuf = Buffer.from(secret, "utf8");
    const actBuf = Buffer.from(provided.padEnd(secret.length, "\0").slice(0, secret.length), "utf8");
    if (!timingSafeEqual(expBuf, actBuf)) {
      throw new HttpError(401, "Unauthorized");
    }

    console.log("[backup] Cron run-all iniciado");
    const result = await createBackupsForAllOrgs();
    console.log(`[backup] Cron run-all completado — ${result.total} orgs procesadas`);
    res.json({ ok: true, ...result });
  })
);

// ── Session auth required for all routes below ────────────────────────────────

router.use(requireAuth);

const requireOwner = (req, _res, next) => {
  if (!canAccessHiddenUsers(req.currentUser)) {
    throw new HttpError(403, "Forbidden");
  }
  next();
};

// Application-level rate limit: max 10 backup/restore ops per IP per 15 min
const opCounts = new Map();
const OP_WINDOW_MS = 15 * 60 * 1000;
const OP_MAX = 10;

const backupRateLimit = (req, _res, next) => {
  const key = String(req.ip);
  const now = Date.now();
  const entry = opCounts.get(key) || { count: 0, resetAt: now + OP_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + OP_WINDOW_MS;
  }
  entry.count += 1;
  opCounts.set(key, entry);
  if (entry.count > OP_MAX) {
    throw new HttpError(429, "Demasiadas operaciones. Espera unos minutos.");
  }
  next();
};

// ── List backups for an org ───────────────────────────────────────────────────
// GET /api/backups/:orgId

router.get(
  "/:orgId",
  requireOwner,
  asyncHandler(async (req, res) => {
    const backups = await listBackups(req.params.orgId);
    res.json({ backups });
  })
);

// ── Create backup now ─────────────────────────────────────────────────────────
// POST /api/backups/:orgId

router.post(
  "/:orgId",
  requireOwner,
  backupRateLimit,
  asyncHandler(async (req, res) => {
    const { orgId } = req.params;
    const info = await createBackup(orgId);
    console.log(
      `[backup] Backup manual — owner=${req.currentUser?.email} org=${orgId} file=${info.filename}`
    );
    res.json({ ok: true, backup: info });
  })
);

// ── Restore a backup ──────────────────────────────────────────────────────────
// POST /api/backups/:orgId/restore/:filename

router.post(
  "/:orgId/restore/:filename",
  requireOwner,
  backupRateLimit,
  asyncHandler(async (req, res) => {
    const { orgId, filename } = req.params;
    console.log(
      `[backup] Restauración iniciada — owner=${req.currentUser?.email} org=${orgId} file=${filename}`
    );
    const result = await restoreBackup(orgId, filename);
    console.log(
      `[backup] Restauración completada — org=${orgId} registros=${result.restored_records}`
    );
    res.json({ ok: true, ...result });
  })
);

export default router;
