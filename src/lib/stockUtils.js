import { appApi } from "@/api/app-api";

/**
 * Validates lines against current stock and returns warnings.
 * Returns array of { material_name, requested, available }
 */
export async function validateStockAvailability(lines) {
  const warnings = [];
  const materialIds = [...new Set(lines.filter(l => l.material_id).map(l => l.material_id))];
  if (materialIds.length === 0) return warnings;

  const materials = await Promise.all(
    materialIds.map(id => appApi.entities.Material.filter({ id }, "name", 1).then(r => r[0]).catch(() => null))
  );

  for (const line of lines) {
    if (!line.material_id) continue;
    const mat = materials.find(m => m?.id === line.material_id);
    if (!mat) continue;
    // Skip mano de obra and desplazamiento (not physical stock)
    if (mat.category === "mano_de_obra" || mat.category === "desplazamiento") continue;
    // Gas refrigerante: stock viene de trazabilidad de botellas, no del almacén de materiales
    if (mat.category === "gas_refrigerante") continue;
    if (line.source_vehicle_id) {
      // Stock de la furgoneta, no del almacén
      const rows = await appApi.entities.VehicleStock.filter(
        { vehicle_id: line.source_vehicle_id, material_id: mat.id },
        "-updated_at",
        1
      ).catch(() => []);
      const availableVeh = rows[0]?.quantity || 0;
      if ((line.quantity || 0) > availableVeh) {
        warnings.push({
          material_name: `${mat.name} (furgoneta ${line.source_vehicle_name || ""})`,
          requested: line.quantity,
          available: availableVeh,
        });
      }
      continue;
    }
    if (line.source_warehouse_id) {
      // Stock de un almacén secundario
      const rows = await appApi.entities.WarehouseStock.filter(
        { warehouse_id: line.source_warehouse_id, material_id: mat.id },
        "-updated_at",
        1
      ).catch(() => []);
      const availableWh = rows[0]?.quantity || 0;
      if ((line.quantity || 0) > availableWh) {
        warnings.push({
          material_name: `${mat.name} (almacén ${line.source_warehouse_name || ""})`,
          requested: line.quantity,
          available: availableWh,
        });
      }
      continue;
    }
    const available = mat.stock_quantity || 0;
    if ((line.quantity || 0) > available) {
      warnings.push({ material_name: mat.name, requested: line.quantity, available });
    }
  }
  return warnings;
}

/**
 * Deducts stock for all lines of a saved intervention and logs movements.
 * La resta y el registro del movimiento los hace el servidor de forma atómica.
 * Cantidades negativas = reposición (edición/eliminación del parte).
 */
export async function deductStockForIntervention({ lines, interventionId, interventionNumber, notes = "" }) {
  const stockLines = (lines || [])
    .filter(l => l.material_id && l.material_id !== "__free_text__" && (l.quantity || 0) !== 0)
    .map(l => ({
      material_id: l.material_id,
      quantity: l.quantity,
      source_vehicle_id: l.source_vehicle_id || undefined,
      source_warehouse_id: l.source_warehouse_id || undefined,
    }));
  if (stockLines.length === 0) return;

  await appApi.stock.deductIntervention({
    lines: stockLines,
    intervention_id: interventionId,
    intervention_number: interventionNumber,
    ...(notes ? { notes } : {}),
  });
}
