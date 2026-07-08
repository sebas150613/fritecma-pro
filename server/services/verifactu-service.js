import { createJsonEntityStore, createJsonFileStore } from "../lib/json-store.js";
import { HttpError } from "../lib/http-error.js";
import {
  DEFAULT_ORGANIZATION_ID,
  decryptOrganizationSettingsFromStorage,
  getOrganizationSettingsStore,
} from "../lib/tenant.js";
import {
  VERIFACTU_PRODUCTION_ENDPOINT,
  VERIFACTU_SANDBOX_ENDPOINT,
  buildVerifactuQrUrl,
  buildVerifactuSoapEnvelope,
  computeAeatInvoiceFingerprint,
  escapeXml,
  parseVerifactuSubmissionResponse,
  postSoapRequest,
  resolveCertificateFile,
} from "./verifactu-aeat.js";

const invoiceStore = createJsonEntityStore("Invoice");
const interventionStore = createJsonEntityStore("Intervention");
const clientStore = createJsonEntityStore("Client");
const budgetStore = createJsonEntityStore("Budget");
const retryQueueStore = createJsonEntityStore("InvoiceRetryQueue");
const counterStore = createJsonFileStore("function-counters.json", {});
const organizationSettingsStore = getOrganizationSettingsStore();

const RETRY_BACKOFF_MS = [60000, 300000, 1800000];
const MAX_RETRIES = 5;
const clampMoney = (value) => Number((Number(value || 0)).toFixed(2));

const normalizePositive = (value) => Math.abs(clampMoney(value));

const formatIsoDate = (value) =>
  typeof value === "string" && value.length >= 10
    ? value.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

const getIssuerInfo = (user) => {
  const issuerNif =
    user?.verifactu_nif ||
    process.env.VERIFACTU_NIF ||
    process.env.APP_VERIFACTU_NIF ||
    "B00000000";
  const issuerName =
    user?.verifactu_nombre ||
    process.env.VERIFACTU_NOMBRE ||
    process.env.APP_VERIFACTU_ISSUER_NAME ||
    "FRIGEST LOCAL";

  return {
    issuerNif,
    issuerName,
  };
};

// Configuración de serie por organización (llega en currentUser desde OrganizationSettings).
// prefix: solo A-Z0-9, máx. 10 chars (serie+número AEAT limitado a 60). yearly: reinicio anual.
export const getInvoiceSeriesConfig = (user) => {
  const rawPrefix = String(user?.factura_serie_prefijo || "F").toUpperCase();
  const prefix = rawPrefix.replace(/[^A-Z0-9]/g, "").slice(0, 10) || "F";
  return {
    prefix,
    yearly: user?.factura_serie_anual !== false,
  };
};

// Clave de serie: "F-2026" (anual) o "F" (continua). Las rectificativas usan
// siempre "R" como base con la misma política de año.
export const buildInvoiceSerieKey = (base, { prefix = "F", yearly = true } = {}, date = new Date()) => {
  const effectivePrefix = base === "R" ? "R" : prefix;
  return yearly ? `${effectivePrefix}-${date.getFullYear()}` : effectivePrefix;
};

// Serial mutex for counter store: prevents duplicate invoice numbers under concurrency
let counterLock = Promise.resolve();

// Per-intervention mutex: prevents TOCTOU double-invoicing and hash-chain splits
// under concurrent requests for the same intervention.
const interventionLocks = new Map();

const acquireInterventionLock = (interventionId) => {
  const prev = interventionLocks.get(interventionId) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  interventionLocks.set(interventionId, next);
  return prev.then(() => release);
};

// Extracts the numeric suffix from an invoice number like "F-000004" → 4.
export const parseInvoiceIndex = (invoiceNumber) => {
  const match = /(\d+)\s*$/.exec(String(invoiceNumber || ""));
  return match ? Number(match[1]) : 0;
};

// Legacy counters were a single flat shape shared by every tenant:
//   { "F": 4, "R": 1 }
// VeriFactu requires an independent series per obligado tributario, so the new
// shape is per-organization:
//   { "org-frigest": { "F": 4, "R": 1 }, "org-otra": { "F": 2 } }
// Any legacy flat keys are attributed to the default (single-tenant) organization.
export const migrateLegacyCounters = (counters) => {
  if (!counters || typeof counters !== "object") {
    return {};
  }

  const hasLegacyFlat = Object.prototype.hasOwnProperty.call(counters, "F") ||
    Object.prototype.hasOwnProperty.call(counters, "R");

  if (!hasLegacyFlat) {
    return { ...counters };
  }

  const migrated = {};
  const legacy = {};
  for (const [key, value] of Object.entries(counters)) {
    if (key === "F" || key === "R") {
      legacy[key] = value;
    } else {
      migrated[key] = value;
    }
  }

  migrated[DEFAULT_ORGANIZATION_ID] = {
    ...(migrated[DEFAULT_ORGANIZATION_ID] || {}),
    ...legacy,
  };

  return migrated;
};

// Highest invoice index already stored for an organization + series. Used to
// seed a fresh counter (new org, or counter file lost) so numbering never
// collides with or skips an existing fiscal record.
const getMaxInvoiceIndex = async (organizationId, series) => {
  const items = await invoiceStore.filter({
    filter: { organization_id: organizationId, serie: series },
    limit: 1000000,
  });

  let max = 0;
  for (const item of items) {
    const index = parseInvoiceIndex(item.invoice_number);
    if (index > max) {
      max = index;
    }
  }
  return max;
};

const getNextInvoiceNumber = async (base = "F", organizationId, seriesConfig = {}) => {
  if (!organizationId) {
    throw new HttpError(400, "No se pudo determinar la organización para numerar la factura.");
  }

  const { yearly = true } = seriesConfig;
  const serieKey = buildInvoiceSerieKey(base, seriesConfig);

  // Queue behind the previous counter operation
  const prev = counterLock;
  let release;
  counterLock = new Promise((resolve) => { release = resolve; });
  await prev;

  try {
    const counters = migrateLegacyCounters(await counterStore.read());
    const orgCounters = { ...(counters[organizationId] || {}) };

    let current = Number(orgCounters[serieKey] || 0);
    if (current === 0) {
      // No counter yet for this org/series: seed from existing invoices so we
      // never reuse a number that is already on a stored record. En series
      // anuales el contador arranca de cero cada año de forma natural
      // (la clave incluye el año y no hay facturas previas de esa serie).
      current = await getMaxInvoiceIndex(organizationId, serieKey);
    }
    current += 1;

    orgCounters[serieKey] = current;
    counters[organizationId] = orgCounters;
    await counterStore.write(counters);

    return {
      number: `${serieKey}-${String(current).padStart(yearly ? 4 : 6, "0")}`,
      index: current,
      serie: serieKey,
    };
  } finally {
    release();
  }
};

const getRetentionUntil = () => {
  const retentionDate = new Date();
  retentionDate.setFullYear(retentionDate.getFullYear() + 6);
  return retentionDate.toISOString().slice(0, 10);
};

const findById = async (store, id, label) => {
  const items = await store.filter({ filter: { id }, limit: 1 });
  const item = items[0] || null;

  if (!item) {
    throw new HttpError(404, `${label} not found`);
  }

  return item;
};

const getLastInvoice = async ({ isProduction = false, organizationId } = {}) => {
  if (!organizationId) {
    throw new HttpError(400, "No se pudo determinar la organización para encadenar la factura.");
  }
  // The VeriFactu hash chain is per obligado tributario (per organization),
  // so the previous record must be scoped to the same organization. Mixing
  // tenants into one chain is non-compliant.
  // Fetch more items so we can skip sandbox invoices in production mode.
  const limit = isProduction ? 50 : 1;
  const items = await invoiceStore.filter({
    filter: { organization_id: organizationId },
    sort: "-created_date",
    limit,
  });
  if (isProduction) {
    return items.find((i) => i.verifactu_status !== "validado_sandbox") || null;
  }
  return items[0] || null;
};

export const computeInvoiceFingerprint = ({
  invoiceNumber,
  issueDate,
  issuerNif,
  ivaTotal,
  total,
  previousHash,
  tipoFactura,
  generatedAt,
}) => {
  return computeAeatInvoiceFingerprint({
    invoiceNumber,
    issueDate,
    issuerNif,
    ivaTotal,
    total,
    previousHash,
    tipoFactura,
    generatedAt,
  });
};

const createMockXmlPayload = ({
  invoiceNumber,
  issueDate,
  issuerNif,
  issuerName,
  clientName,
  total,
  ivaTotal,
  hashHuella,
  previousHash,
  tipoFactura,
}) => `<?xml version="1.0" encoding="UTF-8"?>
<verifactu-simulado>
  <emisor nif="${escapeXml(issuerNif)}">${escapeXml(issuerName)}</emisor>
  <factura numero="${escapeXml(invoiceNumber)}" tipo="${escapeXml(tipoFactura)}" fecha="${escapeXml(formatIsoDate(issueDate))}">
    <cliente>${escapeXml(clientName || "CLIENTE")}</cliente>
    <importe_total>${clampMoney(total).toFixed(2)}</importe_total>
    <cuota_iva>${clampMoney(ivaTotal).toFixed(2)}</cuota_iva>
    <hash_anterior>${escapeXml(previousHash || "")}</hash_anterior>
    <huella>${hashHuella}</huella>
  </factura>
</verifactu-simulado>`;

const buildRetrySuccessPayload = (invoice, overrides = {}) => {
  const now = new Date().toISOString();
  const invoiceId = invoice.id || overrides.invoice_id;
  return {
    success: true,
    invoice_id: invoiceId,
    invoice_number: invoice.invoice_number,
    verifactu_status: overrides.verifactu_status || "aceptado",
    verifactu_csv:
      overrides.verifactu_csv || `CSV-${String(invoice.invoice_number || "LOCAL").replace(/\W+/g, "")}`,
    verifactu_idregistro:
      overrides.verifactu_idregistro || `REG-${String(invoiceId || "LOCAL").slice(0, 8).toUpperCase()}`,
    verifactu_timestamp: overrides.verifactu_timestamp || now,
    qr_url: overrides.qr_url || "",
    error: null,
  };
};

const buildProductionInvoiceRecord = ({
  invoiceRecord,
  originalInvoice,
  intervention,
  tipoFactura,
  rectificativaTipo,
}) => ({
  ...invoiceRecord,
  descripcion_operacion:
    intervention.description ||
    intervention.summary ||
    intervention.notes ||
    `Intervencion ${intervention.number || invoiceRecord.invoice_number}`,
  factura_rectificada_issue_date: originalInvoice?.issue_date || null,
  rectificativa_tipo: rectificativaTipo,
  rectified_base: originalInvoice ? clampMoney(originalInvoice.subtotal ?? 0) : null,
  rectified_tax: originalInvoice ? clampMoney(originalInvoice.iva_total ?? 0) : null,
  tipo_factura: tipoFactura,
});

const submitInvoiceToAeat = async ({
  invoice,
  currentUser,
  previousInvoice,
  endpoint = VERIFACTU_PRODUCTION_ENDPOINT,
  timeoutMs,
}) => {
  const certPath = await resolveCertificateFile(currentUser?.verifactu_cert_uri);
  const soapEnvelope = buildVerifactuSoapEnvelope({
    invoice,
    issuerNif: invoice.issuer_nif,
    issuerName: invoice.issuer_name,
    previousInvoice,
    generatedAt: invoice.issue_date,
  });

  const response = await postSoapRequest({
    endpoint,
    xml: soapEnvelope,
    certPath,
    certPassword: currentUser?.verifactu_cert_password || "",
    timeoutMs,
  });

  return {
    soapEnvelope,
    parsed: parseVerifactuSubmissionResponse(response.body, response.httpStatus),
  };
};

const mapAeatResultToInvoiceUpdate = (result, { invoice, isProduction } = {}) => ({
  pending_submission: false,
  verifactu_status: result.status,
  verifactu_csv: result.csv || "",
  verifactu_idregistro: result.duplicateId || "",
  verifactu_timestamp: result.timestamp || new Date().toISOString(),
  verifactu_response: result.rawResponse,
  verifactu_http_status: result.httpStatus,
  verifactu_diagnostico: result.responseType,
  codigo_error_aeat: result.errorCode || "",
  descripcion_error_aeat: result.errorDescription || "",
  qr_url: result.accepted && isProduction && invoice
    ? buildVerifactuQrUrl(invoice, true)
    : "",
});

const shouldQueueAeatRetry = (error, httpStatus) => {
  if (error instanceof HttpError) {
    return false;
  }

  if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
    return false;
  }

  return true;
};

// ids de partes de una factura agrupada (recapitulativa); null si es de un solo parte
const parseGroupedInterventionIds = (invoice) => {
  if (!invoice?.intervention_ids_json) {
    return null;
  }
  try {
    const ids = JSON.parse(invoice.intervention_ids_json);
    return Array.isArray(ids) && ids.length > 0 ? ids.map(String) : null;
  } catch {
    return null;
  }
};

// Normaliza y valida las líneas de una factura libre (o de presupuesto).
const buildFreeInvoiceInput = (payload) => {
  const clientId = String(payload.client_id || "").trim();
  if (!clientId) {
    throw new HttpError(400, "client_id is required");
  }

  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
  const lines = rawLines
    .map((line) => {
      const quantity = Number(line.quantity) || 0;
      const unitPrice = Number(line.unit_price) || 0;
      const ivaRaw = Number(line.iva_percent);
      return {
        material_name: String(line.material_name || line.description || "").trim().slice(0, 200),
        quantity,
        unit: String(line.unit || "ud").slice(0, 10),
        unit_price: clampMoney(unitPrice),
        total: clampMoney(quantity * unitPrice),
        iva_percent: Number.isFinite(ivaRaw) && ivaRaw >= 0 && ivaRaw <= 21 ? ivaRaw : 21,
      };
    })
    .filter((line) => line.material_name && line.quantity > 0);

  if (lines.length === 0) {
    throw new HttpError(422, "La factura necesita al menos una línea con descripción y cantidad.");
  }

  // Los importes negativos se corrigen con una rectificativa, nunca con una
  // factura de venta en negativo.
  if (lines.some((line) => line.unit_price < 0)) {
    throw new HttpError(422, "El precio unitario no puede ser negativo. Usa una factura rectificativa para abonos.");
  }

  return {
    clientId,
    lines,
    descripcion: String(payload.descripcion || "").trim().slice(0, 250),
    budgetId: payload.budget_id ? String(payload.budget_id) : null,
  };
};

const FREE_INVOICE_LOCK_KEY = "__factura_libre__";

export const processVerifactu = async ({ payload = {}, currentUser }) => {
  const mode = payload.mode || "facturar";

  // Factura libre (sin parte): venta directa, cuota o presupuesto aceptado.
  // También rectificativas de facturas libres (original sin intervention_id).
  const isFreeCreation = mode === "facturar_libre";
  const isFreeRectification =
    (mode === "rectificar" || mode === "rectificar_corregida") &&
    !payload.intervention_id &&
    payload.original_invoice_id;

  if (isFreeCreation || isFreeRectification) {
    const freeInvoice = isFreeCreation ? buildFreeInvoiceInput(payload) : null;
    const release = await acquireInterventionLock(FREE_INVOICE_LOCK_KEY);
    try {
      return await _processVerifactuLocked({
        payload,
        currentUser,
        interventionId: null,
        mode: isFreeCreation ? "facturar" : mode,
        freeInvoice,
      });
    } finally {
      release();
      interventionLocks.delete(FREE_INVOICE_LOCK_KEY);
    }
  }

  // Factura agrupada (recapitulativa): una sola factura para varios partes del
  // mismo cliente. Bloqueo de todos los partes en orden estable (anti-interbloqueo).
  if (mode === "facturar_agrupada") {
    const ids = Array.isArray(payload.intervention_ids)
      ? [...new Set(payload.intervention_ids.map(String).filter(Boolean))]
      : [];
    if (ids.length < 2) {
      throw new HttpError(400, "Selecciona al menos dos partes para la factura agrupada.");
    }

    const sortedIds = [...ids].sort();
    const releases = [];
    try {
      for (const id of sortedIds) {
        releases.push(await acquireInterventionLock(id));
      }
      return await _processVerifactuLocked({
        payload,
        currentUser,
        interventionId: ids[0],
        mode: "facturar",
        groupInterventionIds: ids,
      });
    } finally {
      releases.reverse().forEach((release) => release());
      sortedIds.forEach((id) => interventionLocks.delete(id));
    }
  }

  const interventionId = payload.intervention_id;

  if (!interventionId) {
    throw new HttpError(400, "intervention_id is required");
  }

  // Serialize all operations for this intervention to prevent TOCTOU double-invoicing
  // and hash-chain splits when two requests arrive simultaneously.
  const release = await acquireInterventionLock(interventionId);
  try {
    return await _processVerifactuLocked({ payload, currentUser, interventionId, mode });
  } finally {
    release();
    // Clean up the map entry once no other request is waiting
    // (safe: the next waiter already captured the promise reference)
    interventionLocks.delete(interventionId);
  }
};

const _processVerifactuLocked = async ({ payload, currentUser, interventionId, mode, groupInterventionIds = null, freeInvoice = null }) => {
  const intervention = interventionId
    ? await findById(interventionStore, interventionId, "Intervention")
    : null;
  const now = new Date().toISOString();
  const isRectificativaMode = mode === "rectificar" || mode === "rectificar_corregida";

  const organizationId =
    currentUser?.current_organization?.id ||
    currentUser?.organization_id ||
    null;
  if (!organizationId) {
    throw new HttpError(400, "No se pudo determinar la organización del emisor para facturar.");
  }

  // Factura libre: el cliente debe existir y pertenecer a la organización.
  let freeClient = null;
  if (freeInvoice) {
    const clients = await clientStore.filter({ filter: { id: freeInvoice.clientId }, limit: 1 });
    freeClient = clients[0] || null;
    if (!freeClient || (freeClient.organization_id && freeClient.organization_id !== organizationId)) {
      throw new HttpError(404, "Client not found");
    }
  }

  const groupInterventions = groupInterventionIds
    ? await Promise.all(
        groupInterventionIds.map((id) => findById(interventionStore, id, "Intervention"))
      )
    : null;
  const invoiceTargets = groupInterventions || (intervention ? [intervention] : []);

  // Aislamiento multi-tenant: ningún parte de otra organización es visible aquí.
  const foreign = invoiceTargets.find(
    (item) => item.organization_id && item.organization_id !== organizationId
  );
  if (foreign) {
    throw new HttpError(404, "Intervention not found");
  }

  if (groupInterventions) {
    const clientIds = new Set(groupInterventions.map((item) => item.client_id || ""));
    if (clientIds.size > 1) {
      throw new HttpError(422, "Todos los partes de una factura agrupada deben ser del mismo cliente.");
    }
  }

  // Prevent double invoicing: intervention already finalised. Las rectificativas
  // operan precisamente sobre partes ya facturados, así que quedan fuera de este
  // guard (sus propias validaciones exigen factura original aceptada y sin rectificar).
  const NON_INVOICEABLE_STATUSES = ["facturado", "completado", "anulado"];
  if (!isRectificativaMode) {
    const blocked = invoiceTargets.find((item) => NON_INVOICEABLE_STATUSES.includes(item.status));
    if (blocked) {
      throw new HttpError(
        409,
        `El parte ${blocked.number || blocked.id} ya está ${blocked.status} y no puede facturarse de nuevo.`
      );
    }
  }

  if (mode === "guardar") {
    await interventionStore.update(intervention.id, {
      status: "completado",
      validated_by: currentUser?.email || "",
      validated_at: now,
    });

    return {
      data: {
        success: true,
        mode,
        status: "completado",
        message: "Parte guardado sin factura",
      },
    };
  }

  const originalInvoice =
    payload.original_invoice_id
      ? await findById(invoiceStore, payload.original_invoice_id, "Invoice")
      : null;

  const isRectificativa = isRectificativaMode;

  if (isRectificativa && originalInvoice) {
    // Validate original invoice is in a rectifiable state: aceptada por AEAT en
    // producción, o validada en sandbox (para poder probar el flujo completo).
    const VALID_ORIGINAL_STATUSES = ["aceptado", "aceptado_con_errores", "duplicado", "validado_sandbox"];
    if (!VALID_ORIGINAL_STATUSES.includes(originalInvoice.verifactu_status)) {
      throw new HttpError(400,
        `La factura original no ha sido aceptada por AEAT (estado: ${originalInvoice.verifactu_status}). Solo se pueden rectificar facturas aceptadas.`
      );
    }
    // Validate the original invoice belongs to this intervention (o a su grupo
    // si la original es una factura agrupada).
    const groupedOriginalIds = parseGroupedInterventionIds(originalInvoice);
    const belongsToOriginal = groupedOriginalIds
      ? groupedOriginalIds.includes(String(interventionId))
      : originalInvoice.intervention_id
        ? originalInvoice.intervention_id === interventionId
        : !interventionId; // factura libre: se rectifica sin parte
    if (!belongsToOriginal) {
      throw new HttpError(400, "La factura original no pertenece a este parte.");
    }
    // Aislamiento multi-tenant también sobre la factura original.
    if (originalInvoice.organization_id && originalInvoice.organization_id !== organizationId) {
      throw new HttpError(404, "Invoice not found");
    }
    // Check the original invoice hasn't already been rectified
    const existingRect = await invoiceStore.filter({
      filter: { factura_rectificada_id: originalInvoice.id },
      limit: 1,
    });
    if (existingRect.length > 0) {
      throw new HttpError(409,
        `Esta factura ya fue rectificada por ${existingRect[0].invoice_number}. No se puede rectificar dos veces.`
      );
    }
  }

  const isProductionMode = currentUser?.verifactu_produccion === true;
  const shouldQueueSubmission =
    payload.force_pending_submission === true ||
    payload.pending_submission === true;
  const { issuerNif, issuerName } = getIssuerInfo(currentUser);
  const previousInvoice = await getLastInvoice({ isProduction: isProductionMode, organizationId });
  const previousHash = previousInvoice?.hash_huella || "";
  const seriesConfig = getInvoiceSeriesConfig(currentUser);
  const { number: invoiceNumber, serie: serieKey } = await getNextInvoiceNumber(
    isRectificativa ? "R" : "F",
    organizationId,
    seriesConfig
  );
  const chainIndex = Number(previousInvoice?.invoice_chain_index || 0) + 1;

  const freeSubtotal = freeInvoice
    ? clampMoney(freeInvoice.lines.reduce((acc, line) => acc + line.total, 0))
    : 0;
  const freeIva = freeInvoice
    ? clampMoney(freeInvoice.lines.reduce((acc, line) => acc + line.total * (line.iva_percent / 100), 0))
    : 0;

  const originalSubtotal = freeInvoice
    ? freeSubtotal
    : clampMoney(
        invoiceTargets.reduce((acc, item) => acc + (Number(item.subtotal ?? item.total ?? 0) || 0), 0)
      );
  const originalIvaTotal = freeInvoice
    ? freeIva
    : clampMoney(
        invoiceTargets.reduce((acc, item) => acc + (Number(item.iva_total ?? 0) || 0), 0)
      );
  const originalTotal = freeInvoice
    ? clampMoney(freeSubtotal + freeIva)
    : clampMoney(
        invoiceTargets.reduce((acc, item) => acc + (Number(item.total ?? 0) || 0), 0)
      );

  let subtotal = originalSubtotal;
  let ivaTotal = originalIvaTotal;
  let total = originalTotal;
  let tipoFactura = "F1";
  let nextInterventionStatus = "facturado";
  let rectificationNote = "";
  let rectificativaTipo = null;

  if (mode === "rectificar") {
    if (!originalInvoice) {
      throw new HttpError(400, "original_invoice_id is required for rectificar");
    }

    subtotal = -normalizePositive(originalInvoice.subtotal ?? originalSubtotal);
    ivaTotal = -normalizePositive(originalInvoice.iva_total ?? originalIvaTotal);
    total = -normalizePositive(originalInvoice.total ?? originalTotal);
    tipoFactura = "R1";
    rectificativaTipo = "I";
    nextInterventionStatus = "anulado";
    rectificationNote =
      payload.rectificativa_motivo || "Rectificativa de anulacion generada en backend REST";
  }

  if (mode === "rectificar_corregida") {
    if (!originalInvoice) {
      throw new HttpError(400, "original_invoice_id is required for rectificar_corregida");
    }

    subtotal = clampMoney(payload.subtotal_corregida ?? originalInvoice.subtotal ?? originalSubtotal);
    ivaTotal = clampMoney(payload.iva_corregida ?? originalInvoice.iva_total ?? originalIvaTotal);
    total = clampMoney(payload.total_corregida ?? originalInvoice.total ?? originalTotal);
    tipoFactura = "R1";
    rectificativaTipo = "S";
    nextInterventionStatus = intervention.status || "facturado";
    rectificationNote =
      payload.rectificativa_motivo || "Rectificativa corregida generada en backend REST";
  }

  const dueDaysRaw = Number(currentUser?.factura_vencimiento_dias);
  const dueDays = Number.isFinite(dueDaysRaw) && dueDaysRaw >= 0 && dueDaysRaw <= 365 ? dueDaysRaw : 30;
  const dueDate = isRectificativa
    ? null
    : new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);

  // Referencias parte(s) ↔ factura: agrupada nueva o rectificativa de una agrupada.
  const groupedOriginalIds = isRectificativa ? parseGroupedInterventionIds(originalInvoice) : null;
  const isGroupedInvoice = Boolean(groupInterventions);
  const isGroupedContext = isGroupedInvoice || Boolean(groupedOriginalIds);

  const buildGroupedLinesJson = () => {
    const merged = [];
    for (const item of groupInterventions) {
      let itemLines = [];
      try {
        itemLines = JSON.parse(item.materials_json || "[]");
      } catch {
        itemLines = [];
      }
      merged.push({
        _isSection: true,
        material_name: `Parte ${item.number || item.id} · ${formatIsoDate(item.date || item.created_date)}${
          item.description ? ` — ${String(item.description).slice(0, 70)}` : ""
        }`,
      });
      merged.push(...itemLines);
    }
    return JSON.stringify(merged);
  };

  const linesJson = isRectificativa && originalInvoice?.lines_json
    ? originalInvoice.lines_json
    : isGroupedInvoice
      ? buildGroupedLinesJson()
      : freeInvoice
        ? JSON.stringify(freeInvoice.lines)
        : intervention?.materials_json || "[]";

  const descripcionOperacion = isGroupedInvoice
    ? `Factura recapitulativa de ${groupInterventions.length} partes: ${groupInterventions
        .map((item) => item.number || item.id)
        .join(", ")}`.slice(0, 250)
    : freeInvoice
      ? freeInvoice.descripcion || `Factura de venta — ${freeClient?.name || ""}`.trim()
      : intervention
        ? intervention.description ||
          intervention.summary ||
          intervention.notes ||
          `Intervencion ${intervention.number || invoiceNumber}`
        : originalInvoice?.descripcion_operacion || `Factura ${invoiceNumber}`;

  // Para el registro AEAT de agrupadas y libres, la descripción es la calculada.
  const descriptionSourceIntervention = isGroupedInvoice || !intervention
    ? { description: descripcionOperacion, number: invoiceNumber }
    : intervention;

  const hashHuella = computeInvoiceFingerprint({
    invoiceNumber,
    issueDate: now,
    issuerNif,
    ivaTotal,
    total,
    previousHash,
    tipoFactura,
    generatedAt: now,
  });

  const invoiceRecord = await invoiceStore.create({
    organization_id: organizationId,
    invoice_number: invoiceNumber,
    serie: serieKey,
    tipo_factura: tipoFactura,
    intervention_id: isGroupedContext || !intervention ? null : intervention.id,
    intervention_number: isGroupedInvoice
      ? `${groupInterventions.length} partes`
      : groupedOriginalIds
        ? originalInvoice.intervention_number || `${groupedOriginalIds.length} partes`
        : intervention?.number || (isRectificativa ? originalInvoice?.intervention_number || null : null),
    intervention_ids_json: isGroupedInvoice
      ? JSON.stringify(groupInterventions.map((item) => item.id))
      : groupedOriginalIds
        ? originalInvoice.intervention_ids_json
        : null,
    client_id: freeClient
      ? freeClient.id
      : intervention?.client_id ?? originalInvoice?.client_id ?? null,
    client_name: freeClient
      ? freeClient.name || ""
      : intervention?.client_name ?? originalInvoice?.client_name ?? "",
    client_nif: freeClient
      ? freeClient.nif || freeClient.cif || freeClient.tax_id || ""
      : intervention?.client_nif || originalInvoice?.client_nif || "",
    client_address: freeClient
      ? [freeClient.address, [freeClient.postal_code, freeClient.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ")
      : intervention?.client_address ||
        intervention?.location_address ||
        originalInvoice?.client_address ||
        "",
    issue_date: now,
    subtotal,
    iva_total: ivaTotal,
    total,
    lines_json: linesJson,
    hash_huella: hashHuella,
    hash_anterior: previousHash,
    invoice_chain_index: chainIndex,
    retention_until: getRetentionUntil(),
    payment_status: isRectificativa ? "no_aplica" : "pendiente",
    payment_method: "",
    paid_at: null,
    payment_notes: "",
    due_date: dueDate,
    verifactu_status: shouldQueueSubmission
      ? "sin_envio"
      : isProductionMode
        ? "pendiente_envio"
        : "validado_sandbox",
    pending_submission: shouldQueueSubmission,
    verifactu_csv: "",
    verifactu_idregistro: "",
    verifactu_timestamp: now,
    verifactu_response: shouldQueueSubmission
      ? "Envio pendiente en cola de reintentos del backend REST local"
      : isProductionMode
        ? "Pendiente de envio real a AEAT"
        : "Proceso VeriFactu simulado en backend REST local",
    verifactu_http_status: shouldQueueSubmission ? 0 : 200,
    verifactu_diagnostico: shouldQueueSubmission
      ? "pendiente_cola"
      : isProductionMode
        ? "pendiente_envio"
        : "respuesta_valida_sin_csv",
    qr_url: "",
    is_locked: true,
    issuer_nif: issuerNif,
    issuer_name: issuerName,
    created_by_email: currentUser?.email || "",
    factura_rectificada_id: originalInvoice?.id || null,
    factura_rectificada_number: originalInvoice?.invoice_number || null,
    factura_rectificada_issue_date: originalInvoice?.issue_date || null,
    rectificativa_tipo: rectificativaTipo,
    rectified_base: originalInvoice ? clampMoney(originalInvoice.subtotal ?? 0) : null,
    rectified_tax: originalInvoice ? clampMoney(originalInvoice.iva_total ?? 0) : null,
    rectificativa_motivo: rectificationNote || null,
    descripcion_operacion: descripcionOperacion,
    xml_payload: createMockXmlPayload({
      invoiceNumber,
      issueDate: now,
      issuerNif,
      issuerName,
      clientName: freeClient?.name || intervention?.client_name || originalInvoice?.client_name || "",
      total,
      ivaTotal,
      hashHuella,
      previousHash,
      tipoFactura,
    }),
  });

  // Partes afectados: los del grupo (facturación agrupada), los del grupo de la
  // factura original (rectificativa de agrupada), el parte único, o ninguno
  // (factura libre y sus rectificativas).
  const affectedInterventions = groupInterventions
    || (groupedOriginalIds
      ? await Promise.all(groupedOriginalIds.map((id) => findById(interventionStore, id, "Intervention")))
      : intervention
        ? [intervention]
        : []);

  for (const item of affectedInterventions) {
    await interventionStore.update(item.id, {
      status: mode === "rectificar_corregida" ? (item.status || "facturado") : nextInterventionStatus,
      validated_by: currentUser?.email || "",
      validated_at: now,
      ...(isGroupedInvoice
        ? { invoice_id: invoiceRecord.id, invoice_number: invoiceNumber }
        : {}),
      ...(rectificationNote
        ? {
            rectified_by_info: `${currentUser?.full_name || currentUser?.email || "Sistema"} · ${rectificationNote} · ${invoiceNumber}`,
          }
        : {}),
    });
  }

  // La factura rectificada deja de ser cobrable: su cobro pasa a "no_aplica".
  if (isRectificativa && originalInvoice) {
    await invoiceStore.update(originalInvoice.id, { payment_status: "no_aplica" });
  }

  // Presupuesto → factura: el presupuesto queda enlazado y marcado como facturado.
  if (freeInvoice?.budgetId) {
    const budgets = await budgetStore.filter({ filter: { id: freeInvoice.budgetId }, limit: 1 });
    const budget = budgets[0] || null;
    if (budget && (!budget.organization_id || budget.organization_id === organizationId)) {
      await budgetStore.update(budget.id, {
        status: "facturado",
        invoice_id: invoiceRecord.id,
        invoice_number: invoiceNumber,
        status_changed_at: now,
      });
    }
  }

  let responseInvoice = invoiceRecord;
  let pendingSubmission = shouldQueueSubmission;
  let responseMessage = isProductionMode
    ? "Factura preparada para envio real a AEAT"
    : "Proceso VeriFactu simulado en backend REST local";

  if (!pendingSubmission && isProductionMode) {
    const productionInvoice = buildProductionInvoiceRecord({
      invoiceRecord,
      originalInvoice,
      intervention: descriptionSourceIntervention,
      tipoFactura,
      rectificativaTipo,
    });

    try {
      const submission = await submitInvoiceToAeat({
        invoice: productionInvoice,
        currentUser,
        previousInvoice,
      });
      const updateData = {
        xml_payload: submission.soapEnvelope,
        ...mapAeatResultToInvoiceUpdate(submission.parsed, {
          invoice: productionInvoice,
          isProduction: isProductionMode,
        }),
      };

      await invoiceStore.update(invoiceRecord.id, updateData);
      responseInvoice = { ...invoiceRecord, ...updateData };
      responseMessage = submission.parsed.accepted
        ? "Factura enviada correctamente a AEAT"
        : submission.parsed.errorDescription || "AEAT rechazo el registro";

      if (!submission.parsed.accepted) {
        throw new HttpError(502, responseMessage);
      }
    } catch (error) {
      const productionInvoiceXml = buildVerifactuSoapEnvelope({
        invoice: productionInvoice,
        issuerNif,
        issuerName,
        previousInvoice,
        generatedAt: now,
      });
      const httpStatus = Number(error?.httpStatus || error?.statusCode || 0);

      if (shouldQueueAeatRetry(error, httpStatus)) {
        pendingSubmission = true;
        const updateData = {
          pending_submission: true,
          verifactu_status: "sin_envio",
          verifactu_response: error.message,
          verifactu_http_status: httpStatus,
          verifactu_diagnostico: "pendiente_reintento",
          descripcion_error_aeat: error.message,
          xml_payload: productionInvoiceXml,
        };

        await invoiceStore.update(invoiceRecord.id, updateData);
        responseInvoice = { ...invoiceRecord, ...updateData };
        responseMessage =
          "Envio AEAT aplazado por error temporal. La factura queda en cola de reintento.";
      } else {
        const updateData = {
          pending_submission: false,
          verifactu_status: "error",
          verifactu_response: error.message,
          verifactu_http_status: httpStatus,
          verifactu_diagnostico: "error_envio",
          codigo_error_aeat: error.code || "",
          descripcion_error_aeat: error.message,
          xml_payload: productionInvoiceXml,
        };

        await invoiceStore.update(invoiceRecord.id, updateData);
        throw error;
      }
    }
  }

  if (pendingSubmission && isProductionMode) {
    const productionInvoice = buildProductionInvoiceRecord({
      invoiceRecord: responseInvoice,
      originalInvoice,
      intervention: descriptionSourceIntervention,
      tipoFactura,
      rectificativaTipo,
    });
    const productionXml = buildVerifactuSoapEnvelope({
      invoice: productionInvoice,
      issuerNif,
      issuerName,
      previousInvoice,
      generatedAt: now,
    });
    const updateData = {
      xml_payload: productionXml,
      verifactu_http_status: 0,
    };

    await invoiceStore.update(responseInvoice.id, updateData);
    responseInvoice = { ...responseInvoice, ...updateData };
  }

  if (pendingSubmission) {
    await retryQueueStore.create({
      invoice_id: responseInvoice.id,
      invoice_number: responseInvoice.invoice_number,
      retry_count: 0,
      max_retries: MAX_RETRIES,
      next_retry_at: new Date(Date.now() + 30000).toISOString(),
      last_attempt_at: now,
      last_error: responseInvoice.verifactu_response,
      status: "pending",
      xml_payload: responseInvoice.xml_payload,
      tipo_factura: tipoFactura,
    });
  }

  return {
    data: {
      success: true,
      mode,
      invoice_id: responseInvoice.id,
      invoice_number: responseInvoice.invoice_number,
      hash: hashHuella,
      verifactu_status: responseInvoice.verifactu_status,
      verifactu_csv: responseInvoice.verifactu_csv,
      verifactu_idregistro: responseInvoice.verifactu_idregistro,
      verifactu_timestamp: responseInvoice.verifactu_timestamp,
      message: responseMessage,
      pending_submission: pendingSubmission,
    },
  };
};

export const processVerifactuRetry = async ({ payload = {}, currentUser }) => {
  const invoiceId = payload.invoice_id;
  if (!invoiceId) {
    throw new HttpError(400, "invoice_id is required");
  }

  const invoice = await findById(invoiceStore, invoiceId, "Invoice");
  const userStore = createJsonEntityStore("User");
  const owner =
    invoice.created_by_email
      ? (await userStore.filter({
          filter: { email: invoice.created_by_email },
          limit: 1,
        }))[0] || null
      : null;

  const hasSubmissionCert = (candidate) =>
    candidate?.verifactu_produccion === true && Boolean(candidate?.verifactu_cert_uri);

  let submissionUser = hasSubmissionCert(currentUser)
    ? currentUser
    : hasSubmissionCert(owner)
      ? owner
      : null;

  // The VeriFactu credentials (production flag + certificate) live in
  // OrganizationSettings, not on the User record. When neither the caller nor
  // the invoice creator carries them — e.g. the automatic retry scheduler runs
  // without a currentUser — resolve them from the invoice's organization so
  // real AEAT submissions are not abandoned as permanent failures.
  if (!submissionUser && invoice.organization_id) {
    const settingsRow = (
      await organizationSettingsStore.filter({
        filter: { organization_id: invoice.organization_id },
        limit: 1,
      })
    )[0] || null;
    if (settingsRow) {
      const decrypted = decryptOrganizationSettingsFromStorage({ ...settingsRow });
      if (hasSubmissionCert(decrypted)) {
        submissionUser = { ...(owner || {}), ...decrypted };
      }
    }
  }

  const requiresRealSubmission =
    typeof invoice.xml_payload === "string" &&
    invoice.xml_payload.includes("RegFactuSistemaFacturacion");
  const canUseRealSubmission = Boolean(submissionUser) && requiresRealSubmission;

  if (requiresRealSubmission && !canUseRealSubmission) {
    throw new HttpError(
      400,
      "La factura requiere reenvio real a AEAT pero no hay certificado VeriFactu disponible."
    );
  }

  if (!requiresRealSubmission) {
    const retryResult = buildRetrySuccessPayload(invoice);

    await invoiceStore.update(invoice.id, {
      pending_submission: false,
      verifactu_status: retryResult.verifactu_status,
      verifactu_csv: retryResult.verifactu_csv,
      verifactu_idregistro: retryResult.verifactu_idregistro,
      verifactu_timestamp: retryResult.verifactu_timestamp,
      qr_url: retryResult.qr_url,
      verifactu_http_status: 200,
      verifactu_diagnostico: "aceptado_ok",
      codigo_error_aeat: "",
      descripcion_error_aeat: "",
    });

    return retryResult;
  }

  const certPath = await resolveCertificateFile(submissionUser.verifactu_cert_uri);
  const response = await postSoapRequest({
    endpoint: VERIFACTU_PRODUCTION_ENDPOINT,
    xml: invoice.xml_payload,
    certPath,
    certPassword: submissionUser.verifactu_cert_password || "",
    timeoutMs: Number(payload.timeout_ms || 20000),
  });
  const parsed = parseVerifactuSubmissionResponse(response.body, response.httpStatus);
  const updateData = mapAeatResultToInvoiceUpdate(parsed, {
    invoice,
    isProduction: submissionUser?.verifactu_produccion === true,
  });

  await invoiceStore.update(invoice.id, updateData);

  if (!parsed.accepted) {
    throw new HttpError(422, parsed.errorDescription || "AEAT rechazo el registro");
  }

  return {
    success: true,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    verifactu_status: parsed.status,
    verifactu_csv: parsed.csv,
    verifactu_idregistro: parsed.duplicateId || "",
    verifactu_timestamp: parsed.timestamp || new Date().toISOString(),
    qr_url: updateData.qr_url,
    error: null,
  };
};

export const retryVerifactuSubmissions = async ({ payload = {}, currentUser } = {}) => {
  const now = new Date();
  const queueItems = await retryQueueStore.filter({
    filter: { status: "pending" },
    sort: "-created_date",
    limit: 100,
  });

  const dueItems = queueItems.filter((item) => {
    if (payload.force === true || payload.process_all === true) {
      return true;
    }

    if (!item.next_retry_at) {
      return true;
    }

    return new Date(item.next_retry_at) <= now;
  });

  let successCount = 0;
  let failureCount = 0;
  const results = [];

  for (const queueItem of dueItems) {
    try {
      await retryQueueStore.update(queueItem.id, {
        status: "retrying",
        last_attempt_at: now.toISOString(),
      });

      const retryData = await processVerifactuRetry({
        payload: {
          invoice_id: queueItem.invoice_id,
          xml_payload: queueItem.xml_payload,
          tipo_factura: queueItem.tipo_factura,
        },
        currentUser,
      });

      await retryQueueStore.update(queueItem.id, {
        status: "completed",
        last_attempt_at: now.toISOString(),
        last_error: "",
      });

      successCount += 1;
      results.push({
        invoice_number: queueItem.invoice_number,
        status: "completed",
        csv: retryData.verifactu_csv,
      });
    } catch (error) {
      const nextRetryCount = Number(queueItem.retry_count || 0) + 1;
      const permanentFailure =
        error instanceof HttpError && error.statusCode >= 400 && error.statusCode < 500;
      const isMaxRetriesReached =
        permanentFailure || nextRetryCount >= Number(queueItem.max_retries || MAX_RETRIES);
      const backoffMs =
        RETRY_BACKOFF_MS[Math.min(nextRetryCount - 1, RETRY_BACKOFF_MS.length - 1)];
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

      await retryQueueStore.update(queueItem.id, {
        retry_count: nextRetryCount,
        status: isMaxRetriesReached ? "failed" : "pending",
        next_retry_at: isMaxRetriesReached ? null : nextRetryAt,
        last_attempt_at: now.toISOString(),
        last_error: error.message,
      });

      if (isMaxRetriesReached) {
        await invoiceStore.update(queueItem.invoice_id, {
          pending_submission: false,
          verifactu_status: "error",
          codigo_error_aeat: "MAX_RETRIES_REACHED",
          descripcion_error_aeat: error.message,
        });
        console.error(
          `[VERIFACTU] FACTURA ABANDONADA: ${queueItem.invoice_id} (${queueItem.invoice_number}) tras ${nextRetryCount} reintentos. ` +
          `Último error: ${error.message}. Intervención manual requerida.`
        );
      }

      failureCount += 1;
      results.push({
        invoice_number: queueItem.invoice_number,
        status: isMaxRetriesReached ? "max_retries_reached" : "rescheduled",
        next_retry_at: isMaxRetriesReached ? null : nextRetryAt,
        error: error.message,
      });
    }
  }

  return {
    success: true,
    processed: dueItems.length,
    successCount,
    failureCount,
    results,
  };
};

export const syncGasBottleStatus = async () => {
  const gasBottleStore = createJsonEntityStore("GasBottle");
  const bottles = await gasBottleStore.list({ sort: "-created_date", limit: 1000 });
  const updates = [];

  for (const bottle of bottles) {
    const chargeValue = Number(
      bottle.carga_actual ?? bottle.current_kg ?? bottle.currentKg ?? 0
    );
    const currentStatus = bottle.status || "activa";
    const nextStatus = chargeValue > 0 ? "activa" : "vacia";

    if (currentStatus !== nextStatus) {
      await gasBottleStore.update(bottle.id, { status: nextStatus });
      updates.push({
        bottle_id: bottle.id,
        serial: bottle.serial_number,
        old_status: currentStatus,
        new_status: nextStatus,
        kg: chargeValue,
      });
    }
  }

  return {
    success: true,
    synced: updates.length,
    updates,
  };
};

const HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-06",
  "2026-03-19",
  "2026-04-10",
  "2026-05-01",
  "2026-08-15",
  "2026-10-12",
  "2026-11-01",
  "2026-12-06",
  "2026-12-25",
  "2026-03-01",
  "2026-07-22",
]);

const isHoliday = (dateStr) => HOLIDAYS_2026.has(dateStr);

const isWeekday = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
};

export const sendClockInNotifications = async ({ payload = {}, sendEmail }) => {
  const date = payload.date || new Date().toISOString().slice(0, 10);

  if (isHoliday(date) || !isWeekday(date)) {
    return {
      success: true,
      skipped: true,
      reason: isHoliday(date) ? "holiday" : "weekend",
      date,
    };
  }

  const notificationType = payload.notificationType;
  if (!notificationType || !["morning", "afternoon"].includes(notificationType)) {
    throw new HttpError(400, "Missing or invalid notificationType");
  }

  const userStore = createJsonEntityStore("User");
  const absenceStore = createJsonEntityStore("Absence");
  const users = await userStore.list({ sort: "full_name", limit: 500 });
  const absences = await absenceStore.list({ sort: "-start_date", limit: 500 });
  const techUsers = users.filter((item) =>
    ["tecnico", "ayudante"].includes(item.role)
  );

  const subject =
    notificationType === "morning"
      ? "Recordatorio de Fichaje - Entrada"
      : "Recordatorio de Fichaje - Salida";
  const body =
    notificationType === "morning"
      ? "Buenos dias. Comienza la jornada en FRIGEST. No olvides fichar tu entrada."
      : "Son las 15:00. Recuerda fichar tu salida y comprobar que tus partes de hoy estan cerrados.";

  const sent = [];
  const skipped = [];

  for (const techUser of techUsers) {
    const onAbsence = absences.some(
      (absence) =>
        absence.user_email === techUser.email &&
        date >= String(absence.start_date || "") &&
        date <= String(absence.end_date || "")
    );

    if (onAbsence) {
      skipped.push({
        email: techUser.email,
        name: techUser.full_name,
        reason: "on_absence",
      });
      continue;
    }

    try {
      await sendEmail({
        to: techUser.email,
        subject,
        body,
      });

      sent.push({
        email: techUser.email,
        name: techUser.full_name,
      });
    } catch (error) {
      skipped.push({
        email: techUser.email,
        name: techUser.full_name,
        reason: "send_error",
        error: error.message,
      });
    }
  }

  return {
    success: true,
    date,
    notificationType,
    sent: sent.length,
    skipped: skipped.length,
    details: { sent, skipped },
  };
};

export const verifyInvoiceHashes = async ({ sendEmail }) => {
  const invoices = await invoiceStore.list({ sort: "-issue_date", limit: 500 });
  const fiscalInvoices = invoices.filter((invoice) =>
    ["aceptado", "aceptado_con_errores", "validado_sandbox", "duplicado"].includes(
      invoice.verifactu_status
    )
  );

  const tampered = [];
  const verified = [];

  for (const invoice of fiscalInvoices) {
    const computedHash = computeInvoiceFingerprint({
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      issuerNif: invoice.issuer_nif,
      issuerName: invoice.issuer_name,
      ivaTotal: invoice.iva_total,
      total: invoice.total,
      previousHash: invoice.hash_anterior,
      tipoFactura: invoice.tipo_factura || "F1",
    });

    if (computedHash !== invoice.hash_huella) {
      tampered.push({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        issue_date: invoice.issue_date,
        stored_hash: invoice.hash_huella,
        computed_hash: computedHash,
        client_name: invoice.client_name,
        total: invoice.total,
      });
    } else {
      verified.push(invoice.invoice_number);
    }
  }

  if (tampered.length > 0) {
    const userStore = createJsonEntityStore("User");
    const adminUsers = await userStore.list({ sort: "full_name", limit: 200 });
    const recipients = adminUsers.filter((user) =>
      ["admin", "superadmin"].includes(user.role)
    );

    const alertBody = [
      "ALERTA DE INTEGRIDAD VERIFACTU",
      "",
      `Se han detectado ${tampered.length} factura(s) cuyo hash actual no coincide con el original.`,
      "",
      ...tampered.map(
        (item) =>
          `- ${item.invoice_number} · ${item.client_name} · ${formatIsoDate(
            item.issue_date
          )} · ${clampMoney(item.total).toFixed(2)} EUR`
      ),
    ].join("\n");

    await Promise.allSettled(
      recipients
        .filter((user) => user.email)
        .map((admin) =>
          sendEmail({
            to: admin.email,
            subject: `ALERTA INTEGRIDAD FISCAL - ${tampered.length} factura(s)`,
            body: alertBody,
          })
        )
    );
  }

  return {
    success: true,
    total_checked: fiscalInvoices.length,
    verified: verified.length,
    tampered: tampered.length,
    tampered_invoices: tampered,
    checked_at: new Date().toISOString(),
  };
};

export const testVerifactuSandbox = async ({ payload = {}, currentUser }) => {
  if (payload.dry_run === true) {
    return {
      success: true,
      sandbox_reachable: false,
      simulated: true,
      http_status: 0,
      response_type: "DRY_RUN",
      response_preview: "",
      message: "Prueba simulada del sandbox VeriFactu en backend REST.",
    };
  }

  const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <test>FRIGEST REST</test>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const certUri = payload.cert_uri || currentUser?.verifactu_cert_uri || "";
    const certPath = certUri ? await resolveCertificateFile(certUri) : null;
    const response = await postSoapRequest({
      endpoint: VERIFACTU_SANDBOX_ENDPOINT,
      xml: testXml,
      certPath,
      certPassword: payload.cert_password || currentUser?.verifactu_cert_password || "",
      timeoutMs: Number(payload.timeout_ms || 15000),
    });
    const responseText = response.body;
    return {
      success: true,
      sandbox_reachable: true,
      http_status: response.httpStatus,
      response_type: responseText.includes("Fault")
        ? "SOAP_FAULT"
        : responseText.trim().startsWith("<html") ||
            responseText.trim().startsWith("<!DOCTYPE")
          ? "HTML_ERROR"
          : "SOAP_RESPONSE",
      response_preview: responseText.slice(0, 500),
      full_response: responseText,
      message:
        response.httpStatus >= 200 && response.httpStatus < 400
          ? certPath
            ? "Sandbox accesible con certificado cliente."
            : "Sandbox accesible. Sin certificado solo puede validar conectividad."
          : `HTTP ${response.httpStatus}: revisar endpoint y configuracion.`,
    };
  } catch (error) {
    return {
      success: false,
      sandbox_reachable: false,
      error: error.message,
      message:
        error.name === "AbortError"
          ? "Timeout: Sandbox AEAT no respondio en el tiempo esperado."
          : `Error conectando con el sandbox: ${error.message}`,
    };
  }
};

// Auto-scheduler: periodically retry pending AEAT submissions
let retrySchedulerInterval = null;

export const startVerifactuRetryScheduler = () => {
  if (retrySchedulerInterval) return; // already running
  retrySchedulerInterval = setInterval(() => {
    retryVerifactuSubmissions().catch((err) =>
      console.error("[verifactu] Retry scheduler error:", err.message)
    );
  }, 60000);
};

export const stopVerifactuRetryScheduler = () => {
  if (retrySchedulerInterval) {
    clearInterval(retrySchedulerInterval);
    retrySchedulerInterval = null;
  }
};
