#!/usr/bin/env node
/**
 * Contract: multi-tenant isolation (IDOR) for tenant-scoped entity access.
 * Spawns a throwaway server with APP_DATA_DIR in a temp directory (same idea as rest-smoke).
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = Number(process.env.APP_MT_ISOLATION_PORT || 3027);
const BASE_URL = `http://${HOST}:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (message) => {
  throw new Error(`multitenant-isolation-contract: ${message}`);
};

const assertForbiddenOrNotFound = (status, context) => {
  if (status !== 403 && status !== 404) {
    fail(`${context}: expected 403 or 404, got ${status}`);
  }
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
    process.stdout.write(`[mt-isolation:server] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[mt-isolation:server] ${chunk}`);
  });

  return child;
};

const runContract = async () => {
  const suffix = randomBytes(5).toString("hex");
  const emailA = `mt-a-${suffix}@local.test`;
  const emailB = `mt-b-${suffix}@local.test`;
  const orgSlugA = `mt-a-${suffix}`;
  const orgSlugB = `mt-b-${suffix}`;
  const clientName = `MT-IDOR-CLIENT-A-${suffix}`;

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frigest-mt-isolation-"));
  const tempDataDir = path.join(tempRoot, "data");
  const tempUploadsDir = path.join(tempRoot, "uploads");

  const server = createServerProcess({
    dataDir: tempDataDir,
    uploadsDir: tempUploadsDir,
  });

  try {
    await waitForHealth();

    const ownerHeaders = {
      Authorization: "Bearer local-dev-token",
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Smoke-Owner": "true",
    };

    const ownerOrgA = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Empresa MT A ${suffix}`,
        slug: orgSlugA,
        plan_code: "starter",
      }),
    });
    const orgAId = ownerOrgA?.organization?.id;
    if (!orgAId) {
      fail("owner org A create did not return organization id.");
    }

    const ownerOrgB = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Empresa MT B ${suffix}`,
        slug: orgSlugB,
        plan_code: "starter",
      }),
    });
    const orgBId = ownerOrgB?.organization?.id;
    if (!orgBId) {
      fail("owner org B create did not return organization id.");
    }

    await request(`/api/organizations/${encodeURIComponent(orgAId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: emailA,
        full_name: "Admin MT A",
        role: "admin",
        temporary_password: "TempPass123!",
      }),
    });

    await request(`/api/organizations/${encodeURIComponent(orgBId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: emailB,
        full_name: "Admin MT B",
        role: "admin",
        temporary_password: "TempPass123!",
      }),
    });

    const loginA = await loginViaRedirect({
      pathname: "/api/auth/login",
      formFields: {
        email: emailA,
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      },
    });
    if (!loginA.token) {
      fail(`admin A login failed. location=${loginA.location}`);
    }

    const loginB = await loginViaRedirect({
      pathname: "/api/auth/login",
      formFields: {
        email: emailB,
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      },
    });
    if (!loginB.token) {
      fail(`admin B login failed. location=${loginB.location}`);
    }

    const headersA = {
      Authorization: `Bearer ${loginA.token}`,
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Organization-Id": orgAId,
    };

    const headersB = {
      Authorization: `Bearer ${loginB.token}`,
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Organization-Id": orgBId,
    };

    const clientA = await request("/api/entities/Client", {
      method: "POST",
      headers: headersA,
      body: JSON.stringify({ name: clientName }),
    });
    if (!clientA?.id) {
      fail("creating Client in org A did not return id.");
    }
    if (clientA.organization_id !== orgAId) {
      fail(`Client A organization_id mismatch: expected ${orgAId}, got ${clientA.organization_id}`);
    }

    const listB = await request("/api/entities/Client", { headers: headersB });
    if (!Array.isArray(listB)) {
      fail("GET Client list for admin B must return an array.");
    }
    if (listB.some((row) => row.id === clientA.id)) {
      fail("admin B list leaked Client row from org A.");
    }
    for (const row of listB) {
      if (row.organization_id && row.organization_id !== orgBId) {
        fail(`admin B list contained foreign organization_id=${row.organization_id}`);
      }
    }

    const queryB = await request("/api/entities/Client/query", {
      method: "POST",
      headers: headersB,
      body: JSON.stringify({
        filter: { id: clientA.id, organization_id: orgAId },
        limit: 50,
      }),
    });
    if (!Array.isArray(queryB)) {
      fail("POST Client/query must return an array.");
    }
    if (queryB.length !== 0) {
      fail("Client/query must not return cross-tenant rows when filter targets another org.");
    }

    const getCross = await requestExpectFailure(
      `/api/entities/Client/${encodeURIComponent(clientA.id)}`,
      { headers: headersB }
    );
    assertForbiddenOrNotFound(getCross.status, "GET Client by id (cross-tenant)");

    const patchCross = await requestExpectFailure(
      `/api/entities/Client/${encodeURIComponent(clientA.id)}`,
      {
        method: "PATCH",
        headers: headersB,
        body: JSON.stringify({ name: "pwned" }),
      }
    );
    assertForbiddenOrNotFound(patchCross.status, "PATCH Client (cross-tenant)");

    const deleteCross = await requestExpectFailure(
      `/api/entities/Client/${encodeURIComponent(clientA.id)}`,
      {
        method: "DELETE",
        headers: headersB,
      }
    );
    assertForbiddenOrNotFound(deleteCross.status, "DELETE Client (cross-tenant)");

    const hijackBody = await request("/api/entities/Client", {
      method: "POST",
      headers: headersB,
      body: JSON.stringify({
        name: `MT-IDOR-HIJACK-${suffix}`,
        organization_id: orgAId,
      }),
    });
    if (hijackBody.organization_id !== orgBId) {
      fail(
        `POST Client must assign current organization, not body organization_id. Got ${hijackBody.organization_id}`
      );
    }

    const meBWithForeignHeader = await request("/api/auth/me", {
      headers: {
        ...headersB,
        "X-Organization-Id": orgAId,
      },
    });
    if (meBWithForeignHeader?.current_organization?.id !== orgBId) {
      fail(
        "session organization must not switch to a foreign org via x-organization-id without membership."
      );
    }
    const listBWithForeignHeader = await request("/api/entities/Client", {
      headers: {
        ...headersB,
        "X-Organization-Id": orgAId,
      },
    });
    if (!Array.isArray(listBWithForeignHeader)) {
      fail("GET Client with foreign x-organization-id must still return array.");
    }
    if (listBWithForeignHeader.some((row) => row.id === clientA.id)) {
      fail("Foreign x-organization-id must not leak org A Client rows.");
    }

    console.log(
      "multitenant-isolation-contract: OK (Client entity; multi-org user header tests skipped — API restricts one org per user)."
    );
  } finally {
    server.kill("SIGTERM");
    await sleep(400);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
};

runContract().catch((error) => {
  console.error("[multitenant-isolation-contract] FAILED");
  console.error(error);
  process.exitCode = 1;
});
