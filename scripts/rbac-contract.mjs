#!/usr/bin/env node
/**
 * Contract: role-based access (RBAC) for sensitive API routes.
 * Spawns a temporary server (same pattern as multitenant-isolation-contract).
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = Number(process.env.APP_RBAC_CONTRACT_PORT || 3028);
const BASE_URL = `http://${HOST}:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (message) => {
  throw new Error(`rbac-contract: ${message}`);
};

const request = async (pathname, options = {}) => {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} ${pathname} failed (${response.status}): ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
  }

  return body;
};

const requestExpectFailure = async (pathname, options = {}) => {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return {
    ok: response.ok,
    status: response.status,
    body,
    headers: response.headers,
  };
};

const parseAccessTokenFromRedirect = (locationHeader) => {
  if (!locationHeader) {
    return null;
  }
  const url = new URL(locationHeader, BASE_URL);
  return url.searchParams.get("access_token");
};

const loginViaRedirect = async ({ pathname, formFields }) => {
  const body = new URLSearchParams(formFields || {}).toString();
  const result = await requestExpectFailure(pathname, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const location = result.headers.get("location") || "";
  const token = parseAccessTokenFromRedirect(location);
  return {
    status: result.status,
    location,
    token,
  };
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await request("/health");
      if (health?.ok) {
        return;
      }
    } catch (_error) {
      await sleep(500);
    }
  }

  fail("server did not become healthy in time.");
};

const createServerProcess = ({ dataDir, uploadsDir }) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      /**
       * Deterministic security: do not inherit dev auth bypass from the parent shell.
       * Without this, NODE_ENV defaults to "development" and APP_ALLOW_AUTH_BYPASS defaults
       * to true, so anonymous requests resolve as a visible demo user (GET /api/auth/me → 200).
       */
      NODE_ENV: "test",
      APP_ALLOW_AUTH_BYPASS: "false",
      APP_DEV_TOKEN: "local-dev-token",
      APP_ALLOWED_ORIGINS: "",
      APP_TRUST_PROXY: "false",
      APP_SERVER_HOST: HOST,
      APP_SERVER_PORT: String(PORT),
      APP_ID: "local-app",
      APP_SMOKE_OWNER: "true",
      APP_DATA_DIR: dataDir,
      APP_UPLOADS_DIR: uploadsDir,
      APP_SEED_DEMO_USERS: "true",
      APP_SETTINGS_SECRET:
        process.env.APP_SETTINGS_SECRET ||
        "smoke-local-app-settings-secret-key-at-least-32-chars-long!!",
      APP_COMPANY_PURCHASE_SMTP_STUB: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[rbac-contract:server] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[rbac-contract:server] ${chunk}`);
  });

  return child;
};

const jsonHeaders = (token, organizationId) => ({
  Authorization: `Bearer ${token}`,
  "X-App-Id": "local-app",
  "Content-Type": "application/json",
  ...(organizationId ? { "X-Organization-Id": organizationId } : {}),
});

const assertForbidden = (result, label) => {
  if (result.status !== 403) {
    fail(`${label}: expected 403, got ${result.status}: ${JSON.stringify(result.body)}`);
  }
};

const assertUnauthorized = (result, label) => {
  if (result.status !== 401) {
    fail(`${label}: expected 401, got ${result.status}: ${JSON.stringify(result.body)}`);
  }
};

const runContract = async () => {
  const suffix = randomBytes(5).toString("hex");
  const orgSlug = `rbac-org-${suffix}`;
  const emails = {
    admin: `rbac-admin-${suffix}@local.test`,
    oficina: `rbac-oficina-${suffix}@local.test`,
    tecnico: `rbac-tecnico-${suffix}@local.test`,
    ayudante: `rbac-ayudante-${suffix}@local.test`,
  };

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frigest-rbac-"));
  const tempDataDir = path.join(tempRoot, "data");
  const tempUploadsDir = path.join(tempRoot, "uploads");

  const server = createServerProcess({
    dataDir: tempDataDir,
    uploadsDir: tempUploadsDir,
  });

  try {
    await waitForHealth();

    const anonProbe = await requestExpectFailure("/api/auth/me", {
      headers: { "X-App-Id": "local-app" },
    });
    if (anonProbe.status !== 401) {
      fail(
        `RBAC contract requires APP_ALLOW_AUTH_BYPASS=false for deterministic anonymous checks; GET /api/auth/me without Authorization returned ${anonProbe.status} (expected 401). Fix: spawn child env must set APP_ALLOW_AUTH_BYPASS=false (and avoid implicit dev bypass). Body: ${JSON.stringify(anonProbe.body)}`
      );
    }

    const ownerHeaders = {
      Authorization: "Bearer local-dev-token",
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Smoke-Owner": "true",
    };

    const createdOrg = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Empresa RBAC ${suffix}`,
        slug: orgSlug,
        plan_code: "starter",
      }),
    });
    const orgId = createdOrg?.organization?.id;
    if (!orgId) {
      fail("owner org create did not return organization id.");
    }

    for (const [roleKey, email] of Object.entries(emails)) {
      await request(`/api/organizations/${encodeURIComponent(orgId)}/users`, {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email,
          full_name: `User ${roleKey}`,
          role: roleKey,
          temporary_password: "TempPass123!",
        }),
      });
    }

    const logins = {};
    for (const [roleKey, email] of Object.entries(emails)) {
      const login = await loginViaRedirect({
        pathname: "/api/auth/login",
        formFields: {
          email,
          password: "TempPass123!",
          redirect_uri: `${BASE_URL}/`,
        },
      });
      if (!login.token) {
        fail(`login failed for ${roleKey}: ${login.location}`);
      }
      logins[roleKey] = login.token;
    }

    const anonEntities = await requestExpectFailure("/api/entities/Client", {
      headers: { "X-App-Id": "local-app" },
    });
    assertUnauthorized(anonEntities, "anonymous GET /api/entities/Client");

    for (const roleKey of Object.keys(emails)) {
      await request("/api/auth/me", {
        headers: jsonHeaders(logins[roleKey], orgId),
      });
    }

    const invitePayload = {
      email: `rbac-invited-${suffix}@local.test`,
      role: "tecnico",
    };

    assertForbidden(
      await requestExpectFailure("/api/users/invite", {
        method: "POST",
        headers: jsonHeaders(logins.oficina, orgId),
        body: JSON.stringify(invitePayload),
      }),
      "POST /api/users/invite as oficina"
    );

    assertForbidden(
      await requestExpectFailure("/api/users/invite", {
        method: "POST",
        headers: jsonHeaders(logins.tecnico, orgId),
        body: JSON.stringify(invitePayload),
      }),
      "POST /api/users/invite as tecnico"
    );

    assertForbidden(
      await requestExpectFailure("/api/users/invite", {
        method: "POST",
        headers: jsonHeaders(logins.ayudante, orgId),
        body: JSON.stringify(invitePayload),
      }),
      "POST /api/users/invite as ayudante"
    );

    await request("/api/users/invite", {
      method: "POST",
      headers: jsonHeaders(logins.admin, orgId),
      body: JSON.stringify(invitePayload),
    });

    assertForbidden(
      await requestExpectFailure("/api/entities/User", {
        method: "POST",
        headers: jsonHeaders(logins.tecnico, orgId),
        body: JSON.stringify({
          email: `rbac-bad-user-${suffix}@local.test`,
          role: "tecnico",
          full_name: "No Create",
          is_active: true,
        }),
      }),
      "POST /api/entities/User as tecnico"
    );

    assertForbidden(
      await requestExpectFailure("/api/entities/User", {
        method: "POST",
        headers: jsonHeaders(logins.ayudante, orgId),
        body: JSON.stringify({
          email: `rbac-bad-user2-${suffix}@local.test`,
          role: "ayudante",
          full_name: "No Create",
          is_active: true,
        }),
      }),
      "POST /api/entities/User as ayudante"
    );

    for (const roleKey of Object.keys(emails)) {
      await request("/api/organizations/current", {
        headers: jsonHeaders(logins[roleKey], orgId),
      });
    }

    assertForbidden(
      await requestExpectFailure("/api/organizations/owner-overview", {
        headers: jsonHeaders(logins.admin, orgId),
      }),
      "GET /api/organizations/owner-overview as admin"
    );

    assertForbidden(
      await requestExpectFailure("/api/billing/checkout", {
        method: "POST",
        headers: jsonHeaders(logins.tecnico, orgId),
        body: JSON.stringify({ plan_code: "starter" }),
      }),
      "POST /api/billing/checkout as tecnico"
    );

    assertForbidden(
      await requestExpectFailure("/api/billing/portal", {
        method: "POST",
        headers: jsonHeaders(logins.tecnico, orgId),
        body: JSON.stringify({}),
      }),
      "POST /api/billing/portal as tecnico"
    );

    assertForbidden(
      await requestExpectFailure("/api/billing/contact-sales", {
        method: "POST",
        headers: jsonHeaders(logins.ayudante, orgId),
        body: JSON.stringify({ plan_code: "starter", message: "rbac" }),
      }),
      "POST /api/billing/contact-sales as ayudante"
    );

    assertForbidden(
      await requestExpectFailure("/api/billing/assign-plan", {
        method: "POST",
        headers: jsonHeaders(logins.admin, orgId),
        body: JSON.stringify({ organization_id: orgId, plan_code: "starter" }),
      }),
      "POST /api/billing/assign-plan as admin (owner only)"
    );

    await request("/api/billing/summary", {
      headers: jsonHeaders(logins.tecnico, orgId),
    });

    const sandboxPayload = JSON.stringify({ dry_run: true });
    await request("/api/functions/testVerifactuSandbox", {
      method: "POST",
      headers: jsonHeaders(logins.admin, orgId),
      body: sandboxPayload,
    });
    await request("/api/functions/testVerifactuSandbox", {
      method: "POST",
      headers: jsonHeaders(logins.oficina, orgId),
      body: sandboxPayload,
    });

    assertForbidden(
      await requestExpectFailure("/api/functions/testVerifactuSandbox", {
        method: "POST",
        headers: jsonHeaders(logins.tecnico, orgId),
        body: sandboxPayload,
      }),
      "POST /api/functions/testVerifactuSandbox as tecnico"
    );

    await request("/api/functions/retryVerifactuSubmissions", {
      method: "POST",
      headers: jsonHeaders(logins.admin, orgId),
      body: JSON.stringify({}),
    });

    assertForbidden(
      await requestExpectFailure("/api/functions/retryVerifactuSubmissions", {
        method: "POST",
        headers: jsonHeaders(logins.tecnico, orgId),
        body: JSON.stringify({}),
      }),
      "POST /api/functions/retryVerifactuSubmissions as tecnico"
    );

    await request("/api/functions/verifyInvoiceHashes", {
      method: "POST",
      headers: jsonHeaders(logins.admin, orgId),
      body: JSON.stringify({}),
    });

    assertForbidden(
      await requestExpectFailure("/api/functions/verifyInvoiceHashes", {
        method: "POST",
        headers: jsonHeaders(logins.ayudante, orgId),
        body: JSON.stringify({}),
      }),
      "POST /api/functions/verifyInvoiceHashes as ayudante"
    );

    await request("/api/ai/invoke", {
      method: "POST",
      headers: jsonHeaders(logins.tecnico, orgId),
      body: JSON.stringify({ prompt: "rbac-contract ping" }),
    });

    const settingsRows = await request("/api/entities/OrganizationSettings", {
      headers: jsonHeaders(logins.admin, orgId),
    });
    const settingsId =
      Array.isArray(settingsRows) && settingsRows[0]?.id ? settingsRows[0].id : null;
    if (!settingsId) {
      fail("expected OrganizationSettings row for test org.");
    }

    assertForbidden(
      await requestExpectFailure(
        `/api/entities/OrganizationSettings/${encodeURIComponent(settingsId)}`,
        {
          method: "PATCH",
          headers: jsonHeaders(logins.tecnico, orgId),
          body: JSON.stringify({ verifactu_nombre: `RBAC ${suffix}` }),
        }
      ),
      "PATCH /api/entities/OrganizationSettings as tecnico"
    );

    assertForbidden(
      await requestExpectFailure("/api/auth/me", {
        method: "PATCH",
        headers: jsonHeaders(logins.tecnico, orgId),
        body: JSON.stringify({ verifactu_nombre: `RBAC Patch ${suffix}` }),
      }),
      "PATCH /api/auth/me with organization settings fields as tecnico"
    );

    await request("/api/auth/me", {
      method: "PATCH",
      headers: jsonHeaders(logins.tecnico, orgId),
      body: JSON.stringify({ full_name: `RBAC Name ${suffix}` }),
    });

    assertForbidden(
      await requestExpectFailure("/api/account/me", {
        method: "DELETE",
        headers: jsonHeaders(logins.admin, orgId),
      }),
      "DELETE /api/account/me as admin"
    );

    assertForbidden(
      await requestExpectFailure("/api/account/me", {
        method: "DELETE",
        headers: jsonHeaders(logins.oficina, orgId),
      }),
      "DELETE /api/account/me as oficina"
    );

    await request("/api/organizations/owner-overview", {
      headers: ownerHeaders,
    });

    console.log("rbac-contract: OK");
  } finally {
    server.kill("SIGTERM");
    await sleep(400);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
};

runContract().catch((error) => {
  console.error("[rbac-contract] FAILED");
  console.error(error);
  process.exitCode = 1;
});
