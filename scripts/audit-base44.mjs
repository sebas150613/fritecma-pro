import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".vite",
]);

/** Paths where Base44 mentions are expected (historical archive, tooling, lockfile metadata). */
const LEGACY_ALLOWED_PREFIXES = [
  "archive/base44/",
  "README.md",
  "package.json",
  "package-lock.json",
  "scripts/audit-base44.mjs",
  "scripts/audit-entity-parity.mjs",
  "scripts/audit-function-parity.mjs",
];

/** Application/runtime roots that must stay Base44-free (matches only unexpected hits). */
const isActiveApplicationPath = (relativePath) => {
  const n = relativePath.replace(/\\/g, "/");
  return (
    n.startsWith("src/") ||
    n.startsWith("server/") ||
    n === "vite.config.js" ||
    n === "vite.config.ts" ||
    n === "vite.config.mjs"
  );
};

const PATTERNS = [
  "@base44/sdk",
  "media.base44.com",
  "VITE_BASE44_",
  "VITE_APP_BASE_URL",
  "base44.app",
  "base44",
];

const shouldIgnorePath = (relativePath) => {
  const parts = relativePath.split(path.sep);
  return parts.some((part) => IGNORED_DIRS.has(part));
};

const isAllowedLegacyPath = (relativePath) =>
  LEGACY_ALLOWED_PREFIXES.some((prefix) =>
    relativePath.replace(/\\/g, "/").startsWith(prefix)
  );

const collectFiles = async (dirPath, results = []) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(ROOT, fullPath);

    if (shouldIgnorePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectFiles(fullPath, results);
      continue;
    }

    results.push(fullPath);
  }

  return results;
};

const main = async () => {
  const files = await collectFiles(ROOT);
  const findings = [];

  for (const filePath of files) {
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
    const raw = await fs.readFile(filePath, "utf8").catch(() => null);

    if (raw === null) {
      continue;
    }

    const lines = raw.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (!PATTERNS.some((pattern) => line.includes(pattern))) {
        return;
      }

      findings.push({
        path: relativePath,
        line: index + 1,
        allowed: isAllowedLegacyPath(relativePath),
        text: line.trim(),
      });
    });
  }

  const unexpected = findings.filter((item) => !item.allowed);
  const unexpectedActive = unexpected.filter((item) =>
    isActiveApplicationPath(item.path)
  );

  if (unexpected.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          unexpected_references: 0,
          unexpected_active_hits: 0,
          total_scanned_hits: findings.length,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: false,
        unexpected_references: unexpected.length,
        unexpected_active_hits: unexpectedActive.length,
        total_scanned_hits: findings.length,
        unexpected,
        unexpected_active: unexpectedActive,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
};

main().catch((error) => {
  console.error("[audit-base44] FAILED");
  console.error(error);
  process.exitCode = 1;
});
