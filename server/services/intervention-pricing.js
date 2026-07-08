/**
 * Valoración server-side de partes (Intervention) y visitas (Visit).
 *
 * El servidor es la única fuente de verdad de los precios:
 *  - Roles de oficina (admin/superadmin/oficina/encargado): sus precios de
 *    línea se aceptan como override explícito, pero los totales de línea y
 *    del registro se recalculan siempre en servidor.
 *  - Roles de campo (tecnico/ayudante): los precios que envíe el cliente se
 *    IGNORAN. El servidor los resuelve: primero preservando la línea
 *    equivalente del registro existente (integridad histórica en ediciones),
 *    después desde el catálogo (Material.sell_price) o las tarifas de mano de
 *    obra de la organización, y en último caso 0 € (pendiente de oficina).
 *
 * Esto permite retirar sell_price y las tarifas de las respuestas para roles
 * de campo sin romper la creación/edición de partes.
 */
import { createJsonEntityStore } from "../lib/json-store.js";
import { canSeePrices } from "../lib/price-rbac.js";
import {
  getTarifa1Oficial,
  getTarifaOficialAyudante,
} from "../../src/lib/organizationTariffs.js";
import { computeTotalsFromLines } from "../../src/lib/displacementBilling.js";

const materialStore = createJsonEntityStore("Material");
const organizationSettingsStore = createJsonEntityStore("OrganizationSettings");

const PRICED_ENTITIES = {
  Intervention: "materials_json",
  Visit: "materials_json",
};

/** Campos de precio a nivel de registro que un rol de campo nunca puede fijar. */
const FIELD_ROLE_BLOCKED_FIELDS = [
  "subtotal",
  "iva_total",
  "total",
  "tarifa_aplicada",
  "discount_percent",
  "desplazamientos_cantidad",
  "desplazamiento_tramo_id",
  "desplazamiento_tramo_nombre",
  "desplazamiento_precio_unitario",
  "desplazamiento_total",
];

const round2 = (value) => Number((Number(value) || 0).toFixed(2));

const parseLines = (rawJson) => {
  if (rawJson == null || rawJson === "") {
    return [];
  }
  try {
    const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const isRealMaterialLine = (line) =>
  line?.material_id && line.material_id !== "__free_text__";

/**
 * Clave de emparejamiento línea-entrante ↔ línea-existente para preservar el
 * precio histórico en ediciones de roles de campo.
 */
const lineMatchKey = (line) => {
  if (!line || typeof line !== "object") {
    return "invalid";
  }
  if (line._isLabor) {
    return `labor|${line._tipoHorario || ""}|${line._laborMode || ""}`;
  }
  if (line._isDisplacementLine) {
    return `disp|${String(line.material_name || "").trim().toLowerCase()}`;
  }
  if (isRealMaterialLine(line)) {
    return `mat|${line.material_id}`;
  }
  return `free|${String(line.material_name || "").trim().toLowerCase()}|${line.unit || ""}`;
};

const buildExistingLineIndex = (existingLines) => {
  const index = new Map();
  for (const line of existingLines) {
    const key = lineMatchKey(line);
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key).push(line);
  }
  return index;
};

const takeExistingMatch = (index, line) => {
  const bucket = index.get(lineMatchKey(line));
  return bucket && bucket.length > 0 ? bucket.shift() : null;
};

const getTariffProfileForOrganization = async (organizationId) => {
  const rows = await organizationSettingsStore.filter({
    filter: { organization_id: organizationId },
    limit: 1,
  });
  return rows[0] || {};
};

const getMaterialForOrganization = async (materialId, organizationId) => {
  const rows = await materialStore.filter({
    filter: { id: String(materialId) },
    limit: 1,
  });
  const material = rows[0] || null;
  if (!material) {
    return null;
  }
  if (material.organization_id && material.organization_id !== organizationId) {
    return null;
  }
  return material;
};

const priceLaborLine = (line, tariffProfile) => {
  const tipoHorario = line._tipoHorario || "normal";
  return line._laborMode === "oficial_ayudante"
    ? getTarifaOficialAyudante(tariffProfile, tipoHorario)
    : getTarifa1Oficial(tariffProfile, tipoHorario);
};

/** ¿Aplica valoración server-side a esta escritura? */
export const shouldApplyServerPricing = (entityName, body) =>
  Object.prototype.hasOwnProperty.call(PRICED_ENTITIES, entityName) &&
  body &&
  typeof body === "object";

/**
 * Aplica la política de precios sobre req.body (mutación in place del objeto
 * devuelto; el llamante debe usar el retorno como body definitivo).
 *
 * @param {string} entityName Intervention | Visit
 * @param {object} body payload entrante (create o patch)
 * @param {object|null} existing registro previo (solo en PATCH)
 * @param {{ role: string, organizationId: string }} ctx
 */
export const applyServerPricing = async (entityName, body, existing, ctx) => {
  const linesField = PRICED_ENTITIES[entityName];
  const office = canSeePrices(ctx.role);
  const out = { ...body };
  const hasLines = Object.prototype.hasOwnProperty.call(out, linesField);

  if (office) {
    // Oficina: sus unit_price son override legítimo, pero los totales se
    // derivan SIEMPRE en servidor de las líneas enviadas.
    if (!hasLines) {
      return out;
    }
    const lines = parseLines(out[linesField]).map((line) => {
      if (!line || typeof line !== "object") {
        return line;
      }
      const quantity = Number(line.quantity) || 0;
      const unitPrice = Number(line.unit_price) || 0;
      return { ...line, unit_price: unitPrice, total: round2(quantity * unitPrice) };
    });
    const discount =
      Number(out.discount_percent ?? existing?.discount_percent ?? 0) || 0;
    const totals = computeTotalsFromLines(lines, discount);
    out[linesField] = JSON.stringify(lines);
    out.subtotal = round2(totals.subtotal);
    out.iva_total = round2(totals.ivaTotal);
    out.total = round2(totals.total);
    return out;
  }

  // Rol de campo: nunca puede fijar precios ni totales a nivel de registro.
  for (const field of FIELD_ROLE_BLOCKED_FIELDS) {
    delete out[field];
  }

  if (!hasLines) {
    return out;
  }

  const incoming = parseLines(out[linesField]);
  const existingIndex = buildExistingLineIndex(
    parseLines(existing?.[linesField])
  );
  const tariffProfile = await getTariffProfileForOrganization(ctx.organizationId);

  const pricedLines = [];
  for (const line of incoming) {
    if (!line || typeof line !== "object") {
      continue;
    }
    const quantity = Number(line.quantity) || 0;
    let unitPrice = 0;
    let ivaPercent = Number(line.iva_percent);

    const preserved = takeExistingMatch(existingIndex, line);
    if (preserved) {
      unitPrice = Number(preserved.unit_price) || 0;
      if (!Number.isFinite(ivaPercent)) {
        ivaPercent = Number(preserved.iva_percent);
      }
    } else if (line._isLabor) {
      unitPrice = priceLaborLine(line, tariffProfile);
    } else if (isRealMaterialLine(line)) {
      const material = await getMaterialForOrganization(
        line.material_id,
        ctx.organizationId
      );
      unitPrice = Number(material?.sell_price) || 0;
      if (!Number.isFinite(ivaPercent)) {
        ivaPercent = Number(material?.iva_percent);
      }
    }

    pricedLines.push({
      ...line,
      unit_price: round2(unitPrice),
      iva_percent: Number.isFinite(ivaPercent) ? ivaPercent : 21,
      total: round2(quantity * unitPrice),
    });
  }

  const discount = Number(existing?.discount_percent ?? 0) || 0;
  const totals = computeTotalsFromLines(pricedLines, discount);
  out[linesField] = JSON.stringify(pricedLines);
  out.subtotal = round2(totals.subtotal);
  out.iva_total = round2(totals.ivaTotal);
  out.total = round2(totals.total);

  const firstLabor = pricedLines.find((line) => line._isLabor);
  if (entityName === "Intervention" && firstLabor) {
    out.tarifa_aplicada = firstLabor.unit_price;
  }

  return out;
};
