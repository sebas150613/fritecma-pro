/**
 * Regla de negocio: los roles de campo (tecnico/ayudante) nunca ven precios.
 * Este módulo centraliza qué campos son "de precio" por entidad y cómo
 * eliminarlos de las respuestas de la API para esos roles. La UI ya los
 * oculta; esto lo garantiza a nivel de servidor.
 */
import { canOperateOffice, resolveAppRole } from "./roles.js";

/** admin / superadmin / oficina (encargado se normaliza a admin). */
export const canSeePrices = (role) => canOperateOffice(role);

export const isFieldRole = (role) =>
  ["tecnico", "ayudante"].includes(resolveAppRole({ role }));

/** Campos de precio dentro de una línea de materials_json / lines_json. */
const LINE_PRICE_FIELDS = ["unit_price", "total", "sell_price", "cost_price", "price"];

/** Campos de precio a nivel de registro, por entidad. */
const ENTITY_PRICE_FIELDS = {
  Invoice: {
    fields: [
      "subtotal",
      "iva_total",
      "total",
      "rectified_base",
      "rectified_tax",
      // el XML AEAT contiene los importes de la factura
      "xml_payload",
    ],
    linesField: "lines_json",
  },
  RecurringInvoice: {
    fields: ["subtotal", "iva_total", "total"],
    linesField: "lines_json",
  },
  Budget: {
    fields: ["subtotal", "iva_total", "total", "discount_percent"],
    linesField: "lines_json",
  },
  Intervention: {
    fields: [
      "subtotal",
      "iva_total",
      "total",
      "tarifa_aplicada",
      "discount_percent",
      "desplazamiento_precio_unitario",
      "desplazamiento_total",
    ],
    linesField: "materials_json",
  },
  Visit: {
    fields: ["subtotal", "iva_total", "total"],
    linesField: "materials_json",
  },
  Material: {
    fields: ["sell_price", "cost_price"],
    linesField: null,
  },
  PurchaseOrder: {
    fields: [],
    linesField: "lines_json",
  },
};

/**
 * Campos de OrganizationSettings con información de precios o facturación que
 * no deben llegar a los roles de campo (ni fusionados en /me ni al leer la
 * entidad OrganizationSettings).
 */
export const ORG_SETTINGS_PRICE_FIELDS = [
  "tarifa_1_oficial_normal",
  "tarifa_1_oficial_extra",
  "tarifa_1_oficial_nocturna",
  "tarifa_1_oficial_festiva",
  "tarifa_oficial_ayudante_normal",
  "tarifa_oficial_ayudante_extra",
  "tarifa_oficial_ayudante_nocturna",
  "tarifa_oficial_ayudante_festiva",
  // cada tramo lleva su precio
  "desplazamiento_tramos_json",
  "factura_serie_prefijo",
  "factura_serie_anual",
  "factura_iban",
  "factura_condiciones_pago",
  "factura_vencimiento_dias",
];

const stripLinePrices = (rawJson) => {
  if (rawJson == null || rawJson === "") {
    return rawJson;
  }
  try {
    const lines = JSON.parse(rawJson);
    if (!Array.isArray(lines)) {
      return rawJson;
    }
    const sanitized = lines.map((line) => {
      if (!line || typeof line !== "object") {
        return line;
      }
      const out = { ...line };
      for (const field of LINE_PRICE_FIELDS) {
        delete out[field];
      }
      return out;
    });
    return JSON.stringify(sanitized);
  } catch {
    // JSON ilegible: mejor no exponerlo que arriesgar una fuga.
    return "[]";
  }
};

const stripRecordPrices = (entityName, record) => {
  const spec = ENTITY_PRICE_FIELDS[entityName];
  if (!spec || !record || typeof record !== "object") {
    return record;
  }
  const out = { ...record };
  for (const field of spec.fields) {
    delete out[field];
  }
  if (spec.linesField && out[spec.linesField] !== undefined) {
    out[spec.linesField] = stripLinePrices(out[spec.linesField]);
  }
  return out;
};

/**
 * Elimina los campos de precio de un registro (o lista de registros) de
 * entidad para los roles que no pueden verlos. Para el resto, no cambia nada.
 */
export const sanitizeEntityPricesForRole = (entityName, value, role) => {
  if (canSeePrices(role) || !ENTITY_PRICE_FIELDS[entityName]) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripRecordPrices(entityName, item));
  }
  return stripRecordPrices(entityName, value);
};

/**
 * Elimina tarifas y configuración de facturación de un objeto de settings ya
 * sanitizado (o del usuario fusionado de /me) para roles de campo.
 */
export const sanitizeOrgSettingsPricesForRole = (settings, role) => {
  if (!settings || typeof settings !== "object" || canSeePrices(role)) {
    return settings;
  }
  const out = { ...settings };
  for (const field of ORG_SETTINGS_PRICE_FIELDS) {
    delete out[field];
  }
  return out;
};
