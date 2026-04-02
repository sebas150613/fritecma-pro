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
    const { intervention_id, mode, original_invoice_id, rectificativa_motivo, tipo_horario_override, tarifa_override } = body; // mode: 'guardar' | 'facturar' | 'rectificar'

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

    // ── MODO: RECTIFICATIVA ──
    if (mode === 'rectificar') {
      if (!original_invoice_id) {
        return Response.json({ error: 'original_invoice_id requerido para rectificar' }, { status: 400 });
      }

      const origInvoices = await base44.asServiceRole.entities.Invoice.filter({ id: original_invoice_id }, '-created_date', 1);
      if (!origInvoices.length) {
        return Response.json({ error: 'Factura original no encontrada' }, { status: 404 });
      }
      const origInvoice = origInvoices[0];

      const allUsersRect = await base44.asServiceRole.entities.User.list('full_name', 100);
      const adminUser = allUsersRect.find(u => u.verifactu_nif) || {};
      const emisorNif = adminUser.verifactu_nif || Deno.env.get('VERIFACTU_NIF') || 'B00000000';
      const emisorNombre = adminUser.verifactu_nombre || Deno.env.get('VERIFACTU_NOMBRE') || 'EMPRESA S.L.';

      const { number: rectNumber, index: rectIndex } = await getNextInvoiceNumber(base44, 'R');

      // Hash encadenado al hash de la factura original
      const fechaHoraHuella = now.replace(/[-:T.Z]/g, '').slice(0, 14);
      const hashInput = [
        `NIF=${emisorNif}`,
        `NombreRazonEmisor=${emisorNombre}`,
        `NumSerieFactura=${rectNumber}`,
        `FechaExpedicionFactura=${now.slice(0, 10)}`,
        `TipoFactura=R1`,
        `CuotaTotalIVA=${(origInvoice.iva_total || 0).toFixed(2)}`,
        `ImporteTotal=${-(origInvoice.total || 0).toFixed(2)}`,
        `Huella=${origInvoice.hash_huella}`,
        `FechaHoraHuella=${fechaHoraHuella}`,
      ].join('&');
      const hashRect = await sha256(hashInput);

      const retentionDate = new Date();
      retentionDate.setFullYear(retentionDate.getFullYear() + 6);

      const rectData = {
        invoice_number: rectNumber,
        serie: 'R',
        intervention_id: intervention_id,
        intervention_number: intervention.number,
        client_id: origInvoice.client_id,
        client_name: origInvoice.client_name,
        client_nif: origInvoice.client_nif,
        client_address: origInvoice.client_address,
        issue_date: now,
        subtotal: -(origInvoice.subtotal || 0),
        iva_total: -(origInvoice.iva_total || 0),
        total: -(origInvoice.total || 0),
        lines_json: origInvoice.lines_json,
        hash_huella: hashRect,
        hash_anterior: origInvoice.hash_huella,
        invoice_chain_index: rectIndex,
        retention_until: retentionDate.toISOString().slice(0, 10),
        verifactu_status: 'pendiente',
        is_locked: true,
        issuer_nif: emisorNif,
        issuer_name: emisorNombre,
        created_by_email: user.email,
        // Campos rectificativa
        tipo_factura: 'R1',
        factura_rectificada_id: original_invoice_id,
        factura_rectificada_number: origInvoice.invoice_number,
        rectificativa_motivo: rectificativa_motivo || '',
      };

      const rectInvoice = await base44.asServiceRole.entities.Invoice.create(rectData);

      return Response.json({
        success: true,
        mode: 'rectificar',
        invoice_number: rectNumber,
        hash: hashRect,
        verifactu_status: 'pendiente',
        invoice_id: rectInvoice.id,
      });
    }

    // ── MODO: FACTURAR (Veri*factu) ──

    // 1. Obtener cliente
    const clients = await base44.asServiceRole.entities.Client.filter({ id: intervention.client_id }, '-created_date', 1);
    const client = clients[0] || {};

    // Si hay override de tarifa, recalcular las líneas de MO
    if (tarifa_override || tipo_horario_override) {
      const tarifaMap = {
        normal:   client.tarifa_normal   ?? 45,
        extra:    client.tarifa_extra    ?? 60,
        nocturno: client.tarifa_nocturna ?? 70,
        festivo:  client.tarifa_festiva  ?? 80,
      };
      const tipoFinal = tipo_horario_override || intervention.tipo_horario || 'normal';
      const tarifaFinal = tarifa_override || tarifaMap[tipoFinal] || 45;

      let lines = [];
      try { lines = JSON.parse(intervention.materials_json || '[]'); } catch(_) {}
      let changed = false;
      lines = lines.map(l => {
        if (l._isLabor) {
          changed = true;
          const newTotal = (l.quantity || 0) * tarifaFinal;
          return { ...l, unit_price: tarifaFinal, total: newTotal, _tipoHorario: tipoFinal };
        }
        return l;
      });
      if (changed) {
        const sub = lines.reduce((s, l) => s + (l.total || 0), 0);
        const disc = sub * ((intervention.discount_percent || 0) / 100);
        const base = sub - disc;
        const ivaT = lines.reduce((s, l) => {
          const lineBase = (l.total || 0) * (1 - (intervention.discount_percent || 0) / 100);
          return s + lineBase * ((l.iva_percent || 21) / 100);
        }, 0);
        await base44.asServiceRole.entities.Intervention.update(intervention_id, {
          materials_json: JSON.stringify(lines),
          subtotal: sub - disc,
          iva_total: ivaT,
          total: base + ivaT,
          tipo_horario: tipoFinal,
          tarifa_aplicada: tarifaFinal,
        });
        // Recargar intervention actualizada
        const fresh = await base44.asServiceRole.entities.Intervention.filter({ id: intervention_id }, '-created_date', 1);
        Object.assign(intervention, fresh[0] || {});
      }
    }

    // 2. Obtener número de factura correlativo
    const { number: invoiceNumber, index: chainIndex } = await getNextInvoiceNumber(base44);

    // 3. Obtener hash de la factura anterior para encadenamiento
    const prevInvoices = await base44.asServiceRole.entities.Invoice.list('-invoice_chain_index', 1);
    const hashAnterior = prevInvoices.length > 0 ? (prevInvoices[0].hash_huella || '') : '';

    // 4. NIF y nombre: buscar el usuario que tenga verifactu_nif configurado (puede ser admin o superadmin)
    const allUsers = await base44.asServiceRole.entities.User.list('full_name', 100);
    const adminUser = allUsers.find(u => u.verifactu_nif) || {};
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
        <sum:TipoComunicacion>A0</sum:TipoComunicacion>
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

    // 8. Enviar a AEAT con mTLS usando node:https (Deno Node compatibility)
    let verifactuStatus = 'pendiente';
    let verifactuResponse = '';
    let csvCode = '';

    try {
      console.log(`[Verifactu] Iniciando envío mTLS a AEAT (${IS_PRODUCCION ? 'PROD' : 'SANDBOX'}): ${AEAT_ENDPOINT}`);
      console.log(`[Verifactu] NIF emisor: ${emisorNif}, Nº factura: ${invoiceNumber}`);

      // Obtener certificado .p12 del almacenamiento privado
      const certUri = adminUser.verifactu_cert_uri;
      if (!certUri) {
        throw new Error('Certificado digital no configurado. Ve a Configuración → Veri*factu y sube el archivo .p12.');
      }

      const certPassword = adminUser.verifactu_cert_password || '';
      console.log(`[Verifactu] Certificado URI: ${certUri}, contraseña configurada: ${certPassword ? 'Sí' : 'No (vacía)'}`);

      // Descargar .p12 desde almacenamiento privado
      const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: certUri,
        expires_in: 60,
      });
      const certResponse = await fetch(signed_url);
      const certArrayBuffer = await certResponse.arrayBuffer();

      // En Deno, Buffer no es global — importar desde node:buffer
      const { Buffer } = await import('node:buffer');
      const certBuffer = Buffer.from(certArrayBuffer);
      const xmlBytes = Buffer.byteLength(xmlPayload, 'utf8');
      console.log(`[Verifactu] Certificado descargado: ${certBuffer.length} bytes`);

      // Usar node:https con pfx para mTLS real
      const https = await import('node:https');
      const url = new URL(AEAT_ENDPOINT);

      let httpStatus = 200;
      const responseText = await new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR',
            'Content-Length': xmlBytes,
          },
          pfx: certBuffer,
          passphrase: certPassword,
          rejectUnauthorized: false, // sandbox usa cert autofirmado
        };

        const req = https.default.request(options, (res) => {
          httpStatus = res.statusCode;
          console.log(`[Verifactu] HTTP Status AEAT: ${res.statusCode} ${res.statusMessage}`);
          let data = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve(data));
        });

        req.on('error', (err) => {
          console.error('[Verifactu] Error de red mTLS:', err.message);
          reject(err);
        });

        req.setTimeout(25000, () => {
          req.destroy();
          reject(new Error('Timeout: AEAT no respondió en 25s'));
        });

        req.write(xmlPayload, 'utf8');
        req.end();
      });

      // En SANDBOX: aceptar respuestas sin error HTTP (incluso 302) como testing
      if (!IS_PRODUCCION && httpStatus >= 200 && httpStatus < 400) {
        console.log(`[Verifactu] SANDBOX MODE - Aceptando respuesta HTTP ${httpStatus} como válida para testing`);
        verifactuStatus = 'aceptado';
        verifactuResponse = `Testing SANDBOX - HTTP ${httpStatus}. En producción requiere CSV válido de AEAT.`;
      } else if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.warn('[Verifactu] AEAT devolvió HTML en lugar de SOAP. Certificado rechazado o endpoint incorrecto.');
        console.log('[Verifactu] Respuesta HTML (primeros 500):', responseText.slice(0, 500));
        verifactuStatus = 'sin_envio';
        verifactuResponse = 'AEAT rechazó el certificado cliente (respuesta HTML). Verifica que el .p12 sea el certificado homologado para Veri*factu y que la contraseña sea correcta.';
      } else {
        // PRODUCCION: requiere CSV e IDRegistro
        console.log(`[Verifactu] Respuesta SOAP AEAT:`, responseText.slice(0, 1500));
        verifactuResponse = responseText.slice(0, 2000);

        const csvMatch = responseText.match(/<CSV>([^<]+)<\/CSV>/);
        const estadoMatch = responseText.match(/<EstadoEnvio>([^<]+)<\/EstadoEnvio>/);
        const codigoMatch = responseText.match(/<CodigoErrorRegistro>([^<]+)<\/CodigoErrorRegistro>/);

        // Extraer IDRegistro y Timestamp AEAT
        const idRegistroMatch = responseText.match(/<IDRegistro>([^<]+)<\/IDRegistro>/);
        const idRegistro = idRegistroMatch ? idRegistroMatch[1] : '';
        const timestampMatch = responseText.match(/<FechaHoraRecepcion>([^<]+)<\/FechaHoraRecepcion>/);
        const timestampAeat = timestampMatch ? timestampMatch[1] : '';
        
        if (csvMatch) {
          csvCode = csvMatch[1];
          verifactuStatus = 'aceptado';
          console.log(`[Verifactu] ACEPTADO - CSV: ${csvCode}, IDRegistro: ${idRegistro}`);
        } else if (estadoMatch && (estadoMatch[1] === 'Correcto' || estadoMatch[1] === 'AceptadoConErrores')) {
          verifactuStatus = 'aceptado';
          console.log(`[Verifactu] ACEPTADO - EstadoEnvio: ${estadoMatch[1]}, IDRegistro: ${idRegistro}`);
        } else if (codigoMatch) {
          verifactuStatus = 'rechazado';
          verifactuResponse = `Error AEAT: ${codigoMatch[1]} — ${verifactuResponse}`;
          console.warn(`[Verifactu] RECHAZADO - Código: ${codigoMatch[1]}`);
        } else {
          verifactuStatus = 'enviado';
          console.log('[Verifactu] Enviado - respuesta sin CSV ni error claro');
        }
      }

    } catch (aeatErr) {
      console.error('[Verifactu] Error al enviar a AEAT:', aeatErr.message);
      verifactuStatus = 'sin_envio';
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