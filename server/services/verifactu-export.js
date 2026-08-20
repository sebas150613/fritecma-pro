/**
 * Exportación de los registros de facturación (art. 8.2.c RD 1007/2023).
 *
 * "El sistema informático deberá contar con un procedimiento de descarga,
 * volcado y archivo seguro de los registros de facturación generados por él,
 * que deberán poder ser exportados a un almacenamiento externo en formato
 * electrónico legible."
 *
 * Un CSV para la gestoría no cumple esto: lo que hay que poder volcar es el
 * REGISTRO, con su huella, su encadenamiento y su índice, no un resumen
 * comercial de la factura. Se exporta en XML con codificación UTF-8, que es el
 * formato que la Orden HAC/1177/2024 fija para los registros.
 */
import { HttpError } from "../lib/http-error.js";
import { escapeXml } from "./verifactu-aeat.js";
import { isAnulacion } from "./verifactu-anulacion.js";

const FISCAL_INVOICE_STATUSES = new Set([
  "aceptado",
  "aceptado_con_errores",
  "validado_sandbox",
  "duplicado",
]);

const text = (value) => escapeXml(value == null ? "" : String(value));
const amount = (value) => Number(Number(value || 0).toFixed(2));

/** Normaliza un extremo del periodo a ISO, o null si no es una fecha válida. */
const parseBoundary = (value, { endOfDay = false } = {}) => {
  if (!value) return null;
  const raw = String(value);
  const date = new Date(
    endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Construye el documento XML de los registros de facturación de un periodo.
 * Función pura: recibe las facturas ya acotadas a una organización.
 */
export const buildInvoiceRecordsXml = ({
  invoices = [],
  organizationId = "",
  from = null,
  to = null,
  generatedAt = new Date().toISOString(),
} = {}) => {
  const records = invoices
    .filter((invoice) => FISCAL_INVOICE_STATUSES.has(invoice.verifactu_status))
    .filter((invoice) => {
      if (from && String(invoice.issue_date || "") < from) return false;
      if (to && String(invoice.issue_date || "") > to) return false;
      return true;
    })
    .sort(
      (a, b) =>
        Number(a.invoice_chain_index || 0) - Number(b.invoice_chain_index || 0)
    );

  const comunes = (invoice) => `    <IndiceCadena>${text(
    invoice.invoice_chain_index
  )}</IndiceCadena>
    <HuellaAnterior>${text(invoice.hash_anterior)}</HuellaAnterior>
    <Huella>${text(invoice.hash_huella)}</Huella>
    <TipoHuella>01</TipoHuella>
    <EstadoRegistro>${text(invoice.verifactu_status)}</EstadoRegistro>
    <CSV>${text(invoice.verifactu_csv)}</CSV>
    <IDRegistroAEAT>${text(invoice.verifactu_idregistro)}</IDRegistroAEAT>
    <FechaHoraRegistro>${text(invoice.verifactu_timestamp)}</FechaHoraRegistro>`;

  const body = records
    .map((invoice) =>
      isAnulacion(invoice)
        ? `  <RegistroAnulacion>
${comunes(invoice)}
    <IDEmisorFacturaAnulada>${text(invoice.issuer_nif)}</IDEmisorFacturaAnulada>
    <NumSerieFacturaAnulada>${text(
      invoice.factura_anulada_number || invoice.invoice_number
    )}</NumSerieFacturaAnulada>
    <FechaExpedicionFacturaAnulada>${text(
      invoice.factura_anulada_issue_date
    )}</FechaExpedicionFacturaAnulada>
    <Motivo>${text(invoice.anulacion_motivo)}</Motivo>
  </RegistroAnulacion>`
        : `  <RegistroFacturacion>
${comunes(invoice)}
    <IDEmisorFactura>${text(invoice.issuer_nif)}</IDEmisorFactura>
    <NombreEmisor>${text(invoice.issuer_name)}</NombreEmisor>
    <NumSerieFactura>${text(invoice.invoice_number)}</NumSerieFactura>
    <FechaExpedicionFactura>${text(invoice.issue_date)}</FechaExpedicionFactura>
    <TipoFactura>${text(invoice.tipo_factura || "F1")}</TipoFactura>
    <NombreRazonDestinatario>${text(invoice.client_name)}</NombreRazonDestinatario>
    <NIFDestinatario>${text(invoice.client_nif)}</NIFDestinatario>
    <BaseImponible>${amount(invoice.subtotal)}</BaseImponible>
    <CuotaTotal>${amount(invoice.iva_total)}</CuotaTotal>
    <ImporteTotal>${amount(invoice.total)}</ImporteTotal>
  </RegistroFacturacion>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ExportacionRegistrosFacturacion>
  <Cabecera>
    <ObligadoTributario>${text(organizationId)}</ObligadoTributario>
    <PeriodoDesde>${text(from || "")}</PeriodoDesde>
    <PeriodoHasta>${text(to || "")}</PeriodoHasta>
    <NumeroRegistros>${records.length}</NumeroRegistros>
    <FechaGeneracion>${text(generatedAt)}</FechaGeneracion>
  </Cabecera>
  <Registros>
${body}
  </Registros>
</ExportacionRegistrosFacturacion>
`;

  return { xml, count: records.length, records };
};

/**
 * Función invocable: vuelca los registros de facturación de la organización
 * del usuario a un XML descargable.
 */
export const createExportInvoiceRecords =
  ({ invoiceStore }) =>
  async ({ payload = {}, currentUser } = {}) => {
    const organizationId =
      payload?.organization_id ||
      currentUser?.current_organization?.id ||
      currentUser?.organization_id ||
      null;

    if (!organizationId) {
      throw new HttpError(
        400,
        "No se pudo determinar la organización cuyos registros de facturación se quieren exportar."
      );
    }

    const from = parseBoundary(payload.from);
    const to = parseBoundary(payload.to, { endOfDay: true });

    if (payload.from && !from) {
      throw new HttpError(422, "La fecha inicial del periodo no es válida.");
    }
    if (payload.to && !to) {
      throw new HttpError(422, "La fecha final del periodo no es válida.");
    }
    if (from && to && from > to) {
      throw new HttpError(422, "El periodo indicado empieza después de terminar.");
    }

    const invoices = await invoiceStore.filter({
      filter: { organization_id: organizationId },
      sort: "invoice_chain_index",
    });

    const generatedAt = new Date().toISOString();
    const { xml, count } = buildInvoiceRecordsXml({
      invoices,
      organizationId,
      from,
      to,
      generatedAt,
    });

    const stamp = generatedAt.slice(0, 10);
    return {
      success: true,
      organization_id: organizationId,
      count,
      generated_at: generatedAt,
      filename: `registros-facturacion-${stamp}.xml`,
      content_type: "application/xml; charset=utf-8",
      xml,
    };
  };
