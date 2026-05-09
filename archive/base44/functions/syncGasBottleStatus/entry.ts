import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Solo admins pueden ejecutar esta sincronización
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Obtener todas las botellas
    const bottles = await base44.asServiceRole.entities.GasBottle.list('-created_date', 1000);

    const updates = [];
    for (const bottle of bottles) {
      const cargaActual = bottle.carga_actual || 0;
      const currentStatus = bottle.status || 'activa';
      let newStatus = currentStatus;

      // Sincronizar estado basado en carga
      if (cargaActual > 0 && currentStatus === 'vacia') {
        // Botella con carga pero marcada como vacía
        newStatus = 'activa';
      } else if (cargaActual <= 0 && currentStatus !== 'vacia') {
        // Botella sin carga pero no marcada como vacía
        newStatus = 'vacia';
      }

      // Si el estado cambió, actualizar
      if (newStatus !== currentStatus) {
        await base44.asServiceRole.entities.GasBottle.update(bottle.id, { status: newStatus });
        updates.push({
          bottle_id: bottle.id,
          serial: bottle.serial_number,
          old_status: currentStatus,
          new_status: newStatus,
          kg: cargaActual,
        });
      }
    }

    return Response.json({
      success: true,
      synced: updates.length,
      updates: updates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});