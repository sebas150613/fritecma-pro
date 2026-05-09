import { createJsonEntityStore, createJsonFileStore } from "../lib/json-store.js";
import { HttpError } from "../lib/http-error.js";
import {
  VERIFACTU_PRODUCTION_ENDPOINT,
  VERIFACTU_SANDBOX_ENDPOINT,
  buildVerifactuSoapEnvelope,
  computeAeatInvoiceFingerprint,
  parseVerifactuSubmissionResponse,
  postSoapRequest,
  resolveCertificateFile,
} from "./verifactu-aeat.js";

const invoiceStore = createJsonEntityStore("Invoice");
const interventionStore = createJsonEntityStore("Intervention");
const retryQueueStore = createJsonEntityStore("InvoiceRetryQueue");
const counterStore = createJsonFileStore("function-counters.json", {});

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

const getNextInvoiceNumber = async (series = "F") => {
  const counters = await counterStore.read();
  const current = Number(counters[series] || 0) + 1;
  counters[series] = current;
  await counterStore.write(counters);
  return {
    number: `${series}-${String(current).padStart(6, "0")}`,
    index: current,
  };
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

const getLastInvoice = async () => {
  const items = await invoiceStore.list({ sort: "-created_date", limit: 1 });
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
  <emisor nif="${issuerNif}">${issuerName}</emisor>
  <factura numero="${invoiceNumber}" tipo="${tipoFactura}" fecha="${formatIsoDate(issueDate)}">
    <cliente>${clientName || "CLIENTE"}</cliente>
    <importe_total>${clampMoney(total).toFixed(2)}</importe_total>
    <cuota_iva>${clampMoney(ivaTotal).toFixed(2)}</cuota_iva>
    <hash_anterior>${previousHash || ""}</hash_anterior>
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

const mapAeatResultToInvoiceUpdate = (result) => ({
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
  qr_url: "",
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

export const processVerifactu = async ({ payload = {}, currentUser }) => {
  const interventionId = payload.intervention_id;
  const mode = payload.mode || "facturar";

  if (!interventionId) {
    throw new HttpError(400, "intervention_id is required");
  }

  const intervention = await findById(interventionStore, interventionId, "Intervention");
  const now = new Date().toISOString();

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

  const isRectificativa = mode === "rectificar" || mode === "rectificar_corregida";
  const isProductionMode = currentUser?.verifactu_produccion === true;
  const shouldQueueSubmission =
    payload.force_pending_submission === true ||
    payload.pending_submission === true;
  const { issuerNif, issuerName } = getIssuerInfo(currentUser);
  const previousInvoice = await getLastInvoice();
  const previousHash = previousInvoice?.hash_huella || "";
  const { number: invoiceNumber } = await getNextInvoiceNumber(isRectificativa ? "R" : "F");
  const chainIndex = Number(previousInvoice?.invoice_chain_index || 0) + 1;

  const originalSubtotal = clampMoney(intervention.subtotal ?? intervention.total ?? 0);
  const originalIvaTotal = clampMoney(intervention.iva_total ?? 0);
  const originalTotal = clampMoney(intervention.total ?? 0);

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
    invoice_number: invoiceNumber,
    serie: isRectificativa ? "R" : "F",
    tipo_factura: tipoFactura,
    intervention_id: intervention.id,
    intervention_number: intervention.number,
    client_id: intervention.client_id,
    client_name: intervention.client_name,
    client_nif: intervention.client_nif || "",
    client_address: intervention.client_address || intervention.location_address || "",
    issue_date: now,
    subtotal,
    iva_total: ivaTotal,
    total,
    lines_json: intervention.materials_json || "[]",
    hash_huella: hashHuella,
    hash_anterior: previousHash,
    invoice_chain_index: chainIndex,
    retention_until: getRetentionUntil(),
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
    descripcion_operacion:
      intervention.description ||
      intervention.summary ||
      intervention.notes ||
      `Intervencion ${intervention.number || invoiceNumber}`,
    xml_payload: createMockXmlPayload({
      invoiceNumber,
      issueDate: now,
      issuerNif,
      issuerName,
      clientName: intervention.client_name,
      total,
      ivaTotal,
      hashHuella,
      previousHash,
      tipoFactura,
    }),
  });

  await interventionStore.update(intervention.id, {
    status: nextInterventionStatus,
    validated_by: currentUser?.email || "",
    validated_at: now,
    ...(rectificationNote
      ? {
          rectified_by_info: `${currentUser?.full_name || currentUser?.email || "Sistema"} · ${rectificationNote} · ${invoiceNumber}`,
        }
      : {}),
  });

  let responseInvoice = invoiceRecord;
  let pendingSubmission = shouldQueueSubmission;
  let responseMessage = isProductionMode
    ? "Factura preparada para envio real a AEAT"
    : "Proceso VeriFactu simulado en backend REST local";

  if (!pendingSubmission && isProductionMode) {
    const productionInvoice = buildProductionInvoiceRecord({
      invoiceRecord,
      originalInvoice,
      intervention,
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
        ...mapAeatResultToInvoiceUpdate(submission.parsed),
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
      intervention,
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
  const submissionUser =
    currentUser?.verifactu_produccion === true && currentUser?.verifactu_cert_uri
      ? currentUser
      : owner;
  const requiresRealSubmission =
    typeof invoice.xml_payload === "string" &&
    invoice.xml_payload.includes("RegFactuSistemaFacturacion");
  const canUseRealSubmission =
    submissionUser?.verifactu_produccion === true &&
    submissionUser?.verifactu_cert_uri &&
    requiresRealSubmission;

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
  const updateData = mapAeatResultToInvoiceUpdate(parsed);

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
    qr_url: "",
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
    ["aceptado", "validado_sandbox", "sandbox_ok", "duplicado"].includes(
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
