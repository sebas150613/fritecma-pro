import fs from "node:fs";
import path from "node:path";

const REGISTRY_PATH = path.resolve(process.cwd(), "app-schema", "functions.json");

const functionDefinitions = (() => {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return [];
  }

  const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (definition) =>
      definition &&
      typeof definition.name === "string" &&
      Array.isArray(definition.roles)
  );
})();

const functionDefinitionMap = new Map(
  functionDefinitions.map((definition) => [definition.name, definition])
);

export const knownFunctions = functionDefinitions.map(
  (definition) => definition.name
);

export const getFunctionDefinition = (functionName) =>
  functionDefinitionMap.get(functionName) || null;
