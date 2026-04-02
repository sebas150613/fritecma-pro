import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const IS_PRODUCCION = Deno.env.get('VERIFACTU_PRODUCCION') === 'true';

const AEAT_ENDPOINT = IS_PRODUCCION
  ? 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
  : 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';

const AEAT_QR_BASE = IS_PRODUCCION
  ? 'https://www2.aeat.es/wlpl/TIKE-CONT/ValidarQR'
  : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

// Envía XML a AEAT vía mTLS
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { invoice_id, xml_payload, tipo_factura } = body;

    if (!invoice_id || !xml_payload) {
      return Response.json({ error: 'Parámetros faltantes' }, { status: 400 });
    }

    // Obtener datos de factura original
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoice_id }, '-created_date', 1);
    if (!invoices.length) {
      return Response.json({ error: 'Factura no encontrada' }, { status: 404 });
    }
    const invoice = invoices[0];

    // Obtener NIF del emisor
    const allUsers = await base44.asServiceRole.entities.User.list('full_name', 100);
    const adminUser = allUsers.find(u => u.verifactu_nif) || {};
    const emisorNif = adminUser.verifactu_nif || Deno.env.get('VERIFACTU_NIF') || 'B00000000';

    // Enviar a AEAT
    let verifactuStatus = 'sin_envio';
    let verifactuResponse = '';
    let csvCode = '';
    let idRegistro = '';
    let timestampAeat = '';
    let qrUrl = '';

    try {
      const { httpStatus, responseText } = await sendToAEAT(xml_payload, base44, adminUser, emisorNif);

      if ((!IS_PRODUCCION && httpStatus >= 200 && httpStatus < 300 || IS_PRODUCCION && httpStatus === 200) && !responseText.includes('<Fault>')) {
        console.log(JSON.stringify({ evento: 'reintento_respuesta_valida', httpStatus }));
        verifactuStatus = 'aceptado';
      } else if (IS_PRODUCCION && httpStatus !== 200) {
        console.warn(JSON.stringify({ evento: 'error_http_status', httpStatus }));
        verifactuStatus = 'error';
        verifactuResponse = `HTTP ${httpStatus}: En producción solo se acepta status 200.`;
      } else if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.warn(JSON.stringify({ evento: 'error_html_response' }));
        verifactuStatus = 'sin_envio';
        verifactuResponse = 'AEAT rechazó certificado. Verifica credenciales.';
      } else {
        verifactuResponse = responseText.slice(0, 2000);
        const csvMatch = responseText.match(/<CSV>([^<]+)<\/CSV>/);
        const idRegistroMatch = responseText.match(/<IDRegistro>([^<]+)<\/IDRegistro>/);
        idRegistro = idRegistroMatch ? idRegistroMatch[1] : '';
        const timestampMatch = responseText.match(/<FechaHora(Recepcion|Presentacion)>([^<]+)<\/FechaHora.*?>/);
        timestampAeat = timestampMatch ? timestampMatch[2] : '';
        const codigoMatch = responseText.match(/<CodigoErrorRegistro>([^<]+)<\/CodigoErrorRegistro>/);
        const codigoError = codigoMatch ? codigoMatch[1] : '';

        if (csvMatch && idRegistro) {
          csvCode = csvMatch[1];
          verifactuStatus = 'aceptado';
          // Generar QR si en producción
          if (IS_PRODUCCION) {
            const fechaQR = invoice.issue_date?.slice(0, 10).split('-').reverse().join('-') || '';
            const params = new URLSearchParams({
              nif: emisorNif,
              numserie: invoice.invoice_number,
              fecha: fechaQR,
              importe: (invoice.total || 0).toFixed(2),
            });
            qrUrl = `${AEAT_QR_BASE}?${params.toString()}`;
          }
          console.log(JSON.stringify({ evento: 'reintento_aceptado', csv: csvCode }));
        } else if (codigoError) {
          verifactuStatus = 'rechazado';
          verifactuResponse = `Error AEAT: ${codigoError}`;
          console.warn(JSON.stringify({ evento: 'reintento_rechazado', codigo: codigoError }));
        } else {
          verifactuStatus = 'error';
          console.warn(JSON.stringify({ evento: 'reintento_respuesta_invalida' }));
        }
      }
    } catch (aeatErr) {
      console.error(JSON.stringify({ evento: 'error_envio_reintento', error: aeatErr.message }));
      verifactuStatus = 'sin_envio';
      verifactuResponse = `Error: ${aeatErr.message}`;
    }

    return Response.json({
      success: verifactuStatus === 'aceptado',
      invoice_id,
      verifactu_status: verifactuStatus,
      verifactu_csv: csvCode,
      verifactu_idregistro: idRegistro,
      verifactu_timestamp: timestampAeat,
      qr_url: qrUrl,
      error: verifactuStatus !== 'aceptado' ? verifactuResponse : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});