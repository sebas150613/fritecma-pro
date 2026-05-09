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
    const available = mat.stock_quantity || 0;
    if ((line.quantity || 0) > available) {
      warnings.push({ material_name: mat.name, requested: line.quantity, available });
    }
  }
  return warnings;
}

/**
 * Deducts stock for all lines of a saved intervention and logs movements.
 */
export async function deductStockForIntervention({ lines, interventionId, interventionNumber, technicianEmail, technicianName }) {
  const materialIds = [...new Set(lines.filter(l => l.material_id).map(l => l.material_id))];
  if (materialIds.length === 0) return;

  const materials = await Promise.all(
    materialIds.map(id => appApi.entities.Material.filter({ id }, "name", 1).then(r => r[0]).catch(() => null))
  );

  for (const line of lines) {
    if (!line.material_id || !line.quantity) continue;
    const mat = materials.find(m => m?.id === line.material_id);
    if (!mat) continue;
    if (mat.category === "mano_de_obra" || mat.category === "desplazamiento") continue;
    if (mat.category === "gas_refrigerante") continue;

    const stockBefore = mat.stock_quantity || 0;
    const stockAfter = stockBefore - (line.quantity || 0);

    // Update stock
    await appApi.entities.Material.update(mat.id, { stock_quantity: stockAfter });

    // Log movement
    await appApi.entities.StockMovement.create({
      material_id: mat.id,
      material_name: mat.name,
      material_code: mat.code || "",
      quantity: -(line.quantity || 0),
      stock_before: stockBefore,
      stock_after: stockAfter,
      movement_type: "salida_parte",
      intervention_id: interventionId,
      intervention_number: interventionNumber,
      technician_email: technicianEmail,
      technician_name: technicianName,
    });
  }
}

