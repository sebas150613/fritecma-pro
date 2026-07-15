import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth, canAccessHiddenUsers } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { canOperateOffice } from "../lib/roles.js";
import { assertLicenseAllowsWrite } from "../lib/license.js";
import {
  adjustStock,
  deductStockForIntervention,
  registerProjectMovement,
  registerStockEntry,
  transferStock,
  validatePendingStockEntry,
} from "../services/stock-service.js";

const router = express.Router();

router.use(requireAuth);

// Las operaciones de stock son datos operativos del tenant: la cuenta owner
// oculta de plataforma no participa (mismo criterio que la API de entidades).
router.use((req, _res, next) => {
  if (canAccessHiddenUsers(req.currentUser)) {
    next(new HttpError(403, "Owner account cannot access tenant operational data"));
    return;
  }
  next();
});

const requireOfficeRole = (req) => {
  if (!canOperateOffice(req.currentUser?.role)) {
    throw new HttpError(403, "Esta operación de stock requiere rol de oficina o encargado.");
  }
};

const ctx = (req) => ({
  organization: req.currentOrganization,
  user: req.currentUser,
});

// Entrada de material (albarán / lote / OCR) — oficina y encargado.
router.post(
  "/entry",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    requireOfficeRole(req);
    const body = req.body || {};
    const result = await registerStockEntry({
      ...ctx(req),
      lines: body.lines,
      location: { warehouse_id: body.warehouse_id },
      movementType: body.movement_type || "entrada_albaran",
      albaranNumber: String(body.albaran_number || "").trim(),
      notes: String(body.notes || ""),
      purchaseOrderId: String(body.purchase_order_id || ""),
      purchaseOrderNumber: String(body.purchase_order_number || ""),
    });
    res.status(201).json(result);
  })
);

// Validación de una entrada pendiente de técnico — oficina y encargado.
router.post(
  "/validate-entry",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    requireOfficeRole(req);
    const body = req.body || {};
    const result = await validatePendingStockEntry({
      ...ctx(req),
      entryId: body.entry_id,
      location: { warehouse_id: body.warehouse_id },
    });
    res.json(result);
  })
);

// Salida de material al guardar un parte — cualquier miembro de la empresa.
router.post(
  "/deduct-intervention",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    const body = req.body || {};
    const result = await deductStockForIntervention({
      ...ctx(req),
      lines: body.lines,
      interventionId: String(body.intervention_id || ""),
      interventionNumber: String(body.intervention_number || ""),
      notes: String(body.notes || ""),
    });
    res.status(201).json(result);
  })
);

// Traspaso entre ubicaciones. Si interviene un vehículo puede hacerlo cualquier
// miembro (los técnicos cargan/devuelven su furgoneta); entre almacenes es una
// operación logística de oficina/encargado.
router.post(
  "/transfer",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    const body = req.body || {};
    const from = body.from || {};
    const to = body.to || {};
    const involvesVehicle = Boolean(from.vehicle_id || to.vehicle_id);
    if (!involvesVehicle) {
      requireOfficeRole(req);
    }
    const result = await transferStock({
      ...ctx(req),
      materialId: body.material_id,
      quantity: body.quantity,
      from,
      to,
    });
    res.status(201).json(result);
  })
);

// Ajuste absoluto por recuento físico — solo oficina y encargado.
router.post(
  "/adjust",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    requireOfficeRole(req);
    const body = req.body || {};
    const result = await adjustStock({
      ...ctx(req),
      materialId: body.material_id,
      newQuantity: body.new_quantity,
      location: { warehouse_id: body.warehouse_id, vehicle_id: body.vehicle_id },
      notes: String(body.notes || ""),
    });
    res.json(result);
  })
);

// Vale de obra (salida) y retorno de obra — cualquier miembro.
router.post(
  "/project",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    const body = req.body || {};
    const result = await registerProjectMovement({
      ...ctx(req),
      materialId: body.material_id,
      quantity: body.quantity,
      direction: String(body.direction || ""),
      projectName: String(body.project_name || ""),
      location: { warehouse_id: body.warehouse_id },
    });
    res.status(201).json(result);
  })
);

export default router;
