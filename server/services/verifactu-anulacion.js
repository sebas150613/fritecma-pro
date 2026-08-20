/**
 * Registro de facturación de ANULACIÓN (art. 11 RD 1007/2023).
 *
 * Sirve para retirar ante la AEAT un registro que no debió existir: una factura
 * emitida por error, a un cliente equivocado, duplicada. NO sustituye a la
 * rectificativa, que es el camino normal para corregir importes y que deja la
 * factura original en pie.
 *
 * En ambos casos el registro original se conserva inalterado, como exige el
 * art. 8.2.a: la corrección se hace "mediante al menos un registro de
 * facturación adicional posterior".
 *
 * El registro de anulación ocupa su propia posición en la cadena de huellas,
 * igual que un alta, pero su huella se calcula sobre otros campos (Orden
 * HAC/1177/2024, art. 13.1.b).
 */
import { HttpError } from "../lib/http-error.js";
import { computeAeatAnulacionFingerprint } from "./verifactu-aeat.js";

/** Estados de un registro ya remitido o simulado, que por tanto puede anularse. */
export const ANULABLE_STATUSES = new Set([
  "aceptado",
  "aceptado_con_errores",
  "duplicado",
  "validado_sandbox",
]);

/** Marca de tipo de registro. Los registros antiguos, sin campo, son altas. */
export const RECORD_TYPE_ALTA = "alta";
export const RECORD_TYPE_ANULACION = "anulacion";

export const getRecordType = (record) =>
  record?.record_type === RECORD_TYPE_ANULACION
    ? RECORD_TYPE_ANULACION
    : RECORD_TYPE_ALTA;

export const isAnulacion = (record) => getRecordType(record) === RECORD_TYPE_ANULACION;

/**
 * Comprueba que una factura puede anularse y explica por qué si no.
 * @param {object} invoice factura que se quiere anular
 * @param {Array} existingRecords registros de la organización (para detectar duplicados)
 */
export const assertCanAnnul = (invoice, existingRecords = []) => {
  if (!invoice) {
    throw new HttpError(404, "La factura que se quiere anular no existe.");
  }

  if (isAnulacion(invoice)) {
    throw new HttpError(
      422,
      "Ese registro ya es una anulación: no se puede anular una anulación."
    );
  }

  if (!ANULABLE_STATUSES.has(invoice.verifactu_status)) {
    throw new HttpError(
      422,
      `Solo se pueden anular registros ya remitidos. Esta factura está en estado "${
        invoice.verifactu_status || "sin estado"
      }".`
    );
  }

  const yaAnulada = existingRecords.some(
    (r) => isAnulacion(r) && r.factura_anulada_id === invoice.id
  );
  if (yaAnulada) {
    throw new HttpError(409, "Esa factura ya tiene un registro de anulación.");
  }
};

/**
 * Construye el registro de anulación, ya encadenado. No lo persiste.
 *
 * @param {object} p
 * @param {object} p.invoice        factura anulada
 * @param {object} p.previousRecord último registro de la cadena de la organización
 * @param {string} p.organizationId
 * @param {string} p.motivo         motivo, para la trazabilidad interna
 * @param {object} p.currentUser
 * @param {string} p.now            ISO
 */
export const buildAnulacionRecord = ({
  invoice,
  previousRecord,
  organizationId,
  motivo = "",
  currentUser = null,
  now = new Date().toISOString(),
}) => {
  const previousHash = previousRecord?.hash_huella || "";
  const chainIndex = Number(previousRecord?.invoice_chain_index || 0) + 1;

  const hashHuella = computeAeatAnulacionFingerprint({
    issuerNif: invoice.issuer_nif,
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    previousHash,
    generatedAt: now,
  });

  return {
    organization_id: organizationId,
    record_type: RECORD_TYPE_ANULACION,

    // Identificación del registro anulado.
    factura_anulada_id: invoice.id,
    factura_anulada_number: invoice.invoice_number,
    factura_anulada_issue_date: invoice.issue_date,
    anulacion_motivo: String(motivo || "").trim(),

    // Un registro de anulación no tiene numeración propia ni serie: no consume
    // numeración de factura. Se identifica por el registro que anula.
    invoice_number: invoice.invoice_number,
    serie: "",
    issue_date: now,
    tipo_factura: "",

    // Sin importes: la anulación no repercute nada.
    subtotal: 0,
    iva_total: 0,
    total: 0,
    lines_json: "[]",

    client_name: invoice.client_name || "",
    client_nif: invoice.client_nif || "",
    issuer_nif: invoice.issuer_nif,
    issuer_name: invoice.issuer_name,

    hash_huella: hashHuella,
    hash_anterior: previousHash,
    invoice_chain_index: chainIndex,

    payment_status: "no_aplica",
    is_locked: true,
    created_by_email: currentUser?.email || "",
  };
};
