import fs from "node:fs";
import path from "node:path";

const ENTITY_DIR = path.resolve(process.cwd(), "app-schema", "entities");
const EXTRA_ENTITIES = ["StockEntry"];

const entityNames = (() => {
  const names = new Set(EXTRA_ENTITIES);

  if (fs.existsSync(ENTITY_DIR)) {
    for (const file of fs.readdirSync(ENTITY_DIR)) {
      if (file.endsWith(".jsonc")) {
        names.add(file.replace(/\.jsonc$/i, ""));
      }
    }
  }

  return [...names].sort();
})();

export const knownEntities = entityNames;

export const isKnownEntity = (entityName) => knownEntities.includes(entityName);
