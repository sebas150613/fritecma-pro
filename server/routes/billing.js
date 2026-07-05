import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { requireWritableLicense } from "../lib/license.js";
import {
  assignPlanToOrganization,
  createBillingPortalSession,
  createSalesContactRequest,
  createOrganizationCheckoutSession,
  getOrganizationSubscription,
  getSubscriptionSummary,
  hasStripeEventBeenProcessed,
  parseStripeWebhookEvent,
  recordStripeEventProcessed,
  syncStripeCheckoutCompletion,
  updateSubscriptionFromStripePayload,
} from "../services/billing-service.js";

const router = express.Router();

const requireBillingAdmin = (currentUser) => {
  if (!["admin", "superadmin"].includes(currentUser?.role)) {
    throw new HttpError(403, "Forbidden");
  }
};

const requireOwner = (currentUser) => {
  if (currentUser?.is_hidden_owner !== true) {
    throw new HttpError(403, "Forbidden");
  }
};

const resolveTargetOrganizationId = (req) =>
  String(
    req.body?.organization_id ||
      req.query?.organization_id ||
      req.currentOrganization?.id ||
      ""
  ).trim();

router.use(requireAuth);

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const targetOrganizationId = resolveTargetOrganizationId(req);
    const organizationId =
      req.currentUser?.is_hidden_owner === true && targetOrganizationId
        ? targetOrganizationId
        : req.currentOrganization.id;

    res.json(await getSubscriptionSummary(organizationId));
  })
);

router.post(
  "/checkout",
  requireWritableLicense,
  asyncHandler(async (req, res) => {
    requireBillingAdmin(req.currentUser);

    const planCode = String(req.body?.plan_code || "").trim();
    const targetOrganizationId = resolveTargetOrganizationId(req);
    const organizationId =
      req.currentUser?.is_hidden_owner === true && targetOrganizationId
        ? targetOrganizationId
        : req.currentOrganization.id;
    const baseOrigin = `${req.protocol}://${req.get("host")}`;
    const successUrl =
      String(req.body?.success_url || "").trim() ||
      `${baseOrigin}/settings?billing=success`;
    const cancelUrl =
      String(req.body?.cancel_url || "").trim() ||
      `${baseOrigin}/settings?billing=cancel`;
    const summary = await getSubscriptionSummary(organizationId);
    const subscription = await getOrganizationSubscription(organizationId);

    const { session } = await createOrganizationCheckoutSession({
      organization: summary.organization,
      subscription,
      planCode,
      successUrl,
      cancelUrl,
    });

    res.json({
      url: session.url,
      session_id: session.id,
    });
  })
);

router.post(
  "/assign-plan",
  asyncHandler(async (req, res) => {
    requireOwner(req.currentUser);

    const organizationId = resolveTargetOrganizationId(req);
    const planCode = String(req.body?.plan_code || "").trim();
    res.json(
      await assignPlanToOrganization({
        organizationId,
        planCode,
      })
    );
  })
);

router.post(
  "/portal",
  asyncHandler(async (req, res) => {
    requireBillingAdmin(req.currentUser);

    const targetOrganizationId = resolveTargetOrganizationId(req);
    const organizationId =
      req.currentUser?.is_hidden_owner === true && targetOrganizationId
        ? targetOrganizationId
        : req.currentOrganization.id;
    const baseOrigin = `${req.protocol}://${req.get("host")}`;
    const returnUrl =
      String(req.body?.return_url || "").trim() || `${baseOrigin}/settings`;
    const subscription = await getOrganizationSubscription(organizationId);
    const portalSession = await createBillingPortalSession({
      subscription,
      returnUrl,
    });

    res.json({
      url: portalSession.url,
    });
  })
);

router.post(
  "/contact-sales",
  asyncHandler(async (req, res) => {
    requireBillingAdmin(req.currentUser);

    const planCode = String(req.body?.plan_code || "").trim();
    const message = String(req.body?.message || "").trim();
    const targetOrganizationId = resolveTargetOrganizationId(req);
    const organizationId =
      req.currentUser?.is_hidden_owner === true && targetOrganizationId
        ? targetOrganizationId
        : req.currentOrganization.id;
    const summary = await getSubscriptionSummary(organizationId);
    const result = await createSalesContactRequest({
      organization: summary.organization,
      currentUser: req.currentUser,
      planCode,
      message,
    });

    res.json(result);
  })
);

export const stripeWebhookHandler = async (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];
    const event = parseStripeWebhookEvent(req.body, signature);

    // Skip events already processed (Stripe re-delivers on timeout/retry).
    if (await hasStripeEventBeenProcessed(event.id)) {
      return res.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        await syncStripeCheckoutCompletion(event.data.object);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const stripeSubscription = event.data.object;
        const organizationId = stripeSubscription?.metadata?.organization_id;
        if (organizationId) {
          await updateSubscriptionFromStripePayload({
            stripeSubscription,
            organizationId,
          });
        }
        break;
      }
      default:
        break;
    }

    // Record only after successful handling so a failed event is still retried.
    await recordStripeEventProcessed(event);

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
};

export default router;
