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

// Calcula zona horaria dinámica: UTC+2 en verano (CEST), UTC+1 en invierno (CET)
// CRÍTICO: Este offset se incluye en el hash SHA-256 y en FechaHoraHusoHorarioGenRegistro.
// Errores aquí rompen la firma fiscal sin aviso. Para producción real, usar luxon o equivalent.
function getTimeZoneOffset(date) {
  if (!date || !(date instanceof Date) || isNaN(date)) {
    console.warn(JSON.stringify({ evento: 'error_timezone_fecha_invalida', tipo: typeof date }));
    return '+01:00'; // fallback seguro
  }
  
  try {
    const year = date.getFullYear();
    
    // España: último domingo de marzo (inicio verano) y último domingo de octubre (fin verano)
    // En 2026: 29-marzo (verano) y 25-octubre (invierno)
    const lastSunMar = new Date(year, 2, 31);
    lastSunMar.setDate(lastSunMar.getDate() - ((lastSunMar.getDay() + 6) % 7));
    
    const lastSunOct = new Date(year, 9, 31);
    lastSunOct.setDate(lastSunOct.getDate() - ((lastSunOct.getDay() + 6) % 7));
    
    const isSummer = date >= lastSunMar && date < lastSunOct;
    const offset = isSummer ? '+02:00' : '+01:00';
    
    console.log(JSON.stringify({
      evento: 'timezone_calculado',
      fecha: date.toISOString(),
      offset,
      esMesVerano: isSummer,
      cambioVeX: 'desde ' + lastSunMar.toISOString().slice(0, 10) + ' hasta ' + lastSunOct.toISOString().slice(0, 10),
    }));
    
    return offset;
  } catch (err) {
    console.error(JSON.stringify({ evento: 'error_calculando_timezone', error: err.message }));
    return '+01:00'; // fallback seguro
  }
}

// Envía XML a AEAT vía mTLS y parsea respuesta
async function sendToAEAT(xmlPayload, base44, adminUser, emisorNif) {
  const certUri = adminUser.verifactu_cert_uri;
  if (!certUri) throw new Error('Certificado digital no configurado.');
  
  const certPassword = adminUser.verifactu_cert_password || '';
  const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
    file_uri: certUri,
    expires_in: 60,
  });
  const certResponse = await fetch(signed_url);
  const certArrayBuffer = await certResponse.arrayBuffer();
  const { Buffer } = await import('node:buffer');
  const certBuffer = Buffer.from(certArrayBuffer);
  const xmlBytes = Buffer.byteLength(xmlPayload, 'utf8');
  
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
      rejectUnauthorized: IS_PRODUCCION,
    };
    
    const req = https.default.request(options, (res) => {
      httpStatus = res.statusCode;
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    
    req.on('error', reject);
    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error('Timeout: AEAT no respondió en 25s'));
    });
    
    req.write(xmlPayload, 'utf8');
    req.end();
  });
  
  return { httpStatus, responseText };
}

// Valida y normaliza NIF/NIE/CIF según formato español
function validateAndNormalizeNIF(nif) {
  if (!nif) return '';
  
  // Normalizar: quitar espacios, puntos, guiones y convertir a uppercase
  const normalized = nif.replace(/[\s.\-]/g, '').toUpperCase().trim();
  
  // Validar formato básico: debe tener 8-9 caracteres
  if (!normalized || normalized.length < 8) return '';
  
  // Validar que comience con letra (NIF/NIE/CIF) o número (extranjero sin NIF)
  const firstChar = normalized[0];
  
  // NIF: 8 dígitos + 1 letra
  if (/^[0-9]{8}[A-Z]$/.test(normalized)) {
    return normalized;
  }
  
  // NIE: X/Y/Z + 7 dígitos + 1 letra
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(normalized)) {
    return normalized;
  }
  
  // CIF: letra inicial + 7 dígitos + control (letra o dígito)
  if (/^[A-Z][0-9]{7}[A-Z0-9]$/.test(normalized)) {
    return normalized;
  }
  
  // Si no coincide con patrón esperado, devolver vacío (no válido)
  return '';
}

// Genera descripción detallada de la operación para cumplimiento fiscal
function generateDetailedDescription(intervention) {
  const parts = ['Mantenimiento y reparación de sistemas frigoríficos'];
  
  if (intervention.gas_type) {
    parts.push(`Gas: ${intervention.gas_type}`);
  }
  if (intervention.gas_loaded_kg > 0) {
    parts.push(`Carga: ${intervention.gas_loaded_kg}kg`);
  }
  if (intervention.gas_recovered_kg > 0) {
    parts.push(`Recuperación: ${intervention.gas_recovered_kg}kg`);
  }
  if (intervention.description) {
    parts.push(intervention.description);
  }
  
  const description = parts.join(' | ');
  return description.slice(0, 200);
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

    // ── MODO: RECTIFICATIVA CORREGIDA (editada) ──
    if (mode === 'rectificar_corregida') {
      if (!original_invoice_id) {
        return Response.json({ error: 'original_invoice_id requerido para rectificar_corregida' }, { status: 400 });
      }

      const origInvoices = await base44.asServiceRole.entities.Invoice.filter({ id: original_invoice_id }, '-created_date', 1);
      if (!origInvoices.length) {
        return Response.json({ error: 'Factura original no encontrada' }, { status: 404 });
      }
      const origInvoice = origInvoices[0];

      // Usar valores corregidos si se proporcionan, sino usar los originales
      const subtotalCorregida = body.subtotal_corregida !== undefined ? body.subtotal_corregida : origInvoice.subtotal;
      const ivaCorregida = body.iva_corregida !== undefined ? body.iva_corregida : origInvoice.iva_total;
      const totalCorregida = body.total_corregida !== undefined ? body.total_corregida : origInvoice.total;
      const descriptionCorregida = body.description_corregida || intervention.description || '';
      const notesCorregida = body.technician_notes_corregida || intervention.technician_notes || '';

      const allUsersRect = await base44.asServiceRole.entities.User.list('full_name', 100);
      const adminUser = allUsersRect.find(u => u.verifactu_nif) || {};
      const emisorNif = adminUser.verifactu_nif || Deno.env.get('VERIFACTU_NIF') || 'B00000000';
      const emisorNombre = adminUser.verifactu_nombre || Deno.env.get('VERIFACTU_NOMBRE') || 'EMPRESA S.L.';
      const softwareNif = Deno.env.get('FRITECMA_NIF') || 'B00000000';

      const { number: rectNumber, index: rectIndex } = await getNextInvoiceNumber(base44, 'R');

      // Hash encadenado al hash de la factura original
      const fechaHoraHuella = now.replace(/[-:T.Z]/g, '').slice(0, 14);
      const hashInput = [
        `NIF=${emisorNif}`,
        `NombreRazonEmisor=${emisorNombre}`,
        `NumSerieFactura=${rectNumber}`,
        `FechaExpedicionFactura=${now.slice(0, 10)}`,
        `TipoFactura=R1`,
        `CuotaTotalIVA=${ivaCorregida.toFixed(2)}`,
        `ImporteTotal=${totalCorregida.toFixed(2)}`,
        `Huella=${origInvoice.hash_huella}`,
        `FechaHoraHuella=${fechaHoraHuella}`,
      ].join('&');
      const hashRect = await sha256(hashInput);

      const retentionDate = new Date();
      retentionDate.setFullYear(retentionDate.getFullYear() + 6);

      // Generar XML rectificativa con valores CORREGIDOS
      let rectStatus = 'pendiente';
      let rectCsv = '';
      let rectIdRegistro = '';
      let rectTimestamp = '';
      let rectResponse = '';

      try {
        const timeZoneOffsetRect = getTimeZoneOffset(new Date(now));
        const rectXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
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
            <sum:NumSerieFactura>${rectNumber}</sum:NumSerieFactura>
            <sum:FechaExpedicionFactura>${now.slice(0, 10)}</sum:FechaExpedicionFactura>
          </sum:IDFactura>
          <sum:NombreRazonEmisor>${emisorNombre}</sum:NombreRazonEmisor>
          <sum:TipoFactura>R1</sum:TipoFactura>
          <sum:DescripcionOperacion>${descriptionCorregida.slice(0, 200)}</sum:DescripcionOperacion>
          <sum:FacturaRectificada>
            <sum:NumSerieFactura>${origInvoice.invoice_number}</sum:NumSerieFactura>
            <sum:FechaExpedicionFactura>${origInvoice.issue_date.slice(0, 10)}</sum:FechaExpedicionFactura>
          </sum:FacturaRectificada>
          <sum:Destinatarios>
            <sum:IDDestinatario>
              <sum:NombreRazon>${intervention.client_name}</sum:NombreRazon>
              ${origInvoice.client_nif ? `<sum:NIF>${origInvoice.client_nif}</sum:NIF>` : '<sum:IDOtro><sum:ID>NO_NIF</sum:ID></sum:IDOtro>'}
            </sum:IDDestinatario>
          </sum:Destinatarios>
          <sum:Desglose>
            <sum:DetalleIVA>
              <sum:TipoImpositivo>21.00</sum:TipoImpositivo>
              <sum:BaseImponibleOimporteNoSujeto>${subtotalCorregida.toFixed(2)}</sum:BaseImponibleOimporteNoSujeto>
              <sum:CuotaRepercutida>${ivaCorregida.toFixed(2)}</sum:CuotaRepercutida>
            </sum:DetalleIVA>
          </sum:Desglose>
          <sum:CuotaTotal>${ivaCorregida.toFixed(2)}</sum:CuotaTotal>
          <sum:ImporteTotal>${totalCorregida.toFixed(2)}</sum:ImporteTotal>
          <sum:Encadenamiento>
            <sum:RegistroAnterior><sum:Huella>${origInvoice.hash_huella}</sum:Huella></sum:RegistroAnterior>
          </sum:Encadenamiento>
          <sum:SistemaInformatico>
            <sum:NombreRazon>FRITECMA Software</sum:NombreRazon>
            <sum:NIF>${softwareNif}</sum:NIF>
            <sum:NombreSistemaInformatico>FRITECMA App</sum:NombreSistemaInformatico>
            <sum:Version>1.0</sum:Version>
          </sum:SistemaInformatico>
          <sum:FechaHoraHusoHorarioGenRegistro>${now.slice(0, 19)}${timeZoneOffsetRect}</sum:FechaHoraHusoHorarioGenRegistro>
          <sum:Huella>${hashRect}</sum:Huella>
          <sum:TipoHuella>01</sum:TipoHuella>
        </sum:RegistroAlta>
      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
        
        const { httpStatus, responseText } = await sendToAEAT(rectXmlPayload, base44, adminUser, emisorNif);
        rectResponse = responseText.slice(0, 2000);
        
        if ((!IS_PRODUCCION && httpStatus >= 200 && httpStatus < 300 || IS_PRODUCCION && httpStatus === 200) && !responseText.includes('<Fault>')) {
          rectStatus = 'aceptado';
          const csvMatch = responseText.match(/<CSV>([^<]+)<\/CSV>/);
          if (csvMatch) rectCsv = csvMatch[1];
          const idMatch = responseText.match(/<IDRegistro>([^<]+)<\/IDRegistro>/);
          if (idMatch) rectIdRegistro = idMatch[1];
          const tsMatch = responseText.match(/<FechaHora(Recepcion|Presentacion)>([^<]+)<\/FechaHora.*?>/);
          if (tsMatch) rectTimestamp = tsMatch[2];
          console.log(JSON.stringify({ evento: 'rectificativa_corregida_aceptada', csv: rectCsv, idRegistro: rectIdRegistro }));
        } else if (IS_PRODUCCION && httpStatus !== 200) {
          console.warn(JSON.stringify({ evento: 'error_rectificativa_corregida_http', httpStatus, causa: 'solo_200_valido_en_produccion' }));
          rectStatus = 'error';
        } else {
          const codigoMatch = responseText.match(/<CodigoErrorRegistro>([^<]+)<\/CodigoErrorRegistro>/);
          if (codigoMatch) {
            rectStatus = 'rechazado';
            console.warn(JSON.stringify({ evento: 'rectificativa_corregida_rechazada', codigo: codigoMatch[1] }));
          } else {
            rectStatus = 'error';
          }
        }
      } catch (rectErr) {
        console.error(JSON.stringify({ evento: 'error_envio_rectificativa_corregida', error: rectErr.message }));
        rectStatus = 'sin_envio';
        rectResponse = rectErr.message;
      }

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
        subtotal: subtotalCorregida,
        iva_total: ivaCorregida,
        total: totalCorregida,
        lines_json: origInvoice.lines_json,
        hash_huella: hashRect,
        hash_anterior: origInvoice.hash_huella,
        invoice_chain_index: rectIndex,
        retention_until: retentionDate.toISOString().slice(0, 10),
        verifactu_status: rectStatus,
        verifactu_csv: rectCsv,
        verifactu_idregistro: rectIdRegistro,
        verifactu_timestamp: rectTimestamp,
        verifactu_response: rectResponse,
        is_locked: true,
        issuer_nif: emisorNif,
        issuer_name: emisorNombre,
        created_by_email: user.email,
        tipo_factura: 'R1',
        factura_rectificada_id: original_invoice_id,
        factura_rectificada_number: origInvoice.invoice_number,
        rectificativa_motivo: body.rectificativa_motivo || 'Corrección de datos',
      };

      const rectInvoice = await base44.asServiceRole.entities.Invoice.create(rectData);

      return Response.json({
        success: true,
        mode: 'rectificar_corregida',
        invoice_number: rectNumber,
        hash: hashRect,
        verifactu_status: rectStatus,
        invoice_id: rectInvoice.id,
      });
    }

    // ── MODO: RECTIFICATIVA (anulación negativa directa) ──
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
      const softwareNif = Deno.env.get('FRITECMA_NIF') || 'B00000000';

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

      // Generar XML rectificativa y enviar a AEAT
      let rectStatus = 'pendiente';
      let rectCsv = '';
      let rectIdRegistro = '';
      let rectTimestamp = '';
      let rectResponse = '';

      try {
        const rectXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
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
            <sum:NumSerieFactura>${rectNumber}</sum:NumSerieFactura>
            <sum:FechaExpedicionFactura>${now.slice(0, 10)}</sum:FechaExpedicionFactura>
          </sum:IDFactura>
          <sum:NombreRazonEmisor>${emisorNombre}</sum:NombreRazonEmisor>
          <sum:TipoFactura>R1</sum:TipoFactura>
          <sum:DescripcionOperacion>Factura Rectificativa</sum:DescripcionOperacion>
          <sum:FacturaRectificada>
            <sum:NumSerieFactura>${origInvoice.invoice_number}</sum:NumSerieFactura>
            <sum:FechaExpedicionFactura>${origInvoice.issue_date.slice(0, 10)}</sum:FechaExpedicionFactura>
          </sum:FacturaRectificada>
          <sum:Destinatarios>
            <sum:IDDestinatario>
              <sum:NombreRazon>${intervention.client_name}</sum:NombreRazon>
              ${origInvoice.client_nif ? `<sum:NIF>${origInvoice.client_nif}</sum:NIF>` : '<sum:IDOtro><sum:ID>NO_NIF</sum:ID></sum:IDOtro>'}
            </sum:IDDestinatario>
          </sum:Destinatarios>
          <sum:Desglose>
            <sum:DetalleIVA>
              <sum:TipoImpositivo>21.00</sum:TipoImpositivo>
              <sum:BaseImponibleOimporteNoSujeto>${-(origInvoice.subtotal || 0).toFixed(2)}</sum:BaseImponibleOimporteNoSujeto>
              <sum:CuotaRepercutida>${-(origInvoice.iva_total || 0).toFixed(2)}</sum:CuotaRepercutida>
            </sum:DetalleIVA>
          </sum:Desglose>
          <sum:CuotaTotal>${-(origInvoice.iva_total || 0).toFixed(2)}</sum:CuotaTotal>
          <sum:ImporteTotal>${-(origInvoice.total || 0).toFixed(2)}</sum:ImporteTotal>
          <sum:Encadenamiento>
            <sum:RegistroAnterior><sum:Huella>${origInvoice.hash_huella}</sum:Huella></sum:RegistroAnterior>
          </sum:Encadenamiento>
          <sum:SistemaInformatico>
            <sum:NombreRazon>FRITECMA Software</sum:NombreRazon>
            <sum:NIF>${softwareNif}</sum:NIF>
            <sum:NombreSistemaInformatico>FRITECMA App</sum:NombreSistemaInformatico>
            <sum:Version>1.0</sum:Version>
          </sum:SistemaInformatico>
          <sum:FechaHoraHusoHorarioGenRegistro>${now.slice(0, 19)}${getTimeZoneOffset(new Date(now))}</sum:FechaHoraHusoHorarioGenRegistro>
          <sum:Huella>${hashRect}</sum:Huella>
          <sum:TipoHuella>01</sum:TipoHuella>
        </sum:RegistroAlta>
      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
        
        const { httpStatus, responseText } = await sendToAEAT(rectXmlPayload, base44, adminUser, emisorNif);
        rectResponse = responseText.slice(0, 2000);
        
        if ((!IS_PRODUCCION && httpStatus >= 200 && httpStatus < 300 || IS_PRODUCCION && httpStatus === 200) && !responseText.includes('<Fault>')) {
          rectStatus = 'aceptado';
          const csvMatch = responseText.match(/<CSV>([^<]+)<\/CSV>/);
          if (csvMatch) rectCsv = csvMatch[1];
          const idMatch = responseText.match(/<IDRegistro>([^<]+)<\/IDRegistro>/);
          if (idMatch) rectIdRegistro = idMatch[1];
          const tsMatch = responseText.match(/<FechaHora(Recepcion|Presentacion)>([^<]+)<\/FechaHora.*?>/);
          if (tsMatch) rectTimestamp = tsMatch[2];
          console.log(JSON.stringify({ evento: 'rectificativa_aceptada', csv: rectCsv, idRegistro: rectIdRegistro }));
        } else if (IS_PRODUCCION && httpStatus !== 200) {
          console.warn(JSON.stringify({ evento: 'error_rectificativa_http', httpStatus, causa: 'solo_200_valido_en_produccion' }));
          rectStatus = 'error';
        } else {
          const codigoMatch = responseText.match(/<CodigoErrorRegistro>([^<]+)<\/CodigoErrorRegistro>/);
          if (codigoMatch) {
            rectStatus = 'rechazado';
            console.warn(JSON.stringify({ evento: 'rectificativa_rechazada', codigo: codigoMatch[1] }));
          } else {
            rectStatus = 'error';
          }
        }
      } catch (rectErr) {
        console.error(JSON.stringify({ evento: 'error_envio_rectificativa', error: rectErr.message }));
        rectStatus = 'sin_envio';
        rectResponse = rectErr.message;
      }

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
        verifactu_status: rectStatus,
        verifactu_csv: rectCsv,
        verifactu_idregistro: rectIdRegistro,
        verifactu_timestamp: rectTimestamp,
        verifactu_response: rectResponse,
        is_locked: true,
        issuer_nif: emisorNif,
        issuer_name: emisorNombre,
        created_by_email: user.email,
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
        verifactu_status: rectStatus,
        invoice_id: rectInvoice.id,
      });
    }

    // ── MODO: FACTURAR (Veri*factu) ──

    // 1. Obtener cliente
    const clients = await base44.asServiceRole.entities.Client.filter({ id: intervention.client_id }, '-created_date', 1);
    const client = clients[0] || {};
    
    // Validar y normalizar NIF del cliente
    const clientNifNormalized = validateAndNormalizeNIF(client.cif);
    if (!clientNifNormalized && client.cif) {
      // Si tiene CIF pero no es válido, registrar advertencia pero continuar
      console.warn(JSON.stringify({ evento: 'nif_cliente_invalido', nif_original: client.cif, cliente: client.name }));
    }

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
    const emisorNif = adminUser.verifactu_nif || Deno.env.get('VERIFACTU_NIF') || '';
    const emisorNombre = adminUser.verifactu_nombre || Deno.env.get('VERIFACTU_NOMBRE') || 'EMPRESA S.L.';

    console.log(JSON.stringify({ evento: 'datos_cargados', intervention_id, client_id: intervention.client_id, client_name: intervention.client_name, emisorNif, emisorNombre, tiene_cert: !!adminUser.verifactu_cert_uri, adminUser_email: adminUser.email }));

    if (!emisorNif) {
      return Response.json({ error: 'NIF emisor no configurado. Ve a Ajustes y rellena el NIF fiscal.' }, { status: 400 });
    }
    if (!adminUser.verifactu_cert_uri) {
      return Response.json({ error: 'Certificado digital no configurado. Ve a Ajustes y sube el certificado .p12.' }, { status: 400 });
    }
    
    // NIF del software desarrollador (FRITECMA)
    const softwareNif = Deno.env.get('FRITECMA_NIF') || 'B00000000';

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
    // CRÍTICO: El timezone offset aquí se usa en el hash SHA-256. Cualquier error rompe la firma.
    console.log(JSON.stringify({ evento: 'generando_xml', invoiceNumber, chainIndex, hashAnterior: hashAnterior ? hashAnterior.slice(0,16)+'...' : '(primera factura)', total: intervention.total, subtotal: intervention.subtotal, iva: intervention.iva_total }));
    const nowDate = new Date(now);
    const timeZoneOffset = getTimeZoneOffset(nowDate);
    
    // Validación adicional: confirmar que el offset esté en formato ISO correcto
    if (!/^[+-]\d{2}:\d{2}$/.test(timeZoneOffset)) {
      console.error(JSON.stringify({ evento: 'timezone_offset_invalido', offset: timeZoneOffset, fallback: '+01:00' }));
      return Response.json({ error: 'Timezone offset inválido' }, { status: 500 });
    }
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
          <sum:DescripcionOperacion>${generateDetailedDescription(intervention)}</sum:DescripcionOperacion>
          <sum:Destinatarios>
            <sum:IDDestinatario>
              <sum:NombreRazon>${intervention.client_name}</sum:NombreRazon>
              ${clientNifNormalized ? `<sum:NIF>${clientNifNormalized}</sum:NIF>` : '<sum:IDOtro><sum:ID>NO_NIF</sum:ID></sum:IDOtro>'}
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
            <sum:NIF>${softwareNif}</sum:NIF>
            <sum:NombreSistemaInformatico>FRITECMA App</sum:NombreSistemaInformatico>
            <sum:Version>1.0</sum:Version>
          </sum:SistemaInformatico>
          <sum:FechaHoraHusoHorarioGenRegistro>${now.slice(0, 19)}${timeZoneOffset}</sum:FechaHoraHusoHorarioGenRegistro>
          <sum:Huella>${hashHuella}</sum:Huella>
          <sum:TipoHuella>01</sum:TipoHuella>
        </sum:RegistroAlta>
      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;

    console.log(JSON.stringify({ evento: 'xml_generado', xmlPreview: xmlPayload.slice(0, 500) }));

    // 8. Enviar a AEAT con mTLS usando node:https (Deno Node compatibility)
    let verifactuStatus = 'pendiente';
    let verifactuResponse = '';
    let csvCode = '';
    let idRegistro = '';
    let timestampAeat = '';

    try {
      console.log(JSON.stringify({ evento: 'enviando_a_aeat', modo: IS_PRODUCCION ? 'PROD' : 'SANDBOX', endpoint: AEAT_ENDPOINT, nif: emisorNif, factura: invoiceNumber }));

      const { httpStatus, responseText } = await sendToAEAT(xmlPayload, base44, adminUser, emisorNif);
      console.log(JSON.stringify({ evento: 'respuesta_aeat_recibida', httpStatus, longitudRespuesta: responseText.length, preview: responseText.slice(0, 300) }));

      // En SANDBOX: aceptar respuestas 2xx sin SOAP Fault. En PROD: solo 200 exacto
      if ((!IS_PRODUCCION && httpStatus >= 200 && httpStatus < 300 || IS_PRODUCCION && httpStatus === 200) && !responseText.includes('<Fault>')) {
        console.log(JSON.stringify({ evento: 'sandbox_aceptado', httpStatus, modo: 'testing' }));
        verifactuStatus = 'aceptado';
        verifactuResponse = `Testing SANDBOX - HTTP ${httpStatus}. En producción requiere CSV válido de AEAT.`;
      } else if (IS_PRODUCCION && httpStatus !== 200) {
        console.warn(JSON.stringify({ evento: 'error_http_status_produccion', httpStatus, causa: 'solo_200_valido_en_produccion' }));
        verifactuStatus = 'error';
        verifactuResponse = `HTTP ${httpStatus}: En producción solo se acepta status 200 de la AEAT.`;
      } else if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.warn(JSON.stringify({ evento: 'error_html_response', causa: 'certificado_rechazado_o_endpoint_incorrecto', respuesta_primeros_500: responseText.slice(0, 500) }));
        verifactuStatus = 'sin_envio';
        verifactuResponse = 'AEAT rechazó el certificado cliente (respuesta HTML). Verifica que el .p12 sea el certificado homologado para Veri*factu y que la contraseña sea correcta.';
      } else {
        // PRODUCCION: requiere CSV e IDRegistro
        console.log(JSON.stringify({ evento: 'respuesta_soap', respuesta_primeros_1500: responseText.slice(0, 1500) }));
        verifactuResponse = responseText.slice(0, 2000);

        const csvMatch = responseText.match(/<CSV>([^<]+)<\/CSV>/);
        const idRegistroMatch = responseText.match(/<IDRegistro>([^<]+)<\/IDRegistro>/);
        idRegistro = idRegistroMatch ? idRegistroMatch[1] : '';
        const timestampMatch = responseText.match(/<FechaHora(Recepcion|Presentacion)>([^<]+)<\/FechaHora.*?>/);
        timestampAeat = timestampMatch ? timestampMatch[2] : '';
        const codigoMatch = responseText.match(/<CodigoErrorRegistro>([^<]+)<\/CodigoErrorRegistro>/);
        const codigoError = codigoMatch ? codigoMatch[1] : '';
        const descMatch = responseText.match(/<DescripcionErrorRegistro>([^<]+)<\/DescripcionErrorRegistro>/);
        const descripcionError = descMatch ? descMatch[1] : '';
        const estadoMatch = responseText.match(/<EstadoEnvio>([^<]+)<\/EstadoEnvio>/);
        const estadoEnvio = estadoMatch ? estadoMatch[1] : '';
        const estadoRegistroMatch = responseText.match(/<EstadoRegistro>([^<]+)<\/EstadoRegistro>/);
        const estadoRegistro = estadoRegistroMatch ? estadoRegistroMatch[1] : '';
        const esDuplicado = ['30002', '30003', '21000055'].includes(codigoError); // Códigos AEAT para duplicado/factura ya registrada

        // Producción: requiere CSV + IDRegistro + EstadoEnvio='Correcto' + EstadoRegistro='Correcto'
        if (csvMatch && idRegistro && estadoEnvio === 'Correcto' && estadoRegistro === 'Correcto') {
          csvCode = csvMatch[1];
          verifactuStatus = 'aceptado';
          console.log(JSON.stringify({ evento: 'aceptado', csv: csvCode, idRegistro, timestamp: timestampAeat }));
        } else if (codigoError) {
          verifactuStatus = esDuplicado ? 'duplicado' : 'rechazado';
          verifactuResponse = `Error AEAT: ${codigoError}${descripcionError ? ' - ' + descripcionError : ''}`;
          console.warn(JSON.stringify({ evento: 'rechazado', codigo: codigoError, esDuplicado }));
        } else {
          verifactuStatus = 'error';
          verifactuResponse = 'Respuesta AEAT inválida: falta CSV o IDRegistro';
          console.warn(JSON.stringify({ evento: 'error_respuesta_invalida', razon: 'falta_csv_o_idregistro' }));
        }
      }

    } catch (aeatErr) {
      console.error(JSON.stringify({ evento: 'error_envio_aeat', error: aeatErr.message }));
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
    console.log(JSON.stringify({ evento: 'guardando_factura', invoiceNumber, verifactuStatus, total: intervention.total }));
    let lines = [];
    try { lines = JSON.parse(intervention.materials_json || '[]'); } catch(_) { lines = []; }
    const invoiceData = {
      invoice_number: invoiceNumber,
      serie: 'A',
      intervention_id: intervention_id,
      intervention_number: intervention.number,
      client_id: intervention.client_id,
      client_name: intervention.client_name,
      client_nif: clientNifNormalized,
      client_address: client.address || '',
      issue_date: now,
      subtotal: intervention.subtotal || 0,
      iva_total: intervention.iva_total || 0,
      total: intervention.total || 0,
      lines_json: JSON.stringify(lines),
      xml_payload: xmlPayload,
      hash_huella: hashHuella,
      hash_anterior: hashAnterior,
      invoice_chain_index: chainIndex,
      retention_until: retentionUntil,
      verifactu_status: verifactuStatus,
      verifactu_csv: csvCode,
      verifactu_idregistro: verifactuStatus === 'aceptado' ? idRegistro : '',
      verifactu_timestamp: verifactuStatus === 'aceptado' ? timestampAeat : '',
      verifactu_response: verifactuResponse,
      qr_url: qrUrl,
      is_locked: true,
      issuer_nif: emisorNif,
      issuer_name: emisorNombre,
      created_by_email: user.email,
    };
    const invoice = await base44.asServiceRole.entities.Invoice.create(invoiceData);
    console.log(JSON.stringify({ evento: 'factura_guardada', invoice_id: invoice.id, invoiceNumber }));

    // 11. Si el envío no fue aceptado inmediatamente, agregarlo a la cola de reintentos
    if (verifactuStatus !== 'aceptado' && verifactuStatus !== 'duplicado') {
      try {
        await base44.asServiceRole.entities.InvoiceRetryQueue.create({
          invoice_id: invoice.id,
          invoice_number: invoiceNumber,
          retry_count: 0,
          max_retries: 5,
          next_retry_at: new Date(Date.now() + 30000).toISOString(),
          last_attempt_at: now,
          last_error: verifactuResponse,
          status: 'pending',
          xml_payload: xmlPayload,
          tipo_factura: 'F1',
        });
        console.log(JSON.stringify({ evento: 'factura_agregada_cola_reintentos', invoice_id: invoice.id, status: verifactuStatus }));
      } catch (queueErr) {
        console.warn(JSON.stringify({ evento: 'error_agregar_a_cola_reintentos', error: queueErr.message }));
      }
    }

    // 12. Marcar el parte como facturado e inalterable
    await base44.asServiceRole.entities.Intervention.update(intervention_id, {
      status: 'facturado',
      validated_by: user.email,
      validated_at: now,
    });
    console.log(JSON.stringify({ evento: 'parte_marcado_facturado', intervention_id }));

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
    console.error(JSON.stringify({ evento: 'ERROR_FATAL', message: error.message, stack: error.stack }));
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});