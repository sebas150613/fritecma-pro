import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ── CONFIGURACIÓN DE ENTORNO ──────────────────────────────────────────────────
// Cambia VERIFACTU_PRODUCCION a 'true' en secrets para activar producción real.
const IS_PRODUCCION = Deno.env.get('VERIFACTU_PRODUCCION') === 'true';

const AEAT_ENDPOINT = IS_PRODUCCION
  ? 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
  : 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';

const AEAT_QR_BASE = IS_PRODUCCION
  ? 'https://www2.aeat.es/wlpl/TIKE-CONT/ValidarQR'
  : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';
// ─────────────────────────────────────────────────────────────────────────────

// SHA-256 hash usando Web Crypto API (async)
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Genera número de factura correlativo
async function getNextInvoiceNumber(base44, serie = 'A') {
  const year = new Date().getFullYear();
  const existing = await base44.asServiceRole.entities.Invoice.list('-invoice_chain_index', 1);
  const lastIdx = existing.length > 0 ? (existing[0].invoice_chain_index || 0) : 0;
  const nextIdx = lastIdx + 1;
  const number = `${serie}${year}-${String(nextIdx).padStart(5, '0')}`;
  return { number, index: nextIdx };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'superadmin', 'encargado', 'oficina'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { intervention_id, mode } = body; // mode: 'guardar' | 'facturar'

    if (!intervention_id) {
      return Response.json({ error: 'intervention_id requerido' }, { status: 400 });
    }

    // Cargar el parte
    const interventions = await base44.asServiceRole.entities.Intervention.filter({ id: intervention_id }, '-created_date', 1);
    if (!interventions.length) {
      return Response.json({ error: 'Parte no encontrado' }, { status: 404 });
    }
    const intervention = interventions[0];

    const now = new Date().toISOString();

    // ── MODO: GUARDAR SIN FACTURA ──
    if (mode === 'guardar') {
      await base44.asServiceRole.entities.Intervention.update(intervention_id, {
        status: 'completado',
        validated_by: user.email,
        validated_at: now,
      });
      return Response.json({ success: true, mode: 'guardar', status: 'completado' });
    }

    // ── MODO: FACTURAR (Veri*factu) ──

    // 1. Obtener cliente
    const clients = await base44.asServiceRole.entities.Client.filter({ id: intervention.client_id }, '-created_date', 1);
    const client = clients[0] || {};

    // 2. Obtener número de factura correlativo
    const { number: invoiceNumber, index: chainIndex } = await getNextInvoiceNumber(base44);

    // 3. Obtener hash de la factura anterior para encadenamiento
    const prevInvoices = await base44.asServiceRole.entities.Invoice.list('-invoice_chain_index', 1);
    const hashAnterior = prevInvoices.length > 0 ? (prevInvoices[0].hash_huella || '') : '';

    // 4. Leer NIF y nombre desde secrets (configurados en Ajustes)
    const emisorNif = Deno.env.get('VERIFACTU_NIF') || 'B00000000';
    const emisorNombre = Deno.env.get('VERIFACTU_NOMBRE') || 'EMPRESA S.L.';

    // 5. Construir string para hash (según spec Veri*factu: NIF+NombreEmisor+NumFactura+FechaExpedicion+TipoFactura+CuotaTotal+ImporteTotal+Huella Anterior+FechaHoraHuella)
    const fechaHoraHuella = now.replace(/[-:T.Z]/g, '').slice(0, 14);
    const hashInput = [
      `NIF=${emisorNif}`,
      `NombreRazonEmisor=${emisorNombre}`,
      `NumSerieFactura=${invoiceNumber}`,
      `FechaExpedicionFactura=${now.slice(0, 10)}`,
      `TipoFactura=F1`,
      `CuotaTotalIVA=${(intervention.iva_total || 0).toFixed(2)}`,
      `ImporteTotal=${(intervention.total || 0).toFixed(2)}`,
      `Huella=${hashAnterior}`,
      `FechaHoraHuella=${fechaHoraHuella}`,
    ].join('&');

    const hashHuella = await sha256(hashInput);

    // 6. Generar URL QR verificación AEAT (sandbox o producción según flag)
    // La AEAT exige fecha en formato DD-MM-YYYY en el QR
    const fechaQR = now.slice(0, 10).split('-').reverse().join('-');
    const qrParams = new URLSearchParams({
      nif: emisorNif,
      numserie: invoiceNumber,
      fecha: fechaQR,
      importe: (intervention.total || 0).toFixed(2),
    });
    const qrUrl = `${AEAT_QR_BASE}?${qrParams.toString()}`;

    // 7. Construir XML Veri*factu (estructura básica RegFactuSistemaFacturacion)
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:RegFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum:ObligadoEmision>
          <sum:NombreRazon>${emisorNombre}</sum:NombreRazon>
          <sum:NIF>${emisorNif}</sum:NIF>
        </sum:ObligadoEmision>
      </sum:Cabecera>
      <sum:RegistroFactura>
        <sum:RegistroAlta>
          <sum:IDVersion>1.0</sum:IDVersion>
          <sum:IDFactura>
            <sum:IDEmisorFactura><sum:NIF>${emisorNif}</sum:NIF></sum:IDEmisorFactura>
            <sum:NumSerieFactura>${invoiceNumber}</sum:NumSerieFactura>
            <sum:FechaExpedicionFactura>${now.slice(0, 10)}</sum:FechaExpedicionFactura>
          </sum:IDFactura>
          <sum:NombreRazonEmisor>${emisorNombre}</sum:NombreRazonEmisor>
          <sum:TipoFactura>F1</sum:TipoFactura>
          <sum:DescripcionOperacion>Servicios de mantenimiento y reparación - ${intervention.description || 'Servicio técnico'}</sum:DescripcionOperacion>
          <sum:Destinatarios>
            <sum:IDDestinatario>
              <sum:NombreRazon>${intervention.client_name}</sum:NombreRazon>
              ${client.cif ? `<sum:NIF>${client.cif}</sum:NIF>` : '<sum:IDOtro><sum:ID>NO_NIF</sum:ID></sum:IDOtro>'}
            </sum:IDDestinatario>
          </sum:Destinatarios>
          <sum:Desglose>
            <sum:DetalleIVA>
              <sum:TipoImpositivo>21.00</sum:TipoImpositivo>
              <sum:BaseImponibleOimporteNoSujeto>${(intervention.subtotal || 0).toFixed(2)}</sum:BaseImponibleOimporteNoSujeto>
              <sum:CuotaRepercutida>${(intervention.iva_total || 0).toFixed(2)}</sum:CuotaRepercutida>
            </sum:DetalleIVA>
          </sum:Desglose>
          <sum:CuotaTotal>${(intervention.iva_total || 0).toFixed(2)}</sum:CuotaTotal>
          <sum:ImporteTotal>${(intervention.total || 0).toFixed(2)}</sum:ImporteTotal>
          <sum:Encadenamiento>
            ${hashAnterior ? `<sum:RegistroAnterior><sum:Huella>${hashAnterior}</sum:Huella></sum:RegistroAnterior>` : '<sum:PrimerRegistro>S</sum:PrimerRegistro>'}
          </sum:Encadenamiento>
          <sum:SistemaInformatico>
            <sum:NombreRazon>FRITECMA Software</sum:NombreRazon>
            <sum:NIF>${emisorNif}</sum:NIF>
            <sum:NombreSistemaInformatico>FRITECMA App</sum:NombreSistemaInformatico>
            <sum:Version>1.0</sum:Version>
          </sum:SistemaInformatico>
          <sum:FechaHoraHusoHorarioGenRegistro>${now.slice(0, 19)}+01:00</sum:FechaHoraHusoHorarioGenRegistro>
          <sum:Huella>${hashHuella}</sum:Huella>
        </sum:RegistroAlta>
      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;

    // 8. Enviar a AEAT — sandbox o producción según flag VERIFACTU_PRODUCCION
    let verifactuStatus = 'pendiente';
    let verifactuResponse = '';
    let csvCode = '';

    if (!IS_PRODUCCION) {
      // ── MODO SANDBOX: simula respuesta OK de la AEAT para pruebas ──
      // En producción se usará el endpoint real con certificado .p12
      csvCode = `SANDBOX-${hashHuella.slice(0, 16)}`;
      verifactuStatus = 'aceptado';
      verifactuResponse = `[SANDBOX] Simulación OK. Hash: ${hashHuella}. Endpoint que se usará en producción: ${AEAT_ENDPOINT}`;
    } else {
      // ── MODO PRODUCCIÓN: envío real a la AEAT ──
      try {
        const aeatRes = await fetch(AEAT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR',
          },
          body: xmlPayload,
          signal: AbortSignal.timeout(15000),
        });
        const responseText = await aeatRes.text();
        verifactuResponse = responseText.slice(0, 1000);
        const csvMatch = responseText.match(/<CSV>([^<]+)<\/CSV>/);
        if (csvMatch) {
          csvCode = csvMatch[1];
          verifactuStatus = 'aceptado';
        } else {
          verifactuStatus = 'enviado';
        }
      } catch (aeatErr) {
        verifactuStatus = 'pendiente';
        verifactuResponse = `Error conexión AEAT: ${aeatErr.message}`;
      }
    }

    // 9. Calcular fecha de retención legal (6 años desde emisión)
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() + 6);
    const retentionUntil = retentionDate.toISOString().slice(0, 10);

    // 10. Crear registro de factura — XML en texto plano, sin PDF
    const invoiceData = {
      invoice_number: invoiceNumber,
      serie: 'A',
      intervention_id: intervention_id,
      intervention_number: intervention.number,
      client_id: intervention.client_id,
      client_name: intervention.client_name,
      client_nif: client.cif || '',
      client_address: client.address || '',
      issue_date: now,
      subtotal: intervention.subtotal || 0,
      iva_total: intervention.iva_total || 0,
      total: intervention.total || 0,
      lines_json: intervention.materials_json || '[]',
      xml_payload: xmlPayload,
      hash_huella: hashHuella,
      hash_anterior: hashAnterior,
      invoice_chain_index: chainIndex,
      retention_until: retentionUntil,
      verifactu_status: verifactuStatus,
      verifactu_csv: csvCode,
      verifactu_response: verifactuResponse,
      qr_url: qrUrl,
      is_locked: true,
      issuer_nif: emisorNif,
      issuer_name: emisorNombre,
      created_by_email: user.email,
    };

    const invoice = await base44.asServiceRole.entities.Invoice.create(invoiceData);

    // 11. Marcar el parte como facturado e inalterable
    await base44.asServiceRole.entities.Intervention.update(intervention_id, {
      status: 'facturado',
      validated_by: user.email,
      validated_at: now,
    });

    return Response.json({
      success: true,
      mode: 'facturar',
      invoice_number: invoiceNumber,
      hash: hashHuella,
      verifactu_status: verifactuStatus,
      qr_url: qrUrl,
      invoice_id: invoice.id,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});