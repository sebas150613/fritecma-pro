import express from "express";
import { URL } from "node:url";
import { asyncHandler } from "../lib/async-handler.js";
import {
  createPasswordHash,
  createSessionForCredentials,
  createSessionForPrivateCredentials,
  createSessionForUser,
  getUserStore,
  invalidateSessionToken,
  listAvailableUsers,
  requireAuth,
  stripSensitiveUserFields,
  syncMembershipSnapshotForUser,
  updateSessionOrganization,
  upsertOrganizationSettingsForOrganization,
} from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  getOrganizationMembershipStore,
  getOrganizationSettingsStore,
  getOrganizationStore,
  normalizeOrganizationSlug,
  sanitizeOrganizationSettingsForClient,
  splitOrganizationSettingsPatch,
} from "../lib/tenant.js";
import {
  ensureOrganizationSubscription,
  getOrganizationSubscriptionStore,
} from "../services/billing-service.js";
import {
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  createEmailVerificationToken,
  createPasswordResetToken,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/account-security-service.js";
import { serverConfig } from "../config.js";
import { createRateLimiter, getClientIp } from "../lib/rate-limit.js";

const router = express.Router();

const authLoginRateLimiter = createRateLimiter({
  namespace: "auth-login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator(req) {
    const ip = getClientIp(req);
    const raw = req.body?.email;
    const email =
      typeof raw === "string" && raw.trim() !== ""
        ? raw.trim().toLowerCase()
        : "";
    return `${ip}:${email || "no-email"}`;
  },
});
const userStore = getUserStore();
const organizationStore = getOrganizationStore();
const membershipStore = getOrganizationMembershipStore();
const organizationSettingsStore = getOrganizationSettingsStore();
const organizationSubscriptionStore = getOrganizationSubscriptionStore();

const DEFAULT_REDIRECT_URI = "http://127.0.0.1:5173/";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildRedirectWithToken = (redirectUri, token) => {
  const url = new URL(redirectUri);
  url.searchParams.set("access_token", token);
  url.searchParams.set("from_url", redirectUri);
  return url.toString();
};

const buildAuthViewUrl = (
  pathname,
  { redirectUri, error, mode, extraParams = {} } = {}
) => {
  const url = new URL(pathname, "http://127.0.0.1:3000");

  if (redirectUri) {
    url.searchParams.set("redirect_uri", redirectUri);
  }
  if (error) {
    url.searchParams.set("error", error);
  }
  if (mode) {
    url.searchParams.set("mode", mode);
  }
  for (const [key, value] of Object.entries(extraParams || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return `${url.pathname}${url.search}`;
};

const isBrowserFormRequest = (req) => {
  const contentType = String(req.headers["content-type"] || "");
  const accept = String(req.headers.accept || "");

  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    accept.includes("text/html")
  );
};

const sendAuthSuccessResponse = (req, res, session, redirectUri, status = 200) => {
  if (isBrowserFormRequest(req)) {
    return res.redirect(buildRedirectWithToken(redirectUri, session.token));
  }

  return res.status(status).json({
    access_token: session.token,
    user: session.user,
    organization: session.organization,
  });
};

const handleAuthActionError = (
  req,
  res,
  error,
  { pathname, redirectUri, mode, extraParams }
) => {
  if (isBrowserFormRequest(req)) {
    return res.redirect(
      buildAuthViewUrl(pathname, {
        redirectUri,
        error: error.message || "Unexpected error",
        mode,
        extraParams,
      })
    );
  }

  throw error;
};

const buildServerBaseUrl = (req) => {
  const forwardedProto = req.headers["x-forwarded-proto"]?.toString();
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  if (host) {
    return `${forwardedProto || req.protocol || "http"}://${host}`;
  }

  return `http://${serverConfig.host}:${serverConfig.port}`;
};

const buildAppRedirectUri = (req, explicitRedirectUri) => {
  const candidate = String(explicitRedirectUri || "").trim();
  if (candidate) {
    return candidate;
  }

  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    return `${origin.replace(/\/+$/, "")}/`;
  }

  return DEFAULT_REDIRECT_URI;
};

const findUserByEmail = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const users = await userStore.filter({
    filter: { email: normalizedEmail },
    limit: 1,
  });

  return users[0] || null;
};

const renderStatusPage = ({
  title,
  message,
  actionLabel = "",
  actionHref = "",
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 32%),
          linear-gradient(180deg, #f3f7fb 0%, #eef4f2 100%);
        color: #102236;
      }
      .card {
        width: 100%;
        max-width: 520px;
        padding: 30px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(16, 34, 54, 0.12);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
      h1 { margin: 0 0 12px; font-size: 30px; }
      p { color: #5f6e7c; line-height: 1.6; }
      a {
        display: inline-flex;
        margin-top: 18px;
        padding: 12px 16px;
        border-radius: 14px;
        background: linear-gradient(135deg, #0f766e 0%, #0b4f54 100%);
        color: #ffffff;
        text-decoration: none;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${actionLabel && actionHref ? `<a href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>` : ""}
    </div>
  </body>
</html>`;

const sendVerificationEmailForUser = async (req, user, organizationName, redirectUri) => {
  if (!user?.email) {
    return null;
  }

  const tokenRecord = await createEmailVerificationToken({
    userId: user.id,
    email: user.email,
  });
  const verificationUrl = `${buildServerBaseUrl(
    req
  )}/api/auth/verify-email?token=${encodeURIComponent(
    tokenRecord.token
  )}&redirect_uri=${encodeURIComponent(buildAppRedirectUri(req, redirectUri))}`;

  return sendVerificationEmail({
    user,
    organizationName,
    verificationUrl,
  });
};

const renderAuthPage = async ({
  redirectUri,
  errorMessage = "",
  mode = "login",
}) => {
  const users = serverConfig.allowAuthBypass
    ? (await listAvailableUsers()).filter((user) => user.is_active !== false)
    : [];

  const userOptions = users
    .map(
      (user) =>
        `<option value="${escapeHtml(user.id)}">${escapeHtml(
          `${user.full_name} (${user.email})`
        )}</option>`
    )
    .join("");

  const loginIsActive = true;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FRIGEST Access</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #102236;
        --muted: #5f6e7c;
        --panel: rgba(255, 255, 255, 0.94);
        --line: rgba(16, 34, 54, 0.12);
        --brand: #0f766e;
        --brand-deep: #0b4f54;
        --brand-soft: #dff4ef;
        --danger-bg: #fff0eb;
        --danger-ink: #9a3412;
        --shadow: 0 28px 70px rgba(15, 23, 42, 0.16);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Arial, sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.2), transparent 36%),
          radial-gradient(circle at bottom right, rgba(15, 23, 42, 0.12), transparent 32%),
          linear-gradient(135deg, #f3f7fb 0%, #edf4f3 100%);
      }
      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(280px, 420px) minmax(320px, 680px);
        gap: 28px;
        align-items: center;
        justify-content: center;
        padding: 40px 24px;
      }
      .hero, .panel {
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .hero {
        padding: 36px;
        background:
          linear-gradient(160deg, rgba(11, 79, 84, 0.98), rgba(16, 34, 54, 0.96));
        color: #f8fafc;
      }
      .eyebrow {
        display: inline-flex;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 18px 0 14px;
        font-size: 40px;
        line-height: 1.05;
      }
      .hero p {
        margin: 0;
        line-height: 1.65;
        color: rgba(241, 245, 249, 0.84);
      }
      .hero ul {
        margin: 28px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 12px;
      }
      .hero li {
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(248, 250, 252, 0.92);
      }
      .panel {
        background: var(--panel);
        backdrop-filter: blur(10px);
      }
      .panel-head {
        padding: 28px 30px 0;
      }
      .tabs {
        display: inline-grid;
        grid-auto-flow: column;
        gap: 8px;
        padding: 8px;
        border-radius: 18px;
        background: #e7eef4;
      }
      .tab {
        padding: 10px 16px;
        border-radius: 12px;
        color: var(--muted);
        font-weight: 700;
        text-decoration: none;
      }
      .tab.active {
        background: #ffffff;
        color: var(--ink);
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
      }
      .error {
        margin: 24px 30px 0;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(154, 52, 18, 0.18);
        background: var(--danger-bg);
        color: var(--danger-ink);
        font-weight: 600;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 20px;
        padding: 28px 30px 30px;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 22px;
        background: #ffffff;
      }
      .card.active {
        border-color: rgba(15, 118, 110, 0.28);
        box-shadow: 0 18px 30px rgba(15, 118, 110, 0.1);
      }
      .card h2 {
        margin: 0 0 8px;
        font-size: 22px;
      }
      .card p {
        margin: 0 0 18px;
        color: var(--muted);
        line-height: 1.55;
      }
      label {
        display: block;
        margin: 14px 0 8px;
        font-size: 13px;
        font-weight: 700;
        color: var(--ink);
      }
      input, select, button {
        width: 100%;
        border-radius: 14px;
        padding: 13px 14px;
        font-size: 14px;
      }
      input, select {
        border: 1px solid #d6dee6;
        background: #fbfdff;
        color: var(--ink);
      }
      input:focus, select:focus {
        outline: 2px solid rgba(15, 118, 110, 0.2);
        border-color: rgba(15, 118, 110, 0.5);
      }
      button {
        margin-top: 18px;
        border: 0;
        background: linear-gradient(135deg, var(--brand) 0%, var(--brand-deep) 100%);
        color: #ffffff;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 14px 24px rgba(11, 79, 84, 0.22);
      }
      .muted {
        margin-top: 14px;
        font-size: 12px;
        color: var(--muted);
        line-height: 1.55;
      }
      .dev {
        margin: 0 30px 30px;
        padding: 22px;
        border-radius: 22px;
        background: var(--brand-soft);
        border: 1px solid rgba(15, 118, 110, 0.12);
      }
      .dev h3 {
        margin: 0 0 6px;
        font-size: 18px;
      }
      .footer-note {
        padding: 0 30px 30px;
        font-size: 12px;
        color: var(--muted);
      }
      .link {
        color: var(--brand-deep);
        font-weight: 700;
        text-decoration: none;
      }
      @media (max-width: 980px) {
        .shell {
          grid-template-columns: 1fr;
          max-width: 760px;
          margin: 0 auto;
        }
        h1 {
          font-size: 34px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="eyebrow">FRIGEST SaaS</div>
        <h1>Gestion profesional para empresas de frio y servicio tecnico.</h1>
        <p>
          Accede con una cuenta corporativa, manteniendo el aislamiento por
          organizacion y la configuracion fiscal separada por empresa.
        </p>
        <ul>
          <li>Multi-tenant con aislamiento por organizacion y suscripcion.</li>
          <li>Configuracion fiscal y VeriFactu separadas por empresa.</li>
          <li>Base compatible con PostgreSQL para despliegue SaaS serio.</li>
        </ul>
      </section>

      <main class="panel">
        <div class="panel-head">
          <div class="tabs">
            <a class="tab active" href="${escapeHtml(
              buildAuthViewUrl("/api/auth/login", { redirectUri, mode: "login" })
            )}">Entrar</a>
          </div>
        </div>

        ${
          errorMessage
            ? `<div class="error">${escapeHtml(errorMessage)}</div>`
            : ""
        }

        <div class="grid">
          <section class="card ${loginIsActive ? "active" : ""}">
            <h2>Acceso de empresa</h2>
            <p>Inicia sesion con email y contrasena. Cada usuario entra en la organizacion que le corresponde.</p>
            <form method="post" action="/api/auth/login">
              <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
              <label for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="username" required />
              <label for="password">Contrasena</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required />
              <button type="submit">Entrar en FRIGEST</button>
              <div class="muted">
                <a class="link" href="${escapeHtml(
                  buildAuthViewUrl("/api/auth/forgot-password", { redirectUri })
                )}">Recuperar contrasena</a><br />
                El acceso privado de propietaria se mantiene separado en
                <a class="link" href="${escapeHtml(
                  buildAuthViewUrl("/api/auth/private-login", { redirectUri })
                )}">private login</a>.
              </div>
            </form>
          </section>

          <section class="card">
            <h2>Alta de organizacion</h2>
            <p>Activa una empresa nueva con su administrador inicial y un trial profesional sobre el plan Starter.</p>
            ${
              serverConfig.publicSignupEnabled
                ? `<form method="post" action="/api/auth/signup">
              <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
              <label for="organization_name">Empresa</label>
              <input id="organization_name" name="organization_name" type="text" autocomplete="organization" required />
              <label for="organization_slug">Slug</label>
              <input id="organization_slug" name="organization_slug" type="text" placeholder="mi-empresa" />
              <label for="full_name">Nombre del administrador</label>
              <input id="full_name" name="full_name" type="text" autocomplete="name" required />
              <label for="signup_email">Email</label>
              <input id="signup_email" name="email" type="email" autocomplete="email" required />
              <label for="signup_password">Contrasena</label>
              <input id="signup_password" name="password" type="password" autocomplete="new-password" minlength="8" required />
              <button type="submit">Crear cuenta y empresa</button>
              <div class="muted">
                Se crea la organizacion, el usuario administrador y la suscripcion Starter en prueba durante 15 dias.
              </div>
            </form>`
                : `<div class="muted">
              El alta publica esta desactivada en este entorno. Activa
              <code>APP_PUBLIC_SIGNUP_ENABLED=true</code> para abrir onboarding directo.
            </div>`
            }
          </section>
        </div>

        ${
          serverConfig.allowAuthBypass
            ? `<section class="dev">
          <h3>Acceso local de desarrollo</h3>
          <p class="muted" style="margin-top: 0;">
            Este bloque solo existe para entornos de desarrollo con bypass activo.
          </p>
          <form method="post" action="/api/auth/login">
            <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
            <label for="user_id">Usuario local</label>
            <select id="user_id" name="user_id">${userOptions}</select>
            <button type="submit">Entrar con usuario local</button>
          </form>
        </section>`
            : ""
        }

        <div class="footer-note">
          Redireccion actual:
          <code>${escapeHtml(redirectUri)}</code>
        </div>
      </main>
    </div>
  </body>
</html>`;
};

const createOrganizationSignup = async ({
  organizationName,
  organizationSlug,
  fullName,
  email,
  password,
}) => {
  const normalizedOrganizationName = String(organizationName || "").trim();
  const normalizedFullName = String(fullName || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedSlug = normalizeOrganizationSlug(
    String(organizationSlug || normalizedOrganizationName)
  );

  if (!serverConfig.publicSignupEnabled) {
    throw new HttpError(403, "Public signup is disabled");
  }

  if (normalizedOrganizationName.length < 2) {
    throw new HttpError(422, "Organization name is required");
  }

  if (normalizedFullName.length < 2) {
    throw new HttpError(422, "Full name is required");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new HttpError(422, "Email address is not valid");
  }

  const existingUsers = await userStore.list();
  if (
    existingUsers.some(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    )
  ) {
    throw new HttpError(409, "An account already exists for that email address");
  }

  const existingOrganizations = await organizationStore.filter({
    filter: { slug: normalizedSlug },
    limit: 1,
  });
  if (existingOrganizations[0]) {
    throw new HttpError(409, "An organization with that slug already exists");
  }

  let createdUser = null;
  let createdOrganization = null;
  let createdMembership = null;
  let createdOrganizationSettings = null;
  let createdSubscription = null;

  try {
    createdUser = await userStore.create({
      email: normalizedEmail,
      full_name: normalizedFullName,
      role: "admin",
      is_active: true,
      password_hash: createPasswordHash(password),
    });

    createdOrganization = await organizationStore.create({
      name: normalizedOrganizationName,
      slug: normalizedSlug,
      is_active: true,
      plan_code: "starter",
    });

    createdMembership = await membershipStore.create({
      organization_id: createdOrganization.id,
      organization_name: createdOrganization.name,
      user_id: createdUser.id,
      user_email: createdUser.email || "",
      user_name: createdUser.full_name || createdUser.email || "Invitado",
      role: "admin",
      status: "active",
    });

    createdOrganizationSettings = await organizationSettingsStore.create({
      organization_id: createdOrganization.id,
      verifactu_nombre: createdOrganization.name,
      verifactu_produccion: false,
    });

    createdSubscription = await ensureOrganizationSubscription(createdOrganization, {
      planCode: "starter",
      status: "trialing",
      trialDays: 15,
    });

    const session = await createSessionForUser(createdUser.id, {
      organizationId: createdOrganization.id,
    });

    return {
      token: session.token,
      user: session.user,
      organization: createdOrganization,
    };
  } catch (error) {
    if (createdSubscription?.id) {
      await organizationSubscriptionStore
        .delete(createdSubscription.id)
        .catch(() => {});
    }
    if (createdOrganizationSettings?.id) {
      await organizationSettingsStore
        .delete(createdOrganizationSettings.id)
        .catch(() => {});
    }
    if (createdMembership?.id) {
      await membershipStore.delete(createdMembership.id).catch(() => {});
    }
    if (createdOrganization?.id) {
      await organizationStore.delete(createdOrganization.id).catch(() => {});
    }
    if (createdUser?.id) {
      await userStore.delete(createdUser.id).catch(() => {});
    }
    throw error;
  }
};

const getInvitationContext = async (token) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const users = await userStore.filter({
    filter: { invitation_token: normalizedToken },
    limit: 1,
  });
  const user = users[0] || null;

  if (!user || user.is_active === false) {
    return null;
  }

  const memberships = await membershipStore.filter({
    filter: { user_id: user.id },
  });
  const membership = memberships.find((item) => item.status !== "disabled") || memberships[0] || null;

  return {
    user,
    membership,
  };
};

const renderInviteAcceptancePage = async ({
  token,
  redirectUri,
  errorMessage = "",
}) => {
  const invite = await getInvitationContext(token);

  if (!invite) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invitation Not Found</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: #f6f7fb;
        color: #102236;
      }
      .card {
        width: 100%;
        max-width: 480px;
        padding: 28px;
        border-radius: 22px;
        background: #ffffff;
        border: 1px solid rgba(16, 34, 54, 0.12);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
      a { color: #0b4f54; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Invitation unavailable</h1>
      <p>The invitation token is invalid, expired, or has already been used.</p>
      <p><a href="${escapeHtml(
        buildAuthViewUrl("/api/auth/login", { redirectUri })
      )}">Go back to login</a></p>
    </div>
  </body>
</html>`;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Accept Invitation</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 32%),
          linear-gradient(180deg, #f3f7fb 0%, #eef4f2 100%);
        color: #102236;
      }
      .card {
        width: 100%;
        max-width: 520px;
        padding: 30px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(16, 34, 54, 0.12);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
      .eyebrow {
        display: inline-flex;
        padding: 8px 12px;
        border-radius: 999px;
        background: #dff4ef;
        color: #0b4f54;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 { margin: 16px 0 8px; font-size: 30px; }
      p { color: #5f6e7c; line-height: 1.6; }
      .meta {
        margin-top: 18px;
        padding: 16px;
        border-radius: 16px;
        background: #f8fafc;
        border: 1px solid rgba(16, 34, 54, 0.08);
      }
      .meta strong { color: #102236; }
      .error {
        margin-top: 18px;
        padding: 12px 14px;
        border-radius: 14px;
        background: #fff0eb;
        border: 1px solid rgba(154, 52, 18, 0.18);
        color: #9a3412;
        font-weight: 600;
      }
      label {
        display: block;
        margin: 16px 0 8px;
        font-size: 13px;
        font-weight: 700;
      }
      input, button {
        width: 100%;
        border-radius: 14px;
        padding: 13px 14px;
        font-size: 14px;
        box-sizing: border-box;
      }
      input {
        border: 1px solid #d6dee6;
        background: #fbfdff;
      }
      button {
        margin-top: 18px;
        border: 0;
        background: linear-gradient(135deg, #0f766e 0%, #0b4f54 100%);
        color: #ffffff;
        font-weight: 700;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <form class="card" method="post" action="/api/auth/accept-invite">
      <div class="eyebrow">FRIGEST Invite</div>
      <h1>Activate your account</h1>
      <p>Finish your access to <strong>${escapeHtml(
        invite.membership?.organization_name || "FRIGEST"
      )}</strong> by setting your password.</p>
      <div class="meta">
        <div><strong>Email:</strong> ${escapeHtml(invite.user.email || "")}</div>
        <div><strong>Role:</strong> ${escapeHtml(invite.membership?.role || invite.user.role || "tecnico")}</div>
      </div>
      ${
        errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""
      }
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <label for="full_name">Full name</label>
      <input id="full_name" name="full_name" type="text" value="${escapeHtml(
        invite.user.full_name || ""
      )}" autocomplete="name" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
      <button type="submit">Activate access</button>
    </form>
  </body>
</html>`;
};

const acceptInvitation = async ({ token, fullName, password }) => {
  const invite = await getInvitationContext(token);

  if (!invite) {
    throw new HttpError(404, "Invitation not found");
  }

  if (invite.user.password_hash) {
    throw new HttpError(409, "Invitation has already been accepted");
  }

  const updatedUser = await userStore.update(invite.user.id, {
    full_name: String(fullName || "").trim() || invite.user.full_name || invite.user.email,
    password_hash: createPasswordHash(password),
    invitation_token: null,
    invitation_accepted_at: new Date().toISOString(),
  });

  await syncMembershipSnapshotForUser(updatedUser, {
    includeRole: false,
    includeStatus: false,
  });

  return createSessionForUser(updatedUser.id, {
    organizationId: invite.membership?.organization_id || null,
  });
};

const requestPasswordReset = async (req, email, redirectUri) => {
  const user = await findUserByEmail(email);

  if (!user || user.is_active === false || !user.email) {
    return { success: true, queued: true };
  }

  const tokenRecord = await createPasswordResetToken({
    userId: user.id,
    email: user.email,
  });
  const resetUrl = `${buildServerBaseUrl(
    req
  )}/api/auth/reset-password?token=${encodeURIComponent(
    tokenRecord.token
  )}&redirect_uri=${encodeURIComponent(buildAppRedirectUri(req, redirectUri))}`;

  await sendPasswordResetEmail({
    user,
    resetUrl,
  });

  return { success: true, queued: true };
};

const resetPasswordWithToken = async ({ token, password }) => {
  const tokenRecord = await consumePasswordResetToken(token);

  if (!tokenRecord?.user_id) {
    throw new HttpError(404, "Password reset link is not valid");
  }

  const users = await userStore.filter({
    filter: { id: tokenRecord.user_id },
    limit: 1,
  });
  const user = users[0] || null;

  if (!user || user.is_active === false) {
    throw new HttpError(404, "Account not found");
  }

  const updatedUser = await userStore.update(user.id, {
    password_hash: createPasswordHash(password),
    password_reset_at: new Date().toISOString(),
  });

  return createSessionForUser(updatedUser.id);
};

const verifyEmailFromToken = async (token) => {
  const tokenRecord = await consumeEmailVerificationToken(token);

  if (!tokenRecord?.user_id) {
    throw new HttpError(404, "Verification link is not valid");
  }

  const users = await userStore.filter({
    filter: { id: tokenRecord.user_id },
    limit: 1,
  });
  const user = users[0] || null;

  if (!user || user.is_active === false) {
    throw new HttpError(404, "Account not found");
  }

  return userStore.update(user.id, {
    email_verified_at: new Date().toISOString(),
  });
};

const renderPasswordResetRequestPage = ({
  redirectUri,
  errorMessage = "",
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Password</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: linear-gradient(180deg, #f3f7fb 0%, #eef4f2 100%);
        color: #102236;
      }
      .card {
        width: 100%;
        max-width: 460px;
        padding: 30px;
        border-radius: 24px;
        background: #ffffff;
        border: 1px solid rgba(16, 34, 54, 0.12);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { color: #5f6e7c; line-height: 1.6; }
      label {
        display: block;
        margin: 16px 0 8px;
        font-size: 13px;
        font-weight: 700;
      }
      input, button {
        width: 100%;
        border-radius: 14px;
        padding: 13px 14px;
        font-size: 14px;
        box-sizing: border-box;
      }
      input { border: 1px solid #d6dee6; background: #fbfdff; }
      button {
        margin-top: 18px;
        border: 0;
        background: linear-gradient(135deg, #0f766e 0%, #0b4f54 100%);
        color: #ffffff;
        font-weight: 700;
        cursor: pointer;
      }
      .error {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        background: #fff0eb;
        border: 1px solid rgba(154, 52, 18, 0.18);
        color: #9a3412;
      }
    </style>
  </head>
  <body>
    <form class="card" method="post" action="/api/auth/forgot-password">
      <h1>Reset password</h1>
      <p>Introduce tu email y te enviaremos un enlace seguro para actualizar la contraseña.</p>
      ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required />
      <button type="submit">Enviar enlace</button>
    </form>
  </body>
</html>`;

const renderPasswordResetPage = ({
  token,
  redirectUri,
  errorMessage = "",
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Choose New Password</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: linear-gradient(180deg, #f3f7fb 0%, #eef4f2 100%);
        color: #102236;
      }
      .card {
        width: 100%;
        max-width: 460px;
        padding: 30px;
        border-radius: 24px;
        background: #ffffff;
        border: 1px solid rgba(16, 34, 54, 0.12);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { color: #5f6e7c; line-height: 1.6; }
      label {
        display: block;
        margin: 16px 0 8px;
        font-size: 13px;
        font-weight: 700;
      }
      input, button {
        width: 100%;
        border-radius: 14px;
        padding: 13px 14px;
        font-size: 14px;
        box-sizing: border-box;
      }
      input { border: 1px solid #d6dee6; background: #fbfdff; }
      button {
        margin-top: 18px;
        border: 0;
        background: linear-gradient(135deg, #0f766e 0%, #0b4f54 100%);
        color: #ffffff;
        font-weight: 700;
        cursor: pointer;
      }
      .error {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        background: #fff0eb;
        border: 1px solid rgba(154, 52, 18, 0.18);
        color: #9a3412;
      }
    </style>
  </head>
  <body>
    <form class="card" method="post" action="/api/auth/reset-password">
      <h1>Choose a new password</h1>
      <p>Define una contraseña nueva para tu cuenta de FRIGEST.</p>
      ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <label for="password">New password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
      <button type="submit">Actualizar contraseña</button>
    </form>
  </body>
</html>`;

router.get(
  "/login",
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.query.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const errorMessage = req.query.error?.toString() || "";
    const mode = req.query.mode?.toString() || "login";

    res.type("html").send(
      await renderAuthPage({
        redirectUri,
        errorMessage,
        mode,
      })
    );
  })
);

router.get(
  "/signup",
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.query.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    res.redirect(buildAuthViewUrl("/api/auth/login", { redirectUri, mode: "login" }));
  })
);

router.get(
  "/private-login",
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.query.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const errorMessage = req.query.error?.toString() || "";

    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FRIGEST Private Access</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
        color: #e2e8f0;
      }
      .card {
        width: 100%;
        max-width: 420px;
        padding: 28px;
        border-radius: 22px;
        background: rgba(15, 23, 42, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { color: #94a3b8; line-height: 1.6; }
      .error {
        margin: 18px 0 0;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(185, 28, 28, 0.14);
        border: 1px solid rgba(248, 113, 113, 0.18);
        color: #fecaca;
      }
      label {
        display: block;
        margin: 16px 0 8px;
        font-size: 13px;
        font-weight: 700;
      }
      input, button {
        width: 100%;
        border-radius: 14px;
        padding: 13px 14px;
        font-size: 14px;
        box-sizing: border-box;
      }
      input {
        border: 1px solid #334155;
        background: #0f172a;
        color: #f8fafc;
      }
      button {
        margin-top: 18px;
        border: 0;
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #ffffff;
        font-weight: 700;
        cursor: pointer;
      }
      a { color: #93c5fd; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <form class="card" method="post" action="/api/auth/private-login">
      <h1>Private Access</h1>
      <p>Acceso restringido a la propietaria de la plataforma.</p>
      ${
        errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""
      }
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required />
      <label for="password">Contrasena</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Entrar</button>
      <p><a href="${escapeHtml(
        buildAuthViewUrl("/api/auth/login", { redirectUri })
      )}">Volver al acceso general</a></p>
    </form>
  </body>
</html>`);
  })
);

router.post(
  "/login",
  authLoginRateLimiter,
  express.urlencoded({ extended: true }),
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.body?.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const userId = req.body?.user_id?.toString();
    const email = req.body?.email?.toString();
    const password = req.body?.password?.toString();

    try {
      const session = userId
        ? await createSessionForUser(userId)
        : await createSessionForCredentials(email, password, {
            allowHiddenOwner: true,
          });

      return sendAuthSuccessResponse(req, res, session, redirectUri);
    } catch (error) {
      return handleAuthActionError(req, res, error, {
        pathname: "/api/auth/login",
        redirectUri,
        mode: userId ? "login" : "login",
      });
    }
  })
);

router.post(
  "/signup",
  express.urlencoded({ extended: true }),
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.body?.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;

    try {
      const session = await createOrganizationSignup({
        organizationName: req.body?.organization_name,
        organizationSlug: req.body?.organization_slug,
        fullName: req.body?.full_name,
        email: req.body?.email,
        password: req.body?.password,
      });
      const verificationDelivery = await sendVerificationEmailForUser(
        req,
        session.user,
        session.organization?.name,
        redirectUri
      );

      if (isBrowserFormRequest(req)) {
        return sendAuthSuccessResponse(req, res, session, redirectUri, 201);
      }

      return res.status(201).json({
        access_token: session.token,
        user: session.user,
        organization: session.organization,
        email_verification_sent: true,
        verification_delivery: verificationDelivery,
      });
    } catch (error) {
      return handleAuthActionError(req, res, error, {
        pathname: "/api/auth/signup",
        redirectUri,
        mode: "signup",
      });
    }
  })
);

router.post(
  "/private-login",
  express.urlencoded({ extended: true }),
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.body?.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const email = req.body?.email?.toString();
    const password = req.body?.password?.toString();

    try {
      const session = await createSessionForPrivateCredentials(email, password);
      return sendAuthSuccessResponse(req, res, session, redirectUri);
    } catch (error) {
      return handleAuthActionError(req, res, error, {
        pathname: "/api/auth/private-login",
        redirectUri,
        mode: "login",
      });
    }
  })
);

router.get(
  "/accept-invite",
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.query.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const token = req.query.token?.toString() || "";
    const errorMessage = req.query.error?.toString() || "";

    res.type("html").send(
      await renderInviteAcceptancePage({
        token,
        redirectUri,
        errorMessage,
      })
    );
  })
);

router.post(
  "/accept-invite",
  express.urlencoded({ extended: true }),
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.body?.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const token = req.body?.token?.toString() || "";

    try {
      const session = await acceptInvitation({
        token,
        fullName: req.body?.full_name,
        password: req.body?.password,
      });
      const verificationDelivery = await sendVerificationEmailForUser(
        req,
        session.user,
        session.organization?.name,
        redirectUri
      );

      if (isBrowserFormRequest(req)) {
        return sendAuthSuccessResponse(req, res, session, redirectUri);
      }

      return res.json({
        access_token: session.token,
        user: session.user,
        organization: session.organization,
        email_verification_sent: true,
        verification_delivery: verificationDelivery,
      });
    } catch (error) {
      return handleAuthActionError(req, res, error, {
        pathname: "/api/auth/accept-invite",
        redirectUri,
        mode: "login",
        extraParams: {
          token,
        },
      });
    }
  })
);

router.get(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.query.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const errorMessage = req.query.error?.toString() || "";

    res.type("html").send(
      renderPasswordResetRequestPage({
        redirectUri,
        errorMessage,
      })
    );
  })
);

router.post(
  "/forgot-password",
  express.urlencoded({ extended: true }),
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.body?.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;

    try {
      await requestPasswordReset(req, req.body?.email, redirectUri);

      if (isBrowserFormRequest(req)) {
        return res.type("html").send(
          renderStatusPage({
            title: "Email sent",
            message:
              "Si la cuenta existe, hemos enviado un enlace seguro para restablecer la contraseña.",
            actionLabel: "Volver al login",
            actionHref: buildAuthViewUrl("/api/auth/login", { redirectUri }),
          })
        );
      }

      return res.json({
        success: true,
        queued: true,
      });
    } catch (error) {
      return handleAuthActionError(req, res, error, {
        pathname: "/api/auth/forgot-password",
        redirectUri,
        mode: "login",
      });
    }
  })
);

router.get(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.query.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const token = req.query.token?.toString() || "";
    const errorMessage = req.query.error?.toString() || "";

    res.type("html").send(
      renderPasswordResetPage({
        token,
        redirectUri,
        errorMessage,
      })
    );
  })
);

router.post(
  "/reset-password",
  express.urlencoded({ extended: true }),
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.body?.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const token = req.body?.token?.toString() || "";

    try {
      const session = await resetPasswordWithToken({
        token,
        password: req.body?.password,
      });

      if (isBrowserFormRequest(req)) {
        return sendAuthSuccessResponse(req, res, session, redirectUri);
      }

      return res.json({
        access_token: session.token,
        user: session.user,
        organization: session.organization,
      });
    } catch (error) {
      return handleAuthActionError(req, res, error, {
        pathname: "/api/auth/reset-password",
        redirectUri,
        mode: "login",
        extraParams: {
          token,
        },
      });
    }
  })
);

router.get(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const redirectUri =
      req.query.redirect_uri?.toString() || DEFAULT_REDIRECT_URI;
    const token = req.query.token?.toString() || "";

    try {
      await verifyEmailFromToken(token);

      if (req.headers.accept?.includes("application/json")) {
        return res.json({
          success: true,
        });
      }

      return res.type("html").send(
        renderStatusPage({
          title: "Email verificado",
          message:
            "Tu cuenta ya está verificada. Puedes volver a la aplicación y continuar con tu sesión.",
          actionLabel: "Abrir FRIGEST",
          actionHref: redirectUri,
        })
      );
    } catch (error) {
      if (req.headers.accept?.includes("application/json")) {
        throw error;
      }

      return res.type("html").send(
        renderStatusPage({
          title: "Verification unavailable",
          message: error.message || "The verification link is not valid.",
          actionLabel: "Volver al login",
          actionHref: buildAuthViewUrl("/api/auth/login", { redirectUri }),
        })
      );
    }
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(req.currentUser);
  })
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const split = splitOrganizationSettingsPatch(req.body || {});
    let organizationSettingsPatch = { ...split.organizationSettingsPatch };
    if (Object.prototype.hasOwnProperty.call(organizationSettingsPatch, "pedidos_smtp_pass")) {
      const pw = String(organizationSettingsPatch.pedidos_smtp_pass ?? "").trim();
      if (!pw) {
        delete organizationSettingsPatch.pedidos_smtp_pass;
      }
    }

    const { userPatch } = split;
    const hasUserPatch = Object.keys(userPatch).length > 0;
    const hasOrganizationSettingsPatch =
      Object.keys(organizationSettingsPatch).length > 0;

    const updatedUser = hasUserPatch
      ? await userStore.update(req.currentUser.id, userPatch)
      : null;

    if (updatedUser) {
      await syncMembershipSnapshotForUser(updatedUser, {
        includeRole: false,
        includeStatus: false,
      });
    }

    const updatedOrganizationSettings = hasOrganizationSettingsPatch
      ? await upsertOrganizationSettingsForOrganization(
          req.currentOrganization.id,
          organizationSettingsPatch
        )
      : req.currentOrganizationSettings;

    const sanitizedSettings = sanitizeOrganizationSettingsForClient(
      updatedOrganizationSettings || req.currentOrganizationSettings
    );

    res.json({
      ...req.currentUser,
      ...stripSensitiveUserFields(updatedUser || req.currentUser),
      ...sanitizedSettings,
      current_organization_settings: sanitizedSettings,
    });
  })
);

router.post(
  "/send-verification-email",
  requireAuth,
  asyncHandler(async (req, res) => {
    const delivery = await sendVerificationEmailForUser(
      req,
      req.currentUser,
      req.currentOrganization?.name,
      req.body?.redirect_uri
    );

    res.json({
      success: true,
      delivery,
    });
  })
);

router.post(
  "/switch-organization",
  requireAuth,
  asyncHandler(async (req, res) => {
    const organizationId = req.body?.organization_id?.toString();
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

    const context = await updateSessionOrganization(
      req.authSessionToken,
      organizationId
    );

    res.json(context.currentUser);
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

    await invalidateSessionToken(token);
    res.json({ success: true });
  })
);

router.get(
  "/logout-page",
  asyncHandler(async (req, res) => {
    const redirectUri = req.query.redirect_uri?.toString() || "/";
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUri)}" />
    <title>Logging out</title>
  </head>
  <body></body>
</html>`);
  })
);

export default router;
