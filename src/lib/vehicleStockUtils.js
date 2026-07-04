import { appApi } from "@/api/app-api";

async function getVehicleStockRow(vehicleId, materialId) {
  const rows = await appApi.entities.VehicleStock.filter(
    { vehicle_id: vehicleId, material_id: materialId },
    "-updated_at",
    1
  );
  return rows[0] || null;
}

async function upsertVehicleStock({ vehicle, material, delta }) {
  const now = new Date().toISOString();
  const row = await getVehicleStockRow(vehicle.id, material.id);
  if (row) {
    const newQty = (row.quantity || 0) + delta;
    await appApi.entities.VehicleStock.update(row.id, {
      quantity: newQty,
      vehicle_name: vehicle.name,
      material_name: material.name,
      material_code: material.code || "",
      unit: material.unit || "ud",
      updated_at: now,
    });
    return newQty;
  }
  await appApi.entities.VehicleStock.create({
    vehicle_id: vehicle.id,
    vehicle_name: vehicle.name,
    material_id: material.id,
    material_name: material.name,
    material_code: material.code || "",
    unit: material.unit || "ud",
    quantity: delta,
    updated_at: now,
  });
  return delta;
}

/**
 * Traspasa material del almacén al vehículo.
 * Descuenta del stock general y registra el movimiento con su autor.
 */
export async function transferToVehicle({ vehicle, material, quantity, user }) {
  const stockBefore = material.stock_quantity || 0;
  const stockAfter = stockBefore - quantity;

  await appApi.entities.Material.update(material.id, { stock_quantity: stockAfter });
  await upsertVehicleStock({ vehicle, material, delta: quantity });

  await appApi.entities.StockMovement.create({
    material_id: material.id,
    material_name: material.name,
    material_code: material.code || "",
    quantity: -quantity,
    stock_before: stockBefore,
    stock_after: stockAfter,
    movement_type: "traspaso_a_vehiculo",
    vehicle_id: vehicle.id,
    vehicle_name: vehicle.name,
    technician_email: user.email,
    technician_name: user.full_name || user.email,
  });

  return stockAfter;
}

/**
 * Devuelve material del vehículo al almacén.
 * Suma al stock general y registra el movimiento con su autor.
 */
export async function transferToWarehouse({ vehicle, material, quantity, user }) {
  const stockBefore = material.stock_quantity || 0;
  const stockAfter = stockBefore + quantity;

  await appApi.entities.Material.update(material.id, { stock_quantity: stockAfter });
  await upsertVehicleStock({ vehicle, material, delta: -quantity });

  await appApi.entities.StockMovement.create({
    material_id: material.id,
    material_name: material.name,
    material_code: material.code || "",
    quantity: quantity,
    stock_before: stockBefore,
    stock_after: stockAfter,
    movement_type: "traspaso_a_almacen",
    vehicle_id: vehicle.id,
    vehicle_name: vehicle.name,
    technician_email: user.email,
    technician_name: user.full_name || user.email,
  });

  return stockAfter;
}

/**
 * Descuenta del stock de un vehículo el material usado en un parte.
 * El stock general no se toca; queda registrado el movimiento.
 */
export async function deductFromVehicle({ vehicle, material, quantity, interventionId, interventionNumber, user }) {
  const row = await getVehicleStockRow(vehicle.id, material.id);
  const before = row?.quantity || 0;
  const after = await upsertVehicleStock({ vehicle, material, delta: -quantity });

  await appApi.entities.StockMovement.create({
    material_id: material.id,
    material_name: material.name,
    material_code: material.code || "",
    quantity: -quantity,
    stock_before: before,
    stock_after: after,
    movement_type: "salida_parte_vehiculo",
    vehicle_id: vehicle.id,
    vehicle_name: vehicle.name,
    intervention_id: interventionId,
    intervention_number: interventionNumber,
    technician_email: user.email,
    technician_name: user.full_name || user.email,
  });
}
