import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { createHash } from "node:crypto";
import { serverConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";

export const VERIFACTU_SANDBOX_ENDPOINT =
  process.env.APP_VERIFACTU_SANDBOX_ENDPOINT ||
  "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP";

export const VERIFACTU_PRODUCTION_ENDPOINT =
  process.env.APP_VERIFACTU_PRODUCTION_ENDPOINT ||
  "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP";

// Endpoints de validación QR (Orden HAC/1177/2024, Anexo IV)
export const VERIFACTU_QR_PRODUCTION_ENDPOINT =
  process.env.APP_VERIFACTU_QR_PRODUCTION_ENDPOINT ||
  "https://www2.aeat.es/wlpl/TIKE-CONT/ValidarQR";

export const VERIFACTU_QR_SANDBOX_ENDPOINT =
  process.env.APP_VERIFACTU_QR_SANDBOX_ENDPOINT ||
  "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";

const NS_SUM =
  "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";
const NS_INFO =
  "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";

const pad = (value) => String(value).padStart(2, "0");
const money = (value) => Number((Number(value || 0)).toFixed(2));
const moneyText = (value) => `${money(value)}`;
const safe = (value, fallback = "") =>
  String(value == null ? fallback : value).trim();

export const formatAeatDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

export const formatOffsetDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const minutes = pad(Math.abs(offsetMinutes) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
};

export const escapeXml = (value) =>
  safe(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const computeAeatInvoiceFingerprint = ({
  invoiceNumber,
  issueDate,
  issuerNif,
  ivaTotal,
  total,
  previousHash,
  tipoFactura,
  generatedAt,
}) => {
  const hashInput = [
    `IDEmisorFactura=${safe(issuerNif)}`,
    `NumSerieFactura=${safe(invoiceNumber)}`,
    `FechaExpedicionFactura=${formatAeatDate(issueDate)}`,
    `TipoFactura=${safe(tipoFactura || "F1")}`,
    `CuotaTotal=${moneyText(ivaTotal)}`,
    `ImporteTotal=${moneyText(total)}`,
    `Huella=${safe(previousHash)}`,
    `FechaHoraHusoGenRegistro=${formatOffsetDateTime(generatedAt || issueDate)}`,
  ].join("&");

  return createHash("sha256").update(hashInput, "utf8").digest("hex").toUpperCase();
};

const buildPartyXml = ({ name, nif, fallbackId }) => {
  if (safe(nif)) {
    return `<sum1:NombreRazon>${escapeXml(name || "CLIENTE VARIOS")}</sum1:NombreRazon><sum1:NIF>${escapeXml(
      nif
    )}</sum1:NIF>`;
  }

  return `<sum1:NombreRazon>${escapeXml(
    name || "CLIENTE VARIOS"
  )}</sum1:NombreRazon><sum1:IDOtro><sum1:CodigoPais>ES</sum1:CodigoPais><sum1:IDType>07</sum1:IDType><sum1:ID>${escapeXml(
    fallbackId || "NOIDENTIF"
  )}</sum1:ID></sum1:IDOtro>`;
};

const buildSystemXml = (issuerNif) => {
  const softwareName = safe(process.env.APP_VERIFACTU_SOFTWARE_NAME, "FRIGEST");
  const softwareNif = safe(process.env.APP_VERIFACTU_SOFTWARE_NIF, issuerNif);
  const systemName = safe(process.env.APP_VERIFACTU_SYSTEM_NAME, "FRIGEST");
  const systemId = safe(process.env.APP_VERIFACTU_SYSTEM_ID, "01").slice(0, 2);
  const version = safe(process.env.APP_VERIFACTU_SYSTEM_VERSION, "1.0.0");
  const installation = safe(
    process.env.APP_VERIFACTU_INSTALLATION_ID,
    `${serverConfig.appId}-local`
  );

  return `<sum1:SistemaInformatico><sum1:NombreRazon>${escapeXml(
    softwareName
  )}</sum1:NombreRazon><sum1:NIF>${escapeXml(
    softwareNif
  )}</sum1:NIF><sum1:NombreSistemaInformatico>${escapeXml(
    systemName
  )}</sum1:NombreSistemaInformatico><sum1:IdSistemaInformatico>${escapeXml(
    systemId
  )}</sum1:IdSistemaInformatico><sum1:Version>${escapeXml(
    version
  )}</sum1:Version><sum1:NumeroInstalacion>${escapeXml(
    installation
  )}</sum1:NumeroInstalacion><sum1:TipoUsoPosibleSoloVerifactu>S</sum1:TipoUsoPosibleSoloVerifactu><sum1:TipoUsoPosibleMultiOT>N</sum1:TipoUsoPosibleMultiOT><sum1:IndicadorMultiplesOT>N</sum1:IndicadorMultiplesOT></sum1:SistemaInformatico>`;
};

const buildBreakdownXml = ({ subtotal, ivaTotal }) => {
  const base = money(subtotal);
  const tax = money(ivaTotal);
  const type = Math.abs(base) > 0 ? Number(((tax / base) * 100).toFixed(2)) : 0;

  return `<sum1:Desglose><sum1:DetalleDesglose><sum1:Impuesto>01</sum1:Impuesto><sum1:ClaveRegimen>01</sum1:ClaveRegimen><sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion><sum1:TipoImpositivo>${type}</sum1:TipoImpositivo><sum1:BaseImponibleOimporteNoSujeto>${moneyText(
    base
  )}</sum1:BaseImponibleOimporteNoSujeto><sum1:CuotaRepercutida>${moneyText(
    tax
  )}</sum1:CuotaRepercutida></sum1:DetalleDesglose></sum1:Desglose>`;
};

// Construye la URL de verificación QR según Orden HAC/1177/2024, Anexo IV.
// Solo se genera en producción: en sandbox no existe registro real en la AEAT.
// Parámetros: nif (obligado), numserie (número-serie), fecha (DD-MM-YYYY), importe (2 decimales).
export const buildVerifactuQrUrl = (invoice, isProduction) => {
  if (!isProduction) return "";
  const params = new URLSearchParams({
    nif: safe(invoice.issuer_nif),
    numserie: safe(invoice.invoice_number),
    fecha: formatAeatDate(invoice.issue_date),
    importe: `${money(invoice.total)}`,
  });
  return `${VERIFACTU_QR_PRODUCTION_ENDPOINT}?${params.toString()}`;
};

export const buildVerifactuSoapEnvelope = ({
  invoice,
  issuerNif,
  issuerName,
  previousInvoice,
  generatedAt,
}) => {
  const rectificativaXml =
    invoice.tipo_factura?.startsWith("R") && invoice.factura_rectificada_number
      ? `<sum1:TipoRectificativa>${
          invoice.rectificativa_tipo || "I"
        }</sum1:TipoRectificativa><sum1:FacturasRectificadas><sum1:IDFacturaRectificada><sum1:IDEmisorFactura>${escapeXml(
          issuerNif
        )}</sum1:IDEmisorFactura><sum1:NumSerieFactura>${escapeXml(
          invoice.factura_rectificada_number
        )}</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>${formatAeatDate(
          invoice.factura_rectificada_issue_date || invoice.issue_date
        )}</sum1:FechaExpedicionFactura></sum1:IDFacturaRectificada></sum1:FacturasRectificadas>${
          invoice.rectificativa_tipo === "S"
            ? `<sum1:ImporteRectificacion><sum1:BaseRectificada>${moneyText(
                invoice.rectified_base ?? 0
              )}</sum1:BaseRectificada><sum1:CuotaRectificada>${moneyText(
                invoice.rectified_tax ?? 0
              )}</sum1:CuotaRectificada></sum1:ImporteRectificacion>`
            : ""
        }`
      : "";

  const previousXml = previousInvoice?.hash_huella
    ? `<sum1:RegistroAnterior><sum1:IDEmisorFactura>${escapeXml(
        previousInvoice.issuer_nif || issuerNif
      )}</sum1:IDEmisorFactura><sum1:NumSerieFactura>${escapeXml(
        previousInvoice.invoice_number
      )}</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>${formatAeatDate(
        previousInvoice.issue_date
      )}</sum1:FechaExpedicionFactura><sum1:Huella>${escapeXml(
        previousInvoice.hash_huella
      )}</sum1:Huella></sum1:RegistroAnterior>`
    : "<sum1:PrimerRegistro>S</sum1:PrimerRegistro>";

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="${NS_SUM}" xmlns:sum1="${NS_INFO}">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:RegFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum1:ObligadoEmision>
          <sum1:NombreRazon>${escapeXml(issuerName)}</sum1:NombreRazon>
          <sum1:NIF>${escapeXml(issuerNif)}</sum1:NIF>
        </sum1:ObligadoEmision>
      </sum:Cabecera>
      <sum:RegistroFactura>
        <sum1:RegistroAlta>
          <sum1:IDVersion>1.0</sum1:IDVersion>
          <sum1:IDFactura>
            <sum1:IDEmisorFactura>${escapeXml(issuerNif)}</sum1:IDEmisorFactura>
            <sum1:NumSerieFactura>${escapeXml(invoice.invoice_number)}</sum1:NumSerieFactura>
            <sum1:FechaExpedicionFactura>${formatAeatDate(
              invoice.issue_date
            )}</sum1:FechaExpedicionFactura>
          </sum1:IDFactura>
          <sum1:RefExterna>${escapeXml(invoice.id || invoice.invoice_number)}</sum1:RefExterna>
          <sum1:NombreRazonEmisor>${escapeXml(issuerName)}</sum1:NombreRazonEmisor>
          <sum1:TipoFactura>${escapeXml(invoice.tipo_factura || "F1")}</sum1:TipoFactura>
          ${rectificativaXml}
          <sum1:FechaOperacion>${formatAeatDate(invoice.issue_date)}</sum1:FechaOperacion>
          <sum1:DescripcionOperacion>${escapeXml(
            invoice.descripcion_operacion || `Intervencion ${invoice.intervention_number || invoice.invoice_number}`
          )}</sum1:DescripcionOperacion>
          <sum1:Destinatarios>
            <sum1:IDDestinatario>${buildPartyXml({
              name: invoice.client_name,
              nif: invoice.client_nif,
              fallbackId: invoice.client_id || invoice.invoice_number,
            })}</sum1:IDDestinatario>
          </sum1:Destinatarios>
          ${buildBreakdownXml(invoice)}
          <sum1:CuotaTotal>${moneyText(invoice.iva_total)}</sum1:CuotaTotal>
          <sum1:ImporteTotal>${moneyText(invoice.total)}</sum1:ImporteTotal>
          <sum1:Encadenamiento>${previousXml}</sum1:Encadenamiento>
          ${buildSystemXml(issuerNif)}
          <sum1:FechaHoraHusoGenRegistro>${formatOffsetDateTime(
            generatedAt || invoice.issue_date
          )}</sum1:FechaHoraHusoGenRegistro>
          <sum1:TipoHuella>01</sum1:TipoHuella>
          <sum1:Huella>${escapeXml(invoice.hash_huella)}</sum1:Huella>
        </sum1:RegistroAlta>
      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
};

export const resolveCertificateFile = async (certUri) => {
  const normalized = safe(certUri).replace(/^\/+/, "");
  if (!normalized) {
    throw new HttpError(400, "Debe configurar el certificado VeriFactu para usar produccion.");
  }

  const target = path.isAbsolute(normalized)
    ? normalized
    : path.join(serverConfig.uploadsDir, normalized);
  await fs.access(target);
  return target;
};

export const postSoapRequest = async ({
  endpoint,
  xml,
  certPath,
  certPassword,
  timeoutMs = 20000,
}) => {
  const url = new URL(endpoint);
  const pfx = certPath ? await fs.readFile(certPath) : null;

  return await new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        pfx: pfx || undefined,
        passphrase: certPassword || undefined,
        rejectUnauthorized: true,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "",
          "Content-Length": Buffer.byteLength(xml),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            httpStatus: response.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Timeout conectando con AEAT."));
    });
    request.on("error", reject);
    request.write(xml);
    request.end();
  });
};

const getTagValue = (xml, tag) => {
  const match = new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`).exec(xml);
  return match?.[1]?.trim() || "";
};

export const parseVerifactuSubmissionResponse = (xml, httpStatus) => {
  const html = /^\s*</.test(xml) && /^\s*<(?:!DOCTYPE|html)/i.test(xml);
  const fault = getTagValue(xml, "faultstring") || getTagValue(xml, "Fault");
  const csv = getTagValue(xml, "CSV");
  const estadoEnvio = getTagValue(xml, "EstadoEnvio");
  const estadoRegistro = getTagValue(xml, "EstadoRegistro");
  const codigo = getTagValue(xml, "CodigoErrorRegistro");
  const descripcion =
    getTagValue(xml, "DescripcionErrorRegistro") || fault || (html ? "Respuesta HTML no SOAP." : "");
  const duplicateId = getTagValue(xml, "IdPeticionRegistroDuplicado");
  const duplicateState = getTagValue(xml, "EstadoRegistroDuplicado");
  const timestamp = getTagValue(xml, "TimestampPresentacion");
  const waitSeconds = Number(getTagValue(xml, "TiempoEsperaEnvio") || 0);

  const accepted = ["Correcto", "AceptadoConErrores"].includes(estadoRegistro);
  const duplicated = !accepted && Boolean(duplicateId);
  const status = duplicated
    ? "duplicado"
    : accepted
      ? estadoRegistro === "AceptadoConErrores"
        ? "aceptado_con_errores"
        : "aceptado"
      : "error";

  return {
    httpStatus,
    status,
    accepted: accepted || duplicated,
    csv,
    estadoEnvio,
    estadoRegistro,
    duplicateId,
    duplicateState,
    errorCode: codigo,
    errorDescription: descripcion,
    timestamp,
    waitSeconds,
    responseType: fault ? "SOAP_FAULT" : html ? "HTML_ERROR" : "SOAP_RESPONSE",
    rawResponse: xml,
  };
};
