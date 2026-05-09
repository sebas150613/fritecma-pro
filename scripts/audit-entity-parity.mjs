import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LEGACY_ENTITIES_DIR = path.join(ROOT, "archive", "base44", "entities");
const REST_SCHEMA_DIR = path.join(ROOT, "app-schema", "entities");

const normalizeNames = (names) => [...new Set(names)].sort();

const readEntityNames = async (dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return normalizeNames(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonc"))
      .map((entry) => entry.name.replace(/\.jsonc$/i, ""))
  );
};

const main = async () => {
  const legacyEntities = await readEntityNames(LEGACY_ENTITIES_DIR);
  const appSchemaEntities = await readEntityNames(REST_SCHEMA_DIR);

  const missingInAppSchema = legacyEntities.filter(
    (name) => !appSchemaEntities.includes(name)
  );
  const extraInAppSchema = appSchemaEntities.filter(
    (name) => !legacyEntities.includes(name)
  );

  const ok = missingInAppSchema.length === 0 && extraInAppSchema.length === 0;

  console.log(
    JSON.stringify(
      {
        ok,
        legacy_entities: legacyEntities.length,
        app_schema_entities: appSchemaEntities.length,
        missing_in_app_schema: missingInAppSchema,
        extra_in_app_schema: extraInAppSchema,
      },
      null,
      2
    )
  );

  if (!ok) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("[audit-entity-parity] FAILED");
  console.error(error);
  process.exitCode = 1;
});
