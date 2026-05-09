/**
 * Lista oficial de gases refrigerantes (climatización / refrigeración).
 * Incluye los mínimos solicitados y referencias habituales en UE.
 * Compatibilidad: matching por texto ignora mayúsculas y espacios.
 */

/** @type {readonly string[]} */
export const REFRIGERANT_GAS_CANONICAL_LIST = Object.freeze([
  "R134a",
  "R404A",
  "R407A",
  "R407C",
  "R407F",
  "R410A",
  "R417A",
  "R421A",
  "R422B",
  "R422D",
  "R423A",
  "R424A",
  "R426A",
  "R427A",
  "R428A",
  "R430A",
  "R434A",
  "R437A",
  "R438A",
  "R440A",
  "R441A",
  "R442A",
  "R444B",
  "R445A",
  "R447A",
  "R447B",
  "R448A",
  "R449A",
  "R450A",
  "R452A",
  "R452B",
  "R453A",
  "R454B",
  "R454C",
  "R455A",
  "R458A",
  "R459A",
  "R460C",
  "R463A",
  "R468A",
  "R469A",
  "R470A",
  "R471A",
  "R472A",
  "R473A",
  "R474A",
  "R475A",
  "R502A",
  "R507A",
  "R508B",
  "R513A",
  "R513B",
  "R515B",
  "R516A",
  "R32",
  "R290",
  "R600a",
  "R744",
  "R1234yf",
  "R1234ze(E)",
  "R1234ze",
  "R22",
  "R717",
  "Otro",
]);

export const GAS_TYPE_OTHER_LABEL = "Otro";

/** Compact key: lowercase, sin espacios — para comparar botellas / materiales */
export function normalizeGasCompareKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9()]/gi, "");
}

const CANONICAL_BY_KEY = new Map();
for (const g of REFRIGERANT_GAS_CANONICAL_LIST) {
  CANONICAL_BY_KEY.set(normalizeGasCompareKey(g), g);
}

/** Coincide entrada del usuario con la etiqueta canónica si existe */
export function resolveCanonicalGasLabel(raw, extraLegacyTypes = []) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const compact = normalizeGasCompareKey(t);
  if (CANONICAL_BY_KEY.has(compact)) {
    return CANONICAL_BY_KEY.get(compact);
  }
  for (const leg of extraLegacyTypes) {
    if (!leg) continue;
    if (normalizeGasCompareKey(leg) === compact) {
      return String(leg).trim();
    }
  }
  return t.replace(/\s+/g, " ").trim().toUpperCase();
}

export function isOfficialGasType(value) {
  const k = normalizeGasCompareKey(value);
  if (!k || k === normalizeGasCompareKey(GAS_TYPE_OTHER_LABEL)) return false;
  return CANONICAL_BY_KEY.has(k);
}

export function materialCodeForGasType(displayLabel) {
  const slug = String(displayLabel || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  return `GAS-${slug}`;
}

export function materialNameForGasType(displayLabel) {
  const label = String(displayLabel || "").trim();
  return label ? `Gas ${label}` : "";
}

/** Validación mensaje requerido por negocio */
export const GAS_OTHER_REQUIRED_MESSAGE = "Indica el tipo de gas personalizado para continuar.";

export function validateOtherGasDraft(otherUiActive, otherDraft) {
  if (!otherUiActive) return true;
  return String(otherDraft || "").trim().length > 0;
}
