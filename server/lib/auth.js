import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createJsonEntityStore, createJsonFileStore } from "./json-store.js";
import { HttpError } from "./http-error.js";
import { serverConfig } from "../config.js";
import {
  DEFAULT_ORGANIZATION_ID,
  ORGANIZATION_SETTINGS_FIELDS,
  getOrganizationMembershipStore,
  getOrganizationSettingsStore,
  getOrganizationStore,
  getTenantScopedEntityNames,
  mergeOrganizationSettingsIntoUser,
  normalizeOrganizationSlug,
} from "./tenant.js";
import {
  GLOBAL_ROLE_SUPERADMIN,
  normalizeGlobalRole,
  normalizeOrganizationRole,
  resolveAppRole,
} from "./roles.js";
import { getOrganizationSubscription } from "../services/billing-service.js";
import {
  LICENSE_READ_ONLY_MESSAGE,
  isLicenseRestrictedStatus,
} from "./license.js";

const userStore = createJsonEntityStore("User");
const sessionStore = createJsonFileStore("auth-sessions.json", {});
const organizationStore = getOrganizationStore();
const membershipStore = getOrganizationMembershipStore();
const organizationSettingsStore = getOrganizationSettingsStore();

const defaultAdmin = {
  id: "local-admin",
  email: "admin@local.test",
  full_name: "Administrador Local",
  role: "admin",
  is_active: true,
};

const defaultOffice = {
  id: "local-office",
  email: "oficina@local.test",
  full_name: "Oficina Local",
  role: "oficina",
  is_active: true,
};

const defaultTechnician = {
  id: "local-tech",
  email: "tecnico@local.test",
  full_name: "Tecnico Local",
  role: "tecnico",
  is_active: true,
};

const defaultHelper = {
  id: "local-helper",
  email: "ayudante@local.test",
  full_name: "Ayudante Local",
  role: "ayudante",
  is_active: true,
};

const hiddenOwnerSeed = {
  id: "owner-se-adrover",
  email: "s.estela.adrover@gmail.com",
  full_name: "Owner",
  role: "superadmin",
  global_role: "superadmin",
  is_active: true,
  is_hidden_owner: true,
  owner_panel_enabled: true,
  password_hash:
    "scrypt$596c6281cd7b488bafc5e757e488fbab$9225acfbb8e84d7a2d932767832067d677048b67a8dbdbf0e126feea4b9ba6eedf86fb4741c87b0bfe777c552d7fad03c2d475ed24d341e468f6b6f926b138b7",
};

const seedUsers = [
  defaultAdmin,
  defaultOffice,
  defaultTechnician,
  defaultHelper,
  hiddenOwnerSeed,
];
const seedUserIds = new Set(seedUsers.map((user) => user.id));
let bootstrapPromise = null;

const verifyPasswordHash = (rawPassword, storedHash) => {
  if (!rawPassword || !storedHash || !storedHash.startsWith("scrypt$")) {
    return false;
  }

  const [, salt, hash] = storedHash.split("$");
  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(String(rawPassword), salt, 64);
  const expected = Buffer.from(hash, "hex");

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
};

export const createPasswordHash = (rawPassword) => {
  const normalizedPassword = String(rawPassword || "");
  if (normalizedPassword.length < 8) {
    throw new HttpError(422, "Password must contain at least 8 characters");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizedPassword, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
};

const pickFirst = (items) => (Array.isArray(items) && items.length > 0 ? items[0] : null);

const normalizeUserRolePatch = (user) => {
  if (!user) {
    return {};
  }

  const nextGlobalRole = normalizeGlobalRole(user.global_role || user.role, {
    isHiddenOwner: user.is_hidden_owner === true,
  });
  const nextRole = nextGlobalRole
    ? GLOBAL_ROLE_SUPERADMIN
    : normalizeOrganizationRole(user.role);
  const patch = {};

  if ((user.global_role || null) !== nextGlobalRole) {
    patch.global_role = nextGlobalRole;
  }

  if ((user.role || null) !== nextRole) {
    patch.role = nextRole;
  }

  return patch;
};

const pickLegacyOrganizationSettings = (users = []) => {
  const source =
    users.find((user) => user?.verifactu_nif || user?.verifactu_nombre) ||
    users.find((user) => user?.role === "admin") ||
    users.find((user) => user?.is_hidden_owner === true) ||
    null;

  if (!source) {
    return {};
  }

  return ORGANIZATION_SETTINGS_FIELDS.reduce((acc, field) => {
    if (source[field] !== undefined) {
      acc[field] = source[field];
    }
    return acc;
  }, {});
};

export const isHiddenOwner = (user) => user?.is_hidden_owner === true;
export const canAccessHiddenUsers = (user) => isHiddenOwner(user);

export const sanitizeUserForViewer = (user, viewer) => {
  if (!user) {
    return null;
  }

  if (canAccessHiddenUsers(viewer)) {
    return user;
  }

  if (isHiddenOwner(user)) {
    return null;
  }

  return user;
};

export const stripSensitiveUserFields = (user) => {
  if (!user) {
    return null;
  }

  const {
    password_hash,
    invitation_token,
    password_reset_token,
    ...safeUser
  } = user;
  void password_hash;
  void invitation_token;
  void password_reset_token;
  return safeUser;
};

export const filterUsersForViewer = (users, viewer) =>
  (Array.isArray(users) ? users : []).filter((user) => sanitizeUserForViewer(user, viewer));

const ensureSeedUsers = async () => {
  const users = await userStore.list();

  if (users.length === 0) {
    await userStore.upsertSeed(seedUsers);
    return;
  }

  for (const seedUser of seedUsers) {
    const existing = users.find((user) => user.id === seedUser.id || user.email === seedUser.email);

    if (!existing) {
      await userStore.create(seedUser);
      continue;
    }

    const patch = {};

    if (existing.role !== seedUser.role) {
      patch.role = seedUser.role;
    }
    if ((existing.global_role || null) !== (seedUser.global_role || null)) {
      patch.global_role = seedUser.global_role || null;
    }
    if (existing.is_hidden_owner !== seedUser.is_hidden_owner) {
      patch.is_hidden_owner = seedUser.is_hidden_owner;
    }
    if (existing.owner_panel_enabled !== seedUser.owner_panel_enabled) {
      patch.owner_panel_enabled = seedUser.owner_panel_enabled;
    }
    if (existing.is_active === false && seedUser.is_hidden_owner) {
      patch.is_active = true;
    }
    if (seedUser.password_hash && existing.password_hash !== seedUser.password_hash) {
      patch.password_hash = seedUser.password_hash;
    }

    if (Object.keys(patch).length > 0) {
      await userStore.update(existing.id, patch);
    }
  }

  for (const user of await userStore.list()) {
    const patch = normalizeUserRolePatch(user);
    if (Object.keys(patch).length > 0) {
      await userStore.update(user.id, patch);
    }
  }
};

const ensureDefaultOrganization = async (users) => {
  const organizations = await organizationStore.list();
  const existingDefault =
    organizations.find((organization) => organization.id === DEFAULT_ORGANIZATION_ID) ||
    organizations[0] ||
    null;

  const legacySettings = pickLegacyOrganizationSettings(users);
  const fallbackName =
    legacySettings.verifactu_nombre ||
    organizations[0]?.name ||
    "FRIGEST";

  if (existingDefault) {
    const patch = {};
    if (!existingDefault.name && fallbackName) {
      patch.name = fallbackName;
    }
    if (!existingDefault.slug) {
      patch.slug = normalizeOrganizationSlug(fallbackName);
    }
    if (existingDefault.is_active === false) {
      patch.is_active = true;
    }

    if (Object.keys(patch).length > 0) {
      return organizationStore.update(existingDefault.id, patch);
    }

    return existingDefault;
  }

  return organizationStore.create({
    id: DEFAULT_ORGANIZATION_ID,
    name: fallbackName,
    slug: normalizeOrganizationSlug(fallbackName),
    is_active: true,
    plan_code: "starter",
  });
};

const ensureMembershipsForUsers = async (organization, users) => {
  const memberships = await membershipStore.list();

  for (const user of users) {
    if (!user?.id) {
      continue;
    }

    if (!seedUserIds.has(user.id)) {
      continue;
    }

    const existing = memberships.find(
      (membership) =>
        membership.organization_id === organization.id && membership.user_id === user.id
    );

    const snapshot = {
      organization_name: organization.name,
      user_email: user.email || "",
      user_name: user.full_name || user.email || "Invitado",
      role: normalizeOrganizationRole(user.role),
      status: user.is_active === false ? "disabled" : "active",
    };

    if (!existing) {
      await membershipStore.create({
        organization_id: organization.id,
        ...snapshot,
        user_id: user.id,
      });
      continue;
    }

    const patch = {};
    for (const [key, value] of Object.entries(snapshot)) {
      if (existing[key] !== value) {
        patch[key] = value;
      }
    }

    if (Object.keys(patch).length > 0) {
      await membershipStore.update(existing.id, patch);
    }
  }
};

const ensureOrganizationSettings = async (organization, users) => {
  const existing = pickFirst(
    await organizationSettingsStore.filter({
      filter: { organization_id: organization.id },
      limit: 1,
    })
  );
  const legacySettings = pickLegacyOrganizationSettings(users);

  if (!existing) {
    await organizationSettingsStore.create({
      organization_id: organization.id,
      ...legacySettings,
    });
    return;
  }

  const patch = {};
  for (const field of ORGANIZATION_SETTINGS_FIELDS) {
    if (
      (existing[field] === undefined || existing[field] === "") &&
      legacySettings[field] !== undefined &&
      legacySettings[field] !== ""
    ) {
      patch[field] = legacySettings[field];
    }
  }

  if (Object.keys(patch).length > 0) {
    await organizationSettingsStore.update(existing.id, patch);
  }
};

const backfillTenantEntities = async (organizationId) => {
  for (const entityName of getTenantScopedEntityNames()) {
    const store = createJsonEntityStore(entityName);
    const records = await store.list();

    for (const record of records) {
      if (record?.organization_id) {
        continue;
      }

      await store.update(record.id, {
        organization_id: organizationId,
      });
    }
  }
};

const normalizeMembershipRoles = async () => {
  const memberships = await membershipStore.list();

  for (const membership of memberships) {
    const nextRole = normalizeOrganizationRole(membership.role);
    if (membership.role !== nextRole) {
      await membershipStore.update(membership.id, {
        role: nextRole,
      });
    }
  }
};

export const syncMembershipSnapshotForUser = async (
  user,
  { includeRole = true, includeStatus = true } = {}
) => {
  if (!user?.id) {
    return;
  }

  const memberships = await membershipStore.filter({
    filter: { user_id: user.id },
  });

  for (const membership of memberships) {
    const patch = {};
    const nextStatus = user.is_active === false ? "disabled" : "active";

    if (membership.user_email !== (user.email || "")) {
      patch.user_email = user.email || "";
    }
    if (membership.user_name !== (user.full_name || user.email || "Invitado")) {
      patch.user_name = user.full_name || user.email || "Invitado";
    }
    if (includeRole && membership.role !== normalizeOrganizationRole(user.role)) {
      patch.role = normalizeOrganizationRole(user.role);
    }
    if (includeStatus && membership.status !== nextStatus) {
      patch.status = nextStatus;
    }

    if (Object.keys(patch).length > 0) {
      await membershipStore.update(membership.id, patch);
    }
  }
};

export const ensureSaasBootstrap = async () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensureSeedUsers();
      const users = await userStore.list();
      const organization = await ensureDefaultOrganization(users);
      await ensureMembershipsForUsers(organization, users);
      await normalizeMembershipRoles();
      await ensureOrganizationSettings(organization, users);
      await backfillTenantEntities(organization.id);
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
};

const extractToken = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
};

const readSessions = async () => {
  const sessions = await sessionStore.read();
  return sessions && typeof sessions === "object" ? sessions : {};
};

const writeSessions = async (sessions) => sessionStore.write(sessions);

const getUserById = async (id) => {
  const users = await userStore.list();
  return users.find((user) => user.id === id) || null;
};

const getUserByEmail = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const users = await userStore.list();
  return (
    users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail) || null
  );
};

export const getOrganizationMembershipsForUser = async (userId) => {
  const memberships = await membershipStore.filter({
    filter: { user_id: userId },
  });

  return memberships
    .filter((membership) => membership.status !== "disabled")
    .sort((left, right) => String(left.organization_name || "").localeCompare(right.organization_name || ""));
};

export const getOrganizationMembershipsForOrganization = async (organizationId) => {
  return membershipStore.filter({
    filter: { organization_id: organizationId },
  });
};

const getOrganizationById = async (organizationId) => {
  const organizations = await organizationStore.filter({
    filter: { id: organizationId },
    limit: 1,
  });
  return organizations[0] || null;
};

const getOrganizationSettingsForOrganization = async (organizationId) => {
  const settings = await organizationSettingsStore.filter({
    filter: { organization_id: organizationId },
    limit: 1,
  });

  return settings[0] || null;
};

const createResolvedAuthContext = async (user, preferredOrganizationId) => {
  const memberships = await getOrganizationMembershipsForUser(user.id);

  if (!memberships[0]) {
    throw new HttpError(403, "User not registered for this app");
  }

  const selectedMembership =
    memberships.find((membership) => membership.organization_id === preferredOrganizationId) ||
    memberships[0];

  const organization = await getOrganizationById(selectedMembership.organization_id);

  if (!organization || organization.is_active === false) {
    throw new HttpError(403, "Organization is not active");
  }

  const organizationSettings = await getOrganizationSettingsForOrganization(organization.id);
  const resolvedRole = resolveAppRole(user, selectedMembership);
  const subscription = isHiddenOwner(user)
    ? null
    : await getOrganizationSubscription(organization.id);
  const licenseStatus = subscription?.status || "active";
  const licenseIsRestricted = isLicenseRestrictedStatus(licenseStatus);

  if (licenseIsRestricted && ["tecnico", "ayudante"].includes(resolvedRole)) {
    throw new HttpError(403, "No se puede iniciar sesión actualmente.");
  }

  const currentUser = {
    ...mergeOrganizationSettingsIntoUser(
      stripSensitiveUserFields(user),
      organization,
      organizationSettings,
      memberships
    ),
    role: resolvedRole,
    current_membership_id: selectedMembership.id,
    license_status: licenseStatus,
    license_read_only:
      licenseIsRestricted && ["admin", "oficina", "encargado", "superadmin"].includes(resolvedRole),
    ...(licenseIsRestricted
      ? { license_message: LICENSE_READ_ONLY_MESSAGE }
      : {}),
  };

  return {
    currentUser,
    currentOrganization: organization,
    currentOrganizationMembership: selectedMembership,
    currentOrganizationSettings: organizationSettings,
    currentMemberships: memberships,
  };
};

const resolveAuthenticatedBaseUser = async (req) => {
  await ensureSaasBootstrap();

  const token = extractToken(req);
  const users = await userStore.list();
  const visibleUsers = filterUsersForViewer(users, null);
  const sessions = token ? await readSessions() : {};
  const session = token ? sessions[token] : null;

  if (session?.userId) {
    const user = users.find((item) => item.id === session.userId);

    if (user && user.is_active !== false) {
      return {
        user,
        sessionToken: token,
        session,
      };
    }
  }

  if (token && token === serverConfig.devToken) {
    if (
      !serverConfig.isProduction &&
      process.env.APP_SMOKE_OWNER === "true" &&
      String(req.headers["x-smoke-owner"] || "").toLowerCase() === "true"
    ) {
      return {
        user: hiddenOwnerSeed,
        sessionToken: null,
        session: null,
      };
    }

    return {
      user: visibleUsers.find((user) => user.is_active !== false) || defaultAdmin,
      sessionToken: null,
      session: null,
    };
  }

  void req;

  if (!token && serverConfig.allowAuthBypass) {
    return {
      user: visibleUsers.find((user) => user.is_active !== false) || defaultAdmin,
      sessionToken: null,
      session: null,
    };
  }

  throw new HttpError(401, "Authentication required");
};

export const resolveCurrentAuthContext = async (req) => {
  const { user, sessionToken, session } = await resolveAuthenticatedBaseUser(req);
  const preferredOrganizationId =
    session?.organizationId ||
    req.headers["x-organization-id"]?.toString() ||
    null;
  const context = await createResolvedAuthContext(user, preferredOrganizationId);

  return {
    ...context,
    sessionToken,
    session,
  };
};

export const resolveCurrentUser = async (req) => {
  const context = await resolveCurrentAuthContext(req);
  return context.currentUser;
};

export const assertCanAccessTargetUser = async (
  viewer,
  targetUser,
  organizationId = null
) => {
  if (!targetUser) {
    throw new HttpError(404, "User not found");
  }

  if (isHiddenOwner(targetUser) && !canAccessHiddenUsers(viewer)) {
    throw new HttpError(404, "User not found");
  }

  if (!organizationId || canAccessHiddenUsers(viewer)) {
    return;
  }

  const memberships = await getOrganizationMembershipsForOrganization(organizationId);
  const targetMembership = memberships.find((membership) => membership.user_id === targetUser.id);

  if (!targetMembership) {
    throw new HttpError(404, "User not found");
  }
};

export const createSessionForUser = async (
  userId,
  { allowHiddenOwner = false, organizationId = null } = {}
) => {
  await ensureSaasBootstrap();
  const user = await getUserById(userId);

  if (!user || user.is_active === false || (isHiddenOwner(user) && !allowHiddenOwner)) {
    throw new HttpError(404, "User not found");
  }

  const memberships = await getOrganizationMembershipsForUser(user.id);
  const selectedMembership =
    memberships.find((membership) => membership.organization_id === organizationId) ||
    memberships[0] ||
    null;

  if (!selectedMembership) {
    throw new HttpError(403, "User not registered for any organization");
  }

  const token = randomUUID();
  const sessions = await readSessions();
  sessions[token] = {
    userId: user.id,
    organizationId: selectedMembership.organization_id,
    createdAt: new Date().toISOString(),
  };
  await writeSessions(sessions);

  const context = await createResolvedAuthContext(user, selectedMembership.organization_id);

  return {
    token,
    user: context.currentUser,
    organization: context.currentOrganization,
  };
};

export const createSessionForCredentials = async (
  email,
  password,
  { allowHiddenOwner = false, organizationId = null } = {}
) => {
  await ensureSaasBootstrap();
  const candidate = await getUserByEmail(email);

  if (!candidate || candidate.is_active === false) {
    throw new HttpError(401, "Credenciales invalidas");
  }

  if (isHiddenOwner(candidate) && !allowHiddenOwner) {
    throw new HttpError(401, "Credenciales invalidas");
  }

  if (!verifyPasswordHash(password, candidate.password_hash)) {
    throw new HttpError(401, "Credenciales invalidas");
  }

  return createSessionForUser(candidate.id, {
    allowHiddenOwner,
    organizationId,
  });
};

export const createSessionForPrivateCredentials = async (email, password) =>
  createSessionForCredentials(email, password, {
    allowHiddenOwner: true,
  });

export const updateSessionOrganization = async (token, organizationId) => {
  if (!token) {
    throw new HttpError(400, "Authentication token is required");
  }

  const sessions = await readSessions();
  const session = sessions[token];

  if (!session?.userId) {
    throw new HttpError(401, "Authentication required");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    throw new HttpError(401, "Authentication required");
  }

  const memberships = await getOrganizationMembershipsForUser(user.id);
  const membership = memberships.find(
    (item) => item.organization_id === String(organizationId || "")
  );

  if (!membership) {
    throw new HttpError(403, "You do not belong to that organization");
  }

  sessions[token] = {
    ...session,
    organizationId: membership.organization_id,
    updatedAt: new Date().toISOString(),
  };

  await writeSessions(sessions);
  return createResolvedAuthContext(user, membership.organization_id);
};

export const invalidateSessionToken = async (token) => {
  if (!token) {
    return false;
  }

  const sessions = await readSessions();
  if (!sessions[token]) {
    return false;
  }

  delete sessions[token];
  await writeSessions(sessions);
  return true;
};

export const requireAuth = async (req, _res, next) => {
  try {
    const context = await resolveCurrentAuthContext(req);
    req.currentUser = context.currentUser;
    req.currentOrganization = context.currentOrganization;
    req.currentOrganizationMembership = context.currentOrganizationMembership;
    req.currentOrganizationSettings = context.currentOrganizationSettings;
    req.currentMemberships = context.currentMemberships;
    req.authSessionToken = context.sessionToken;
    next();
  } catch (error) {
    next(error);
  }
};

export const getUserStore = () => userStore;
export const listAvailableUsers = async () => {
  await ensureSaasBootstrap();
  const users = await userStore.list();
  return filterUsersForViewer(users, null);
};

export const upsertOrganizationSettingsForOrganization = async (
  organizationId,
  patch = {}
) => {
  const existing = await getOrganizationSettingsForOrganization(organizationId);

  if (!existing) {
    return organizationSettingsStore.create({
      organization_id: organizationId,
      ...patch,
    });
  }

  return organizationSettingsStore.update(existing.id, patch);
};
