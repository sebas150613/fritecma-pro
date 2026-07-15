import { HttpError } from "../lib/http-error.js";
import { createJsonEntityStore } from "../lib/json-store.js";
import { buildTenantFilter } from "../lib/tenant.js";

const materialStore = createJsonEntityStore("Material");
const warehouseStore = createJsonEntityStore("Warehouse");
const warehouseStockStore = createJsonEntityStore("WarehouseStock");
const vehicleStockStore = createJsonEntityStore("VehicleStock");
const vehicleStore = createJsonEntityStore("Vehicle");
const stockMovementStore = createJsonEntityStore("StockMovement");
const stockEntryStore = createJsonEntityStore("StockEntry");

// Categorías sin stock físico de almacén: mano de obra y desplazamiento no son
// materiales; el gas refrigerante se gestiona por trazabilidad de botellas.
const NON_STOCK_CATEGORIES = new Set(["mano_de_obra", "desplazamiento"]);
const isGasMaterial = (material) => material?.category === "gas_refrigerante";
const isStockTracked = (material) =>
  material && !NON_STOCK_CATEGORIES.has(material.category) && !isGasMaterial(material);

// El store (Postgres/JSON) no expone transacciones; la API corre en un único
// proceso Node, así que serializamos las operaciones de stock por organización
// para que dos escrituras concurrentes no se pisen (read-modify-write).
const orgLocks = new Map();
const withOrgStockLock = (organizationId, fn) => {
  const previous = orgLocks.get(organizationId) || Promise.resolve();
  const next = previous.then(fn, fn);
  orgLocks.set(
    organizationId,
    next.catch(() => {})
  );
  return next;
};

const parseQuantity = (raw, { label = "La cantidad" } = {}) => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(422, `${label} debe ser un número mayor que cero.`);
  }
  return value;
};

const getMaterialOrThrow = async (organizationId, materialId) => {
  const items = await materialStore.filter({
    filter: buildTenantFilter(organizationId, { id: String(materialId || "") }),
    limit: 1,
  });
  if (!items[0]) {
    throw new HttpError(404, "Material no encontrado.");
  }
  return items[0];
};

const getWarehouseOrThrow = async (organizationId, warehouseId) => {
  const items = await warehouseStore.filter({
    filter: buildTenantFilter(organizationId, { id: String(warehouseId || "") }),
    limit: 1,
  });
  if (!items[0]) {
    throw new HttpError(404, "Almacén no encontrado.");
  }
  return items[0];
};

const getVehicleOrThrow = async (organizationId, vehicleId) => {
  const items = await vehicleStore.filter({
    filter: buildTenantFilter(organizationId, { id: String(vehicleId || "") }),
    limit: 1,
  });
  if (!items[0]) {
    throw new HttpError(404, "Vehículo no encontrado.");
  }
  return items[0];
};

/**
 * Normaliza una ubicación de stock recibida del cliente.
 * { } → principal · { warehouse_id } → almacén secundario · { vehicle_id } → vehículo.
 */
export const resolveStockLocation = async (organizationId, raw = {}) => {
  const warehouseId = String(raw?.warehouse_id || "").trim();
  const vehicleId = String(raw?.vehicle_id || "").trim();
  if (warehouseId && vehicleId) {
    throw new HttpError(422, "Una ubicación no puede ser almacén y vehículo a la vez.");
  }
  if (vehicleId) {
    const vehicle = await getVehicleOrThrow(organizationId, vehicleId);
    return { type: "vehiculo", id: vehicle.id, name: vehicle.name || "" };
  }
  if (warehouseId) {
    const warehouse = await getWarehouseOrThrow(organizationId, warehouseId);
    return { type: "almacen", id: warehouse.id, name: warehouse.name || "" };
  }
  return { type: "principal", id: "", name: "Almacén principal" };
};

const readLocationQuantity = async (organizationId, location, material) => {
  if (location.type === "principal") {
    return material.stock_quantity || 0;
  }
  const store = location.type === "vehiculo" ? vehicleStockStore : warehouseStockStore;
  const key =
    location.type === "vehiculo"
      ? { vehicle_id: location.id, material_id: material.id }
      : { warehouse_id: location.id, material_id: material.id };
  const rows = await store.filter({
    filter: buildTenantFilter(organizationId, key),
    limit: 1,
  });
  return { row: rows[0] || null, quantity: rows[0]?.quantity || 0 };
};

/**
 * Aplica un delta de stock en una ubicación y devuelve { before, after }.
 * Debe llamarse dentro de withOrgStockLock.
 */
const applyLocationDelta = async (organizationId, location, material, delta) => {
  if (location.type === "principal") {
    const before = material.stock_quantity || 0;
    const after = before + delta;
    await materialStore.update(material.id, { stock_quantity: after });
    material.stock_quantity = after;
    return { before, after };
  }

  const { row, quantity: before } = await readLocationQuantity(
    organizationId,
    location,
    material
  );
  const after = before + delta;
  const now = new Date().toISOString();
  const denormalized = {
    material_name: material.name,
    material_code: material.code || "",
    unit: material.unit || "ud",
    updated_at: now,
  };
  const store = location.type === "vehiculo" ? vehicleStockStore : warehouseStockStore;
  if (row) {
    await store.update(row.id, { quantity: after, ...denormalized });
  } else {
    const keyFields =
      location.type === "vehiculo"
        ? { vehicle_id: location.id, vehicle_name: location.name }
        : { warehouse_id: location.id, warehouse_name: location.name };
    await store.create({
      organization_id: organizationId,
      material_id: material.id,
      quantity: after,
      ...keyFields,
      ...denormalized,
    });
  }
  return { before, after };
};

const createMovement = async (organizationId, user, fields) => {
  return stockMovementStore.create({
    organization_id: organizationId,
    technician_email: user?.email || "",
    technician_name: user?.full_name || user?.email || "",
    ...fields,
  });
};

const locationMovementContext = (location) => {
  if (location.type === "vehiculo") {
    return { vehicle_id: location.id, vehicle_name: location.name };
  }
  if (location.type === "almacen") {
    return { warehouse_id: location.id, warehouse_name: location.name };
  }
  return {};
};

/**
 * Entrada de material (albarán, lote, OCR). Varias líneas, una ubicación destino.
 */
export const registerStockEntry = async ({
  organization,
  user,
  lines,
  location: rawLocation,
  movementType = "entrada_albaran",
  albaranNumber = "",
  notes = "",
  purchaseOrderId = "",
  purchaseOrderNumber = "",
}) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new HttpError(422, "Añade al menos una línea de entrada.");
  }
  if (!["entrada_albaran", "ajuste_manual", "entrada_devolucion"].includes(movementType)) {
    throw new HttpError(422, "Tipo de movimiento de entrada no válido.");
  }
  const location = await resolveStockLocation(organization.id, rawLocation);
  if (location.type === "vehiculo") {
    throw new HttpError(422, "Las entradas de material se registran en un almacén, no en un vehículo.");
  }

  return withOrgStockLock(organization.id, async () => {
    const results = [];
    for (const line of lines) {
      const quantity = parseQuantity(line?.quantity);
      const material = await getMaterialOrThrow(organization.id, line?.material_id);
      if (!isStockTracked(material)) {
        throw new HttpError(
          422,
          `"${material.name}" no admite entradas de stock (categoría ${material.category}).`
        );
      }
      const { before, after } = await applyLocationDelta(
        organization.id,
        location,
        material,
        quantity
      );
      await createMovement(organization.id, user, {
        material_id: material.id,
        material_name: material.name,
        material_code: material.code || "",
        quantity,
        stock_before: before,
        stock_after: after,
        movement_type: movementType,
        ...(albaranNumber ? { albaran_number: albaranNumber } : {}),
        ...(line?.supplier_id ? { supplier_id: line.supplier_id } : {}),
        ...(line?.supplier_name ? { supplier_name: line.supplier_name } : {}),
        ...(purchaseOrderId ? { purchase_order_id: purchaseOrderId } : {}),
        ...(purchaseOrderNumber ? { purchase_order_number: purchaseOrderNumber } : {}),
        ...(notes || line?.notes ? { notes: line?.notes || notes } : {}),
        ...locationMovementContext(location),
      });
      results.push({ material_id: material.id, stock_before: before, stock_after: after });
    }
    return { location, lines: results };
  });
};

/**
 * Valida una entrada pendiente (StockEntry) creada por un técnico:
 * aplica el stock, registra el movimiento y marca la entrada como validada.
 */
export const validatePendingStockEntry = async ({
  organization,
  user,
  entryId,
  location: rawLocation,
}) => {
  const entries = await stockEntryStore.filter({
    filter: buildTenantFilter(organization.id, { id: String(entryId || "") }),
    limit: 1,
  });
  const entry = entries[0];
  if (!entry) {
    throw new HttpError(404, "Entrada de stock no encontrada.");
  }
  if (entry.status !== "pendiente") {
    throw new HttpError(409, "Esta entrada ya fue validada.");
  }
  const location = await resolveStockLocation(organization.id, rawLocation);
  if (location.type === "vehiculo") {
    throw new HttpError(422, "Las entradas se validan sobre un almacén.");
  }

  return withOrgStockLock(organization.id, async () => {
    // Releer dentro del lock: dos validaciones simultáneas no deben duplicar stock.
    const fresh = await stockEntryStore.filter({
      filter: buildTenantFilter(organization.id, { id: entry.id }),
      limit: 1,
    });
    if (!fresh[0] || fresh[0].status !== "pendiente") {
      throw new HttpError(409, "Esta entrada ya fue validada.");
    }
    const quantity = parseQuantity(fresh[0].quantity);
    const material = await getMaterialOrThrow(organization.id, fresh[0].material_id);
    const { before, after } = await applyLocationDelta(
      organization.id,
      location,
      material,
      quantity
    );
    await createMovement(organization.id, user, {
      material_id: material.id,
      material_name: material.name,
      material_code: material.code || "",
      quantity,
      stock_before: before,
      stock_after: after,
      movement_type: "entrada_albaran",
      albaran_number: fresh[0].albaran_number || "",
      notes: `Albarán ${fresh[0].albaran_number || "?"} — Validado por ${user?.full_name || user?.email || ""}`,
      ...(fresh[0].supplier_id ? { supplier_id: fresh[0].supplier_id } : {}),
      ...(fresh[0].supplier_name ? { supplier_name: fresh[0].supplier_name } : {}),
      ...(fresh[0].purchase_order_id ? { purchase_order_id: fresh[0].purchase_order_id } : {}),
      ...(fresh[0].purchase_order_number
        ? { purchase_order_number: fresh[0].purchase_order_number }
        : {}),
      ...locationMovementContext(location),
    });
    const updatedEntry = await stockEntryStore.update(fresh[0].id, {
      status: "validado",
      validated_by: user?.email || "",
      validated_by_name: user?.full_name || "",
      validated_at: new Date().toISOString(),
    });
    return { entry: updatedEntry, stock_before: before, stock_after: after };
  });
};

/**
 * Movimiento de material por parte. Cada línea indica su origen
 * (principal por defecto, o vehicle_id / warehouse_id).
 * quantity > 0 = salida por parte; quantity < 0 = reposición
 * (edición o eliminación del parte), registrada como entrada_devolucion.
 * Ignora líneas de categorías sin stock (mano de obra, desplazamiento, gas).
 */
export const deductStockForIntervention = async ({
  organization,
  user,
  lines,
  interventionId = "",
  interventionNumber = "",
  notes = "",
}) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { lines: [] };
  }

  return withOrgStockLock(organization.id, async () => {
    const results = [];
    for (const line of lines) {
      if (!line?.material_id) continue;
      const quantity = Number(line?.quantity);
      if (!Number.isFinite(quantity) || quantity === 0) continue;
      let material;
      try {
        material = await getMaterialOrThrow(organization.id, line.material_id);
      } catch {
        continue; // material borrado: el parte no debe fallar por el stock
      }
      if (!isStockTracked(material)) continue;

      const location = await resolveStockLocation(organization.id, {
        vehicle_id: line.source_vehicle_id,
        warehouse_id: line.source_warehouse_id,
      });
      const { before, after } = await applyLocationDelta(
        organization.id,
        location,
        material,
        -quantity
      );
      const movementType =
        quantity > 0
          ? location.type === "vehiculo"
            ? "salida_parte_vehiculo"
            : "salida_parte"
          : "entrada_devolucion";
      await createMovement(organization.id, user, {
        material_id: material.id,
        material_name: material.name,
        material_code: material.code || "",
        quantity: -quantity,
        stock_before: before,
        stock_after: after,
        movement_type: movementType,
        intervention_id: interventionId,
        intervention_number: interventionNumber,
        ...(notes ? { notes } : {}),
        ...locationMovementContext(location),
      });
      results.push({ material_id: material.id, stock_before: before, stock_after: after });
    }
    return { lines: results };
  });
};

/**
 * Traspaso de material entre dos ubicaciones (principal / almacén / vehículo).
 * Mantiene los tipos históricos cuando interviene un vehículo; entre almacenes
 * usa traspaso_entre_almacenes con origen/destino legibles.
 */
export const transferStock = async ({ organization, user, materialId, quantity: rawQuantity, from, to }) => {
  const quantity = parseQuantity(rawQuantity);
  const fromLocation = await resolveStockLocation(organization.id, from);
  const toLocation = await resolveStockLocation(organization.id, to);
  if (fromLocation.type === toLocation.type && fromLocation.id === toLocation.id) {
    throw new HttpError(422, "El origen y el destino del traspaso son la misma ubicación.");
  }

  return withOrgStockLock(organization.id, async () => {
    const material = await getMaterialOrThrow(organization.id, materialId);
    if (!isStockTracked(material)) {
      throw new HttpError(
        422,
        `"${material.name}" no admite traspasos de stock (categoría ${material.category}).`
      );
    }

    const fromResult = await applyLocationDelta(
      organization.id,
      fromLocation,
      material,
      -quantity
    );
    const toResult = await applyLocationDelta(organization.id, toLocation, material, quantity);

    const baseFields = {
      material_id: material.id,
      material_name: material.name,
      material_code: material.code || "",
      from_location_name: fromLocation.name,
      to_location_name: toLocation.name,
    };

    if (toLocation.type === "vehiculo" && fromLocation.type !== "vehiculo") {
      // Carga de furgoneta: el movimiento histórico refleja la salida del almacén.
      await createMovement(organization.id, user, {
        ...baseFields,
        quantity: -quantity,
        stock_before: fromResult.before,
        stock_after: fromResult.after,
        movement_type: "traspaso_a_vehiculo",
        vehicle_id: toLocation.id,
        vehicle_name: toLocation.name,
        ...(fromLocation.type === "almacen"
          ? { warehouse_id: fromLocation.id, warehouse_name: fromLocation.name }
          : {}),
      });
    } else if (fromLocation.type === "vehiculo" && toLocation.type !== "vehiculo") {
      // Devolución de furgoneta: el movimiento refleja la entrada en el almacén.
      await createMovement(organization.id, user, {
        ...baseFields,
        quantity,
        stock_before: toResult.before,
        stock_after: toResult.after,
        movement_type: "traspaso_a_almacen",
        vehicle_id: fromLocation.id,
        vehicle_name: fromLocation.name,
        ...(toLocation.type === "almacen"
          ? { warehouse_id: toLocation.id, warehouse_name: toLocation.name }
          : {}),
      });
    } else {
      const movementType =
        fromLocation.type === "vehiculo" && toLocation.type === "vehiculo"
          ? "traspaso_a_vehiculo"
          : "traspaso_entre_almacenes";
      await createMovement(organization.id, user, {
        ...baseFields,
        quantity: -quantity,
        stock_before: fromResult.before,
        stock_after: fromResult.after,
        movement_type: movementType,
        ...(toLocation.type === "vehiculo"
          ? { vehicle_id: toLocation.id, vehicle_name: toLocation.name }
          : {}),
      });
    }

    return {
      material_id: material.id,
      from: { ...fromLocation, ...fromResult },
      to: { ...toLocation, ...toResult },
    };
  });
};

/**
 * Ajuste absoluto de stock por recuento físico. Solo oficina/encargado/admin
 * (el rol se comprueba en la ruta). Registra el delta como ajuste_manual.
 */
export const adjustStock = async ({
  organization,
  user,
  materialId,
  newQuantity,
  location: rawLocation,
  notes = "",
}) => {
  const target = Number(newQuantity);
  if (!Number.isFinite(target) || target < 0) {
    throw new HttpError(422, "El stock resultante debe ser un número mayor o igual a cero.");
  }
  const location = await resolveStockLocation(organization.id, rawLocation);

  return withOrgStockLock(organization.id, async () => {
    const material = await getMaterialOrThrow(organization.id, materialId);
    if (isGasMaterial(material)) {
      throw new HttpError(
        422,
        "El stock de gas refrigerante se gestiona desde Trazabilidad de Gases."
      );
    }
    if (!isStockTracked(material)) {
      throw new HttpError(
        422,
        `"${material.name}" no tiene stock físico que ajustar (categoría ${material.category}).`
      );
    }

    const current =
      location.type === "principal"
        ? material.stock_quantity || 0
        : (await readLocationQuantity(organization.id, location, material)).quantity;
    const delta = target - current;
    if (delta === 0) {
      return { material_id: material.id, stock_before: current, stock_after: current, changed: false };
    }

    const { before, after } = await applyLocationDelta(
      organization.id,
      location,
      material,
      delta
    );
    await createMovement(organization.id, user, {
      material_id: material.id,
      material_name: material.name,
      material_code: material.code || "",
      quantity: delta,
      stock_before: before,
      stock_after: after,
      movement_type: "ajuste_manual",
      notes: notes || "Ajuste por recuento físico",
      ...locationMovementContext(location),
    });
    return { material_id: material.id, stock_before: before, stock_after: after, changed: true };
  });
};

/**
 * Salida o retorno de material de obra (vale de obra).
 */
export const registerProjectMovement = async ({
  organization,
  user,
  materialId,
  quantity: rawQuantity,
  direction,
  projectName = "",
  location: rawLocation,
}) => {
  const quantity = parseQuantity(rawQuantity);
  if (!["salida", "entrada"].includes(direction)) {
    throw new HttpError(422, "La dirección del movimiento de obra no es válida.");
  }
  const location = await resolveStockLocation(organization.id, rawLocation);
  if (location.type === "vehiculo") {
    throw new HttpError(422, "Los vales de obra se sirven desde un almacén.");
  }

  return withOrgStockLock(organization.id, async () => {
    const material = await getMaterialOrThrow(organization.id, materialId);
    if (!isStockTracked(material)) {
      throw new HttpError(
        422,
        `"${material.name}" no admite movimientos de stock (categoría ${material.category}).`
      );
    }
    const delta = direction === "salida" ? -quantity : quantity;
    const { before, after } = await applyLocationDelta(
      organization.id,
      location,
      material,
      delta
    );
    await createMovement(organization.id, user, {
      material_id: material.id,
      material_name: material.name,
      material_code: material.code || "",
      quantity: delta,
      stock_before: before,
      stock_after: after,
      movement_type: direction === "salida" ? "salida_obra" : "entrada_obra",
      notes: direction === "salida" ? `Obra: ${projectName}` : `Retorno obra: ${projectName}`,
      ...locationMovementContext(location),
    });
    return { material_id: material.id, stock_before: before, stock_after: after };
  });
};
