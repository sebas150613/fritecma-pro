import { createJsonEntityStore } from "../lib/json-store.js";
import { isKnownEntity } from "../lib/entity-registry.js";
import {
  getOrganizationMembershipStore,
  getOrganizationStore,
  getTenantScopedEntityNames,
} from "../lib/tenant.js";
import { getUserStore } from "../lib/auth.js";

/** Extra entities not generated from app-schema but tenant-scoped when present */
const EXTRA_TENANT_ENTITIES = ["StockEntry"];

/**
 * Deletes all persisted data for one organization (tenant stores + memberships + org row).
 * Only for the owner hard-delete endpoint — not exposed via generic entity DELETE.
 */
export async function purgeOrganizationCompletely(organizationId) {
  const membershipStore = getOrganizationMembershipStore();
  const organizationStore = getOrganizationStore();
  const userStore = getUserStore();

  const entityNames = [
    ...getTenantScopedEntityNames(),
    ...EXTRA_TENANT_ENTITIES.filter((name) => isKnownEntity(name)),
  ];

  for (const entityName of entityNames) {
    const store = createJsonEntityStore(entityName);
    const items = await store.filter({
      filter: { organization_id: organizationId },
      limit: 100000,
    });
    for (const item of items) {
      await store.delete(item.id);
    }
  }

  const memberships = await membershipStore.filter({
    filter: { organization_id: organizationId },
    limit: 100000,
  });
  const affectedUserIds = new Set(memberships.map((m) => m.user_id));

  for (const m of memberships) {
    await membershipStore.delete(m.id);
  }

  for (const userId of affectedUserIds) {
    const remaining = await membershipStore.filter({
      filter: { user_id: userId },
      limit: 100,
    });
    if (remaining.length > 0) {
      continue;
    }
    const users = await userStore.filter({ filter: { id: userId }, limit: 1 });
    const user = users[0];
    if (user && user.is_hidden_owner !== true) {
      await userStore.delete(userId);
    }
  }

  const removedOrg = await organizationStore.delete(organizationId);
  if (!removedOrg) {
    throw new Error("Failed to delete organization record");
  }
}
