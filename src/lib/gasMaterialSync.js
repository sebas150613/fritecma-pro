import { appApi } from "@/api/app-api";
import {
  materialCodeForGasType,
  materialNameForGasType,
  normalizeGasCompareKey,
  resolveCanonicalGasLabel,
} from "@/lib/refrigerantGases";

/**
 * Extrae la clave normalizada del tipo de gas desde un material de categoría gas_refrigerante.
 */
export function extractNormalizedGasKeyFromMaterial(m) {
  const code = String(m?.code || "");
  const fromCode = code.match(/^GAS[_-]?(.+)$/i);
  if (fromCode) {
    return normalizeGasCompareKey(fromCode[1]);
  }
  const name = String(m?.name || "");
  const fromName = name.match(/^Gas\s+(.+)$/i);
  if (fromName) {
    return normalizeGasCompareKey(fromName[1]);
  }
  return "";
}

export async function fetchGasRefrigeranteMaterials() {
  const all = await appApi.entities.Material.list("name", 1500).catch(() => []);
  return (all || []).filter((m) => m.category === "gas_refrigerante");
}

/**
 * Suma kg en botellas activas (excluye devuelta) para un tipo de gas (comparación flexible).
 */
export function gasDisplayLabelFromMaterial(m) {
  const code = String(m?.code || "");
  const c = code.match(/^GAS[_-]?(.+)$/i);
  if (c) return c[1].replace(/\s+/g, " ").trim();
  const n = String(m?.name || "").match(/^Gas\s+(.+)$/i);
  if (n) return n[1].replace(/\s+/g, " ").trim();
  return "";
}

export function getSyncedKgForGasMaterial(m, bottles) {
  const label = gasDisplayLabelFromMaterial(m);
  if (!label) return 0;
  return sumActiveGasKgFromBottles(label, bottles);
}

export function sumActiveGasKgFromBottles(gasTypeLabel, bottles) {
  const target = normalizeGasCompareKey(gasTypeLabel);
  if (!target) return 0;
  return (bottles || []).reduce((sum, b) => {
    if (b.status === "devuelta") return sum;
    if (b.status !== "activa") return sum;
    if (normalizeGasCompareKey(b.gas_type) !== target) return sum;
    return sum + (parseFloat(b.carga_actual) || 0);
  }, 0);
}

export async function findGasMaterialForType(gasTypeLabel, cacheList = null, legacyExtras = []) {
  const materials = cacheList ?? (await fetchGasRefrigeranteMaterials());
  const display = resolveCanonicalGasLabel(gasTypeLabel, legacyExtras);
  const target = normalizeGasCompareKey(display);
  if (!target) return null;
  const codeWant = materialCodeForGasType(display).toUpperCase();
  for (const m of materials) {
    const key = extractNormalizedGasKeyFromMaterial(m);
    if (key && key === target) return m;
    if (String(m.code || "").trim().toUpperCase() === codeWant) return m;
  }
  return null;
}

/**
 * Crea o actualiza el material agrupado para un tipo de gas y sincroniza stock desde botellas activas.
 * @param {string} gasTypeLabel - etiqueta final del gas (p.ej. R449A)
 * @param {object[]|null} bottlesOverride - lista opcional de botellas ya cargada
 */
export async function syncGasMaterialStock(gasTypeLabel, bottlesOverride = null) {
  const bottles =
    bottlesOverride ?? (await appApi.entities.GasBottle.list("-created_date", 500).catch(() => []));
  const extras = [...new Set((bottles || []).map((b) => b.gas_type).filter(Boolean))];
  const display = resolveCanonicalGasLabel(gasTypeLabel, extras);
  if (!display) return null;
  if (normalizeGasCompareKey(display) === normalizeGasCompareKey("Otro")) {
    return null;
  }

  const stockQty = sumActiveGasKgFromBottles(display, bottles);
  const code = materialCodeForGasType(display);
  const name = materialNameForGasType(display);

  const gasMaterials = await fetchGasRefrigeranteMaterials();
  let mat =
    (await findGasMaterialForType(display, gasMaterials, extras)) ||
    gasMaterials.find((m) => String(m.code || "").trim().toUpperCase() === code.toUpperCase());

  if (!mat) {
    mat = await appApi.entities.Material.create({
      code,
      name,
      category: "gas_refrigerante",
      unit: "kg",
      stock_quantity: stockQty,
      min_stock: 0,
      iva_percent: 21,
      is_active: true,
      sell_price: 0,
      cost_price: 0,
    });
    return mat;
  }

  await appApi.entities.Material.update(mat.id, {
    stock_quantity: stockQty,
    code: mat.code || code,
    name: mat.name || name,
    category: "gas_refrigerante",
    unit: "kg",
  });
  return { ...mat, stock_quantity: stockQty, code: mat.code || code, name: mat.name || name };
}
