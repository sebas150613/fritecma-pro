import { createJsonEntityStore } from "./json-store.js";
import { knownEntities } from "./entity-registry.js";

const organizationStore = createJsonEntityStore("Organization");
const membershipStore = createJsonEntityStore("OrganizationMembership");
const organizationSettingsStore = createJsonEntityStore("OrganizationSettings");

const GLOBAL_ENTITY_NAMES = new Set([
  "User",
  "Organization",
  "OrganizationMembership",
  "SubscriptionPlan",
]);

export const DEFAULT_ORGANIZATION_ID = "org-frigest";

export const ORGANIZATION_SETTINGS_FIELDS = [
  "verifactu_nif",
  "verifactu_nombre",
  "verifactu_cert_uri",
  "verifactu_cert_password",
  "verifactu_produccion",
  "emisor_direccion",
  "emisor_telefono",
  "emisor_logo_url",
  "tarifa_1_oficial_normal",
  "tarifa_1_oficial_extra",
  "tarifa_1_oficial_nocturna",
  "tarifa_1_oficial_festiva",
  "tarifa_oficial_ayudante_normal",
  "tarifa_oficial_ayudante_extra",
  "tarifa_oficial_ayudante_nocturna",
  "tarifa_oficial_ayudante_festiva",
  "desplazamiento_tramos_json",
  "pedidos_email_from",
  "pedidos_email_from_name",
  "pedidos_reply_to",
  "pedidos_entrega_direccion",
  "pedidos_entrega_contacto",
  "pedidos_entrega_telefono",
  "pedidos_entrega_observaciones",
];

export const getOrganizationStore = () => organizationStore;
export const getOrganizationMembershipStore = () => membershipStore;
export const getOrganizationSettingsStore = () => organizationSettingsStore;

export const isTenantScopedEntity = (entityName) =>
  knownEntities.includes(entityName) && !GLOBAL_ENTITY_NAMES.has(entityName);

export const getTenantScopedEntityNames = () =>
  knownEntities.filter((entityName) => !GLOBAL_ENTITY_NAMES.has(entityName));

export const normalizeOrganizationSlug = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "organization";

export const sanitizeOrganizationForViewer = (organization) => {
  if (!organization) {
    return null;
  }

  return organization;
};

export const sanitizeOrganizationMembership = (membership) => {
  if (!membership) {
    return null;
  }

  return membership;
};

export const mergeOrganizationSettingsIntoUser = (
  user,
  organization,
  organizationSettings,
  memberships = []
) => {
  if (!user) {
    return null;
  }

  return {
    ...user,
    ...(organizationSettings || {}),
    current_organization: sanitizeOrganizationForViewer(organization),
    current_organization_settings: organizationSettings || null,
    organization_memberships: memberships.map(sanitizeOrganizationMembership),
  };
};

export const splitOrganizationSettingsPatch = (payload = {}) => {
  const userPatch = { ...payload };
  const organizationSettingsPatch = {};

  for (const field of ORGANIZATION_SETTINGS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(userPatch, field)) {
      organizationSettingsPatch[field] = userPatch[field];
      delete userPatch[field];
    }
  }

  return {
    userPatch,
    organizationSettingsPatch,
  };
};

export const buildTenantFilter = (organizationId, filter = {}) => ({
  ...(filter || {}),
  organization_id: organizationId,
});
