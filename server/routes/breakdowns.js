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
const clientStore = createJsonEntityStore("Client");
const workCenterStore = createJsonEntityStore("WorkCenter");

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

// POST /api/breakdowns/create-with-client — atomic create (new or existing client + optional center + breakdown)
// If new_client is provided: creates Client, optionally WorkCenter, then Breakdown in sequence.
// Rolls back any created records if a later step fails.
router.post(
  "/create-with-client",
  asyncHandler(async (req, res) => {
    assertNotOwner(req);
    assertLicenseAllowsWrite(req);
    const role = req.currentUser?.role;
    if (!canAdminBreakdowns(role)) {
      throw new HttpError(403, "Solo admin y oficina pueden crear averías");
    }

    const { new_client, new_work_center, breakdown: bd } = req.body || {};

    if (!bd?.description?.trim()) {
      throw new HttpError(400, "La descripción es obligatoria");
    }

    const orgId = req.currentOrganization.id;
    const now = new Date().toISOString();
    let clientId = bd.client_id;
    let clientName = bd.client_name;
    let createdClient = null;
    let createdWorkCenter = null;

    if (new_client) {
      if (!new_client.name?.trim()) {
        throw new HttpError(400, "El nombre del cliente es obligatorio");
      }

      createdClient = await clientStore.create({
        ...new_client,
        name: new_client.name.trim(),
        organization_id: orgId,
        discount_percent: new_client.discount_percent ?? 0,
        price_tier: new_client.price_tier || "standard",
        tarifa_normal: new_client.tarifa_normal ?? 45,
        tarifa_extra: new_client.tarifa_extra ?? 60,
        tarifa_nocturna: new_client.tarifa_nocturna ?? 70,
        tarifa_festiva: new_client.tarifa_festiva ?? 80,
        created_at: now,
        updated_at: now,
      });
      clientId = createdClient.id;
      clientName = createdClient.name;

      if (new_work_center?.name?.trim()) {
        try {
          createdWorkCenter = await workCenterStore.create({
            ...new_work_center,
            name: new_work_center.name.trim(),
            client_id: clientId,
            client_name: clientName,
            organization_id: orgId,
            is_active: true,
            created_at: now,
            updated_at: now,
          });
        } catch (wcErr) {
          console.error("[breakdowns] Error creating work center, rolling back client:", wcErr);
          await clientStore.delete(createdClient.id).catch((e) => console.error("[breakdowns] Rollback delete client failed:", e));
          throw new HttpError(500, "Error al crear el centro de trabajo");
        }
      }
    } else {
      if (!clientId || !clientName) {
        throw new HttpError(400, "El cliente es obligatorio");
      }
      // Verify client exists and belongs to this organization
      const clientCheck = await clientStore.filter({
        filter: buildTenantFilter(orgId, { id: clientId }),
        limit: 1,
      });
      if (!clientCheck[0]) {
        throw new HttpError(400, "Cliente no encontrado");
      }
      clientName = clientCheck[0].name; // prevent name spoofing
    }

    const breakdownPayload = {
      client_id: clientId,
      client_name: clientName,
      work_center_id: createdWorkCenter?.id || bd.work_center_id || undefined,
      work_center_name: createdWorkCenter?.name || bd.work_center_name || undefined,
      number: generateBreakdownNumber(),
      organization_id: orgId,
      status: bd.status || "abierta",
      priority: bd.priority || "media",
      assigned_user_id: bd.assigned_user_id || undefined,
      assigned_user_email: bd.assigned_user_email || undefined,
      assigned_user_name: bd.assigned_user_name || undefined,
      description: bd.description || "",
      client_fault_id: bd.client_fault_id || undefined,
      contact_phone_snapshot: bd.contact_phone_snapshot || undefined,
      created_by_email: req.currentUser.email,
      created_by_name: req.currentUser.full_name || req.currentUser.email,
      created_at: now,
      updated_at: now,
    };

    let breakdown;
    try {
      breakdown = await breakdownStore.create(breakdownPayload);
    } catch (bdErr) {
      console.error("[breakdowns] Error creating breakdown, rolling back:", bdErr);
      if (createdWorkCenter) await workCenterStore.delete(createdWorkCenter.id).catch((e) => console.error("[breakdowns] Rollback delete workCenter failed:", e));
      if (createdClient) await clientStore.delete(createdClient.id).catch((e) => console.error("[breakdowns] Rollback delete client failed:", e));
      throw new HttpError(500, "Error al crear la avería");
    }

    res.status(201).json({ breakdown, client: createdClient, work_center: createdWorkCenter });
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

    // Verify client exists and belongs to this organization
    const orgId = req.currentOrganization.id;
    const clientCheck = await clientStore.filter({
      filter: buildTenantFilter(orgId, { id: client_id }),
      limit: 1,
    });
    if (!clientCheck[0]) {
      throw new HttpError(400, "Cliente no encontrado");
    }
    const verifiedClientName = clientCheck[0].name; // prevent name spoofing

    const now = new Date().toISOString();
    const payload = {
      number: generateBreakdownNumber(),
      organization_id: orgId,
      status: req.body.status || "abierta",
      priority: req.body.priority || "media",
      client_id: client_id,
      client_name: verifiedClientName,
      work_center_id: req.body.work_center_id || undefined,
      work_center_name: req.body.work_center_name || undefined,
      machine_id: req.body.machine_id || undefined,
      machine_name: req.body.machine_name || undefined,
      assigned_user_id: req.body.assigned_user_id || undefined,
      assigned_user_email: req.body.assigned_user_email || undefined,
      assigned_user_name: req.body.assigned_user_name || undefined,
      description: description,
      client_fault_id: req.body.client_fault_id || undefined,
      contact_phone_snapshot: req.body.contact_phone_snapshot || undefined,
      created_by_email: req.currentUser.email,
      created_by_name: req.currentUser.full_name || req.currentUser.email,
      created_at: now,
      updated_at: now,
    };

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

    const whitelist = [
      "client_id", "client_name", "work_center_id", "work_center_name",
      "machine_id", "machine_name",
      "description", "priority", "status", "assigned_user_id", "assigned_user_email",
      "assigned_user_name", "client_fault_id", "contact_phone_snapshot",
      "closed_at", "closed_by_email", "last_intervention_id", "last_intervention_number",
    ];
    let patch = { updated_at: new Date().toISOString() };
    for (const key of whitelist) {
      if (req.body[key] !== undefined) {
        patch[key] = req.body[key];
      }
    }
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
