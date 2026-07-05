import Stripe from "stripe";
import { createJsonEntityStore } from "../lib/json-store.js";
import { HttpError } from "../lib/http-error.js";
import { serverConfig } from "../config.js";
import { sendEmail } from "./email-service.js";
import {
  getOrganizationMembershipStore,
  getOrganizationStore,
} from "../lib/tenant.js";
import { getUserStore } from "../lib/auth.js";

const planStore = createJsonEntityStore("SubscriptionPlan");
const subscriptionStore = createJsonEntityStore("OrganizationSubscription");
const membershipStore = getOrganizationMembershipStore();
const organizationStore = getOrganizationStore();

const DEFAULT_PLAN_SEEDS = [
  {
    id: "plan-starter",
    code: "starter",
    name: "Starter",
    description: "Operación inicial para empresas pequeñas.",
    currency: "EUR",
    monthly_price_cents: 14900,
    seat_limit: 5,
    storage_limit_gb: 20,
    ai_requests_month: 500,
    stripe_price_id: process.env.STRIPE_PRICE_STARTER || "",
    is_active: true,
    sort_order: 10,
    features: [
      "Hasta 5 usuarios",
      "Partes, stock, clientes y calendario",
      "VeriFactu y trazabilidad",
      "Soporte estándar",
    ],
  },
  {
    id: "plan-growth",
    code: "growth",
    name: "Growth",
    description: "Escalado para operación multi-equipo.",
    currency: "EUR",
    monthly_price_cents: 29900,
    seat_limit: 15,
    storage_limit_gb: 100,
    ai_requests_month: 2500,
    stripe_price_id: process.env.STRIPE_PRICE_GROWTH || "",
    is_active: true,
    sort_order: 20,
    features: [
      "Hasta 15 usuarios",
      "Automatizaciones y mayor capacidad",
      "Prioridad de soporte",
      "Más volumen de IA y archivos",
    ],
  },
  {
    id: "plan-enterprise",
    code: "enterprise",
    name: "Enterprise",
    description: "Contrato avanzado y límites personalizados.",
    currency: "EUR",
    monthly_price_cents: 0,
    seat_limit: null,
    storage_limit_gb: null,
    ai_requests_month: null,
    stripe_price_id: process.env.STRIPE_PRICE_ENTERPRISE || "",
    is_active: true,
    sort_order: 30,
    features: [
      "Usuarios ilimitados",
      "Onboarding asistido",
      "Soporte prioritario",
      "Configuración comercial personalizada",
    ],
  },
];

let stripeClient = null;

const getStripeClient = () => {
  if (!serverConfig.stripeSecretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(serverConfig.stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
    });
  }

  return stripeClient;
};

const addDaysIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const toUnixSeconds = (value) => {
  if (!value) {
    return null;
  }

  return Math.floor(new Date(value).getTime() / 1000);
};

const fromUnixSeconds = (value) => {
  if (!value && value !== 0) {
    return null;
  }

  return new Date(Number(value) * 1000).toISOString();
};

const getOrganizationRecordById = async (organizationId) => {
  const organizations = await organizationStore.filter({
    filter: { id: String(organizationId || "") },
    limit: 1,
  });

  return organizations[0] || null;
};

export const isBillingConfigured = () =>
  Boolean(serverConfig.stripeSecretKey && serverConfig.stripeWebhookSecret);

export const ensurePlanCatalog = async () => {
  const existingPlans = await planStore.list({ sort: "sort_order" });

  if (existingPlans.length === 0) {
    await planStore.upsertSeed(DEFAULT_PLAN_SEEDS);
    return;
  }

  for (const seedPlan of DEFAULT_PLAN_SEEDS) {
    const existing = existingPlans.find(
      (plan) => plan.id === seedPlan.id || plan.code === seedPlan.code
    );

    if (!existing) {
      await planStore.create(seedPlan);
      continue;
    }

    const patch = {};
    for (const field of [
      "name",
      "description",
      "currency",
      "monthly_price_cents",
      "seat_limit",
      "storage_limit_gb",
      "ai_requests_month",
      "stripe_price_id",
      "is_active",
      "sort_order",
      "features",
    ]) {
      if (JSON.stringify(existing[field]) !== JSON.stringify(seedPlan[field])) {
        patch[field] = seedPlan[field];
      }
    }

    if (Object.keys(patch).length > 0) {
      await planStore.update(existing.id, patch);
    }
  }
};

export const listPlans = async ({ activeOnly = true } = {}) => {
  await ensurePlanCatalog();
  const plans = await planStore.list({ sort: "sort_order" });
  return activeOnly ? plans.filter((plan) => plan.is_active !== false) : plans;
};

export const getPlanByCode = async (planCode) => {
  await ensurePlanCatalog();
  const plans = await planStore.filter({
    filter: { code: String(planCode || "") },
    limit: 1,
  });
  return plans[0] || null;
};

export const getPlanByStripePriceId = async (stripePriceId) => {
  if (!stripePriceId) {
    return null;
  }

  const plans = await listPlans({ activeOnly: false });
  return plans.find((plan) => plan.stripe_price_id === stripePriceId) || null;
};

export const ensureOrganizationSubscription = async (
  organization,
  {
    planCode = "starter",
    status = "active",
    trialDays = 0,
    trialEndsAt = null,
  } = {}
) => {
  await ensurePlanCatalog();
  const existingSubscriptions = await subscriptionStore.filter({
    filter: { organization_id: organization.id },
    limit: 1,
  });
  const existing = existingSubscriptions[0] || null;

  if (existing) {
    return existing;
  }

  const resolvedTrialEnd =
    trialEndsAt && String(trialEndsAt).trim()
      ? new Date(trialEndsAt).toISOString()
      : trialDays > 0
        ? addDaysIso(trialDays)
        : null;

  return subscriptionStore.create({
    organization_id: organization.id,
    organization_name: organization.name,
    plan_code: planCode,
    status,
    billing_provider: serverConfig.stripeSecretKey ? "stripe" : "manual",
    trial_ends_at: resolvedTrialEnd,
    current_period_start: new Date().toISOString(),
    current_period_end: resolvedTrialEnd || addDaysIso(30),
    cancel_at_period_end: false,
  });
};

export const getOrganizationSubscription = async (organizationId) => {
  const items = await subscriptionStore.filter({
    filter: { organization_id: organizationId },
    limit: 1,
  });
  return items[0] || null;
};

export const getSeatUsage = async (organizationId) => {
  const memberships = await membershipStore.filter({
    filter: { organization_id: organizationId },
  });
  const users = await getUserStore().list();
  const hiddenOwnerIds = new Set(
    users.filter((user) => user.is_hidden_owner === true).map((user) => user.id)
  );

  return memberships.filter(
    (membership) =>
      membership.status !== "disabled" && !hiddenOwnerIds.has(membership.user_id)
  ).length;
};

export const getSubscriptionSummary = async (organizationId) => {
  const organization = await organizationStore.filter({
    filter: { id: organizationId },
    limit: 1,
  });
  const organizationRecord = organization[0] || null;
  const subscription = await getOrganizationSubscription(organizationId);

  if (!organizationRecord || !subscription) {
    throw new HttpError(404, "Organization subscription not found");
  }

  const plan = await getPlanByCode(subscription.plan_code);
  const seatUsage = await getSeatUsage(organizationId);
  const seatLimit =
    subscription.seat_limit_override ??
    plan?.seat_limit ??
    null;

  return {
    organization: organizationRecord,
    subscription,
    plan,
    usage: {
      active_seats: seatUsage,
      storage_used_gb: null,
      ai_requests_month: null,
    },
    limits: {
      seat_limit: seatLimit,
      storage_limit_gb: plan?.storage_limit_gb ?? null,
      ai_requests_month: plan?.ai_requests_month ?? null,
    },
    billing: {
      provider: subscription.billing_provider || "manual",
      stripe_enabled: Boolean(serverConfig.stripeSecretKey),
      portal_enabled: Boolean(
        serverConfig.stripeSecretKey && subscription.stripe_customer_id
      ),
    },
  };
};

export const assertSeatAvailableForOrganization = async (
  organizationId,
  increment = 1
) => {
  const summary = await getSubscriptionSummary(organizationId);
  const seatLimit = summary.limits.seat_limit;

  if (seatLimit === null || seatLimit === undefined || seatLimit <= 0) {
    return summary;
  }

  if (summary.usage.active_seats + increment > seatLimit) {
    throw new HttpError(409, "Seat limit reached for the current subscription", {
      seat_limit: seatLimit,
      active_seats: summary.usage.active_seats,
      plan_code: summary.plan?.code || summary.subscription.plan_code,
    });
  }

  return summary;
};

export const createOrganizationCheckoutSession = async ({
  organization,
  subscription,
  planCode,
  successUrl,
  cancelUrl,
}) => {
  const stripe = getStripeClient();

  if (!stripe) {
    throw new HttpError(503, "Stripe billing is not configured on the server");
  }

  const targetPlan = await getPlanByCode(planCode);
  if (!targetPlan || targetPlan.is_active === false) {
    throw new HttpError(404, "Plan not found");
  }

  if (!targetPlan.stripe_price_id) {
    throw new HttpError(422, "Selected plan is not configured for Stripe checkout");
  }

  let customerId = subscription?.stripe_customer_id || "";

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      metadata: {
        organization_id: organization.id,
      },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price: targetPlan.stripe_price_id,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      organization_id: organization.id,
      plan_code: targetPlan.code,
    },
    subscription_data: {
      metadata: {
        organization_id: organization.id,
        plan_code: targetPlan.code,
      },
    },
    allow_promotion_codes: true,
  });

  const nextSubscription = subscription
    ? await subscriptionStore.update(subscription.id, {
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
        billing_provider: "stripe",
      })
    : await subscriptionStore.create({
        organization_id: organization.id,
        organization_name: organization.name,
        plan_code: targetPlan.code,
        status: "incomplete",
        billing_provider: "stripe",
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
      });

  return {
    session,
    subscription: nextSubscription,
  };
};

export const createBillingPortalSession = async ({
  subscription,
  returnUrl,
}) => {
  const stripe = getStripeClient();

  if (!stripe) {
    throw new HttpError(503, "Stripe billing is not configured on the server");
  }

  if (!subscription?.stripe_customer_id) {
    throw new HttpError(409, "No Stripe customer is linked to this organization");
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: returnUrl,
  });

  return portalSession;
};

export const createSalesContactRequest = async ({
  organization,
  currentUser,
  planCode,
  message,
}) => {
  const targetPlan = await getPlanByCode(planCode);

  if (!targetPlan || targetPlan.is_active === false) {
    throw new HttpError(404, "Plan not found");
  }

  const users = await getUserStore().list();
  const ownerRecipients = users
    .filter((user) => user.is_hidden_owner === true && user.is_active !== false && user.email)
    .map((user) => user.email);
  const recipients = [
    ...new Set(
      [serverConfig.salesEmail, serverConfig.emailReplyTo, serverConfig.emailFrom, ...ownerRecipients]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];

  if (recipients.length === 0) {
    throw new HttpError(503, "No hay destinatario comercial configurado");
  }

  const activeSeats = await getSeatUsage(organization.id);

  const subject = `[FRIGEST] Solicitud comercial ${organization.name} -> ${targetPlan.name}`;
  const body = [
    "Nueva solicitud comercial desde la app.",
    "",
    `Empresa: ${organization.name}`,
    `Slug: ${organization.slug || "sin-slug"}`,
    `Plan solicitado: ${targetPlan.name} (${targetPlan.code})`,
    `Usuarios activos: ${activeSeats}`,
    "",
    `Solicitante: ${currentUser?.full_name || currentUser?.email || "Sin nombre"}`,
    `Email solicitante: ${currentUser?.email || "Sin email"}`,
    "",
    "Mensaje:",
    String(message || "").trim() || "Sin mensaje adicional.",
  ].join("\n");

  const delivery = await sendEmail({
    to: recipients,
    reply_to: currentUser?.email || undefined,
    subject,
    body,
  });

  return {
    success: true,
    queued: delivery?.queued === true,
    provider: delivery?.provider || "stub",
  };
};

export const assignPlanToOrganization = async ({
  organizationId,
  planCode,
}) => {
  const organization = await getOrganizationRecordById(organizationId);
  if (!organization) {
    throw new HttpError(404, "Organization not found");
  }

  const targetPlan = await getPlanByCode(planCode);
  if (!targetPlan || targetPlan.is_active === false) {
    throw new HttpError(404, "Plan not found");
  }

  const existingSubscription = await getOrganizationSubscription(organization.id);

  if (existingSubscription) {
    await subscriptionStore.update(existingSubscription.id, {
      plan_code: targetPlan.code,
      status: "active",
      trial_ends_at: null,
    });
  } else {
    await ensureOrganizationSubscription(organization, {
      planCode: targetPlan.code,
      status: "active",
      trialDays: 0,
    });
  }

  await organizationStore.update(organization.id, {
    plan_code: targetPlan.code,
  });

  return getSubscriptionSummary(organization.id);
};

export const updateSubscriptionFromStripePayload = async ({
  stripeSubscription,
  organizationId,
}) => {
  const existing = await getOrganizationSubscription(organizationId);
  if (!existing) {
    throw new HttpError(404, "Organization subscription not found");
  }

  const priceId =
    stripeSubscription?.items?.data?.[0]?.price?.id || "";
  const mappedPlan = await getPlanByStripePriceId(priceId);

  return subscriptionStore.update(existing.id, {
    billing_provider: "stripe",
    plan_code: mappedPlan?.code || existing.plan_code,
    status: stripeSubscription.status || existing.status,
    stripe_customer_id:
      typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : existing.stripe_customer_id,
    stripe_subscription_id: stripeSubscription.id || existing.stripe_subscription_id,
    current_period_start:
      fromUnixSeconds(stripeSubscription.current_period_start) ||
      existing.current_period_start,
    current_period_end:
      fromUnixSeconds(stripeSubscription.current_period_end) ||
      existing.current_period_end,
    cancel_at_period_end:
      stripeSubscription.cancel_at_period_end === true,
    trial_ends_at:
      fromUnixSeconds(stripeSubscription.trial_end) || existing.trial_ends_at,
  });
};

export const parseStripeWebhookEvent = (payloadBuffer, signature) => {
  const stripe = getStripeClient();

  if (!stripe || !serverConfig.stripeWebhookSecret) {
    throw new HttpError(503, "Stripe webhook handling is not configured");
  }

  return stripe.webhooks.constructEvent(
    payloadBuffer,
    signature,
    serverConfig.stripeWebhookSecret
  );
};

export const syncStripeCheckoutCompletion = async (checkoutSession) => {
  const organizationId = checkoutSession?.metadata?.organization_id;
  if (!organizationId) {
    return null;
  }

  const subscription = await getOrganizationSubscription(organizationId);
  if (!subscription) {
    return null;
  }

  return subscriptionStore.update(subscription.id, {
    stripe_customer_id:
      typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : subscription.stripe_customer_id,
    stripe_subscription_id:
      typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : subscription.stripe_subscription_id,
    stripe_checkout_session_id: checkoutSession.id || subscription.stripe_checkout_session_id,
    status: subscription.status === "incomplete" ? "active" : subscription.status,
  });
};

export const bootstrapOrganizationSubscriptions = async () => {
  await ensurePlanCatalog();
  const organizations = await organizationStore.list();

  for (const organization of organizations) {
    await ensureOrganizationSubscription(organization, {
      planCode: "starter",
      status: "active",
    });
  }
};

export const getPlanStore = () => planStore;
export const getOrganizationSubscriptionStore = () => subscriptionStore;

