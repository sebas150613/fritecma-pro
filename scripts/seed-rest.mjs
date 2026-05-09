import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { serverConfig } from "../server/config.js";
import { createJsonEntityStore } from "../server/lib/json-store.js";

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset");

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: npm run seed:rest -- [--reset]

Seeds the local REST backend JSON stores with representative FRIGEST demo data.

Options:
  --reset   Deletes existing server/data and server/uploads before seeding.
`);
  process.exit(0);
}

const ensureRuntimeDirs = async () => {
  await fs.mkdir(serverConfig.dataDir, { recursive: true });
  await fs.mkdir(serverConfig.publicUploadsDir, { recursive: true });
  await fs.mkdir(serverConfig.privateUploadsDir, { recursive: true });
};

const resetRuntime = async () => {
  await fs.rm(serverConfig.dataDir, { recursive: true, force: true });
  await fs.rm(serverConfig.uploadsDir, { recursive: true, force: true });
};

const upsertById = async (store, record) => {
  const existing = await store.filter({ filter: { id: record.id }, limit: 1 });
  if (existing[0]) {
    return store.update(record.id, record);
  }

  return store.create(record);
};

const buildInterventionLines = () =>
  JSON.stringify([
    {
      _isLabor: true,
      material_name: "Hora de mano de obra",
      quantity: 2,
      unit: "h",
      unit_price: 45,
      total: 90,
      iva_percent: 21,
    },
    {
      material_id: "mat-r449a",
      material_name: "Gas refrigerante R449A",
      quantity: 2,
      unit: "kg",
      unit_price: 35,
      total: 70,
      iva_percent: 21,
    },
  ]);

const main = async () => {
  if (shouldReset) {
    await resetRuntime();
  }

  await ensureRuntimeDirs();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  const stores = {
    User: createJsonEntityStore("User"),
    Client: createJsonEntityStore("Client"),
    WorkCenter: createJsonEntityStore("WorkCenter"),
    Supplier: createJsonEntityStore("Supplier"),
    MaterialFamily: createJsonEntityStore("MaterialFamily"),
    MaterialSubfamily: createJsonEntityStore("MaterialSubfamily"),
    Material: createJsonEntityStore("Material"),
    GasBottle: createJsonEntityStore("GasBottle"),
    GasTransfer: createJsonEntityStore("GasTransfer"),
    StockMovement: createJsonEntityStore("StockMovement"),
    StockEntry: createJsonEntityStore("StockEntry"),
    Project: createJsonEntityStore("Project"),
    ProjectMaterial: createJsonEntityStore("ProjectMaterial"),
    Intervention: createJsonEntityStore("Intervention"),
    Visit: createJsonEntityStore("Visit"),
    Invoice: createJsonEntityStore("Invoice"),
    CalendarEvent: createJsonEntityStore("CalendarEvent"),
    TimeRecord: createJsonEntityStore("TimeRecord"),
    WorkDay: createJsonEntityStore("WorkDay"),
    MaterialRequest: createJsonEntityStore("MaterialRequest"),
    Absence: createJsonEntityStore("Absence"),
    AuditLog: createJsonEntityStore("AuditLog"),
  };

  const users = [
    {
      id: "local-admin",
      email: "admin@local.test",
      full_name: "Administrador Local",
      role: "admin",
      is_active: true,
      verifactu_nif: "B12345678",
      verifactu_nombre: "FRIGEST S.L.",
      verifactu_produccion: false,
    },
    {
      id: "local-tech",
      email: "tecnico@local.test",
      full_name: "Tecnico Local",
      role: "tecnico",
      is_active: true,
    },
    {
      id: "local-office",
      email: "oficina@local.test",
      full_name: "Oficina Local",
      role: "oficina",
      is_active: true,
    },
    {
      id: "local-manager",
      email: "encargado@local.test",
      full_name: "Encargado Local",
      role: "encargado",
      is_active: true,
    },
    {
      id: "local-helper",
      email: "ayudante@local.test",
      full_name: "Ayudante Local",
      role: "ayudante",
      is_active: true,
    },
  ];

  const clients = [
    {
      id: "cli-bahia",
      name: "Hotel Bahia Frio",
      city: "Palma",
      phone: "971000111",
      email: "mantenimiento@bahia.test",
      address: "Av. del Mar 12, Palma",
      postal_code: "07001",
      tarifa_normal: 45,
      tarifa_extra: 60,
      tarifa_nocturna: 70,
      tarifa_festiva: 80,
      discount_percent: 0,
    },
    {
      id: "cli-mercat",
      name: "Mercat Central",
      city: "Palma",
      phone: "971000222",
      email: "compras@mercat.test",
      address: "Carrer del Mercat 5, Palma",
      postal_code: "07002",
      tarifa_normal: 48,
      tarifa_extra: 65,
      tarifa_nocturna: 72,
      tarifa_festiva: 85,
      discount_percent: 5,
    },
  ];

  const workCenters = [
    {
      id: "wc-bahia-cocina",
      client_id: "cli-bahia",
      client_name: "Hotel Bahia Frio",
      name: "Cocina principal",
      address: "Sotano 1",
    },
    {
      id: "wc-mercat-camaras",
      client_id: "cli-mercat",
      client_name: "Mercat Central",
      name: "Camara de congelado",
      address: "Zona de carga",
    },
  ];

  const suppliers = [
    {
      id: "sup-frio",
      name: "Suministros Frio Balear",
      email: "ventas@suministros.test",
      phone: "971333444",
      address: "Poligono Son Castello 8",
      city: "Palma",
      postal_code: "07009",
      is_active: true,
    },
  ];

  const families = [
    { id: "fam-gases", name: "Gases", is_active: true },
    { id: "fam-repuestos", name: "Repuestos", is_active: true },
  ];

  const subfamilies = [
    {
      id: "sub-gases-refrigerante",
      family_id: "fam-gases",
      family_name: "Gases",
      name: "Refrigerante",
      is_active: true,
    },
    {
      id: "sub-repuestos-electrico",
      family_id: "fam-repuestos",
      family_name: "Repuestos",
      name: "Electrico",
      is_active: true,
    },
  ];

  const materials = [
    {
      id: "mat-r449a",
      code: "R449A",
      name: "Gas refrigerante R449A",
      category: "gas_refrigerante",
      family_id: "fam-gases",
      subfamily_id: "sub-gases-refrigerante",
      unit: "kg",
      cost_price: 22,
      sell_price: 35,
      stock_quantity: 34,
      min_stock: 10,
      iva_percent: 21,
      is_active: true,
      supplier_id: "sup-frio",
      supplier_name: "Suministros Frio Balear",
    },
    {
      id: "mat-contactor",
      code: "CNT-25A",
      name: "Contactor 25A",
      category: "repuesto",
      family_id: "fam-repuestos",
      subfamily_id: "sub-repuestos-electrico",
      unit: "ud",
      cost_price: 9,
      sell_price: 18,
      stock_quantity: 5,
      min_stock: 3,
      iva_percent: 21,
      is_active: true,
      supplier_id: "sup-frio",
      supplier_name: "Suministros Frio Balear",
    },
    {
      id: "mat-mo",
      code: "MOD-NORMAL",
      name: "Hora mano de obra",
      category: "mano_de_obra",
      unit: "h",
      cost_price: 0,
      sell_price: 45,
      stock_quantity: 0,
      min_stock: 0,
      iva_percent: 21,
      is_active: true,
    },
  ];

  const gasBottles = [
    {
      id: "bot-r449a-1",
      serial_number: "BOT-R449A-001",
      gas_type: "R449A",
      carga_actual: 24,
      current_kg: 24,
      status: "activa",
      supplier_id: "sup-frio",
      supplier_name: "Suministros Frio Balear",
      location_type: "almacen",
    },
    {
      id: "bot-r449a-2",
      serial_number: "BOT-R449A-002",
      gas_type: "R449A",
      carga_actual: 0,
      current_kg: 0,
      status: "vacia",
      supplier_id: "sup-frio",
      supplier_name: "Suministros Frio Balear",
      location_type: "taller",
    },
  ];

  const projects = [
    {
      id: "proy-bahia-ampliacion",
      name: "Ampliacion camaras Hotel Bahia",
      reference: "OB-2026-014",
      client_id: "cli-bahia",
      client_name: "Hotel Bahia Frio",
      status: "en_curso",
      address: "Av. del Mar 12, Palma",
    },
  ];

  const projectMaterials = [
    {
      id: "pm-bahia-r449a",
      project_id: "proy-bahia-ampliacion",
      material_id: "mat-r449a",
      material_name: "Gas refrigerante R449A",
      quantity: 4,
      unit: "kg",
      movement_type: "salida",
      created_date: now.toISOString(),
    },
  ];

  const interventions = [
    {
      id: "int-bahia-001",
      number: "FRI-260408-A1B2",
      client_id: "cli-bahia",
      client_name: "Hotel Bahia Frio",
      work_center_id: "wc-bahia-cocina",
      work_center_name: "Cocina principal",
      technician_email: "tecnico@local.test",
      technician_name: "Tecnico Local",
      helper_email: "ayudante@local.test",
      helper_name: "Ayudante Local",
      date: now.toISOString(),
      location_address: "Av. del Mar 12, Palma",
      gas_type: "R449A",
      gas_bottle_id: "bot-r449a-1",
      gas_bottle_serial: "BOT-R449A-001",
      gas_loaded_kg: 2,
      gas_recovered_kg: 0.5,
      gas_leak_kg: 1.5,
      description: "Reposicion de gas y ajuste de presostatos",
      technician_notes: "Unidad estable tras la intervencion",
      materials_json: buildInterventionLines(),
      subtotal: 160,
      iva_total: 33.6,
      total: 193.6,
      discount_percent: 0,
      tipo_horario: "normal",
      tarifa_aplicada: 45,
      receptor_name: "Joan Serra",
      receptor_dni: "12345678Z",
      client_conformidad: true,
      saved_at: now.toISOString(),
      incident_status: "finalizado",
      status: "pendiente_revision",
    },
    {
      id: "int-mercat-001",
      number: "FRI-260407-C3D4",
      client_id: "cli-mercat",
      client_name: "Mercat Central",
      work_center_id: "wc-mercat-camaras",
      work_center_name: "Camara de congelado",
      technician_email: "tecnico@local.test",
      technician_name: "Tecnico Local",
      date: new Date(now.getTime() - 86400000).toISOString(),
      location_address: "Carrer del Mercat 5, Palma",
      description: "Cambio de contactor y prueba funcional",
      technician_notes: "Pendiente revisar vibraciones",
      materials_json: JSON.stringify([
        {
          material_id: "mat-contactor",
          material_name: "Contactor 25A",
          quantity: 1,
          unit: "ud",
          unit_price: 18,
          total: 18,
          iva_percent: 21,
        },
      ]),
      subtotal: 18,
      iva_total: 3.78,
      total: 21.78,
      discount_percent: 0,
      incident_status: "pendiente_operativa",
      status: "en_curso",
    },
  ];

  const visits = [
    {
      id: "visit-bahia-001",
      intervention_id: "int-bahia-001",
      visit_number: 1,
      technician_email: "tecnico@local.test",
      technician_name: "Tecnico Local",
      date: now.toISOString(),
      description: "Revision posterior y comprobacion de parametros",
      total: 45,
    },
  ];

  const invoices = [
    {
      id: "inv-bahia-001",
      invoice_number: "F-000001",
      serie: "F",
      tipo_factura: "F1",
      intervention_id: "int-bahia-001",
      intervention_number: "FRI-260408-A1B2",
      client_id: "cli-bahia",
      client_name: "Hotel Bahia Frio",
      issue_date: now.toISOString(),
      subtotal: 160,
      iva_total: 33.6,
      total: 193.6,
      lines_json: buildInterventionLines(),
      hash_huella: "SEEDHASH001",
      hash_anterior: "",
      invoice_chain_index: 1,
      retention_until: "2032-04-08",
      verifactu_status: "validado_sandbox",
      pending_submission: false,
      verifactu_timestamp: now.toISOString(),
      is_locked: true,
      issuer_nif: "B12345678",
      issuer_name: "FRIGEST S.L.",
      created_by_email: "admin@local.test",
    },
  ];

  const calendarEvents = [
    {
      id: "cal-bahia-revision",
      asignado_a: "tecnico@local.test",
      asignado_a_name: "Tecnico Local",
      creado_por: "encargado@local.test",
      creado_por_name: "Encargado Local",
      title: "Revision Hotel Bahia",
      description: "Comprobar temperaturas de camaras y registrar consumos",
      start_date: `${today}T08:30:00.000Z`,
      end_date: `${today}T10:00:00.000Z`,
      event_type: "mantenimiento",
      priority: "alta",
      color: "#ef4444",
      location: "Hotel Bahia",
      completed: false,
    },
    {
      id: "cal-mercat-pedido",
      asignado_a: "oficina@local.test",
      asignado_a_name: "Oficina Local",
      creado_por: "admin@local.test",
      creado_por_name: "Administrador Local",
      title: "Seguimiento pedido proveedor",
      description: "Confirmar entrega de repuestos electricos",
      start_date: `${tomorrow}T09:00:00.000Z`,
      end_date: `${tomorrow}T09:30:00.000Z`,
      event_type: "recordatorio",
      priority: "normal",
      color: "#f59e0b",
      location: "Oficina",
      completed: false,
    },
  ];

  const timeRecords = [
    {
      id: "tr-entrada-hoy",
      technician_email: "tecnico@local.test",
      technician_name: "Tecnico Local",
      work_date: today,
      timestamp: `${today}T07:55:00.000Z`,
      type: "entrada",
    },
    {
      id: "tr-salida-ayer",
      technician_email: "tecnico@local.test",
      technician_name: "Tecnico Local",
      work_date: yesterday,
      timestamp: `${yesterday}T16:35:00.000Z`,
      type: "salida",
    },
  ];

  const workDays = [
    {
      id: "wd-tecnico-hoy",
      user_email: "tecnico@local.test",
      user_name: "Tecnico Local",
      work_date: today,
      status: "borrador",
      segments_json: JSON.stringify([
        {
          start_time: "08:00",
          end_time: "10:00",
          type: "Cliente",
          entity: "cli-bahia",
          location: "Hotel Bahia",
        },
        {
          start_time: "10:30",
          end_time: "13:30",
          type: "Obra",
          entity: "proy-bahia-ampliacion",
          location: "Obra",
        },
      ]),
    },
  ];

  const materialRequests = [
    {
      id: "mr-001",
      technician_email: "tecnico@local.test",
      technician_name: "Tecnico Local",
      request_type: "material",
      description: "Bobina contactor 25A",
      quantity: 2,
      unit: "ud",
      urgency: "normal",
      notes: "Para reposicion de furgon",
      status: "pendiente",
    },
  ];

  const absences = [
    {
      id: "abs-ayudante",
      user_email: "ayudante@local.test",
      start_date: tomorrow,
      end_date: tomorrow,
      type: "vacaciones",
      notes: "Dia libre planificado",
    },
  ];

  const stockMovements = [
    {
      id: "sm-r449a-inicial",
      material_id: "mat-r449a",
      material_name: "Gas refrigerante R449A",
      material_code: "R449A",
      quantity: 12,
      stock_before: 22,
      stock_after: 34,
      movement_type: "ajuste_manual",
      technician_email: "admin@local.test",
      technician_name: "Administrador Local",
      notes: "Carga inicial demo REST",
    },
  ];

  const stockEntries = [
    {
      id: "se-001",
      material_id: "mat-contactor",
      material_name: "Contactor 25A",
      quantity: 3,
      supplier_id: "sup-frio",
      supplier_name: "Suministros Frio Balear",
      status: "pendiente",
      notes: "Recepcion pendiente de validar",
    },
  ];

  const gasTransfers = [
    {
      id: "gt-001",
      from_bottle_id: "bot-r449a-1",
      from_bottle_serial: "BOT-R449A-001",
      to_bottle_id: "bot-r449a-2",
      to_bottle_serial: "BOT-R449A-002",
      gas_type: "R449A",
      kg_transferred: 2,
      technician_email: "tecnico@local.test",
      technician_name: "Tecnico Local",
      timestamp: now.toISOString(),
      notes: "Movimiento demo",
    },
  ];

  const auditLogs = [
    {
      id: "audit-seed-001",
      action: "seed",
      entity_type: "system",
      entity_id: "rest-seed",
      entity_reference: "rest-seed",
      user_email: "admin@local.test",
      user_name: "Administrador Local",
      changes_summary: "Carga inicial de datos demo REST",
      timestamp: now.toISOString(),
    },
  ];

  for (const record of users) await upsertById(stores.User, record);
  for (const record of clients) await upsertById(stores.Client, record);
  for (const record of workCenters) await upsertById(stores.WorkCenter, record);
  for (const record of suppliers) await upsertById(stores.Supplier, record);
  for (const record of families) await upsertById(stores.MaterialFamily, record);
  for (const record of subfamilies)
    await upsertById(stores.MaterialSubfamily, record);
  for (const record of materials) await upsertById(stores.Material, record);
  for (const record of gasBottles) await upsertById(stores.GasBottle, record);
  for (const record of gasTransfers) await upsertById(stores.GasTransfer, record);
  for (const record of stockMovements)
    await upsertById(stores.StockMovement, record);
  for (const record of stockEntries) await upsertById(stores.StockEntry, record);
  for (const record of projects) await upsertById(stores.Project, record);
  for (const record of projectMaterials)
    await upsertById(stores.ProjectMaterial, record);
  for (const record of interventions)
    await upsertById(stores.Intervention, record);
  for (const record of visits) await upsertById(stores.Visit, record);
  for (const record of invoices) await upsertById(stores.Invoice, record);
  for (const record of calendarEvents)
    await upsertById(stores.CalendarEvent, record);
  for (const record of timeRecords) await upsertById(stores.TimeRecord, record);
  for (const record of workDays) await upsertById(stores.WorkDay, record);
  for (const record of materialRequests)
    await upsertById(stores.MaterialRequest, record);
  for (const record of absences) await upsertById(stores.Absence, record);
  for (const record of auditLogs) await upsertById(stores.AuditLog, record);

  const summary = {
    users: users.length,
    clients: clients.length,
    materials: materials.length,
    gas_bottles: gasBottles.length,
    interventions: interventions.length,
    invoices: invoices.length,
    calendar_events: calendarEvents.length,
    requests: materialRequests.length,
    reset: shouldReset,
  };

  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error("[seed-rest] FAILED");
  console.error(error);
  process.exitCode = 1;
});
