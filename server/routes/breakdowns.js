import express from "express";
import { randomBytes } from "node:crypto";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { createJsonEntityStore } from "../lib/json-store.js";
import { buildTenantFilter } from "../lib/tenant.js";
import { assertLicenseAllowsWrite } from "../lib/license.js";
import { canAccessHiddenUsers } from "../lib/auth.js";

const router = express.Router();
const breakdownStore = createJsonEntityStore("Breakdown");
const interventionStore = createJsonEntityStore("Intervention");

router.use(requireAuth);

function generateBreakdownNumber() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `AV-${yy}${mm}${dd}-${suffix}`;
}

const canAdminBreakdowns = (role) =>
  ["admin", "superadmin", "encargado", "oficina"].includes(String(role || "").toLowerCase());

const canViewBreakdowns = (role) =>
  ["admin", "superadmin", "encargado", "oficina", "tecnico", "ayudante", "user"].includes(
    String(role || "").toLowerCase()
  );

const assertNotOwner = (req) => {
  if (canAccessHiddenUsers(req.currentUser)) {
    throw new HttpError(403, "Owner account cannot access operational breakdown data");
  }
};

// GET /api/breakdowns — list with role-based filtering
router.get(
  "/",
  asyncHandler(async (req, res) => {
    assertNotOwner(req);
    const role = req.currentUser?.role;
    if (!canViewBreakdowns(role)) {
      throw new HttpError(403, "Forbidden");
    }

    const baseFilter = buildTenantFilter(req.currentOrganization.id, {});
    let items = await breakdownStore.filter({
      filter: baseFilter,
      sort: req.query.sort || "-created_at",
      limit: Number(req.query.limit) || 200,
    });

    if (!canAdminBreakdowns(role)) {
      const myEmail = req.currentUser?.email;
      items = items.filter(
        (b) => !b.assigned_user_email || b.assigned_user_email === myEmail
      );
    }

    res.json(items);
  })
);

// GET /api/breakdowns/:id — single record
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    assertNotOwner(req);
    const role = req.currentUser?.role;
    if (!canViewBreakdowns(role)) {
      throw new HttpError(403, "Forbidden");
    }

    const results = await breakdownStore.filter({
      filter: buildTenantFilter(req.currentOrganization.id, { id: req.params.id }),
      limit: 1,
    });
    const breakdown = results[0] || null;
    if (!breakdown) {
      throw new HttpError(404, "Avería no encontrada");
    }

    if (!canAdminBreakdowns(role)) {
      const myEmail = req.currentUser?.email;
      if (breakdown.assigned_user_email && breakdown.assigned_user_email !== myEmail) {
        throw new HttpError(403, "No tienes acceso a esta avería");
      }
    }

    const interventions = await interventionStore.filter({
      filter: buildTenantFilter(req.currentOrganization.id, { breakdown_id: breakdown.id }),
      sort: "-date",
      limit: 50,
    });

    res.json({ ...breakdown, interventions });
  })
);

// GET /api/breakdowns/by-client/:clientId — breakdowns for a client (admin/oficina only)
router.get(
  "/by-client/:clientId",
  asyncHandler(async (req, res) => {
    assertNotOwner(req);
    const role = req.currentUser?.role;
    if (!canAdminBreakdowns(role)) {
      throw new HttpError(403, "Forbidden");
    }

    const items = await breakdownStore.filter({
      filter: buildTenantFilter(req.currentOrganization.id, { client_id: req.params.clientId }),
      sort: "-created_at",
      limit: 100,
    });

    res.json(items);
  })
);

// POST /api/breakdowns — create (admin/oficina only)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    assertNotOwner(req);
    assertLicenseAllowsWrite(req);
    const role = req.currentUser?.role;
    if (!canAdminBreakdowns(role)) {
      throw new HttpError(403, "Solo admin y oficina pueden crear averías");
    }

    const { description, client_id, client_name } = req.body || {};
    if (!description?.trim()) {
      throw new HttpError(400, "La descripción es obligatoria");
    }
    if (!client_id || !client_name) {
      throw new HttpError(400, "El cliente es obligatorio");
    }

    const now = new Date().toISOString();
    const payload = {
      ...req.body,
      number: generateBreakdownNumber(),
      organization_id: req.currentOrganization.id,
      status: req.body.status || "abierta",
      priority: req.body.priority || "media",
      created_by_email: req.currentUser.email,
      created_by_name: req.currentUser.full_name || req.currentUser.email,
      created_at: now,
      updated_at: now,
    };

    delete payload.id;

    const created = await breakdownStore.create(payload);
    res.status(201).json(created);
  })
);

// PATCH /api/breakdowns/:id — update
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    assertNotOwner(req);
    assertLicenseAllowsWrite(req);
    const role = req.currentUser?.role;
    if (!canViewBreakdowns(role)) {
      throw new HttpError(403, "Forbidden");
    }

    const results = await breakdownStore.filter({
      filter: buildTenantFilter(req.currentOrganization.id, { id: req.params.id }),
      limit: 1,
    });
    const existing = results[0] || null;
    if (!existing) {
      throw new HttpError(404, "Avería no encontrada");
    }

    const isAdmin = canAdminBreakdowns(role);

    // tecnico/ayudante: solo pueden actualizar status + last_intervention_* via sistema interno
    // No pueden cambiar datos administrativos como cliente, prioridad, asignación, etc.
    let patch = { ...req.body, updated_at: new Date().toISOString() };
    if (!isAdmin) {
      const myEmail = req.currentUser?.email;
      if (existing.assigned_user_email && existing.assigned_user_email !== myEmail) {
        throw new HttpError(403, "No tienes acceso a esta avería");
      }
      // Tecnico only allowed to update status and last_intervention fields
      const allowed = new Set([
        "status", "closed_at", "closed_by_email",
        "last_intervention_id", "last_intervention_number", "updated_at",
      ]);
      patch = Object.fromEntries(
        Object.entries(patch).filter(([k]) => allowed.has(k))
      );
    }

    // Force organization_id to current tenant on update
    patch.organization_id = req.currentOrganization.id;

    const updated = await breakdownStore.update(req.params.id, patch);
    if (!updated) {
      throw new HttpError(404, "Avería no encontrada");
    }

    res.json(updated);
  })
);

export default router;
