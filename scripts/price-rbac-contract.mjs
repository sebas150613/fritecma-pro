#!/usr/bin/env node
/**
 * Contract: los roles de campo (tecnico/ayudante) NUNCA ven precios; los roles
 * de oficina (admin/superadmin/oficina/encargado) sí. Cubre:
 *  - /me sin tarifas ni configuración de facturación para roles de campo.
 *  - Material sin sell_price/cost_price para roles de campo.
 *  - Intervention: valoración server-side (los precios del cliente de campo se
 *    ignoran; catálogo/tarifas mandan), lectura sin precios para campo,
 *    preservación de precios históricos al editar, override de oficina.
 *  - Invoice/Budget/RecurringInvoice sin importes para roles de campo.
 * Mismo arnés que rbac-contract (server temporal aislado, JSON store).
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = Number(process.env.APP_PRICE_RBAC_CONTRACT_PORT || 3029);
const BASE_URL = `http://${HOST}:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (message) => {
  throw new Error(`price-rbac-contract: ${message}`);
};

const raw = async (pathname, options = {}) => {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { status: response.status, ok: response.ok, body, headers: response.headers };
};

const request = async (pathname, options = {}) => {
  const result = await raw(pathname, options);
  if (!result.ok) {
    fail(
      `${options.method || "GET"} ${pathname} failed (${result.status}): ${
        typeof result.body === "string" ? result.body : JSON.stringify(result.body)
      }`
    );
  }
  return result.body;
};

const loginViaRedirect = async (formFields) => {
  const result = await raw("/api/auth/login", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(formFields).toString(),
  });
  const location = result.headers.get("location") || "";
  return location
    ? new URL(location, BASE_URL).searchParams.get("access_token")
    : null;
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await raw("/health").catch(() => null);
    if (health?.ok) {
      return;
    }
    await sleep(500);
  }
  fail("server did not become healthy in time.");
};

const assertNoKeys = (obj, keys, label) => {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      fail(`${label}: el campo "${key}" no debe estar presente (valor: ${JSON.stringify(obj[key])})`);
    }
  }
};

const assertEq = (actual, expected, label) => {
  if (actual !== expected) {
    fail(`${label}: esperaba ${JSON.stringify(expected)}, obtuve ${JSON.stringify(actual)}`);
  }
};

const parseLines = (record, field = "materials_json") => {
  try {
    return JSON.parse(record?.[field] || "[]");
  } catch {
    fail(`no se pudo parsear ${field}`);
  }
};

const run = async () => {
  const suffix = randomBytes(5).toString("hex");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frigest-price-rbac-"));

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: "",
      NODE_ENV: "test",
      APP_ALLOW_AUTH_BYPASS: "false",
      APP_DEV_TOKEN: "local-dev-token",
      APP_ALLOWED_ORIGINS: "",
      APP_TRUST_PROXY: "false",
      APP_SERVER_HOST: HOST,
      APP_SERVER_PORT: String(PORT),
      APP_ID: "local-app",
      APP_SMOKE_OWNER: "true",
      APP_DATA_DIR: path.join(tempRoot, "data"),
      APP_UPLOADS_DIR: path.join(tempRoot, "uploads"),
      APP_SEED_DEMO_USERS: "true",
      APP_SETTINGS_SECRET:
        process.env.APP_SETTINGS_SECRET ||
        "smoke-local-app-settings-secret-key-at-least-32-chars-long!!",
      APP_COMPANY_PURCHASE_SMTP_STUB: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (chunk) =>
    process.stderr.write(`[price-rbac:server] ${chunk}`)
  );

  try {
    await waitForHealth();

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
        name: `Empresa Precios ${suffix}`,
        slug: `price-rbac-${suffix}`,
        plan_code: "starter",
      }),
    });
    const orgId = createdOrg?.organization?.id;
    if (!orgId) {
      fail("owner org create did not return organization id.");
    }

    const roles = ["admin", "encargado", "oficina", "tecnico", "ayudante"];
    const tokens = {};
    for (const role of roles) {
      const email = `price-${role}-${suffix}@local.test`;
      await request(`/api/organizations/${encodeURIComponent(orgId)}/users`, {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email,
          full_name: `User ${role}`,
          role,
          temporary_password: "TempPass123!",
        }),
      });
      tokens[role] = await loginViaRedirect({
        email,
        password: "TempPass123!",
        redirect_uri: `${BASE_URL}/`,
      });
      if (!tokens[role]) {
        fail(`login failed for ${role}`);
      }
    }

    const headersFor = (role) => ({
      Authorization: `Bearer ${tokens[role]}`,
      "X-App-Id": "local-app",
      "Content-Type": "application/json",
      "X-Organization-Id": orgId,
    });

    const LINE_PRICE_KEYS = ["unit_price", "total", "sell_price", "cost_price", "price"];
    const ME_PRICE_KEYS = [
      "tarifa_1_oficial_normal",
      "tarifa_oficial_ayudante_normal",
      "desplazamiento_tramos_json",
      "factura_iban",
      "factura_condiciones_pago",
      "factura_vencimiento_dias",
    ];

    // --- Tarifa de la organización (la fija el admin vía PATCH /me) ---
    await request("/api/auth/me", {
      method: "PATCH",
      headers: headersFor("admin"),
      body: JSON.stringify({ tarifa_1_oficial_normal: 50 }),
    });

    // --- /me por rol ---
    for (const role of ["tecnico", "ayudante"]) {
      const me = await request("/api/auth/me", { headers: headersFor(role) });
      assertNoKeys(me, ME_PRICE_KEYS, `GET /me como ${role}`);
      assertNoKeys(
        me.current_organization_settings || {},
        ME_PRICE_KEYS,
        `GET /me current_organization_settings como ${role}`
      );
    }
    for (const role of ["admin", "encargado", "oficina"]) {
      const me = await request("/api/auth/me", { headers: headersFor(role) });
      assertEq(Number(me.tarifa_1_oficial_normal), 50, `GET /me tarifa como ${role}`);
    }

    // --- Material: catálogo con precios solo para oficina ---
    const material = await request("/api/entities/Material", {
      method: "POST",
      headers: headersFor("admin"),
      body: JSON.stringify({
        name: "Tubo cobre 1/2",
        category: "material",
        unit: "ud",
        sell_price: 40,
        cost_price: 25,
        iva_percent: 21,
        stock: 100,
      }),
    });
    assertEq(Number(material.sell_price), 40, "POST Material (admin) sell_price");

    for (const role of ["tecnico", "ayudante"]) {
      const list = await request("/api/entities/Material", { headers: headersFor(role) });
      const found = list.find((item) => item.id === material.id);
      if (!found) {
        fail(`GET Material como ${role}: material no visible`);
      }
      assertNoKeys(found, ["sell_price", "cost_price"], `GET Material como ${role}`);
      assertEq(Number(found.stock), 100, `GET Material stock como ${role}`);
    }
    for (const role of ["oficina", "encargado"]) {
      const list = await request("/api/entities/Material", { headers: headersFor(role) });
      const found = list.find((item) => item.id === material.id);
      assertEq(Number(found?.sell_price), 40, `GET Material sell_price como ${role}`);
      assertEq(Number(found?.cost_price), 25, `GET Material cost_price como ${role}`);
    }

    // --- Intervention: el tecnico crea un parte; sus precios (999) se ignoran ---
    const tamperedLines = [
      {
        material_id: material.id,
        material_name: "Tubo cobre 1/2",
        quantity: 2,
        unit: "ud",
        unit_price: 999,
        total: 1998,
        iva_percent: 21,
      },
      {
        material_id: "",
        material_name: "Mano de Obra",
        quantity: 3,
        unit: "h",
        unit_price: 999,
        total: 2997,
        iva_percent: 21,
        _isLabor: true,
        _tipoHorario: "normal",
      },
      {
        material_id: "__free_text__",
        material_name: "Pieza especial",
        quantity: 1,
        unit: "ud",
        unit_price: 999,
        total: 999,
        iva_percent: 21,
      },
    ];
    const createdParte = await request("/api/entities/Intervention", {
      method: "POST",
      headers: headersFor("tecnico"),
      body: JSON.stringify({
        number: `PRC-${suffix}`,
        client_name: "Cliente Precios",
        status: "pendiente_revision",
        date: new Date().toISOString().slice(0, 10),
        description: "Contrato de precios por rol",
        materials_json: JSON.stringify(tamperedLines),
        subtotal: 99999,
        iva_total: 99999,
        total: 99999,
        tarifa_aplicada: 999,
      }),
    });
    const parteId = createdParte?.id;
    if (!parteId) {
      fail("POST Intervention (tecnico) no devolvió id");
    }
    // La respuesta del create para el tecnico ya viene sin precios.
    assertNoKeys(createdParte, ["subtotal", "iva_total", "total", "tarifa_aplicada"], "POST Intervention response (tecnico)");
    for (const line of parseLines(createdParte)) {
      assertNoKeys(line, LINE_PRICE_KEYS, "línea de POST Intervention response (tecnico)");
    }

    // Oficina ve la valoración REAL calculada en servidor (no los 999 del cliente).
    const queryParte = async (role) => {
      const items = await request("/api/entities/Intervention/query", {
        method: "POST",
        headers: headersFor(role),
        body: JSON.stringify({ filter: { id: parteId }, limit: 1 }),
      });
      return items[0] || null;
    };

    for (const role of ["admin", "oficina", "encargado"]) {
      const parte = await queryParte(role);
      const lines = parseLines(parte);
      assertEq(Number(lines[0].unit_price), 40, `unit_price material (${role})`);
      assertEq(Number(lines[0].total), 80, `total material (${role})`);
      assertEq(Number(lines[1].unit_price), 50, `unit_price mano de obra (${role})`);
      assertEq(Number(lines[1].total), 150, `total mano de obra (${role})`);
      assertEq(Number(lines[2].unit_price), 0, `unit_price texto libre (${role})`);
      assertEq(Number(parte.subtotal), 230, `subtotal parte (${role})`);
      assertEq(Number(parte.iva_total), 48.3, `iva_total parte (${role})`);
      assertEq(Number(parte.total), 278.3, `total parte (${role})`);
      assertEq(Number(parte.tarifa_aplicada), 50, `tarifa_aplicada (${role})`);
    }

    for (const role of ["tecnico", "ayudante"]) {
      const parte = await queryParte(role);
      assertNoKeys(
        parte,
        ["subtotal", "iva_total", "total", "tarifa_aplicada", "discount_percent"],
        `GET Intervention como ${role}`
      );
      for (const line of parseLines(parte)) {
        assertNoKeys(line, LINE_PRICE_KEYS, `línea de Intervention como ${role}`);
      }
      assertEq(Number(parseLines(parte)[0].quantity), 2, `quantity visible como ${role}`);
    }

    // --- Edición por tecnico: cambia cantidades SIN precios; se preservan los históricos ---
    const strippedEdit = parseLines(await queryParte("tecnico")).map((line) => ({
      ...line,
      quantity: Number(line.quantity) === 2 ? 3 : line.quantity,
    }));
    await request(`/api/entities/Intervention/${parteId}`, {
      method: "PATCH",
      headers: headersFor("tecnico"),
      body: JSON.stringify({ materials_json: JSON.stringify(strippedEdit) }),
    });
    {
      const parte = await queryParte("admin");
      const lines = parseLines(parte);
      assertEq(Number(lines[0].unit_price), 40, "unit_price preservado tras edición tecnico");
      assertEq(Number(lines[0].total), 120, "total recalculado tras edición tecnico");
      assertEq(Number(lines[1].unit_price), 50, "tarifa preservada tras edición tecnico");
      assertEq(Number(parte.subtotal), 270, "subtotal tras edición tecnico");
    }

    // --- Override de oficina: sus precios se respetan y los totales se recalculan ---
    const officeLines = parseLines(await queryParte("oficina")).map((line, i) => ({
      ...line,
      unit_price: i === 0 ? 60 : line.unit_price,
    }));
    await request(`/api/entities/Intervention/${parteId}`, {
      method: "PATCH",
      headers: headersFor("oficina"),
      body: JSON.stringify({ materials_json: JSON.stringify(officeLines) }),
    });
    {
      const parte = await queryParte("admin");
      const lines = parseLines(parte);
      assertEq(Number(lines[0].unit_price), 60, "override de oficina aplicado");
      assertEq(Number(lines[0].total), 180, "total línea tras override");
      assertEq(Number(parte.subtotal), 330, "subtotal tras override oficina");
    }

    // --- Invoice: emitida por oficina; el tecnico no ve importes ---
    const invoiceResult = await request("/api/functions/processVerifactu", {
      method: "POST",
      headers: headersFor("oficina"),
      body: JSON.stringify({ intervention_id: parteId, mode: "facturar" }),
    });
    const invoiceId = invoiceResult?.data?.invoice_id || invoiceResult?.invoice_id;
    if (!invoiceId) {
      fail("processVerifactu no devolvió invoice_id");
    }

    const queryInvoice = async (role) => {
      const items = await request("/api/entities/Invoice/query", {
        method: "POST",
        headers: headersFor(role),
        body: JSON.stringify({ filter: { id: invoiceId }, limit: 1 }),
      });
      return items[0] || null;
    };

    for (const role of ["tecnico", "ayudante"]) {
      const invoice = await queryInvoice(role);
      if (!invoice?.invoice_number) {
        fail(`GET Invoice como ${role}: metadatos no visibles`);
      }
      assertNoKeys(
        invoice,
        ["subtotal", "iva_total", "total", "rectified_base", "rectified_tax", "xml_payload"],
        `GET Invoice como ${role}`
      );
      for (const line of parseLines(invoice, "lines_json")) {
        assertNoKeys(line, LINE_PRICE_KEYS, `línea de Invoice como ${role}`);
      }
    }
    for (const role of ["admin", "oficina", "encargado"]) {
      const invoice = await queryInvoice(role);
      assertEq(Number(invoice.subtotal), 330, `subtotal Invoice como ${role}`);
      if (!(Number(invoice.total) > 330)) {
        fail(`total Invoice como ${role}: esperaba > 330, obtuve ${invoice.total}`);
      }
    }

    // --- Visit: misma valoración server-side que los partes ---
    const createdVisit = await request("/api/entities/Visit", {
      method: "POST",
      headers: headersFor("tecnico"),
      body: JSON.stringify({
        client_name: "Cliente Precios",
        date: new Date().toISOString().slice(0, 10),
        description: "Visita contrato precios",
        materials_json: JSON.stringify([
          {
            material_id: material.id,
            material_name: "Tubo cobre 1/2",
            quantity: 1,
            unit: "ud",
            unit_price: 999,
            total: 999,
            iva_percent: 21,
          },
        ]),
        subtotal: 9999,
        iva_total: 9999,
        total: 9999,
      }),
    });
    assertNoKeys(createdVisit, ["subtotal", "iva_total", "total"], "POST Visit response (tecnico)");
    {
      const visits = await request("/api/entities/Visit/query", {
        method: "POST",
        headers: headersFor("admin"),
        body: JSON.stringify({ filter: { id: createdVisit.id }, limit: 1 }),
      });
      const lines = parseLines(visits[0]);
      assertEq(Number(lines[0].unit_price), 40, "unit_price Visit repreciado (admin)");
      assertEq(Number(visits[0].subtotal), 40, "subtotal Visit (admin)");
      assertEq(Number(visits[0].total), 48.4, "total Visit (admin)");
    }

    // --- Budget y RecurringInvoice: sin importes para roles de campo ---
    const budget = await request("/api/entities/Budget", {
      method: "POST",
      headers: headersFor("oficina"),
      body: JSON.stringify({
        number: `PRE-${suffix}`,
        client_name: "Cliente Precios",
        description: "Presupuesto contrato",
        lines_json: JSON.stringify([
          { material_name: "Instalación", quantity: 1, unit_price: 100, total: 100, iva_percent: 21 },
        ]),
        subtotal: 100,
        iva_total: 21,
        total: 121,
        status: "pendiente",
      }),
    });
    const recurring = await request("/api/entities/RecurringInvoice", {
      method: "POST",
      headers: headersFor("oficina"),
      body: JSON.stringify({
        client_name: "Cliente Precios",
        descripcion: "Cuota mensual",
        lines_json: JSON.stringify([
          { material_name: "Cuota", quantity: 1, unit_price: 75, total: 75, iva_percent: 21 },
        ]),
        periodicity: "monthly",
        active: true,
      }),
    });

    for (const role of ["tecnico", "ayudante"]) {
      const budgets = await request("/api/entities/Budget/query", {
        method: "POST",
        headers: headersFor(role),
        body: JSON.stringify({ filter: { id: budget.id }, limit: 1 }),
      });
      assertNoKeys(budgets[0], ["subtotal", "iva_total", "total", "discount_percent"], `GET Budget como ${role}`);
      for (const line of parseLines(budgets[0], "lines_json")) {
        assertNoKeys(line, LINE_PRICE_KEYS, `línea de Budget como ${role}`);
      }
      const recurrings = await request("/api/entities/RecurringInvoice/query", {
        method: "POST",
        headers: headersFor(role),
        body: JSON.stringify({ filter: { id: recurring.id }, limit: 1 }),
      });
      for (const line of parseLines(recurrings[0], "lines_json")) {
        assertNoKeys(line, LINE_PRICE_KEYS, `línea de RecurringInvoice como ${role}`);
      }
    }
    {
      const budgets = await request("/api/entities/Budget/query", {
        method: "POST",
        headers: headersFor("encargado"),
        body: JSON.stringify({ filter: { id: budget.id }, limit: 1 }),
      });
      assertEq(Number(budgets[0].total), 121, "total Budget como encargado");
    }

    console.log(
      "price-rbac-contract: OK (tecnico/ayudante sin precios; admin/oficina/encargado con precios; valoración server-side verificada)"
    );
  } finally {
    server.kill("SIGTERM");
  }
};

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
