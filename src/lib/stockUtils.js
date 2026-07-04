import { appApi } from "@/api/app-api";
import { deductFromVehicle } from "./vehicleStockUtils";

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

    if (line.source_vehicle_id) {
      // Sale de la furgoneta: no toca el stock del almacén
      await deductFromVehicle({
        vehicle: { id: line.source_vehicle_id, name: line.source_vehicle_name || "" },
        material: mat,
        quantity: line.quantity || 0,
        interventionId,
        interventionNumber,
        user: { email: technicianEmail, full_name: technicianName },
      });
      continue;
    }

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

