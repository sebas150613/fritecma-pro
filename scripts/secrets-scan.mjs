#!/usr/bin/env node
/**
 * Scans git-tracked files for probable secrets (heuristic). Does not print full values.
 * Uses `git ls-files` so local untracked .env does not false-positive.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const MAX_FILE_BYTES = 600_000;

const SKIP_PATH_PREFIXES = [
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".next/",
];

const SKIP_BASENAMES = new Set(["package-lock.json"]);

const SKIP_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".p12",
  ".pem",
  ".sig",
  ".gz",
  ".exe",
  ".dll",
  ".mp4",
  ".webm",
  ".mp3",
]);

function mask(value) {
  const s = String(value);
  if (s.length <= 8) {
    return "[redacted]";
  }
  return `${s.slice(0, 4)}...${s.slice(-4)} (len ${s.length})`;
}

function isLikelyPlaceholderLine(line) {
  const t = line.trim();
  if (/=\s*$/.test(t)) {
    return true;
  }
  if (/postgres:\/\/user:password@/i.test(t)) {
    return true;
  }
  if (/^[#/>\s`-]*$/m.test(t) && t.length < 2) {
    return true;
  }
  if (/\b(fake|dummy|placeholder|changeme|xxxxxxxx|your-key|your_key|example\.org)\b/i.test(t)) {
    return true;
  }
  return false;
}

function shouldSkipPath(rel) {
  const norm = rel.replace(/\\/g, "/");
  for (const p of SKIP_PATH_PREFIXES) {
    if (norm.startsWith(p)) {
      return true;
    }
  }
  const base = path.basename(norm);
  if (SKIP_BASENAMES.has(base)) {
    return true;
  }
  const ext = path.extname(base).toLowerCase();
  if (SKIP_EXT.has(ext)) {
    return true;
  }
  return false;
}

function isForbiddenEnvFilename(rel) {
  const base = path.basename(rel.replace(/\\/g, "/"));
  if (base.includes("example")) {
    return false;
  }
  return (
    base === ".env" ||
    base === ".env.local" ||
    base === ".env.production"
  );
}

/** @typedef {{ pattern: string, re: RegExp, multi?: boolean }} PatternDef */

/** Line-based patterns (single-line matches). */
const LINE_PATTERNS = /** @type {PatternDef[]} */ ([
  {
    pattern: "stripe_secret_live",
    re: /\bsk_live_[0-9a-zA-Z]{20,}\b/,
  },
  {
    pattern: "stripe_secret_test",
    re: /\bsk_test_[0-9a-zA-Z]{20,}\b/,
  },
  {
    pattern: "stripe_publishable_live",
    re: /\bpk_live_[0-9a-zA-Z]{20,}\b/,
  },
  {
    pattern: "stripe_publishable_test",
    re: /\bpk_test_[0-9a-zA-Z]{20,}\b/,
  },
  {
    pattern: "stripe_webhook_secret",
    re: /\bwhsec_[0-9a-zA-Z]{10,}\b/,
  },
  {
    pattern: "github_classic_pat",
    re: /\bghp_[A-Za-z0-9]{20,}\b/,
  },
  {
    pattern: "github_fine_pat",
    re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  {
    pattern: "aws_access_key",
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    pattern: "openai_api_key",
    re: /\bsk-(?:proj-)?[a-zA-Z0-9_-]{10,}\b/,
  },
]);

function findMultilinePem(content) {
  const findings = [];
  const re =
    /-----BEGIN[A-Z ]+PRIVATE KEY-----[\s\S]{20,8000}?-----END[A-Z ]+PRIVATE KEY-----/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const pos = m.index;
    const line = content.slice(0, pos).split("\n").length;
    findings.push({
      pattern: "pem_private_block",
      line,
      match: "[PEM private key block]",
    });
  }
  return findings;
}

function listTrackedFiles() {
  try {
    const buf = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], {
      cwd: ROOT,
      maxBuffer: 20 * 1024 * 1024,
    });
    return buf
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
  } catch {
    console.error(
      "[secrets-scan] FAIL: could not run `git ls-files` — run from a git checkout."
    );
    process.exitCode = 1;
    return [];
  }
}

function scanFile(relPath) {
  const full = path.join(ROOT, relPath);
  const findings = [];

  if (isForbiddenEnvFilename(relPath)) {
    findings.push({
      relPath,
      line: 0,
      pattern: "tracked_env_file",
      masked: "(file should not be tracked — use .env.example)",
    });
    return findings;
  }

  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return findings;
  }
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
    return findings;
  }

  let raw;
  try {
    raw = fs.readFileSync(full);
  } catch {
    return findings;
  }
  if (raw.includes(0)) {
    return findings;
  }

  const content = raw.toString("utf8");
  for (const pem of findMultilinePem(content)) {
    findings.push({
      relPath,
      line: pem.line,
      pattern: pem.pattern,
      masked: pem.match,
    });
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (isLikelyPlaceholderLine(line)) {
      return;
    }

    for (const { pattern, re } of LINE_PATTERNS) {
      const m = line.match(re);
      if (m) {
        findings.push({
          relPath,
          line: idx + 1,
          pattern,
          masked: mask(m[0]),
        });
      }
    }

    const jwtRe =
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
    for (const jm of line.matchAll(jwtRe)) {
      const tok = jm[0];
      if (tok.length < 60) {
        continue;
      }
      findings.push({
        relPath,
        line: idx + 1,
        pattern: "jwt_blob",
        masked: mask(tok),
      });
    }
  });

  return findings;
}

function main() {
  const tracked = listTrackedFiles();
  if (process.exitCode === 1) {
    return;
  }

  const all = [];
  for (const rel of tracked) {
    const norm = rel.replace(/\\/g, "/");
    if (shouldSkipPath(norm)) {
      continue;
    }
    all.push(...scanFile(rel));
  }

  if (all.length === 0) {
    console.log("secrets-scan: OK (no probable secrets in tracked files).");
    return;
  }

  console.error("secrets-scan: probable secret material detected:\n");
  for (const f of all) {
    console.error(
      `  ${f.relPath}:${f.line || "?"}  [${f.pattern}]  ${f.masked}`
    );
  }
  console.error(
    "\nsecrets-scan: remove or rotate credentials; use env vars + gitignore."
  );
  process.exitCode = 1;
}

main();
