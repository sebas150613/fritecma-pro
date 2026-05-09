import { spawn } from "node:child_process";
import fs from "node:fs/promises";
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

const createServerProcess = () => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_SERVER_HOST: HOST,
      APP_SERVER_PORT: String(PORT),
      APP_ID: "local-app",
      APP_SMOKE_OWNER: "true",
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

const cleanupArtifacts = async () => {
  const cleanupTargets = [
    path.join(process.cwd(), "server", "data"),
    path.join(process.cwd(), "server", "uploads"),
  ];

  for (const target of cleanupTargets) {
    await fs.rm(target, { recursive: true, force: true });
  }
};

const runSmoke = async () => {
  await cleanupArtifacts();

  const server = createServerProcess();

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

    const ownerOrgCreate = await request("/api/organizations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: "Empresa Smoke Owner",
        slug: "smoke-owner",
        plan_code: "starter",
      }),
    });
    const targetOrgId = ownerOrgCreate?.organization?.id;
    if (!targetOrgId) {
      throw new Error("Owner org create did not return organization id.");
    }

    const ownerInviteAdmin = await request(`/api/organizations/${encodeURIComponent(targetOrgId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: "admin-license@local.test",
        full_name: "Admin License",
        role: "admin",
        temporary_password: "TempPass123!",
      }),
    });
    const ownerInviteTech = await request(`/api/organizations/${encodeURIComponent(targetOrgId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: "tech-license@local.test",
        full_name: "Tech License",
        role: "tecnico",
        temporary_password: "TempPass123!",
      }),
    });
    const ownerInviteHelper = await request(`/api/organizations/${encodeURIComponent(targetOrgId)}/users`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        email: "helper-license@local.test",
        full_name: "Helper License",
        role: "ayudante",
        temporary_password: "TempPass123!",
      }),
    });

    await request(`/api/organizations/${encodeURIComponent(targetOrgId)}/license/pause`, {
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
        email: "admin-license@local.test",
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
      "X-Organization-Id": targetOrgId,
    };

    const adminMe = await request("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${adminLogin.token}`,
        "X-App-Id": "local-app",
        "X-Organization-Id": targetOrgId,
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

    await request(`/api/organizations/${encodeURIComponent(targetOrgId)}/license/activate`, {
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
  } finally {
    server.kill("SIGTERM");
    await sleep(500);
  }
};

runSmoke().catch((error) => {
  console.error("[rest-smoke] FAILED");
  console.error(error);
  process.exitCode = 1;
});
