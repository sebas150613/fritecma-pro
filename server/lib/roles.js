export const GLOBAL_ROLE_SUPERADMIN = "superadmin";

export const ORGANIZATION_ROLES = [
  "admin",
  "oficina",
  "tecnico",
  "ayudante",
];

export const LEGACY_ROLE_ALIASES = {
  encargado: "admin",
  user: "tecnico",
};

export const normalizeOrganizationRole = (value, fallback = "tecnico") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === GLOBAL_ROLE_SUPERADMIN) {
    return "admin";
  }

  if (LEGACY_ROLE_ALIASES[normalized]) {
    return LEGACY_ROLE_ALIASES[normalized];
  }

  if (ORGANIZATION_ROLES.includes(normalized)) {
    return normalized;
  }

  return fallback;
};

export const normalizeGlobalRole = (value, { isHiddenOwner = false } = {}) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (isHiddenOwner || normalized === GLOBAL_ROLE_SUPERADMIN) {
    return GLOBAL_ROLE_SUPERADMIN;
  }

  return null;
};

export const resolveAppRole = (user, membership = null) => {
  const globalRole = normalizeGlobalRole(user?.global_role || user?.role, {
    isHiddenOwner: user?.is_hidden_owner === true,
  });

  if (globalRole) {
    return globalRole;
  }

  return normalizeOrganizationRole(membership?.role || user?.role);
};

export const isOrganizationRole = (value) =>
  ORGANIZATION_ROLES.includes(normalizeOrganizationRole(value));

export const canManageOrganization = (role) =>
  [GLOBAL_ROLE_SUPERADMIN, "admin"].includes(resolveAppRole({ role }));

export const canOperateOffice = (role) =>
  [GLOBAL_ROLE_SUPERADMIN, "admin", "oficina"].includes(resolveAppRole({ role }));
