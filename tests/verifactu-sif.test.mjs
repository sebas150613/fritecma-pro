/**
 * Bloque <SistemaInformatico> del envio a la AEAT (art. 13 RD 1007/2023).
 *
 * Estos datos identifican al PRODUCTOR del software y deben cuadrar campo a
 * campo con la declaracion responsable publicada
 * (docs/declaracion-responsable-frigest.md). Un desajuste aqui significa
 * declarar a la AEAT algo distinto de lo que se ha firmado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");

const PRODUCER_NIF = "B00000000";
const ISSUER_NIF = "12345678Z";
const INSTALLATION = "frigest-prod-001";

const withEnv = async (overrides, fn) => {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const loadBuilder = async () => {
  const mod = await import("../server/services/verifactu-aeat.js");
  return mod;
};

const sampleInvoice = {
  invoice_number: "F-2026-0001",
  issue_date: "2026-08-19T10:00:00.000Z",
  tipo_factura: "F1",
  client_name: "Cliente Ejemplo SL",
  client_nif: "B11111111",
  subtotal: 100,
  iva_total: 21,
  total: 121,
  hash_huella: "A".repeat(64),
  description: "Mantenimiento",
};

const buildEnvelope = async (mod) =>
  mod.buildVerifactuSoapEnvelope({
    invoice: sampleInvoice,
    issuerNif: ISSUER_NIF,
    issuerName: "Empresa Emisora SL",
    previousInvoice: null,
    generatedAt: "2026-08-19T10:00:00.000Z",
  });

test("declara SOLO VERI*FACTU y multiOT, coherente con la declaracion responsable", async () => {
  const mod = await loadBuilder();
  const xml = await withEnv(
    {
      APP_VERIFACTU_SOFTWARE_NIF: PRODUCER_NIF,
      APP_VERIFACTU_INSTALLATION_ID: INSTALLATION,
      APP_VERIFACTU_MULTIPLES_OT: undefined,
    },
    () => buildEnvelope(mod)
  );

  assert.match(
    xml,
    /<sum1:TipoUsoPosibleSoloVerifactu>S<\/sum1:TipoUsoPosibleSoloVerifactu>/,
    "FriGest no implementa modo no-VERI*FACTU: debe declararse SOLO VERI*FACTU"
  );
  assert.match(
    xml,
    /<sum1:TipoUsoPosibleMultiOT>S<\/sum1:TipoUsoPosibleMultiOT>/,
    "FriGest es multi-tenant: debe declarar que soporta varios obligados tributarios"
  );
  assert.match(
    xml,
    /<sum1:IndicadorMultiplesOT>S<\/sum1:IndicadorMultiplesOT>/,
    "Por defecto el despliegue SaaS da servicio a varios obligados"
  );
});

test("IndicadorMultiplesOT puede ponerse a N en una instalacion de un solo obligado", async () => {
  const mod = await loadBuilder();
  const xml = await withEnv(
    {
      APP_VERIFACTU_SOFTWARE_NIF: PRODUCER_NIF,
      APP_VERIFACTU_INSTALLATION_ID: INSTALLATION,
      APP_VERIFACTU_MULTIPLES_OT: "N",
    },
    () => buildEnvelope(mod)
  );

  assert.match(xml, /<sum1:IndicadorMultiplesOT>N<\/sum1:IndicadorMultiplesOT>/);
  assert.match(
    xml,
    /<sum1:TipoUsoPosibleMultiOT>S<\/sum1:TipoUsoPosibleMultiOT>/,
    "la capacidad del producto no depende de la instalacion"
  );
});

test("el NIF del productor nunca cae al NIF de quien factura", async () => {
  const mod = await loadBuilder();
  const xml = await withEnv(
    {
      APP_VERIFACTU_SOFTWARE_NIF: PRODUCER_NIF,
      APP_VERIFACTU_INSTALLATION_ID: INSTALLATION,
    },
    () => buildEnvelope(mod)
  );

  const system = xml.slice(
    xml.indexOf("<sum1:SistemaInformatico>"),
    xml.indexOf("</sum1:SistemaInformatico>")
  );

  assert.match(system, new RegExp(`<sum1:NIF>${PRODUCER_NIF}</sum1:NIF>`));
  assert.ok(
    !system.includes(ISSUER_NIF),
    "el NIF del obligado tributario no puede aparecer como productor del software"
  );
});

test("sin APP_VERIFACTU_SOFTWARE_NIF se corta el envio en vez de declarar algo falso", async () => {
  const mod = await loadBuilder();
  await withEnv(
    {
      APP_VERIFACTU_SOFTWARE_NIF: undefined,
      APP_VERIFACTU_INSTALLATION_ID: INSTALLATION,
    },
    async () => {
      await assert.rejects(
        async () => buildEnvelope(mod),
        (err) => {
          assert.equal(err.status, 500);
          assert.match(err.message, /APP_VERIFACTU_SOFTWARE_NIF/);
          return true;
        }
      );
    }
  );
});

test("sin APP_VERIFACTU_INSTALLATION_ID tampoco se envia", async () => {
  const mod = await loadBuilder();
  await withEnv(
    {
      APP_VERIFACTU_SOFTWARE_NIF: PRODUCER_NIF,
      APP_VERIFACTU_INSTALLATION_ID: undefined,
    },
    async () => {
      await assert.rejects(
        async () => buildEnvelope(mod),
        (err) => {
          assert.equal(err.status, 500);
          assert.match(err.message, /APP_VERIFACTU_INSTALLATION_ID/);
          return true;
        }
      );
    }
  );
});

test("la version declarada es la del producto, no un literal suelto", async () => {
  const mod = await loadBuilder();
  const pkg = JSON.parse(
    fs.readFileSync(path.join(workspaceRoot, "package.json"), "utf8")
  );

  assert.notEqual(
    pkg.version,
    "0.0.0",
    "la declaracion responsable es por version concreta: 0.0.0 no es declarable"
  );

  const xml = await withEnv(
    {
      APP_VERIFACTU_SOFTWARE_NIF: PRODUCER_NIF,
      APP_VERIFACTU_INSTALLATION_ID: INSTALLATION,
      APP_VERIFACTU_SYSTEM_VERSION: undefined,
    },
    () => buildEnvelope(mod)
  );

  assert.match(xml, new RegExp(`<sum1:Version>${pkg.version}</sum1:Version>`));
});
