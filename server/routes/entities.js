import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import {
  assertCanAccessTargetUser,
  canAccessHiddenUsers,
  filterUsersForViewer,
  getOrganizationMembershipsForOrganization,
  requireAuth,
  stripSensitiveUserFields,
  syncMembershipSnapshotForUser,
} from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { isKnownEntity } from "../lib/entity-registry.js";
import { createJsonEntityStore } from "../lib/json-store.js";
import {
  buildTenantFilter,
  decryptOrganizationSettingsFromStorage,
  encryptOrganizationSettingsForStorage,
  getOrganizationMembershipStore,
  isTenantScopedEntity,
  prepareOrganizationSettingsPatchForStorage,
  sanitizeOrganizationSettingsForClient,
} from "../lib/tenant.js";
import {
  canOperateOffice,
  normalizeOrganizationRole,
  resolveAppRole,
} from "../lib/roles.js";
import { assertSeatAvailableForOrganization } from "../services/billing-service.js";
import { assertLicenseAllowsWrite } from "../lib/license.js";
import {
  sanitizeEntityPricesForRole,
  sanitizeOrgSettingsPricesForRole,
} from "../lib/price-rbac.js";
import {
  applyServerPricing,
  shouldApplyServerPricing,
} from "../services/intervention-pricing.js";

const NON_DELETABLE_OPERATIONAL_ENTITIES = new Set([
  "TimeRecord",
  "WorkDay",
  "Intervention",
  "Invoice",
  "AuditLog",
  "GasTransfer",
  "StockMovement",
  "VehicleStock",
  "WarehouseStock",
  "MaterialRequest",
  "Visit",
  "PurchaseOrder",
]);

const OPERATIONAL_DELETE_FORBIDDEN_MESSAGE =
  "Esta entidad forma parte del histórico de la empresa y no puede eliminarse individualmente.";

// El stock se opera exclusivamente desde /api/stock (movimientos atómicos y
// con registro coherente). Estas entidades no admiten escritura directa.
const STOCK_LEDGER_ENTITIES = new Set([
  "StockMovement",
  "VehicleStock",
  "WarehouseStock",
]);
const STOCK_LEDGER_FORBIDDEN_MESSAGE =
  "El stock se modifica desde las operaciones de stock de la aplicación, no editando esta entidad directamente.";

// Las facturas emitidas son inmutables (VeriFactu). Vía API de entidades solo
// se pueden modificar los campos de cobro, y solo por roles de oficina; la
// creación se hace exclusivamente desde el proceso Veri*factu.
const INVOICE_PAYMENT_FIELDS = new Set([
  "payment_status",
  "payment_method",
  "paid_at",
  "payment_notes",
  "due_date",
]);
const INVOICE_PAYMENT_STATUSES = new Set(["pendiente", "pagada", "no_aplica"]);

const assertInvoicePaymentPatch = (req) => {
  if (!canOperateOffice(req.currentUser?.role)) {
    throw new HttpError(403, "Forbidden");
  }

  const keys = Object.keys(req.body || {});
  const invalidKeys = keys.filter((key) => !INVOICE_PAYMENT_FIELDS.has(key));
  if (invalidKeys.length > 0) {
    throw new HttpError(
      422,
      "Una factura emitida es inmutable: solo pueden modificarse los campos de cobro."
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body || {}, "payment_status") &&
    !INVOICE_PAYMENT_STATUSES.has(String(req.body.payment_status))
  ) {
    throw new HttpError(422, "payment_status no válido (pendiente | pagada | no_aplica).");
  }
};

const router = express.Router();
const stores = new Map();
const membershipStore = getOrganizationMembershipStore();

const getStore = (entityName) => {
  if (!isKnownEntity(entityName)) {
    throw new HttpError(404, `Unknown entity "${entityName}"`);
  }

  if (!stores.has(entityName)) {
    stores.set(entityName, createJsonEntityStore(entityName));
  }

  return stores.get(entityName);
};

const isUserEntity = (entityName) => entityName === "User";
const isOrganizationEntity = (entityName) => entityName === "Organization";
const isOrganizationMembershipEntity = (entityName) =>
  entityName === "OrganizationMembership";
const isUserManagementEntity = (entityName) =>
  isUserEntity(entityName) || isOrganizationMembershipEntity(entityName);

const assertCanManageUsers = (req) => {
  if (!canOperateOffice(req.currentUser?.role)) {
    throw new HttpError(403, "Forbidden");
  }
};

const assertCanWriteOrganizationSettings = (req) => {
  if (!canOperateOffice(req.currentUser?.role)) {
    throw new HttpError(403, "Forbidden");
  }
};

const sanitizeUserWritePatch = (currentUser, payload = {}) => {
  const patch = { ...payload };

  if (!canAccessHiddenUsers(currentUser)) {
    delete patch.is_hidden_owner;
    delete patch.owner_panel_enabled;
    delete patch.password_hash;
    delete patch.global_role;
  }

  return patch;
};

const assertEntityAccessAllowed = (entityName, req) => {
  if (canAccessHiddenUsers(req.currentUser) && isTenantScopedEntity(entityName)) {
    throw new HttpError(403, "Owner account cannot access tenant operational data");
  }
};

const syncCurrentOrganizationMembership = async (req, user, roleOverride = null) => {
  const memberships = await membershipStore.filter({
    filter: {
      organization_id: req.currentOrganization.id,
      user_id: user.id,
    },
    limit: 1,
  });
  const membership = memberships[0] || null;

  if (!membership) {
    return null;
  }

  return membershipStore.update(membership.id, {
    user_email: user.email || "",
    user_name: user.full_name || user.email || "Invitado",
    status: membership.status,
    ...(roleOverride ? { role: roleOverride } : {}),
  });
};

const filterUsersForCurrentOrganization = async (items, req) => {
  const memberships = await getOrganizationMembershipsForOrganization(
    req.currentOrganization.id
  );
  const membershipByUserId = new Map(
    memberships.map((membership) => [membership.user_id, membership])
  );

  return filterUsersForViewer(items, req.currentUser)
    .filter((user) => membershipByUserId.has(user.id))
    .map((user) => {
      const membership = membershipByUserId.get(user.id);
      return {
        ...stripSensitiveUserFields(user),
        role: resolveAppRole(user, membership),
        is_active: membership?.status !== "disabled",
      };
    });
};

const sanitizeEntityPayload = async (entityName, value, req) => {
  if (isUserEntity(entityName)) {
    if (Array.isArray(value)) {
      return filterUsersForCurrentOrganization(value, req);
    }

    await assertCanAccessTargetUser(
      req.currentUser,
      value,
      req.currentOrganization?.id
    );
    const memberships = await getOrganizationMembershipsForOrganization(
      req.currentOrganization.id
    );
    const membership = memberships.find((item) => item.user_id === value.id);

    return {
      ...stripSensitiveUserFields(value),
      role: resolveAppRole(value, membership),
      is_active: membership?.status !== "disabled",
    };
  }

  if (isOrganizationEntity(entityName)) {
    if (Array.isArray(value)) {
      if (canAccessHiddenUsers(req.currentUser)) {
        return value;
      }
      return value.filter(
        (organization) => organization.id === req.currentOrganization?.id
      );
    }

    if (
      !value ||
      (value.id !== req.currentOrganization?.id && !canAccessHiddenUsers(req.currentUser))
    ) {
      throw new HttpError(404, "Organization not found");
    }

    return value;
  }

  if (isOrganizationMembershipEntity(entityName)) {
    if (Array.isArray(value)) {
      return value.filter(
        (membership) => membership.organization_id === req.currentOrganization?.id
      );
    }

    if (!value || value.organization_id !== req.currentOrganization?.id) {
      throw new HttpError(404, "Membership not found");
    }

    return value;
  }

  if (entityName === "OrganizationSettings") {
    const viewerRole = req.currentUser?.role;
    if (Array.isArray(value)) {
      return value.map((item) =>
        sanitizeOrgSettingsPricesForRole(
          sanitizeOrganizationSettingsForClient(
            decryptOrganizationSettingsFromStorage(item)
          ),
          viewerRole
        )
      );
    }
    return sanitizeOrgSettingsPricesForRole(
      sanitizeOrganizationSettingsForClient(
        decryptOrganizationSettingsFromStorage(value)
      ),
      viewerRole
    );
  }

  return sanitizeEntityPricesForRole(entityName, value, req.currentUser?.role);
};

const buildScopedFilter = (entityName, req, filter = {}) => {
  if (isTenantScopedEntity(entityName)) {
    return buildTenantFilter(req.currentOrganization.id, filter);
  }

  if (isOrganizationMembershipEntity(entityName)) {
    return {
      ...(filter || {}),
      organization_id: req.currentOrganization.id,
    };
  }

  if (isOrganizationEntity(entityName) && !canAccessHiddenUsers(req.currentUser)) {
    return {
      ...(filter || {}),
      id: req.currentOrganization.id,
    };
  }

  return filter || {};
};

const ensureEntityBelongsToCurrentOrganization = (entityName, req, existing) => {
  if (!existing) {
    throw new HttpError(404, "Record not found");
  }

  if (isTenantScopedEntity(entityName) && existing.organization_id !== req.currentOrganization.id) {
    throw new HttpError(404, "Record not found");
  }

  if (
    isOrganizationMembershipEntity(entityName) &&
    existing.organization_id !== req.currentOrganization.id
  ) {
    throw new HttpError(404, "Record not found");
  }

  if (
    isOrganizationEntity(entityName) &&
    existing.id !== req.currentOrganization.id &&
    !canAccessHiddenUsers(req.currentUser)
  ) {
    throw new HttpError(404, "Organization not found");
  }
};

router.use(requireAuth);

router.get(
  "/:entity",
  asyncHandler(async (req, res) => {
    assertEntityAccessAllowed(req.params.entity, req);
    const store = getStore(req.params.entity);
    const items = await store.filter({
      filter: buildScopedFilter(req.params.entity, req),
      sort: req.query.sort,
      limit: req.query.limit,
    });
    res.json(await sanitizeEntityPayload(req.params.entity, items, req));
  })
);

router.post(
  "/:entity/query",
  asyncHandler(async (req, res) => {
    assertEntityAccessAllowed(req.params.entity, req);
    const store = getStore(req.params.entity);
    const items = await store.filter({
      filter: buildScopedFilter(req.params.entity, req, req.body?.filter || {}),
      sort: req.body?.sort,
      limit: req.body?.limit,
    });
    res.json(await sanitizeEntityPayload(req.params.entity, items, req));
  })
);

router.post(
  "/:entity",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    const entityName = req.params.entity;
    assertEntityAccessAllowed(entityName, req);
    const store = getStore(entityName);
    const requestedRole = req.body?.role;

    if (entityName === "Invoice") {
      throw new HttpError(403, "Las facturas solo se emiten mediante el proceso Veri*factu.");
    }

    if (STOCK_LEDGER_ENTITIES.has(entityName)) {
      throw new HttpError(403, STOCK_LEDGER_FORBIDDEN_MESSAGE);
    }

    if (isUserEntity(entityName) || isOrganizationMembershipEntity(entityName)) {
      assertCanManageUsers(req);
    }

    if (entityName === "OrganizationSettings") {
      assertCanWriteOrganizationSettings(req);
    }

    if (
      isUserEntity(entityName) &&
      requestedRole === "superadmin" &&
      !canAccessHiddenUsers(req.currentUser)
    ) {
      throw new HttpError(403, "Forbidden");
    }

    let payload = isUserEntity(entityName)
      ? sanitizeUserWritePatch(req.currentUser, req.body || {})
      : req.body || {};

    if (isOrganizationEntity(entityName) && !canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    if (isOrganizationMembershipEntity(entityName)) {
      if ((payload.status || "active") !== "disabled") {
        await assertSeatAvailableForOrganization(req.currentOrganization.id, 1);
      }

      payload.organization_id = req.currentOrganization.id;
      payload.organization_name = req.currentOrganization.name;
      payload.role = normalizeOrganizationRole(payload.role);
    }

    if (isTenantScopedEntity(entityName)) {
      payload.organization_id = req.currentOrganization.id;
    }

    if (shouldApplyServerPricing(entityName, payload)) {
      payload = await applyServerPricing(entityName, payload, null, {
        role: req.currentUser?.role,
        organizationId: req.currentOrganization.id,
      });
    }

    if (entityName === "OrganizationSettings") {
      payload = encryptOrganizationSettingsForStorage(payload);
    }

    const created = await store.create(payload);

    if (isUserEntity(entityName)) {
      await syncMembershipSnapshotForUser(created);
    }

    res.status(201).json(await sanitizeEntityPayload(entityName, created, req));
  })
);

router.patch(
  "/:entity/:id",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    const entityName = req.params.entity;
    assertEntityAccessAllowed(entityName, req);
    const store = getStore(entityName);
    const existingItems = await store.filter({
      filter: { id: req.params.id },
      limit: 1,
    });
    const existing = existingItems[0] || null;

    ensureEntityBelongsToCurrentOrganization(entityName, req, existing);

    if (STOCK_LEDGER_ENTITIES.has(entityName)) {
      throw new HttpError(403, STOCK_LEDGER_FORBIDDEN_MESSAGE);
    }

    if (
      entityName === "Material" &&
      existing &&
      existing.category !== "gas_refrigerante" &&
      Object.prototype.hasOwnProperty.call(req.body || {}, "stock_quantity") &&
      Number(req.body.stock_quantity) !== Number(existing.stock_quantity || 0)
    ) {
      throw new HttpError(
        422,
        "El stock de un material se modifica desde las operaciones de stock (entradas, traspasos o ajuste por recuento), no editando la ficha."
      );
    }

    if (entityName === "Invoice") {
      assertInvoicePaymentPatch(req);
    }

    if (entityName === "OrganizationSettings") {
      assertCanWriteOrganizationSettings(req);
    }

    if (isUserEntity(entityName) || isOrganizationMembershipEntity(entityName)) {
      assertCanManageUsers(req);
    }

    if (isUserEntity(entityName)) {
      await assertCanAccessTargetUser(
        req.currentUser,
        existing,
        req.currentOrganization?.id
      );
    }

    const requestedRole = req.body?.role;
    if (
      isUserEntity(entityName) &&
      requestedRole === "superadmin" &&
      !canAccessHiddenUsers(req.currentUser)
    ) {
      throw new HttpError(403, "Forbidden");
    }

    let patch = isUserEntity(entityName)
      ? sanitizeUserWritePatch(req.currentUser, req.body || {})
      : req.body || {};
    const membershipRolePatch =
      isUserEntity(entityName) &&
      Object.prototype.hasOwnProperty.call(req.body || {}, "role") &&
      !canAccessHiddenUsers(req.currentUser)
        ? normalizeOrganizationRole(requestedRole)
        : null;
    const membershipStatusPatch =
      isUserEntity(entityName) &&
      Object.prototype.hasOwnProperty.call(req.body || {}, "is_active") &&
      !canAccessHiddenUsers(req.currentUser)
        ? req.body?.is_active === false
          ? "disabled"
          : "active"
        : null;

    if (membershipRolePatch) {
      delete patch.role;
    }
    if (membershipStatusPatch) {
      delete patch.is_active;
    }

    if (isOrganizationEntity(entityName) && !canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    if (isTenantScopedEntity(entityName)) {
      patch.organization_id = req.currentOrganization.id;
    }

    if (shouldApplyServerPricing(entityName, patch)) {
      patch = await applyServerPricing(entityName, patch, existing, {
        role: req.currentUser?.role,
        organizationId: req.currentOrganization.id,
      });
    }

    if (entityName === "OrganizationSettings") {
      patch = prepareOrganizationSettingsPatchForStorage(patch);
    }

    if (isOrganizationMembershipEntity(entityName)) {
      if (
        (patch.status || existing.status || "active") !== "disabled" &&
        existing.status === "disabled"
      ) {
        await assertSeatAvailableForOrganization(req.currentOrganization.id, 1);
      }

      patch.organization_id = req.currentOrganization.id;
      patch.organization_name = req.currentOrganization.name;
      patch.role = normalizeOrganizationRole(patch.role || existing.role);
    }

    const updated = await store.update(req.params.id, patch);

    if (!updated) {
      throw new HttpError(404, "Record not found");
    }

    if (isUserEntity(entityName)) {
      await syncMembershipSnapshotForUser(updated, {
        includeRole: canAccessHiddenUsers(req.currentUser),
        includeStatus: canAccessHiddenUsers(req.currentUser),
      });
      const currentMemberships = await membershipStore.filter({
        filter: {
          organization_id: req.currentOrganization.id,
          user_id: updated.id,
        },
        limit: 1,
      });
      const currentMembership = currentMemberships[0] || null;

      if (
        membershipStatusPatch === "active" &&
        currentMembership?.status === "disabled"
      ) {
        await assertSeatAvailableForOrganization(req.currentOrganization.id, 1);
      }

      if (currentMembership) {
        await membershipStore.update(currentMembership.id, {
          user_email: updated.email || "",
          user_name: updated.full_name || updated.email || "Invitado",
          status: membershipStatusPatch || currentMembership.status,
          ...(membershipRolePatch ? { role: membershipRolePatch } : {}),
        });
      } else {
        await syncCurrentOrganizationMembership(req, updated, membershipRolePatch);
      }
    }

    res.json(await sanitizeEntityPayload(entityName, updated, req));
  })
);

router.delete(
  "/:entity/:id",
  asyncHandler(async (req, res) => {
    assertLicenseAllowsWrite(req);
    const entityName = req.params.entity;
    assertEntityAccessAllowed(entityName, req);
    const store = getStore(entityName);
    const existingItems = await store.filter({
      filter: { id: req.params.id },
      limit: 1,
    });
    const existing = existingItems[0] || null;

    ensureEntityBelongsToCurrentOrganization(entityName, req, existing);

    if (entityName === "OrganizationSettings") {
      assertCanWriteOrganizationSettings(req);
    }

    if (isUserManagementEntity(entityName)) {
      assertCanManageUsers(req);
    }

    if (isUserEntity(entityName)) {
      await assertCanAccessTargetUser(
        req.currentUser,
        existing,
        req.currentOrganization?.id
      );

      const currentMemberships = await membershipStore.filter({
        filter: {
          organization_id: req.currentOrganization.id,
          user_id: existing.id,
        },
      });

      for (const membership of currentMemberships) {
        await membershipStore.delete(membership.id);
      }

      const remainingMemberships = await membershipStore.filter({
        filter: { user_id: existing.id },
      });

      if (remainingMemberships.length === 0) {
        const removedUser = await store.delete(req.params.id);

        if (!removedUser) {
          throw new HttpError(404, "Record not found");
        }
      }

      return res.status(204).send();
    }

    if (isOrganizationEntity(entityName)) {
      throw new HttpError(403, "Organizations cannot be deleted from the generic entity API");
    }

    if (isOrganizationMembershipEntity(entityName)) {
      const removed = await membershipStore.delete(req.params.id);

      if (!removed) {
        throw new HttpError(404, "Record not found");
      }

      return res.status(204).send();
    }

    if (NON_DELETABLE_OPERATIONAL_ENTITIES.has(entityName)) {
      throw new HttpError(403, OPERATIONAL_DELETE_FORBIDDEN_MESSAGE);
    }

    const removed = await store.delete(req.params.id);

    if (!removed) {
      throw new HttpError(404, "Record not found");
    }

    res.status(204).send();
  })
);

export default router;
