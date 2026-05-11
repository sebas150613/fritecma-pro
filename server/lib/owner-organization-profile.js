import { HttpError } from "./http-error.js";
import { normalizeOrganizationSlug } from "./tenant.js";

/** Stored under OrganizationSettings with this prefix — stripped from tenant-facing sanitize. */
export const OWNER_PROFILE_PREFIX = "owner_profile_";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const TAX_ID_TYPES = new Set(["nif", "cif", "nie", "vat", "other"]);

export const COMMERCIAL_STATUSES = new Set([
  "prueba",
  "activa",
  "pendiente_pago",
  "pausada",
]);

export const PAYMENT_METHODS = new Set([
  "transferencia",
  "domiciliacion_sepa",
  "tarjeta_stripe",
  "manual",
  "pendiente",
]);

export const PAYMENT_TERMS = new Set([
  "inmediato",
  "15_dias",
  "30_dias",
  "personalizado",
]);

export const trimOrNull = (value) => {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
};

export const normalizeEmail = (value) => {
  const t = trimOrNull(value);
  return t ? t.toLowerCase() : null;
};

export const assertEmailFormat = (email, message) => {
  if (!email) {
    return;
  }
  if (!EMAIL_RE.test(email)) {
    throw new HttpError(400, message || "El email no tiene un formato válido.");
  }
};

export const commercialStatusToSubscriptionStatus = (status) => {
  const s = String(status || "prueba").toLowerCase();
  if (s === "activa") {
    return "active";
  }
  if (s === "pendiente_pago") {
    return "past_due";
  }
  if (s === "pausada") {
    return "paused";
  }
  return "trialing";
};

/**
 * True when fiscal core is considered complete for owner CRM / billing readiness.
 */
export const isFiscalProfileComplete = (organization, profile) => {
  const legal = trimOrNull(organization?.legal_name);
  const tax = trimOrNull(organization?.tax_id);
  const type = trimOrNull(organization?.tax_id_type);
  const billEmail = normalizeEmail(profile?.billing_email);
  const a1 = trimOrNull(profile?.billing_address_line1);
  const zip = trimOrNull(profile?.billing_postal_code);
  const city = trimOrNull(profile?.billing_city);
  const country = trimOrNull(profile?.billing_country) || "ES";
  return Boolean(
    legal &&
      tax &&
      type &&
      billEmail &&
      a1 &&
      zip &&
      city &&
      country
  );
};

export const hasActiveAdminUser = (users = []) =>
  users.some((u) => {
    const role = String(u?.role || "").toLowerCase();
    const st = String(u?.membership_status || "active").toLowerCase();
    if (st === "disabled") {
      return false;
    }
    return ["admin", "superadmin"].includes(role);
  });

const setProfile = (out, key, value) => {
  if (value === undefined) {
    return;
  }
  if (value === null || value === "") {
    out[`${OWNER_PROFILE_PREFIX}${key}`] = null;
    return;
  }
  out[`${OWNER_PROFILE_PREFIX}${key}`] = value;
};

/**
 * Maps owner CRM fields from API body into OrganizationSettings storage keys (prefixed).
 * @param {{ partial?: boolean }} options — `partial`: only keys present on `body` (for PATCH).
 */
export const buildOwnerProfileSettingsPatch = (body = {}, options = {}) => {
  const { partial = false } = options;
  const out = {};
  const p = (key, v) => setProfile(out, key, v);

  const assign = (apiField, mapper = trimOrNull) => {
    if (partial && !Object.prototype.hasOwnProperty.call(body, apiField)) {
      return;
    }
    const raw = body[apiField];
    const value = mapper(raw);
    const short = apiField;
    p(short, value);
  };

  assign("billing_fiscal_name");
  assign("billing_tax_id");
  assign("billing_email", normalizeEmail);
  assign("billing_phone");
  assign("billing_contact_name");
  assign("billing_address_line1");
  assign("billing_address_line2");
  assign("billing_postal_code");
  assign("billing_city");
  assign("billing_region");
  if (!partial || Object.prototype.hasOwnProperty.call(body, "billing_country")) {
    const c = trimOrNull(body.billing_country);
    p("billing_country", c || "ES");
  }
  assign("commercial_contact_name");
  assign("commercial_contact_role");
  assign("commercial_contact_email", normalizeEmail);
  assign("commercial_contact_phone");
  assign("commercial_contact_mobile");
  assign("preferred_language", (v) => trimOrNull(v)?.toLowerCase());
  assign("preferred_contact_channel", (v) => trimOrNull(v)?.toLowerCase());
  assign("payment_method", (v) => trimOrNull(v)?.toLowerCase());
  assign("payment_terms", (v) => trimOrNull(v)?.toLowerCase());
  assign("internal_customer_reference");
  assign("owner_private_notes");
  assign("commercial_notes");
  assign("trial_starts_at");
  assign("trial_ends_at");

  return out;
};

export const extractOwnerProfileFromDecryptedSettings = (settings) => {
  if (!settings || typeof settings !== "object") {
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!key.startsWith(OWNER_PROFILE_PREFIX)) {
      continue;
    }
    const short = key.slice(OWNER_PROFILE_PREFIX.length);
    out[short] = value === "" ? null : value;
  }
  return out;
};

export const mergeOrganizationAndProfileForOwnerApi = (organization, profile) => ({
  name: trimOrNull(organization?.name),
  trade_name: trimOrNull(organization?.trade_name),
  legal_name: trimOrNull(organization?.legal_name),
  tax_id: trimOrNull(organization?.tax_id),
  tax_id_type: trimOrNull(organization?.tax_id_type),
  commercial_status: trimOrNull(organization?.commercial_status),
  demo_seed_enabled: organization?.demo_seed_enabled === true,
  ...profile,
});

/** Merge stored owner profile extract with a settings patch (owner_profile_* keys). */
export const mergeProfileExtractWithStoragePatch = (extract, profilePatch) => {
  const out = { ...(extract || {}) };
  for (const [k, v] of Object.entries(profilePatch || {})) {
    if (!k.startsWith(OWNER_PROFILE_PREFIX)) {
      continue;
    }
    const short = k.slice(OWNER_PROFILE_PREFIX.length);
    if (v === undefined) {
      continue;
    }
    out[short] = v === "" ? null : v;
  }
  return out;
};

/**
 * When commercial_status is activa or pendiente_pago, require fiscal basics + billing email.
 */
export const assertActiveCommercialFiscalBasics = (organization, profileExtract) => {
  const status = String(organization?.commercial_status || "").toLowerCase();
  if (!["activa", "pendiente_pago"].includes(status)) {
    return;
  }
  if (!trimOrNull(organization?.legal_name)) {
    throw new HttpError(
      400,
      "La razón social es obligatoria para empresas activas o facturables."
    );
  }
  if (!trimOrNull(organization?.tax_id)) {
    throw new HttpError(400, "El NIF/CIF es obligatorio para empresas activas.");
  }
  if (!trimOrNull(organization?.tax_id_type)) {
    throw new HttpError(
      400,
      "El tipo de identificador fiscal es obligatorio para empresas activas."
    );
  }
  const billEmail = normalizeEmail(profileExtract?.billing_email);
  if (!billEmail) {
    throw new HttpError(
      400,
      "El email de facturación es obligatorio para empresas activas o pendiente de pago."
    );
  }
  assertEmailFormat(billEmail, "El email de facturación no tiene un formato válido.");
  const ccEmail = normalizeEmail(profileExtract?.commercial_contact_email);
  if (ccEmail) {
    assertEmailFormat(ccEmail, "El email de contacto comercial no tiene un formato válido.");
  }
  const pm = trimOrNull(profileExtract?.payment_method)?.toLowerCase();
  if (pm && !PAYMENT_METHODS.has(pm)) {
    throw new HttpError(422, "El método de pago previsto no es válido.");
  }
  const pt = trimOrNull(profileExtract?.payment_terms)?.toLowerCase();
  if (pt && !PAYMENT_TERMS.has(pt)) {
    throw new HttpError(422, "Las condiciones de pago no son válidas.");
  }
};

export const parseCreateOrganizationBody = (body = {}) => {
  const name = trimOrNull(body.name);
  const slugInput = trimOrNull(body.slug);
  const planCode = trimOrNull(body.plan_code) || "starter";
  const tradeName = trimOrNull(body.trade_name);
  const legalName = trimOrNull(body.legal_name);
  const taxId = trimOrNull(body.tax_id);
  const taxIdTypeRaw = trimOrNull(body.tax_id_type)?.toLowerCase() || null;
  const commercialStatusRaw =
    trimOrNull(body.commercial_status)?.toLowerCase() || "prueba";
  const activateOnCreate = body.activate_on_create !== false;
  const demoSeedEnabled = body.demo_seed_enabled === true;

  const slug = normalizeOrganizationSlug(slugInput || name || "organization");

  if (!name) {
    throw new HttpError(400, "El nombre comercial de la empresa es obligatorio.");
  }

  if (!COMMERCIAL_STATUSES.has(commercialStatusRaw)) {
    throw new HttpError(422, "El estado comercial no es válido.");
  }

  if (taxIdTypeRaw && !TAX_ID_TYPES.has(taxIdTypeRaw)) {
    throw new HttpError(422, "El tipo de identificador fiscal no es válido.");
  }

  const needsFiscal =
    commercialStatusRaw === "activa" || commercialStatusRaw === "pendiente_pago";

  if (needsFiscal) {
    if (!legalName) {
      throw new HttpError(
        400,
        "La razón social es obligatoria para empresas activas o facturables."
      );
    }
    if (!taxId) {
      throw new HttpError(400, "El NIF/CIF es obligatorio para empresas activas.");
    }
    if (!taxIdTypeRaw) {
      throw new HttpError(400, "El tipo de identificador fiscal es obligatorio para empresas activas.");
    }
  }

  assertEmailFormat(
    normalizeEmail(body.billing_email),
    "El email de facturación no tiene un formato válido."
  );
  assertEmailFormat(
    normalizeEmail(body.commercial_contact_email),
    "El email de contacto comercial no tiene un formato válido."
  );

  const profilePatch = buildOwnerProfileSettingsPatch(body);

  const paymentMethod = profilePatch.owner_profile_payment_method;
  if (paymentMethod && !PAYMENT_METHODS.has(paymentMethod)) {
    throw new HttpError(422, "El método de pago previsto no es válido.");
  }

  const paymentTerms = profilePatch.owner_profile_payment_terms;
  if (paymentTerms && !PAYMENT_TERMS.has(paymentTerms)) {
    throw new HttpError(422, "Las condiciones de pago no son válidas.");
  }

  const lang = trimOrNull(body.preferred_language)?.toLowerCase();
  if (lang && !["es", "ca", "en"].includes(lang)) {
    throw new HttpError(422, "El idioma preferido no es válido.");
  }

  const channel = trimOrNull(body.preferred_contact_channel)?.toLowerCase();
  if (channel && !["email", "telefono", "whatsapp", "indistinto"].includes(channel)) {
    throw new HttpError(422, "El canal de contacto preferido no es válido.");
  }

  const organizationFields = {
    name,
    slug,
    plan_code: planCode,
    is_active: activateOnCreate,
    trade_name: tradeName || null,
    legal_name: legalName || null,
    tax_id: taxId || null,
    tax_id_type: taxIdTypeRaw || null,
    commercial_status: commercialStatusRaw,
    demo_seed_enabled: demoSeedEnabled,
  };

  return {
    name,
    slug,
    planCode,
    organizationFields,
    profilePatch,
    subscriptionStatus: commercialStatusToSubscriptionStatus(commercialStatusRaw),
    trialStartsAt: trimOrNull(body.trial_starts_at),
    trialEndsAt: trimOrNull(body.trial_ends_at),
    activateOnCreate,
    initialAdmin: {
      enabled: body.create_initial_admin === true,
      full_name: trimOrNull(body.initial_admin_full_name),
      email: normalizeEmail(body.initial_admin_email),
      phone: trimOrNull(body.initial_admin_phone),
      access_mode: trimOrNull(body.initial_admin_access_mode) || "invite",
      temporary_password: body.initial_admin_temporary_password
        ? String(body.initial_admin_temporary_password)
        : "",
    },
  };
};

export const parsePatchOrganizationBody = (body = {}) => {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    if (!trimOrNull(body.name)) {
      throw new HttpError(400, "El nombre comercial no puede quedar vacío.");
    }
    patch.name = trimOrNull(body.name);
  }
  if (Object.prototype.hasOwnProperty.call(body, "trade_name")) {
    patch.trade_name = trimOrNull(body.trade_name);
  }
  if (Object.prototype.hasOwnProperty.call(body, "legal_name")) {
    patch.legal_name = trimOrNull(body.legal_name);
  }
  if (Object.prototype.hasOwnProperty.call(body, "tax_id")) {
    patch.tax_id = trimOrNull(body.tax_id);
  }
  if (Object.prototype.hasOwnProperty.call(body, "tax_id_type")) {
    patch.tax_id_type = trimOrNull(body.tax_id_type)?.toLowerCase() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "commercial_status")) {
    patch.commercial_status = trimOrNull(body.commercial_status)?.toLowerCase() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "slug")) {
    const s = trimOrNull(body.slug);
    patch.slug = s ? normalizeOrganizationSlug(s) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
    patch.is_active = Boolean(body.is_active);
  }
  if (Object.prototype.hasOwnProperty.call(body, "demo_seed_enabled")) {
    patch.demo_seed_enabled = body.demo_seed_enabled === true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "billing_email")) {
    assertEmailFormat(
      normalizeEmail(body.billing_email),
      "El email de facturación no tiene un formato válido."
    );
  }
  if (Object.prototype.hasOwnProperty.call(body, "commercial_contact_email")) {
    assertEmailFormat(
      normalizeEmail(body.commercial_contact_email),
      "El email de contacto comercial no tiene un formato válido."
    );
  }

  const profilePatch = buildOwnerProfileSettingsPatch(body, { partial: true });

  if (patch.commercial_status && !COMMERCIAL_STATUSES.has(patch.commercial_status)) {
    throw new HttpError(422, "El estado comercial no es válido.");
  }
  if (patch.tax_id_type && !TAX_ID_TYPES.has(patch.tax_id_type)) {
    throw new HttpError(422, "El tipo de identificador fiscal no es válido.");
  }

  const pm = profilePatch.owner_profile_payment_method;
  if (pm && !PAYMENT_METHODS.has(pm)) {
    throw new HttpError(422, "El método de pago previsto no es válido.");
  }
  const pt = profilePatch.owner_profile_payment_terms;
  if (pt && !PAYMENT_TERMS.has(pt)) {
    throw new HttpError(422, "Las condiciones de pago no son válidas.");
  }

  if (Object.prototype.hasOwnProperty.call(body, "preferred_language")) {
    const lang = trimOrNull(body.preferred_language)?.toLowerCase();
    if (lang && !["es", "ca", "en"].includes(lang)) {
      throw new HttpError(422, "El idioma preferido no es válido.");
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "preferred_contact_channel")) {
    const channel = trimOrNull(body.preferred_contact_channel)?.toLowerCase();
    if (channel && !["email", "telefono", "whatsapp", "indistinto"].includes(channel)) {
      throw new HttpError(422, "El canal de contacto preferido no es válido.");
    }
  }

  return { organizationPatch: patch, profilePatch };
};
