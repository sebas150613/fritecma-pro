import express from "express";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/async-handler.js";
import {
  canAccessHiddenUsers,
  createPasswordHash,
  createSessionForUser,
  getOrganizationMembershipsForOrganization,
  getUserStore,
  requireAuth,
  stripSensitiveUserFields,
  updateSessionOrganization,
  upsertOrganizationSettingsForOrganization,
} from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  DEFAULT_ORGANIZATION_ID,
  decryptOrganizationSettingsFromStorage,
  encryptOrganizationSettingsForStorage,
  getOrganizationMembershipStore,
  getOrganizationSettingsStore,
  getOrganizationStore,
  normalizeOrganizationSlug,
  sanitizeOrganizationSettingsForClient,
} from "../lib/tenant.js";
import {
  extractOwnerProfileFromDecryptedSettings,
  hasActiveAdminUser,
  isFiscalProfileComplete,
  mergeOrganizationAndProfileForOwnerApi,
  parseCreateOrganizationBody,
  parsePatchOrganizationBody,
  trimOrNull,
} from "../lib/owner-organization-profile.js";
import {
  assertSeatAvailableForOrganization,
  ensureOrganizationSubscription,
  getPlanByCode,
  getOrganizationSubscriptionStore,
  getSubscriptionSummary,
  listPlans,
} from "../services/billing-service.js";
import { purgeOrganizationCompletely } from "../services/organization-hard-delete.js";

const router = express.Router();
const organizationStore = getOrganizationStore();
const membershipStore = getOrganizationMembershipStore();
const organizationSettingsStore = getOrganizationSettingsStore();
const userStore = getUserStore();
const organizationSubscriptionStore = getOrganizationSubscriptionStore();

/**
 * Owner-only: create or invite a user into an organization (shared by POST /users and org bootstrap).
 * @returns {{ user: object, membership: object, invite_url: string | null, httpStatus: number }}
 */
async function inviteOrganizationUserAsOwner(req, organization, payload) {
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const fullName = String(payload.full_name || "").trim();
  const desiredRole = String(payload.role || "admin").trim().toLowerCase();
  const temporaryPassword = payload.temporary_password
    ? String(payload.temporary_password)
    : "";

  if (!email) {
    throw new HttpError(400, "email is required");
  }

  if (!["admin", "oficina", "encargado", "tecnico", "ayudante"].includes(desiredRole)) {
    throw new HttpError(422, "role is not valid");
  }

  if (req.currentUser?.is_hidden_owner === true) {
    const ownerMail = String(req.currentUser.email || "").trim().toLowerCase();
    if (ownerMail && email === ownerMail) {
      throw new HttpError(422, "La cuenta owner no puede añadirse como usuario de empresa.");
    }
  }

  const existingUsers = await userStore.filter({
    filter: { email },
    limit: 1,
  });
  const existingUser = existingUsers[0] || null;

  if (existingUser?.is_hidden_owner === true) {
    throw new HttpError(409, "User cannot be added to an organization");
  }

  if (existingUser) {
    const otherMemberships = await membershipStore.filter({
      filter: { user_id: existingUser.id },
    });
    const belongsElsewhere = otherMemberships.some(
      (membership) => membership.organization_id !== organization.id
    );
    if (belongsElsewhere) {
      throw new HttpError(409, "Este usuario ya pertenece a otra empresa.");
    }
  }

  const nextInvitationToken = randomUUID();
  let userRecord = existingUser;

  if (existingUser) {
    const patch = {
      is_active: true,
      role: desiredRole,
      full_name: fullName || existingUser.full_name || email,
    };

    if (temporaryPassword) {
      patch.password_hash = createPasswordHash(temporaryPassword);
      patch.invitation_token = null;
    } else if (!existingUser.password_hash) {
      patch.invitation_token = nextInvitationToken;
    }

    userRecord = await userStore.update(existingUser.id, patch);
  } else {
    userRecord = await userStore.create({
      email,
      role: desiredRole,
      full_name: fullName || email || "Invitado",
      is_active: true,
      ...(temporaryPassword
        ? { password_hash: createPasswordHash(temporaryPassword) }
        : { invitation_token: nextInvitationToken }),
    });
  }

  const memberships = await membershipStore.filter({
    filter: {
      organization_id: organization.id,
      user_id: userRecord.id,
    },
    limit: 1,
  });
  const existingMembership = memberships[0] || null;
  const willConsumeSeat = !existingMembership || existingMembership.status === "disabled";

  if (willConsumeSeat) {
    await assertSeatAvailableForOrganization(organization.id, 1);
  }

  const membershipPayload = {
    organization_id: organization.id,
    organization_name: organization.name,
    user_id: userRecord.id,
    user_email: userRecord.email || email,
    user_name: userRecord.full_name || userRecord.email || "Invitado",
    role: desiredRole,
    status: userRecord.is_active === false ? "disabled" : "active",
  };

  const membership = existingMembership
    ? await membershipStore.update(existingMembership.id, membershipPayload)
    : await membershipStore.create(membershipPayload);

  const inviteUrl = userRecord.invitation_token
    ? `${req.protocol}://${req.get("host")}/api/auth/accept-invite?token=${encodeURIComponent(
        userRecord.invitation_token
      )}&redirect_uri=${encodeURIComponent(`${req.protocol}://${req.get("host")}/`)}`
    : null;

  return {
    user: {
      ...stripSensitiveUserFields(userRecord),
      role: desiredRole,
    },
    membership: {
      id: membership.id,
      organization_id: membership.organization_id,
      status: membership.status,
      role: membership.role,
    },
    invite_url: inviteUrl,
    httpStatus: existingUser ? 200 : 201,
  };
}

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const organizationIds = req.currentMemberships.map(
      (membership) => membership.organization_id
    );
    const organizations = await organizationStore.list({ sort: "name" });
    const filtered = organizations.filter((organization) =>
      organizationIds.includes(organization.id)
    );

    res.json(
      filtered.map((organization) => ({
        ...organization,
        is_current: organization.id === req.currentOrganization.id,
      }))
    );
  })
);

router.get(
  "/owner-overview",
  asyncHandler(async (req, res) => {
    if (!canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    const [organizations, users] = await Promise.all([
      organizationStore.list({ sort: "name" }),
      userStore.list(),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));

    const organizationsWithUsers = await Promise.all(
      organizations.map(async (organization) => {
        const memberships = await getOrganizationMembershipsForOrganization(organization.id);
        const organizationUsers = memberships
          .map((membership) => {
            const linkedUser = userById.get(membership.user_id);

            if (!linkedUser || linkedUser.is_hidden_owner === true) {
              return null;
            }

            return {
              ...stripSensitiveUserFields(linkedUser),
              role: membership.role || linkedUser.role || null,
              membership_id: membership.id,
              membership_status: membership.status || "active",
            };
          })
          .filter(Boolean)
          .sort((left, right) =>
            String(left.full_name || left.email || "").localeCompare(
              String(right.full_name || right.email || "")
            )
          );

        const settingsRow = (
          await organizationSettingsStore.filter({
            filter: { organization_id: organization.id },
            limit: 1,
          })
        )[0] || null;
        const decryptedSettings = settingsRow
          ? decryptOrganizationSettingsFromStorage({ ...settingsRow })
          : {};
        const profileExtract = extractOwnerProfileFromDecryptedSettings(decryptedSettings);
        const owner_profile = mergeOrganizationAndProfileForOwnerApi(organization, profileExtract);
        const fiscal_complete = isFiscalProfileComplete(organization, owner_profile);
        const has_admin = hasActiveAdminUser(organizationUsers);

        const summary = await getSubscriptionSummary(organization.id).catch(() => null);
        const billing = summary
          ? {
              subscription: {
                status: summary.subscription?.status || "active",
                plan_code: summary.subscription?.plan_code || organization.plan_code || null,
              },
              plan: {
                name: summary.plan?.name || null,
                monthly_price_cents:
                  summary.plan?.monthly_price_cents ?? null,
              },
              limits: {
                seat_limit: summary.limits?.seat_limit ?? null,
                storage_limit_gb: summary.limits?.storage_limit_gb ?? null,
                ai_requests_month: summary.limits?.ai_requests_month ?? null,
              },
              usage: {
                active_seats: summary.usage?.active_seats ?? organizationUsers.length,
                storage_used_gb:
                  summary.usage?.storage_used_gb ?? null,
                ai_requests_month:
                  summary.usage?.ai_requests_month ?? null,
              },
            }
          : {
              subscription: {
                status: "active",
                plan_code: organization.plan_code || null,
              },
              plan: {
                name: null,
                monthly_price_cents: null,
              },
              limits: {
                seat_limit: null,
                storage_limit_gb: null,
                ai_requests_month: null,
              },
              usage: {
                active_seats: organizationUsers.length,
                storage_used_gb: null,
                ai_requests_month: null,
              },
            };

        return {
          ...organization,
          is_current: organization.id === req.currentOrganization?.id,
          is_platform_internal: organization.id === DEFAULT_ORGANIZATION_ID,
          user_count: organizationUsers.length,
          users: organizationUsers,
          billing,
          owner_profile,
          fiscal_complete,
          has_admin,
        };
      })
    );

    res.json({
      organizations: organizationsWithUsers,
    });
  })
);

router.delete(
  "/:organizationId/hard-delete",
  asyncHandler(async (req, res) => {
    if (!canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!organizationId) {
      throw new HttpError(400, "organizationId is required");
    }

    if (organizationId === req.currentOrganization?.id) {
      throw new HttpError(
        403,
        "No se puede eliminar la organización activa en el contexto de esta sesión."
      );
    }

    if (organizationId === DEFAULT_ORGANIZATION_ID) {
      throw new HttpError(
        403,
        "La organización interna de plataforma no admite borrado definitivo."
      );
    }

    const organizations = await organizationStore.filter({
      filter: { id: organizationId },
      limit: 1,
    });
    if (!organizations[0]) {
      throw new HttpError(404, "Organization not found");
    }

    await purgeOrganizationCompletely(organizationId);

    res.status(204).send();
  })
);

router.get(
  "/current",
  asyncHandler(async (_req, res) => {
    res.json({
      organization: _req.currentOrganization,
      membership: _req.currentOrganizationMembership,
      settings: sanitizeOrganizationSettingsForClient(
        _req.currentOrganizationSettings
      ),
    });
  })
);

router.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    res.json(await listPlans());
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (req.currentUser?.is_hidden_owner !== true) {
      throw new HttpError(
        403,
        "Solo FRIGEST puede crear nuevas empresas desde el panel."
      );
    }

    const parsed = parseCreateOrganizationBody(req.body || {});
    const { organizationFields, profilePatch, planCode, activateOnCreate, initialAdmin } = parsed;

    const selectedPlan = await getPlanByCode(planCode);
    if (!selectedPlan || selectedPlan.is_active === false) {
      throw new HttpError(404, "El plan seleccionado no está disponible.");
    }
    if (
      selectedPlan.code !== "starter" &&
      (!selectedPlan.stripe_price_id || !process.env.STRIPE_SECRET_KEY)
    ) {
      throw new HttpError(
        422,
        "El plan de pago seleccionado no está disponible hasta configurar Stripe en el servidor."
      );
    }

    const existingOrganizations = await organizationStore.filter({
      filter: { slug: organizationFields.slug },
      limit: 1,
    });

    if (existingOrganizations[0]) {
      throw new HttpError(409, "Ya existe una empresa con ese slug.");
    }

    if (initialAdmin.enabled) {
      if (!initialAdmin.email || !initialAdmin.full_name) {
        throw new HttpError(400, "Datos incompletos para el administrador inicial.");
      }
      const mode = String(initialAdmin.access_mode || "invite").toLowerCase();
      if (mode === "password_temp" && !initialAdmin.temporary_password) {
        throw new HttpError(400, "Indica una contraseña temporal o elige invitación por enlace.");
      }
      const ownerMail = String(req.currentUser.email || "").trim().toLowerCase();
      if (ownerMail && initialAdmin.email === ownerMail) {
        throw new HttpError(422, "La cuenta owner no puede añadirse como usuario de empresa.");
      }
    }

    const organization = await organizationStore.create({
      ...organizationFields,
      plan_code: selectedPlan.code,
    });

    const isHiddenOwnerRequest = true;

    const legalName = trimOrNull(organization.legal_name);
    const taxId = trimOrNull(organization.tax_id);
    const vfBase = {
      organization_id: organization.id,
      verifactu_nombre: legalName || organization.name,
      verifactu_produccion: false,
      ...(taxId ? { verifactu_nif: taxId } : {}),
    };

    await organizationSettingsStore.create(
      encryptOrganizationSettingsForStorage({
        ...vfBase,
        ...profilePatch,
      })
    );

    const subscriptionStatus = !activateOnCreate
      ? "paused"
      : parsed.subscriptionStatus;
    const trialEndsAt = parsed.trialEndsAt || null;
    const trialDaysFallback =
      selectedPlan.code === "starter" && !trialEndsAt && activateOnCreate ? 15 : 0;

    await ensureOrganizationSubscription(organization, {
      planCode: selectedPlan.code,
      status: subscriptionStatus,
      trialDays: trialDaysFallback,
      trialEndsAt,
    });

    let initial_admin_warning = null;
    if (initialAdmin.enabled) {
      const mode = String(initialAdmin.access_mode || "invite").toLowerCase();
      const temporaryPassword =
        mode === "password_temp" ? String(initialAdmin.temporary_password || "") : "";
      try {
        await inviteOrganizationUserAsOwner(req, organization, {
          email: initialAdmin.email,
          full_name: initialAdmin.full_name,
          role: "admin",
          temporary_password: temporaryPassword,
        });
      } catch (error) {
        initial_admin_warning =
          "La empresa se ha creado, pero no se pudo crear el administrador inicial.";
      }
    }

    const createdSession = req.authSessionToken || isHiddenOwnerRequest
      ? null
      : await createSessionForUser(req.currentUser.id, {
          organizationId: organization.id,
          allowHiddenOwner: req.currentUser?.is_hidden_owner === true,
        });
    const context = req.authSessionToken && !isHiddenOwnerRequest
      ? await updateSessionOrganization(req.authSessionToken, organization.id)
      : {
          currentUser: createdSession?.user || req.currentUser,
        };
    const summary = await getSubscriptionSummary(organization.id);

    res.status(201).json({
      user: createdSession?.user || context.currentUser,
      ...(createdSession ? { access_token: createdSession.token } : {}),
      organization,
      billing: summary,
      ...(initial_admin_warning ? { initial_admin_warning } : {}),
    });
  })
);

router.patch(
  "/:organizationId/owner-profile",
  asyncHandler(async (req, res) => {
    if (!canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!organizationId) {
      throw new HttpError(400, "organizationId is required");
    }

    const organizations = await organizationStore.filter({
      filter: { id: organizationId },
      limit: 1,
    });
    const organization = organizations[0] || null;
    if (!organization) {
      throw new HttpError(404, "Organization not found");
    }

    const { organizationPatch, profilePatch } = parsePatchOrganizationBody(req.body || {});

    if (
      Object.keys(organizationPatch).length === 0 &&
      Object.keys(profilePatch).length === 0
    ) {
      throw new HttpError(400, "No hay cambios que guardar.");
    }

    if (Object.prototype.hasOwnProperty.call(organizationPatch, "slug")) {
      const nextSlug = organizationPatch.slug;
      if (nextSlug) {
        const others = await organizationStore.filter({
          filter: { slug: nextSlug },
          limit: 5,
        });
        const collision = others.find((item) => item.id !== organizationId);
        if (collision) {
          throw new HttpError(409, "Ya existe una empresa con ese slug.");
        }
      }
    }

    let orgRecord = organization;
    if (Object.keys(organizationPatch).length > 0) {
      orgRecord = await organizationStore.update(organization.id, organizationPatch);
    }

    if (Object.keys(profilePatch).length > 0) {
      await upsertOrganizationSettingsForOrganization(organizationId, profilePatch);
    }

    const vfPatch = {};
    if (trimOrNull(orgRecord.legal_name)) {
      vfPatch.verifactu_nombre = orgRecord.legal_name;
    }
    if (trimOrNull(orgRecord.tax_id)) {
      vfPatch.verifactu_nif = orgRecord.tax_id;
    }
    if (Object.keys(vfPatch).length > 0) {
      await upsertOrganizationSettingsForOrganization(organizationId, vfPatch);
    }

    const refreshed = (
      await organizationStore.filter({
        filter: { id: organizationId },
        limit: 1,
      })
    )[0] || orgRecord;

    const settingsRow = (
      await organizationSettingsStore.filter({
        filter: { organization_id: organizationId },
        limit: 1,
      })
    )[0] || null;
    const decryptedSettings = settingsRow
      ? decryptOrganizationSettingsFromStorage({ ...settingsRow })
      : {};
    const profileExtract = extractOwnerProfileFromDecryptedSettings(decryptedSettings);
    const owner_profile = mergeOrganizationAndProfileForOwnerApi(refreshed, profileExtract);

    res.json({
      organization: refreshed,
      owner_profile,
      fiscal_complete: isFiscalProfileComplete(refreshed, owner_profile),
    });
  })
);

router.post(
  "/:organizationId/users",
  asyncHandler(async (req, res) => {
    if (!canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!organizationId) {
      throw new HttpError(400, "organizationId is required");
    }

    const organizations = await organizationStore.filter({
      filter: { id: organizationId },
      limit: 1,
    });
    const organization = organizations[0] || null;
    if (!organization) {
      throw new HttpError(404, "Organization not found");
    }

    const result = await inviteOrganizationUserAsOwner(req, organization, {
      email: req.body?.email,
      full_name: req.body?.full_name,
      role: req.body?.role,
      temporary_password: req.body?.temporary_password,
    });

    res.status(result.httpStatus).json({
      user: result.user,
      membership: result.membership,
      invite_url: result.invite_url,
    });
  })
);

router.delete(
  "/:organizationId/users/:userId",
  asyncHandler(async (req, res) => {
    const organizationId = String(req.params.organizationId || "").trim();
    const userId = String(req.params.userId || "").trim();

    if (!organizationId || !userId) {
      throw new HttpError(400, "organizationId and userId are required");
    }

    const isOwner = canAccessHiddenUsers(req.currentUser);
    const isAdmin = ["admin", "superadmin"].includes(req.currentUser?.role);

    if (!isOwner && !isAdmin) {
      throw new HttpError(403, "Forbidden");
    }

    if (!isOwner && organizationId !== req.currentOrganization?.id) {
      throw new HttpError(403, "Forbidden");
    }

    const membershipsForUser = await membershipStore.filter({
      filter: {
        organization_id: organizationId,
        user_id: userId,
      },
      limit: 1,
    });
    const targetMembership = membershipsForUser[0] || null;
    if (!targetMembership) {
      throw new HttpError(404, "User not found");
    }

    const users = await userStore.filter({
      filter: { id: userId },
      limit: 1,
    });
    const targetUser = users[0] || null;
    if (!targetUser) {
      throw new HttpError(404, "User not found");
    }

    if (targetUser.is_hidden_owner === true) {
      throw new HttpError(403, "Forbidden");
    }

    const targetRole = String(targetMembership.role || targetUser.role || "").toLowerCase();
    if (!isOwner && targetRole === "superadmin") {
      throw new HttpError(403, "Forbidden");
    }

    const allMembershipsForOrg = await membershipStore.filter({
      filter: { organization_id: organizationId },
    });
    const userById = new Map((await userStore.list()).map((u) => [u.id, u]));

    const activeAdminCount = allMembershipsForOrg.filter((membership) => {
      if (!membership || membership.status === "disabled") {
        return false;
      }
      const role = String(membership.role || "").toLowerCase();
      if (!["admin", "superadmin"].includes(role)) {
        return false;
      }
      const user = userById.get(membership.user_id);
      if (!user || user.is_active === false || user.is_hidden_owner === true) {
        return false;
      }
      return true;
    }).length;

    const isTargetActiveAdmin =
      targetMembership.status !== "disabled" && ["admin", "superadmin"].includes(targetRole);

    if (isTargetActiveAdmin && activeAdminCount <= 1) {
      throw new HttpError(
        409,
        "No se puede eliminar el último administrador activo de la empresa."
      );
    }

    await membershipStore.delete(targetMembership.id);

    const remainingMemberships = await membershipStore.filter({
      filter: { user_id: userId },
    });
    if (!remainingMemberships || remainingMemberships.length === 0) {
      await userStore.delete(userId);
    }

    res.status(204).send();
  })
);

router.post(
  "/:organizationId/license/pause",
  asyncHandler(async (req, res) => {
    if (!canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!organizationId) {
      throw new HttpError(400, "organizationId is required");
    }

    const subscriptionItems = await organizationSubscriptionStore.filter({
      filter: { organization_id: organizationId },
      limit: 1,
    });
    const subscription = subscriptionItems[0] || null;
    if (!subscription) {
      throw new HttpError(404, "Organization subscription not found");
    }

    const updated = await organizationSubscriptionStore.update(subscription.id, {
      status: "paused",
    });

    res.json({
      subscription: {
        organization_id: updated.organization_id,
        plan_code: updated.plan_code,
        status: updated.status,
      },
    });
  })
);

router.post(
  "/:organizationId/license/activate",
  asyncHandler(async (req, res) => {
    if (!canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }

    const organizationId = String(req.params.organizationId || "").trim();
    if (!organizationId) {
      throw new HttpError(400, "organizationId is required");
    }

    const subscriptionItems = await organizationSubscriptionStore.filter({
      filter: { organization_id: organizationId },
      limit: 1,
    });
    const subscription = subscriptionItems[0] || null;
    if (!subscription) {
      throw new HttpError(404, "Organization subscription not found");
    }

    const updated = await organizationSubscriptionStore.update(subscription.id, {
      status: "active",
    });

    const organizationItems = await organizationStore.filter({
      filter: { id: organizationId },
      limit: 1,
    });
    const organization = organizationItems[0] || null;
    if (organization && updated.plan_code && organization.plan_code !== updated.plan_code) {
      await organizationStore.update(organization.id, {
        plan_code: updated.plan_code,
      });
    }

    res.json({
      subscription: {
        organization_id: updated.organization_id,
        plan_code: updated.plan_code,
        status: updated.status,
      },
    });
  })
);

router.post(
  "/switch",
  asyncHandler(async (req, res) => {
    const organizationId = String(req.body?.organization_id || "");
    if (!req.authSessionToken) {
      const session = await createSessionForUser(req.currentUser.id, {
        organizationId,
        allowHiddenOwner: req.currentUser?.is_hidden_owner === true,
      });

      return res.json({
        ...session.user,
        access_token: session.token,
      });
    }

    const context = await updateSessionOrganization(req.authSessionToken, organizationId);

    res.json(context.currentUser);
  })
);

export default router;
