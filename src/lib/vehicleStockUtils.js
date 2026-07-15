import { appApi } from "@/api/app-api";

/**
 * Traspasa material de un almacén al vehículo.
 * El servidor descuenta del almacén, suma a la furgoneta y registra el movimiento.
 * `fromWarehouseId` opcional: origen en almacén secundario (vacío = principal).
 */
export async function transferToVehicle({ vehicle, material, quantity, fromWarehouseId = "" }) {
  const result = await appApi.stock.transfer({
    material_id: material.id,
    quantity,
    from: fromWarehouseId ? { warehouse_id: fromWarehouseId } : {},
    to: { vehicle_id: vehicle.id },
  });
  return result?.from?.after;
}

/**
 * Devuelve material del vehículo a un almacén.
 * `toWarehouseId` opcional: destino en almacén secundario (vacío = principal).
 */
export async function transferToWarehouse({ vehicle, material, quantity, toWarehouseId = "" }) {
  const result = await appApi.stock.transfer({
    material_id: material.id,
    quantity,
    from: { vehicle_id: vehicle.id },
    to: toWarehouseId ? { warehouse_id: toWarehouseId } : {},
  });
  return result?.to?.after;
}
