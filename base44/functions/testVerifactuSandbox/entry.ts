import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SANDBOX_ENDPOINT = 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'superadmin', 'encargado', 'oficina'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log(JSON.stringify({ evento: 'test_sandbox_inicio', timestamp: new Date().toISOString() }));

    // XML mínimo de prueba
    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:RegFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum:TipoComunicacion>A0</sum:TipoComunicacion>
        <sum:ObligadoEmision>
          <sum:NombreRazon>TEST</sum:NombreRazon>
          <sum:NIF>12345678Z</sum:NIF>
        </sum:ObligadoEmision>
      </sum:Cabecera>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;

    // Intentar conexión sin certificado (para verificar endpoint)
    console.log(JSON.stringify({ evento: 'test_sandbox_conectando', endpoint: SANDBOX_ENDPOINT }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(SANDBOX_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR',
        },
        body: testXml,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      const status = response.status;

      console.log(JSON.stringify({
        evento: 'test_sandbox_respuesta',
        httpStatus: status,
        esHTML: responseText.trim().startsWith('<html') || responseText.trim().startsWith('<!DOCTYPE'),
        esSOAP: responseText.includes('Fault') || responseText.includes('CSV'),
        longitud: responseText.length,
        primeros200: responseText.slice(0, 200),
      }));

      return Response.json({
        success: true,
        sandbox_reachable: true,
        http_status: status,
        response_type: responseText.trim().startsWith('<html') ? 'HTML_ERROR' : responseText.includes('Fault') ? 'SOAP_FAULT' : 'SOAP_RESPONSE',
        response_preview: responseText.slice(0, 500),
        full_response: responseText,
        message: status === 200 || status >= 200 && status < 300 
          ? '✓ Sandbox accesible. Requiere certificado cliente para validación real.'
          : `HTTP ${status}: Verificar endpoint y configuración.`,
      });

    } catch (fetchErr) {
      console.error(JSON.stringify({
        evento: 'test_sandbox_error_fetch',
        error: fetchErr.message,
        nombre: fetchErr.name,
      }));

      return Response.json({
        success: false,
        sandbox_reachable: false,
        error: fetchErr.message,
        message: fetchErr.name === 'AbortError' 
          ? 'Timeout: Sandbox AEAT no respondió en 15s'
          : `Error conectando: ${fetchErr.message}`,
      }, { status: 500 });
    }

  } catch (error) {
    console.error(JSON.stringify({
      evento: 'test_sandbox_error_general',
      error: error.message,
    }));
    return Response.json({ error: error.message }, { status: 500 });
  }
});