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

    // 4. NIF y nombre: primero del perfil del admin (guardado desde Ajustes), luego secrets como fallback
    const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' }, '-created_date', 1);
    const adminUser = adminUsers[0] || {};
    const emisorNif = adminUser.verifactu_nif || Deno.env.get('VERIFACTU_NIF') || 'B00000000';
    const emisorNombre = adminUser.verifactu_nombre || Deno.env.get('VERIFACTU_NOMBRE') || 'EMPRESA S.L.';

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

    // 6. Generar URL QR verificación AEAT
    // La AEAT exige fecha en formato DD-MM-YYYY en el parámetro
    // IMPORTANTE: en Sandbox no existe registro real en la AEAT, el QR dará 404.
    // Solo se genera QR real en producción tras respuesta aceptada.
    const fechaQR = now.slice(0, 10).split('-').reverse().join('-');
    const qrParams = new URLSearchParams({
      nif: emisorNif,
      numserie: invoiceNumber,
      fecha: fechaQR,
      importe: (intervention.total || 0).toFixed(2),
    });
    // La URL final del QR se asigna tras confirmar estado 'aceptado' de la AEAT
    const qrUrlBase = `${AEAT_QR_BASE}?${qrParams.toString()}`;

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

    // 8. Enviar a AEAT con certificado digital (mTLS) — sandbox o producción
    let verifactuStatus = 'pendiente';
    let verifactuResponse = '';
    let csvCode = '';

    try {
      // Obtener certificado digital del administrador
      const certUri = adminUser.verifactu_cert_uri;
      if (!certUri) {
        throw new Error('Certificado digital no configurado. Ve a Configuración → Veri*factu y sube el archivo .p12.');
      }

      // Descargar cert desde almacenamiento privado
      const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: certUri,
        expires_in: 60,
      });
      const certResponse = await fetch(signed_url);
      const certArrayBuffer = await certResponse.arrayBuffer();

      // Parsear .p12 con node-forge
      const forge = (await import('npm:node-forge@1.3.1')).default;
      const certBytes = new Uint8Array(certArrayBuffer);
      const certBinaryStr = Array.from(certBytes).map(b => String.fromCharCode(b)).join('');
      const p12Der = forge.util.createBuffer(certBinaryStr, 'raw');
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, adminUser.verifactu_cert_password || '');

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

      if (!certBags[forge.pki.oids.certBag]?.length || !keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.length) {
        throw new Error('No se pudo extraer el certificado o la clave privada del archivo .p12. Verifica la contraseña.');
      }

      const certPem = forge.pki.certificateToPem(certBags[forge.pki.oids.certBag][0].cert);
      const keyPem = forge.pki.privateKeyToPem(keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key);

      // Crear cliente HTTP con certificado cliente (mTLS)
      const httpClient = Deno.createHttpClient({ certChain: certPem, privateKey: keyPem });

      const aeatRes = await fetch(AEAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR',
        },
        body: xmlPayload,
        signal: AbortSignal.timeout(20000),
        client: httpClient,
      });

      httpClient.close();

      const responseText = await aeatRes.text();
      verifactuResponse = responseText.slice(0, 2000);
      console.log(`[Verifactu] Respuesta AEAT (${IS_PRODUCCION ? 'PROD' : 'SANDBOX'}):`, verifactuResponse.slice(0, 500));

      // Detectar aceptación: buscar CSV o EstadoEnvio=Correcto
      const csvMatch = responseText.match(/<CSV>([^<]+)<\/CSV>/);
      const estadoMatch = responseText.match(/<EstadoEnvio>([^<]+)<\/EstadoEnvio>/);
      const codigoMatch = responseText.match(/<CodigoErrorRegistro>([^<]+)<\/CodigoErrorRegistro>/);

      if (csvMatch) {
        csvCode = csvMatch[1];
        verifactuStatus = 'aceptado';
      } else if (estadoMatch && (estadoMatch[1] === 'Correcto' || estadoMatch[1] === 'AceptadoConErrores')) {
        verifactuStatus = 'aceptado';
      } else if (codigoMatch) {
        verifactuStatus = 'rechazado';
        verifactuResponse = `Error AEAT: ${codigoMatch[1]} — ${verifactuResponse}`;
      } else {
        verifactuStatus = 'enviado'; // enviado pero sin confirmación clara
      }

    } catch (aeatErr) {
      console.error('[Verifactu] Error al enviar a AEAT:', aeatErr.message);
      verifactuStatus = 'pendiente';
      verifactuResponse = `Error: ${aeatErr.message}`;
    }

    // QR solo válido en producción con envío aceptado por la AEAT
    const qrUrl = (verifactuStatus === 'aceptado' && IS_PRODUCCION) ? qrUrlBase : '';

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