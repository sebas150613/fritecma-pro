import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import {
  canAccessHiddenUsers,
  createSessionForUser,
  getOrganizationMembershipsForOrganization,
  getUserStore,
  requireAuth,
  stripSensitiveUserFields,
  updateSessionOrganization,
} from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  getOrganizationMembershipStore,
  getOrganizationSettingsStore,
  getOrganizationStore,
  normalizeOrganizationSlug,
} from "../lib/tenant.js";
import {
  ensureOrganizationSubscription,
  getPlanByCode,
  getSubscriptionSummary,
  listPlans,
} from "../services/billing-service.js";

const router = express.Router();
const organizationStore = getOrganizationStore();
const membershipStore = getOrganizationMembershipStore();
const organizationSettingsStore = getOrganizationSettingsStore();
const userStore = getUserStore();

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

        return {
          ...organization,
          is_current: organization.id === req.currentOrganization?.id,
          user_count: organizationUsers.length,
          users: organizationUsers,
        };
      })
    );

    res.json({
      organizations: organizationsWithUsers,
    });
  })
);

router.get(
  "/current",
  asyncHandler(async (_req, res) => {
    res.json({
      organization: _req.currentOrganization,
      membership: _req.currentOrganizationMembership,
      settings: _req.currentOrganizationSettings,
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
    const name = String(req.body?.name || "").trim();
    const requestedSlug = String(req.body?.slug || "").trim();
    const planCode = String(req.body?.plan_code || "starter").trim() || "starter";

    if (!name) {
      throw new HttpError(400, "Organization name is required");
    }

    const selectedPlan = await getPlanByCode(planCode);
    if (!selectedPlan || selectedPlan.is_active === false) {
      throw new HttpError(404, "Selected plan is not available");
    }
    if (
      selectedPlan.code !== "starter" &&
      (!selectedPlan.stripe_price_id || !process.env.STRIPE_SECRET_KEY)
    ) {
      throw new HttpError(
        422,
        "The selected paid plan is not available until Stripe billing is configured"
      );
    }

    const slug = normalizeOrganizationSlug(requestedSlug || name);
    const existingOrganizations = await organizationStore.filter({
      filter: { slug },
      limit: 1,
    });

    if (existingOrganizations[0]) {
      throw new HttpError(409, "An organization with that slug already exists");
    }

    const organization = await organizationStore.create({
      name,
      slug,
      is_active: true,
      plan_code: planCode,
    });

    await membershipStore.create({
      organization_id: organization.id,
      organization_name: organization.name,
      user_id: req.currentUser.id,
      user_email: req.currentUser.email || "",
      user_name: req.currentUser.full_name || req.currentUser.email || "Invitado",
      role: "admin",
      status: "active",
    });

    await organizationSettingsStore.create({
      organization_id: organization.id,
      verifactu_nombre: organization.name,
      verifactu_produccion: false,
    });

    await ensureOrganizationSubscription(organization, {
      planCode: selectedPlan.code,
      status: selectedPlan.code === "starter" ? "trialing" : "incomplete",
      trialDays: selectedPlan.code === "starter" ? 15 : 0,
    });

    const createdSession = req.authSessionToken
      ? null
      : await createSessionForUser(req.currentUser.id, {
          organizationId: organization.id,
          allowHiddenOwner: req.currentUser?.is_hidden_owner === true,
        });
    const context = req.authSessionToken
      ? await updateSessionOrganization(req.authSessionToken, organization.id)
      : {
          currentUser: createdSession.user,
        };
    const summary = await getSubscriptionSummary(organization.id);

    res.status(201).json({
      user: createdSession?.user || context.currentUser,
      ...(createdSession ? { access_token: createdSession.token } : {}),
      organization,
      billing: summary,
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
