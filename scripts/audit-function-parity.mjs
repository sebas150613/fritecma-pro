import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LEGACY_FUNCTIONS_DIR = path.join(ROOT, "archive", "base44", "functions");
const REST_REGISTRY_PATH = path.join(ROOT, "app-schema", "functions.json");

const normalizeNames = (names) => [...new Set(names)].sort();

const main = async () => {
  const legacyEntries = await fs.readdir(LEGACY_FUNCTIONS_DIR, {
    withFileTypes: true,
  });
  const legacyFunctions = normalizeNames(
    legacyEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  );

  const registryRaw = await fs.readFile(REST_REGISTRY_PATH, "utf8");
  const registryFunctions = normalizeNames(
    JSON.parse(registryRaw).map((definition) => definition.name)
  );

  const missingInRest = legacyFunctions.filter(
    (name) => !registryFunctions.includes(name)
  );
  const extraInRest = registryFunctions.filter(
    (name) => !legacyFunctions.includes(name)
  );

  const ok = missingInRest.length === 0 && extraInRest.length === 0;

  console.log(
    JSON.stringify(
      {
        ok,
        legacy_functions: legacyFunctions.length,
        rest_registry_functions: registryFunctions.length,
        missing_in_rest: missingInRest,
        extra_in_rest: extraInRest,
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
  console.error("[audit-function-parity] FAILED");
  console.error(error);
  process.exitCode = 1;
});
