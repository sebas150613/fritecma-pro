import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Backoff exponencial: 1min, 5min, 30min
const RETRY_BACKOFF_MS = [60000, 300000, 1800000];
const MAX_RETRIES = 5;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'superadmin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Obtener items pendientes en la cola cuyo next_retry_at ha llegado
    const now = new Date().toISOString();
    const pending = await base44.asServiceRole.entities.InvoiceRetryQueue.filter({
      status: 'pending',
    }, '-created_date', 100);

    const toRetry = pending.filter(item => {
      if (!item.next_retry_at) return true;
      return new Date(item.next_retry_at) <= new Date(now);
    });

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    for (const queueItem of toRetry) {
      try {
        // Marcar como "retrying"
        await base44.asServiceRole.entities.InvoiceRetryQueue.update(queueItem.id, {
          status: 'retrying',
          last_attempt_at: now,
        });

        // Llamar a processVerifactu nuevamente
        const invoiceRes = await base44.asServiceRole.entities.Invoice.filter(
          { id: queueItem.invoice_id },
          '-created_date',
          1
        );
        if (!invoiceRes.length) {
          await base44.asServiceRole.entities.InvoiceRetryQueue.update(queueItem.id, {
            status: 'failed',
            last_error: 'Factura no encontrada',
          });
          failureCount++;
          continue;
        }
        const invoice = invoiceRes[0];

        // Reintentar envío
        const retryRes = await base44.asServiceRole.functions.invoke('processVerifactuRetry', {
          invoice_id: queueItem.invoice_id,
          xml_payload: queueItem.xml_payload,
          tipo_factura: queueItem.tipo_factura,
        });

        const retryData = retryRes.data;

        if (retryData.success && retryData.verifactu_status === 'aceptado') {
          // Éxito: marcar en cola como completado y actualizar invoice
          await base44.asServiceRole.entities.InvoiceRetryQueue.update(queueItem.id, {
            status: 'completed',
          });
          await base44.asServiceRole.entities.Invoice.update(queueItem.invoice_id, {
            pending_submission: false,
            verifactu_status: 'aceptado',
            verifactu_csv: retryData.verifactu_csv || '',
            verifactu_idregistro: retryData.verifactu_idregistro || '',
            verifactu_timestamp: retryData.verifactu_timestamp || '',
            qr_url: retryData.qr_url || '',
          });
          successCount++;
          results.push({
            invoice_number: queueItem.invoice_number,
            status: 'completed',
            csv: retryData.verifactu_csv,
          });
          console.log(JSON.stringify({
            evento: 'reintento_exitoso',
            factura: queueItem.invoice_number,
            intento: queueItem.retry_count + 1,
          }));
        } else {
          // Fallo: calcular próximo reintento
          const nextRetryCount = (queueItem.retry_count || 0) + 1;
          const isMaxRetriesReached = nextRetryCount >= MAX_RETRIES;
          const backoffMs = RETRY_BACKOFF_MS[Math.min(nextRetryCount - 1, RETRY_BACKOFF_MS.length - 1)];
          const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

          await base44.asServiceRole.entities.InvoiceRetryQueue.update(queueItem.id, {
            retry_count: nextRetryCount,
            status: isMaxRetriesReached ? 'failed' : 'pending',
            next_retry_at: isMaxRetriesReached ? null : nextRetryAt,
            last_error: retryData.error || 'Envío fallido',
          });

          if (isMaxRetriesReached) {
            // Notificar a admin
            await base44.asServiceRole.entities.Invoice.update(queueItem.invoice_id, {
              pending_submission: false,
              verifactu_status: 'error',
            });
            failureCount++;
            results.push({
              invoice_number: queueItem.invoice_number,
              status: 'max_retries_reached',
              error: retryData.error,
            });
            console.warn(JSON.stringify({
              evento: 'reintentos_agotados',
              factura: queueItem.invoice_number,
              intentos: nextRetryCount,
            }));
          } else {
            failureCount++;
            results.push({
              invoice_number: queueItem.invoice_number,
              status: 'rescheduled',
              next_retry: nextRetryAt,
            });
            console.log(JSON.stringify({
              evento: 'reintento_reprogramado',
              factura: queueItem.invoice_number,
              intento: nextRetryCount,
              proximo_en_ms: backoffMs,
            }));
          }
        }
      } catch (itemErr) {
        console.error(JSON.stringify({
          evento: 'error_procesando_item_cola',
          invoice_id: queueItem.invoice_id,
          error: itemErr.message,
        }));
        failureCount++;
        await base44.asServiceRole.entities.InvoiceRetryQueue.update(queueItem.id, {
          last_error: itemErr.message,
        });
      }
    }

    return Response.json({
      success: true,
      processed: toRetry.length,
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    console.error(JSON.stringify({
      evento: 'error_retryVerifactuSubmissions',
      error: error.message,
    }));
    return Response.json({ error: error.message }, { status: 500 });
  }
});