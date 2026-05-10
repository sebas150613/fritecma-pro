import { createJsonEntityStore } from "./json-store.js";
import { knownEntities } from "./entity-registry.js";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  maybeDecryptSecret,
} from "./secret-crypto.js";

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
  "pedidos_smtp_host",
  "pedidos_smtp_port",
  "pedidos_smtp_secure",
  "pedidos_smtp_user",
  "pedidos_smtp_pass",
  "pedidos_smtp_enabled",
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

/**
 * True if this OrganizationSettings field name must never be sent to the client with its stored value.
 * Does not treat *_configured flags as secret-bearing keys.
 */
export const isSensitiveOrganizationSettingsKey = (key) => {
  if (typeof key !== "string" || key.length === 0) {
    return false;
  }
  const lower = key.toLowerCase();
  if (lower.endsWith("_configured")) {
    return false;
  }
  if (lower.includes("password")) {
    return true;
  }
  if (lower.includes("cert_password")) {
    return true;
  }
  if (lower.includes("secret")) {
    return true;
  }
  if (lower.includes("api_key")) {
    return true;
  }
  if (lower.includes("token")) {
    return true;
  }
  if (lower.includes("pass")) {
    return true;
  }
  return false;
};

const isSecretValuePresent = (value) => {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return Boolean(value);
};

/**
 * API/client response: strips secret fields and adds *_configured booleans.
 * Persistence and server-side handlers should use raw settings from store / req.currentOrganizationSettings.
 */
export const sanitizeOrganizationSettingsForClient = (settings) => {
  if (!settings || typeof settings !== "object") {
    return null;
  }

  const result = {};

  for (const [key, value] of Object.entries(settings)) {
    if (isSensitiveOrganizationSettingsKey(key)) {
      result[`${key}_configured`] = isSecretValuePresent(value);
      continue;
    }
    result[key] = value;
  }

  /** Stable API shape: *_configured for known org secret fields even when the raw key is absent. */
  for (const field of ORGANIZATION_SETTINGS_FIELDS) {
    if (!isSensitiveOrganizationSettingsKey(field)) {
      continue;
    }
    const flag = `${field}_configured`;
    if (!Object.prototype.hasOwnProperty.call(result, flag)) {
      result[flag] = false;
    }
  }

  return result;
};

/** Persist: encrypt sensitive OrganizationSettings fields (AES-256-GCM, enc:v1:…). */
export const prepareOrganizationSettingsPatchForStorage = (
  patch = {},
  options = {}
) => {
  if (!patch || typeof patch !== "object") {
    return patch;
  }

  const out = {};
  for (const key of Object.keys(patch)) {
    const v = patch[key];
    if (!isSensitiveOrganizationSettingsKey(key)) {
      out[key] = v;
      continue;
    }
    if (v === undefined) {
      continue;
    }
    if (v === null || v === "") {
      out[key] = v;
      continue;
    }
    const s = String(v);
    if (isEncryptedSecret(s)) {
      out[key] = s;
      continue;
    }
    out[key] = encryptSecret(s, options);
  }
  return out;
};

export const encryptOrganizationSettingsForStorage = (settings, options = {}) =>
  prepareOrganizationSettingsPatchForStorage({ ...settings }, options);

/** Load from store for server use: decrypt sensitive fields (legacy plaintext unchanged). */
export const decryptOrganizationSettingsFromStorage = (settings, options = {}) => {
  if (!settings || typeof settings !== "object") {
    return settings;
  }

  const out = { ...settings };
  for (const key of Object.keys(out)) {
    if (!isSensitiveOrganizationSettingsKey(key)) {
      continue;
    }
    const v = out[key];
    if (v === null || v === undefined || v === "") {
      continue;
    }
    out[key] = decryptSecret(String(v), options);
  }
  return out;
};

/** Softer decrypt (wrong key leaves ciphertext) — tooling/migration only. */
export const maybeDecryptOrganizationSettings = (settings, options = {}) => {
  if (!settings || typeof settings !== "object") {
    return settings;
  }

  const out = { ...settings };
  for (const key of Object.keys(out)) {
    if (!isSensitiveOrganizationSettingsKey(key)) {
      continue;
    }
    const v = out[key];
    if (v === null || v === undefined || v === "") {
      continue;
    }
    out[key] = maybeDecryptSecret(String(v), options);
  }
  return out;
};

/**
 * Overlays decrypted org secret field values onto a user object for **server-only** handlers
 * (e.g. VeriFactu). API responses must still use `req.currentUser` from merge without this overlay.
 */
export const mergeDecryptedOrgSecretsForServer = (user, orgSettings) => {
  if (!user) {
    return user;
  }
  if (!orgSettings || typeof orgSettings !== "object") {
    return user;
  }
  const out = { ...user };
  for (const key of Object.keys(orgSettings)) {
    if (!isSensitiveOrganizationSettingsKey(key)) {
      continue;
    }
    const v = orgSettings[key];
    if (v != null && v !== "") {
      out[key] = v;
    }
  }
  return out;
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

  const safeSettings = sanitizeOrganizationSettingsForClient(organizationSettings);

  return {
    ...user,
    ...(safeSettings || {}),
    current_organization: sanitizeOrganizationForViewer(organization),
    current_organization_settings: safeSettings,
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
