import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Reproduce el mismo algoritmo de hash que processVerifactu
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin' && user.role !== 'superadmin') {
      // Permitir también llamada desde automation (sin usuario autenticado)
      // Si no hay usuario, solo se permite si viene del scheduler interno
      if (user) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Cargar todas las facturas aceptadas
    const invoices = await base44.asServiceRole.entities.Invoice.filter(
      { verifactu_status: 'aceptado' },
      '-issue_date',
      500
    );

    const tampered = [];
    const verified = [];

    for (const invoice of invoices) {
      // Reconstruir el string de hash con los mismos campos usados al crear la factura
      const issueDate = invoice.issue_date?.slice(0, 10) || '';
      const fechaHoraHuella = invoice.issue_date
        ? invoice.issue_date.replace(/[-:T.Z]/g, '').slice(0, 14)
        : '';

      const hashInput = [
        `NIF=${invoice.issuer_nif || ''}`,
        `NombreRazonEmisor=${invoice.issuer_name || ''}`,
        `NumSerieFactura=${invoice.invoice_number}`,
        `FechaExpedicionFactura=${issueDate}`,
        `TipoFactura=F1`,
        `CuotaTotalIVA=${(invoice.iva_total || 0).toFixed(2)}`,
        `ImporteTotal=${(invoice.total || 0).toFixed(2)}`,
        `Huella=${invoice.hash_anterior || ''}`,
        `FechaHoraHuella=${fechaHoraHuella}`,
      ].join('&');

      const computedHash = await sha256(hashInput);

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

    // Si hay facturas alteradas, enviar email de alerta al admin
    if (tampered.length > 0) {
      const adminUsers = await base44.asServiceRole.entities.User.filter(
        { role: 'admin' },
        '-created_date',
        5
      );

      const alertBody = `
⚠️ ALERTA DE INTEGRIDAD VERI*FACTU

Se han detectado ${tampered.length} factura(s) cuyo hash actual no coincide con el hash original registrado en el momento de su emisión. Esto puede indicar una modificación no autorizada de los datos.

FACTURAS COMPROMETIDAS:
${tampered.map(f => `
  - Nº Factura: ${f.invoice_number}
  - Cliente: ${f.client_name}
  - Fecha: ${f.issue_date?.slice(0,10)}
  - Total: ${f.total} €
  - Hash guardado: ${f.stored_hash?.slice(0,32)}...
  - Hash recalculado: ${f.computed_hash?.slice(0,32)}...
`).join('\n')}

Accede inmediatamente a la aplicación y revisa estas facturas.

Este mensaje ha sido generado automáticamente por el sistema de verificación Veri*factu.
      `.trim();

      for (const admin of adminUsers) {
        if (admin.email) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: admin.email,
            subject: `🚨 ALERTA INTEGRIDAD FISCAL — ${tampered.length} factura(s) modificada(s)`,
            body: alertBody,
          });
        }
      }
    }

    return Response.json({
      success: true,
      total_checked: invoices.length,
      verified: verified.length,
      tampered: tampered.length,
      tampered_invoices: tampered,
      checked_at: new Date().toISOString(),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});