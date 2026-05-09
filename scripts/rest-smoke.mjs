import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = Number(process.env.APP_SMOKE_PORT || 3020);
const BASE_URL = `http://${HOST}:${PORT}`;
const HEADERS = {
  Authorization: "Bearer local-dev-token",
  "X-App-Id": "local-app",
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJsonArray = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const writeJsonArray = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
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

const parseAuthErrorFromLocation = (locationHeader) => {
  if (!locationHeader) {
    return "";
  }
  const url = new URL(locationHeader, BASE_URL);
  return url.searchParams.get("error") || "";
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

  throw new Error("REST server did not become healthy in time.");
};

const readOptionalFile = async (filePath) => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[rest-smoke:server] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[rest-smoke:server] ${chunk}`);
  });

  return child;
};

const runSmoke = async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frigest-rest-smoke-"));
  const tempDataDir = path.join(tempRoot, "data");
  const tempUploadsDir = path.join(tempRoot, "uploads");
  const tempMembershipsFile = path.join(
    tempDataDir,
    "entities",
    "OrganizationMembership.json"
  );

  // Capture baseline local dev store snapshots to ensure smoke doesn't contaminate.
  const baselineDir = path.join(process.cwd(), "server", "data", "entities");
  const baselineSnapshots = {
    Organization: await readOptionalFile(path.join(baselineDir, "Organization.json")),
    User: await readOptionalFile(path.join(baselineDir, "User.json")),
    OrganizationMembership: await readOptionalFile(
      path.join(baselineDir, "OrganizationMembership.json")
    ),
    OrganizationSubscription: await readOptionalFile(
      path.join(baselineDir, "OrganizationSubscription.json")
    ),
    OrganizationSettings: await readOptionalFile(
      path.join(baselineDir, "OrganizationSettings.json")
    ),
  };

  const server = createServerProcess({
    dataDir: tempDataDir,
    uploadsDir: tempUploadsDir,
  });

  try {
    await waitForHealth();

    const publicSettings = await request(
      "/api/apps/public/prod/public-settings/by-id/local-app",
      {
        headers: {
          Authorization: "Bearer local-dev-token",
          "X-App-Id": "local-app",
        },
      }
    );

    const me = await request("/api/auth/me", {
      headers: {
        Authorization: "Bearer local-dev-token",
        "X-App-Id": "local-app",
      },
    });

    const updatedMe = await request("/api/auth/me", {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({
        verifactu_nif: "B12345678",
        verifactu_nombre: "FRIGEST TEST",
        verifactu_produccion: false,
      }),
    });

    const invitedUser = await request("/api/users/invite", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        email: "oficina-smoke@local.test",
        role: "oficina",
      }),
    });

    const publicForm = new FormData();
    publicForm.append(
      "file",
      new Blob(["smoke-public"], { type: "text/plain" }),
      "smoke-public.txt"
    );
    const publicUploadResponse = await fetch(`${BASE_URL}/api/files/public`, {
      method: "POST",
      headers: {
        Authorization: "Bearer local-dev-token",
        "X-App-Id": "local-app",
      },
      body: publicForm,
    });
    const publicUpload = await publicUploadResponse.json();
    if (!publicUploadResponse.ok) {
      throw new Error(`public upload failed: ${JSON.stringify(publicUpload)}`);
    }

    const privateForm = new FormData();
    privateForm.append(
      "file",
      new Blob(["smoke-private"], { type: "application/octet-stream" }),
      "smoke-private.p12"
    );
    const privateUploadResponse = await fetch(`${BASE_URL}/api/files/private`, {
      method: "POST",
      headers: {
        Authorization: "Bearer local-dev-token",
        "X-App-Id": "local-app",
      },
      body: privateForm,
    });
    const privateUpload = await privateUploadResponse.json();
    if (!privateUploadResponse.ok) {
      throw new Error(`private upload failed: ${JSON.stringify(privateUpload)}`);
    }

    const signedUrl = await request("/api/files/signed-url", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        file_uri: privateUpload.file_uri,
      }),
    });

    const legacyEmailResponse = await fetch(`${BASE_URL}/api/email/send`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({}),
    });
    if (legacyEmailResponse.status !== 404) {
      const bodyText = await legacyEmailResponse.text();
      throw new Error(
        `Expected POST /api/email/send to be removed (404), got ${legacyEmailResponse.status}: ${bodyText}`
      );
    }

    const smokeClient = await request("/api/entities/Client", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        name: "Cliente Smoke Mail",
        email: "smoke-client-mail@example.com",
        city: "Test",
      }),
    });

    const aiTextRun = await request("/api/ai/invoke", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        prompt: "Saluda brevemente",
      }),
    });

    const aiStructuredRun = await request("/api/ai/invoke", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        prompt: "Extrae datos",
        response_json_schema: {
          type: "object",
          properties: {
            supplier: { type: "string" },
            date: { type: "string" },
            reference: { type: "string" },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                },
              },
            },
          },
        },
      }),
    });

    const intervention = await request("/api/entities/Intervention", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        number: "SMOKE-INT-001",
        client_id: smokeClient.id,
        client_name: smokeClient.name || "Cliente Smoke Mail",
        subtotal: 100,
        iva_total: 21,
        total: 121,
        materials_json: "[]",
        status: "pendiente_revision",
      }),
    });

    const businessEmailRun = await request(
      `/api/business/interventions/${encodeURIComponent(intervention.id)}/send-client-email`,
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({}),
      }
    );

    const invoiceRun = await request("/api/functions/processVerifactu", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        intervention_id: intervention.id,
        mode: "facturar",
      }),
    });

    const queuedRun = await request("/api/functions/processVerifactu", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        intervention_id: intervention.id,
        mode: "facturar",
        force_pending_submission: true,
      }),
    });

    const rectificativaRun = await request("/api/functions/processVerifactu", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        intervention_id: intervention.id,
        mode: "rectificar",
        original_invoice_id: queuedRun.data?.invoice_id,
        rectificativa_motivo: "Smoke rectificativa",
      }),
    });

    const correctedRectificativaRun = await request("/api/functions/processVerifactu", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        intervention_id: intervention.id,
        mode: "rectificar_corregida",
        original_invoice_id: queuedRun.data?.invoice_id,
        rectificativa_motivo: "Smoke rectificativa corregida",
        subtotal_corregida: 50,
        iva_corregida: 10.5,
        total_corregida: 60.5,
      }),
    });

    const retryRun = await request("/api/functions/retryVerifactuSubmissions", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ force: true }),
    });

    const gasBottle = await request("/api/entities/GasBottle", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        serial_number: "SMOKE-BOT-001",
        carga_actual: 0,
        status: "activa",
      }),
    });

    const syncRun = await request("/api/functions/syncGasBottleStatus", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({}),
    });

    const notificationsRun = await request("/api/functions/sendClockInNotifications", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        notificationType: "morning",
        date: "2026-04-08",
      }),
    });

    const verifyRun = await request("/api/functions/verifyInvoiceHashes", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({}),
    });

    const sandboxRun = await request("/api/functions/testVerifactuSandbox", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ dry_run: true }),
    });

    const summary = {
      auth_email: me.email,
      updated_verifactu_nif: updatedMe.verifactu_nif,
      invited_role: invitedUser.role,
      public_backend_provider: publicSettings.public_settings?.backend_provider,
      public_upload_uri: publicUpload.file_uri,
      signed_private_url: signedUrl.file_url,
      email_provider: businessEmailRun.provider,
      ai_text_type: typeof aiTextRun,
      ai_structured_supplier: aiStructuredRun.supplier,
      invoice_status: invoiceRun.data?.verifactu_status,
      queued_pending_submission: queuedRun.data?.pending_submission,
      rectificativa_status: rectificativaRun.data?.verifactu_status,
      rectificativa_corregida_status:
        correctedRectificativaRun.data?.verifactu_status,
      retry_processed: retryRun.processed,
      synced_bottles: syncRun.synced,
      sent_notifications: notificationsRun.sent,
      verified_invoices: verifyRun.verified,
      sandbox_mode: sandboxRun.response_type,
      sample_bottle_id: gasBottle.id,
    };

    console.log(JSON.stringify(summary, null, 2));

    // --- Owner / license flow ---
    const ownerHeaders = {
      Authorization: "Bearer local-dev-token",
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Smoke-Owner": "true",
    };

    const ownerMeProbe = await requestExpectFailure("/api/auth/me", {
      headers: ownerHeaders,
    });
    if (ownerMeProbe.status !== 200) {
      throw new Error(
        `Owner token probe failed (${ownerMeProbe.status}): ${
          typeof ownerMeProbe.body === "string"
            ? ownerMeProbe.body
            : JSON.stringify(ownerMeProbe.body)
        }`
      );
    }

    // Create org A as owner (must start empty)
    const ownerOrgA = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: "Empresa Smoke A",
        slug: "smoke-a",
        plan_code: "starter",
      }),
    });
    const orgAId = ownerOrgA?.organization?.id;
    if (!orgAId) {
      throw new Error("Owner org create did not return organization id.");
    }

    const ownerOverviewEmpty = await request("/api/organizations/owner-overview", {
      headers: ownerHeaders,
    });
    const orgAOverview0 = (ownerOverviewEmpty?.organizations || []).find(
      (org) => org.id === orgAId
    );
    if (!orgAOverview0) {
      throw new Error("Expected org A to appear in owner overview.");
    }
    if (orgAOverview0.user_count !== 0 || (orgAOverview0.users || []).length !== 0) {
      throw new Error("Expected new org to start with 0 users.");
    }

    // Create admin user-a in org A
    const ownerInviteAdminA = await request(
      `/api/organizations/${encodeURIComponent(orgAId)}/users`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email: "user-a@local.test",
          full_name: "Admin A",
          role: "admin",
          temporary_password: "TempPass123!",
        }),
      }
    );

    const ownerOverviewAfterAdmin = await request("/api/organizations/owner-overview", {
      headers: ownerHeaders,
    });
    const orgAOverview1 = (ownerOverviewAfterAdmin?.organizations || []).find(
      (org) => org.id === orgAId
    );
    if (!orgAOverview1) {
      throw new Error("Expected org A to appear in owner overview after creating admin.");
    }
    if (orgAOverview1.user_count !== 1 || (orgAOverview1.users || []).length !== 1) {
      throw new Error("Expected org A to have 1 user after creating admin.");
    }

    // Create org B and admin B
    const ownerOrgB = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: "Empresa Smoke B",
        slug: "smoke-b",
        plan_code: "starter",
      }),
    });
    const orgBId = ownerOrgB?.organization?.id;
    if (!orgBId) {
      throw new Error("Owner org B create did not return organization id.");
    }

    const ownerInviteAdminB = await request(
      `/api/organizations/${encodeURIComponent(orgBId)}/users`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email: "admin-b@local.test",
          full_name: "Admin B",
          role: "admin",
          temporary_password: "TempPass123!",
        }),
      }
    );

    // Multi-company restriction: owner cannot add user-a to org B
    const ownerAddUserAToB = await requestExpectFailure(
      `/api/organizations/${encodeURIComponent(orgBId)}/users`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email: "user-a@local.test",
          full_name: "Admin A",
          role: "admin",
        }),
      }
    );
    if (ownerAddUserAToB.status !== 409) {
      throw new Error("Expected owner multi-company createUser to be blocked with 409.");
    }
    if (
      typeof ownerAddUserAToB.body !== "object" ||
      ownerAddUserAToB.body?.message !== "Este usuario ya pertenece a otra empresa."
    ) {
      throw new Error(
        `Expected multi-company message. got=${JSON.stringify(ownerAddUserAToB.body)}`
      );
    }

    // Admin B cannot create organizations
    const adminBLogin = await loginViaRedirect({
      pathname: "/api/auth/login",
      formFields: {
        email: "admin-b@local.test",
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      },
    });
    if (!adminBLogin.token) {
      throw new Error("Expected admin B login to succeed.");
    }
    const adminBHeaders = {
      Authorization: `Bearer ${adminBLogin.token}`,
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Organization-Id": orgBId,
    };
    const adminBCreatesOrg = await requestExpectFailure("/api/organizations", {
      method: "POST",
      headers: adminBHeaders,
      body: JSON.stringify({
        name: "Empresa NO",
        slug: "nope",
        plan_code: "starter",
      }),
    });
    if (adminBCreatesOrg.status !== 403) {
      throw new Error("Expected admin org create to be blocked with 403.");
    }
    if (
      typeof adminBCreatesOrg.body !== "object" ||
      adminBCreatesOrg.body?.message !==
        "Solo FRIGEST puede crear nuevas empresas desde el panel."
    ) {
      throw new Error(
        `Expected org-create restriction message. got=${JSON.stringify(adminBCreatesOrg.body)}`
      );
    }

    // Invite endpoint also blocks multi-company
    const adminBInvitesUserA = await requestExpectFailure("/api/users/invite", {
      method: "POST",
      headers: adminBHeaders,
      body: JSON.stringify({
        email: "user-a@local.test",
        role: "oficina",
      }),
    });
    if (adminBInvitesUserA.status !== 409) {
      throw new Error("Expected invite multi-company to be blocked with 409.");
    }
    if (
      typeof adminBInvitesUserA.body !== "object" ||
      adminBInvitesUserA.body?.message !== "Este usuario ya pertenece a otra empresa."
    ) {
      throw new Error(
        `Expected invite multi-company message. got=${JSON.stringify(adminBInvitesUserA.body)}`
      );
    }

    // Re-inviting same user to same org should not duplicate membership
    await request(`/api/organizations/${encodeURIComponent(orgAId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: "user-a@local.test",
        full_name: "Admin A",
        role: "admin",
      }),
    });
    const ownerOverviewAfterReadd = await request("/api/organizations/owner-overview", {
      headers: ownerHeaders,
    });
    const orgAOverviewReadd = (ownerOverviewAfterReadd?.organizations || []).find(
      (org) => org.id === orgAId
    );
    if (!orgAOverviewReadd || orgAOverviewReadd.user_count !== 1) {
      throw new Error("Expected re-adding same user to same org not to duplicate membership.");
    }

    // Continue legacy flow on org A (delete + last-admin + license)
    const ownerInviteTech = await request(`/api/organizations/${encodeURIComponent(orgAId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: "tech-license@local.test",
        full_name: "Tech License",
        role: "tecnico",
        temporary_password: "TempPass123!",
      }),
    });
    const ownerInviteHelper = await request(`/api/organizations/${encodeURIComponent(orgAId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: "helper-license@local.test",
        full_name: "Helper License",
        role: "ayudante",
        temporary_password: "TempPass123!",
      }),
    });

    const ownerInviteTempTech = await request(
      `/api/organizations/${encodeURIComponent(orgAId)}/users`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email: "tech-delete@local.test",
          full_name: "Tech Delete",
          role: "tecnico",
          temporary_password: "TempPass123!",
        }),
      }
    );

    await request(
      `/api/organizations/${encodeURIComponent(orgAId)}/users/${encodeURIComponent(
        ownerInviteTempTech?.user?.id
      )}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
      }
    );
    const ownerOverviewAfterDelete = await request("/api/organizations/owner-overview", {
      headers: ownerHeaders,
    });
    const createdOrgAfterDelete = (ownerOverviewAfterDelete?.organizations || []).find(
      (org) => org.id === orgAId
    );
    if (!createdOrgAfterDelete) {
      throw new Error("Expected org to appear in owner overview after delete.");
    }
    if (createdOrgAfterDelete.user_count !== 3) {
      throw new Error("Expected org user_count to drop after deleting temp tech.");
    }

    const deleteLastAdminAttempt = await requestExpectFailure(
      `/api/organizations/${encodeURIComponent(orgAId)}/users/${encodeURIComponent(
        ownerInviteAdminA?.user?.id
      )}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
      }
    );
    if (deleteLastAdminAttempt.status !== 409) {
      throw new Error("Expected deleting last admin to be blocked with 409.");
    }
    if (
      typeof deleteLastAdminAttempt.body !== "object" ||
      deleteLastAdminAttempt.body?.message !==
        "No se puede eliminar el último administrador activo de la empresa."
    ) {
      throw new Error(
        `Expected last-admin protection message. got=${JSON.stringify(deleteLastAdminAttempt.body)}`
      );
    }

    await request(`/api/organizations/${encodeURIComponent(orgAId)}/license/pause`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({}),
    });

    const techLogin = await loginViaRedirect({
      pathname: "/api/auth/login",
      formFields: {
        email: "tech-license@local.test",
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      },
    });
    if (parseAuthErrorFromLocation(techLogin.location) !== "No se puede iniciar sesión actualmente.") {
      throw new Error(
        `Expected tech login to be blocked with exact message. location=${techLogin.location}`
      );
    }

    const helperLogin = await loginViaRedirect({
      pathname: "/api/auth/login",
      formFields: {
        email: "helper-license@local.test",
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      },
    });
    if (parseAuthErrorFromLocation(helperLogin.location) !== "No se puede iniciar sesión actualmente.") {
      throw new Error(
        `Expected helper login to be blocked with exact message. location=${helperLogin.location}`
      );
    }

    const adminLogin = await loginViaRedirect({
      pathname: "/api/auth/login",
      formFields: {
        email: "user-a@local.test",
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      },
    });
    if (!adminLogin.token) {
      throw new Error(`Expected admin login to succeed. location=${adminLogin.location}`);
    }

    const adminHeaders = {
      Authorization: `Bearer ${adminLogin.token}`,
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Organization-Id": orgAId,
    };

    const adminMe = await request("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${adminLogin.token}`,
        "X-App-Id": "local-app",
        "X-Organization-Id": orgAId,
      },
    });
    if (adminMe?.license_read_only !== true) {
      throw new Error("Expected admin to have license_read_only=true while paused.");
    }

    const blockedWrite = await requestExpectFailure("/api/entities/Client", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Blocked client" }),
    });
    if (blockedWrite.status !== 403) {
      throw new Error(`Expected write to be blocked with 403, got ${blockedWrite.status}`);
    }
    if (
      typeof blockedWrite.body !== "object" ||
      blockedWrite.body?.message !== "Licencia caducada. Contacte con FRIGEST para renovación."
    ) {
      throw new Error(`Expected blocked write message. got=${JSON.stringify(blockedWrite.body)}`);
    }

    await request(`/api/organizations/${encodeURIComponent(orgAId)}/license/activate`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({}),
    });

    const allowedWrite = await request("/api/entities/Client", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Allowed client" }),
    });
    if (!allowedWrite?.id) {
      throw new Error("Expected write to succeed after license activation.");
    }

    // --- Owner hard-delete & operational entity delete guard ---
    const ownerOrgHard = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: "Empresa Smoke Hard Delete",
        slug: "smoke-hard-del",
        plan_code: "starter",
      }),
    });
    const orgHardId = ownerOrgHard?.organization?.id;
    if (!orgHardId) {
      throw new Error("hard-delete org create did not return organization id.");
    }

    const ownerOrgAdminDeny = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: "Empresa Smoke Admin Deny",
        slug: "smoke-adeny",
        plan_code: "starter",
      }),
    });
    const orgAdminDenyId = ownerOrgAdminDeny?.organization?.id;
    if (!orgAdminDenyId) {
      throw new Error("admin-deny org create did not return organization id.");
    }

    await request(`/api/organizations/${encodeURIComponent(orgHardId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: "hard-delete-admin@local.test",
        full_name: "Hard Delete Admin",
        role: "admin",
        temporary_password: "TempPass123!",
      }),
    });

    const hardDelAdminLogin = await loginViaRedirect({
      pathname: "/api/auth/login",
      formFields: {
        email: "hard-delete-admin@local.test",
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      },
    });
    if (!hardDelAdminLogin.token) {
      throw new Error(`Expected hard-delete admin login to succeed. location=${hardDelAdminLogin.location}`);
    }

    const hardDelAdminHeaders = {
      Authorization: `Bearer ${hardDelAdminLogin.token}`,
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Organization-Id": orgHardId,
    };

    const smokeTimeRecord = await request("/api/entities/TimeRecord", {
      method: "POST",
      headers: hardDelAdminHeaders,
      body: JSON.stringify({
        technician_email: "hard-delete-admin@local.test",
        technician_name: "Hard Delete Admin",
        type: "entrada",
        timestamp: new Date().toISOString(),
        work_date: "2026-05-09",
      }),
    });

    const trDeleteAttempt = await requestExpectFailure(
      `/api/entities/TimeRecord/${encodeURIComponent(smokeTimeRecord.id)}`,
      { method: "DELETE", headers: hardDelAdminHeaders }
    );
    if (trDeleteAttempt.status !== 403) {
      throw new Error(`Expected TimeRecord DELETE to be 403, got ${trDeleteAttempt.status}`);
    }
    if (
      typeof trDeleteAttempt.body !== "object" ||
      trDeleteAttempt.body?.message !==
        "Esta entidad forma parte del histórico de la empresa y no puede eliminarse individualmente."
    ) {
      throw new Error(`Unexpected TimeRecord delete body: ${JSON.stringify(trDeleteAttempt.body)}`);
    }

    const adminHardDeleteDenied = await requestExpectFailure(
      `/api/organizations/${encodeURIComponent(orgAdminDenyId)}/hard-delete`,
      { method: "DELETE", headers: adminHeaders }
    );
    if (adminHardDeleteDenied.status !== 403) {
      throw new Error(`Expected admin hard-delete to be 403, got ${adminHardDeleteDenied.status}`);
    }

    await request(`/api/organizations/${encodeURIComponent(orgHardId)}/hard-delete`, {
      method: "DELETE",
      headers: ownerHeaders,
    });

    const ownerOverviewAfterHardDelete = await request("/api/organizations/owner-overview", {
      headers: ownerHeaders,
    });
    const orgHardStillThere = (ownerOverviewAfterHardDelete?.organizations || []).find(
      (org) => org.id === orgHardId
    );
    if (orgHardStillThere) {
      throw new Error("Expected hard-deleted org to disappear from owner overview.");
    }

    // --- Seed idempotency check (demo memberships must not recreate if disabled) ---
    const membershipRecords = await readJsonArray(tempMembershipsFile);
    const removedMembership = membershipRecords.find(
      (membership) => membership.user_email === "tecnico@local.test"
    );
    if (!removedMembership) {
      throw new Error("Expected demo tecnico membership to exist for seed idempotency check.");
    }
    await writeJsonArray(
      tempMembershipsFile,
      membershipRecords.filter((membership) => membership.id !== removedMembership.id)
    );

    server.kill("SIGTERM");
    await sleep(500);

    const serverRestart = spawn(process.execPath, ["server/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_SERVER_HOST: HOST,
        APP_SERVER_PORT: String(PORT),
        APP_ID: "local-app",
        APP_SMOKE_OWNER: "true",
        APP_DATA_DIR: tempDataDir,
        APP_UPLOADS_DIR: tempUploadsDir,
        APP_SEED_DEMO_USERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverRestart.stdout.on("data", (chunk) => {
      process.stdout.write(`[rest-smoke:server] ${chunk}`);
    });
    serverRestart.stderr.on("data", (chunk) => {
      process.stderr.write(`[rest-smoke:server] ${chunk}`);
    });

    try {
      await waitForHealth();
      const membershipAfterRestart = await readJsonArray(tempMembershipsFile);
      const tecnicoMembershipRecreated = membershipAfterRestart.some(
        (membership) => membership.user_email === "tecnico@local.test"
      );
      if (tecnicoMembershipRecreated) {
        throw new Error(
          "Expected demo tecnico membership NOT to be recreated when APP_SEED_DEMO_USERS=false."
        );
      }
    } finally {
      serverRestart.kill("SIGTERM");
      await sleep(500);
    }
  } finally {
    server.kill("SIGTERM");
    await sleep(500);

    // Ensure local dev store was not modified by the smoke run.
    const afterSnapshots = {
      Organization: await readOptionalFile(path.join(baselineDir, "Organization.json")),
      User: await readOptionalFile(path.join(baselineDir, "User.json")),
      OrganizationMembership: await readOptionalFile(
        path.join(baselineDir, "OrganizationMembership.json")
      ),
      OrganizationSubscription: await readOptionalFile(
        path.join(baselineDir, "OrganizationSubscription.json")
      ),
      OrganizationSettings: await readOptionalFile(
        path.join(baselineDir, "OrganizationSettings.json")
      ),
    };

    for (const [key, baseline] of Object.entries(baselineSnapshots)) {
      const after = afterSnapshots[key];
      if (baseline !== after) {
        throw new Error(
          `Smoke run modified local dev store file: ${key}.json. Refusing to proceed.`
        );
      }
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
};

runSmoke().catch((error) => {
  console.error("[rest-smoke] FAILED");
  console.error(error);
  process.exitCode = 1;
});
