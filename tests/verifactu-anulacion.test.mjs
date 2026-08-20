/**
 * Registro de facturacion de ANULACION (art. 11 RD 1007/2023).
 *
 * La huella se calcula sobre un subconjunto distinto al del alta. Orden
 * HAC/1177/2024, art. 13.1.b): NIF del emisor, numero de factura y serie, fecha
 * de expedicion, huella del registro anterior, y fecha/hora/huso de generacion.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ANULABLE_STATUSES,
  assertCanAnnul,
  buildAnulacionRecord,
  isAnulacion,
} from "../server/services/verifactu-anulacion.js";
import {
  buildVerifactuAnulacionEnvelope,
  computeAeatAnulacionFingerprint,
  computeAeatInvoiceFingerprint,
} from "../server/services/verifactu-aeat.js";
import { auditInvoiceChain } from "../server/services/verifactu-service.js";

const ISSUER = "12345678Z";
const ORG = "org-1";

const factura = (over = {}) => ({
  id: "fac-1",
  organization_id: ORG,
  invoice_number: "F-2026-0001",
  issue_date: "2026-03-10T09:00:00.000Z",
  issuer_nif: ISSUER,
  issuer_name: "Empresa Emisora SL",
  client_name: "Cliente Uno",
  client_nif: "B11111111",
  subtotal: 100,
  iva_total: 21,
  total: 121,
  tipo_factura: "F1",
  hash_anterior: "",
  invoice_chain_index: 1,
  verifactu_status: "aceptado",
  ...over,
});

const conHuella = (f) => ({
  ...f,
  hash_huella: computeAeatInvoiceFingerprint({
    invoiceNumber: f.invoice_number,
    issueDate: f.issue_date,
    issuerNif: f.issuer_nif,
    ivaTotal: f.iva_total,
    total: f.total,
    previousHash: f.hash_anterior,
    tipoFactura: f.tipo_factura,
    generatedAt: f.issue_date,
  }),
});

test("la huella de anulacion usa los 5 campos de la Orden, no los 8 del alta", () => {
  const base = {
    issuerNif: ISSUER,
    invoiceNumber: "F-2026-0001",
    issueDate: "2026-03-10T09:00:00.000Z",
    previousHash: "A".repeat(64),
    generatedAt: "2026-04-01T12:00:00.000Z",
  };
  const h = computeAeatAnulacionFingerprint(base);
  assert.match(h, /^[0-9A-F]{64}$/, "debe ser un SHA-256 en mayusculas");

  // Cambiar cualquiera de los cinco campos cambia la huella.
  for (const campo of Object.keys(base)) {
    const alterado = { ...base, [campo]: base[campo] + "X" };
    assert.notEqual(
      computeAeatAnulacionFingerprint(alterado),
      h,
      `la huella deberia depender de ${campo}`
    );
  }

  // Y no coincide con la del alta: son subconjuntos distintos.
  const alta = computeAeatInvoiceFingerprint({
    invoiceNumber: base.invoiceNumber,
    issueDate: base.issueDate,
    issuerNif: base.issuerNif,
    ivaTotal: 21,
    total: 121,
    previousHash: base.previousHash,
    tipoFactura: "F1",
    generatedAt: base.generatedAt,
  });
  assert.notEqual(h, alta);
});

test("el registro de anulacion se encadena al anterior y no consume numeracion", () => {
  const f = conHuella(factura());
  const rec = buildAnulacionRecord({
    invoice: f,
    previousRecord: f,
    organizationId: ORG,
    motivo: "Emitida al cliente equivocado",
    now: "2026-04-01T12:00:00.000Z",
  });

  assert.equal(rec.record_type, "anulacion");
  assert.equal(rec.hash_anterior, f.hash_huella);
  assert.equal(rec.invoice_chain_index, 2);
  assert.equal(rec.serie, "", "una anulacion no ocupa serie de facturacion");
  assert.equal(rec.total, 0, "una anulacion no repercute importes");
  assert.equal(rec.factura_anulada_number, "F-2026-0001");
  assert.equal(rec.anulacion_motivo, "Emitida al cliente equivocado");
  assert.ok(isAnulacion(rec));
});

test("la cadena sigue verificando con una anulacion dentro", () => {
  const f = conHuella(factura());
  const rec = {
    id: "anul-1",
    ...buildAnulacionRecord({
      invoice: f,
      previousRecord: f,
      organizationId: ORG,
      motivo: "Duplicada",
      now: "2026-04-01T12:00:00.000Z",
    }),
    verifactu_status: "aceptado",
  };

  const { verified, tampered } = auditInvoiceChain([f, rec]);
  assert.deepEqual(tampered, [], `anomalias inesperadas: ${JSON.stringify(tampered)}`);
  assert.equal(verified.length, 2);
});

test("manipular una anulacion se detecta", () => {
  const f = conHuella(factura());
  const rec = {
    id: "anul-1",
    ...buildAnulacionRecord({
      invoice: f,
      previousRecord: f,
      organizationId: ORG,
      motivo: "Duplicada",
      now: "2026-04-01T12:00:00.000Z",
    }),
    verifactu_status: "aceptado",
  };
  rec.factura_anulada_number = "F-2026-9999"; // se cambia a que factura anula

  const { tampered } = auditInvoiceChain([f, rec]);
  assert.equal(tampered.length, 1);
  assert.ok(
    tampered[0].problems.some((p) => p.includes("registro de anulación")),
    `problemas: ${JSON.stringify(tampered[0].problems)}`
  );
});

test("no se puede anular dos veces la misma factura", () => {
  const f = conHuella(factura());
  const rec = {
    id: "anul-1",
    ...buildAnulacionRecord({
      invoice: f,
      previousRecord: f,
      organizationId: ORG,
      motivo: "Duplicada",
    }),
  };

  assert.throws(
    () => assertCanAnnul(f, [f, rec]),
    (err) => {
      assert.equal(err.status, 409);
      return true;
    }
  );
});

test("no se puede anular una anulacion", () => {
  const f = conHuella(factura());
  const rec = {
    id: "anul-1",
    ...buildAnulacionRecord({ invoice: f, previousRecord: f, organizationId: ORG, motivo: "x" }),
  };

  assert.throws(
    () => assertCanAnnul(rec, [f, rec]),
    (err) => {
      assert.equal(err.status, 422);
      assert.match(err.message, /anular una anulaci/i);
      return true;
    }
  );
});

test("solo se anulan registros ya remitidos", () => {
  for (const estado of ["sin_envio", "pendiente_envio", "error_envio", ""]) {
    assert.throws(
      () => assertCanAnnul(factura({ verifactu_status: estado }), []),
      (err) => {
        assert.equal(err.status, 422);
        return true;
      },
      `estado ${estado} no deberia poder anularse`
    );
  }
  for (const estado of ANULABLE_STATUSES) {
    assert.doesNotThrow(() =>
      assertCanAnnul(factura({ verifactu_status: estado }), [])
    );
  }
});

test("el envelope lleva RegistroAnulacion con los campos de la factura anulada", () => {
  const f = conHuella(factura());
  const rec = {
    id: "anul-1",
    ...buildAnulacionRecord({
      invoice: f,
      previousRecord: f,
      organizationId: ORG,
      motivo: "Duplicada",
      now: "2026-04-01T12:00:00.000Z",
    }),
  };

  const xml = buildVerifactuAnulacionEnvelope({
    record: rec,
    annulled: f,
    issuerNif: ISSUER,
    issuerName: "Empresa Emisora SL",
    previousRecord: f,
    generatedAt: rec.issue_date,
  });

  assert.match(xml, /<sum1:RegistroAnulacion>/);
  assert.ok(!xml.includes("<sum1:RegistroAlta>"), "no debe ser un alta");
  assert.match(xml, /<sum1:NumSerieFacturaAnulada>F-2026-0001<\/sum1:NumSerieFacturaAnulada>/);
  assert.match(xml, /<sum1:FechaExpedicionFacturaAnulada>10-03-2026</);
  assert.match(xml, new RegExp(`<sum1:Huella>${rec.hash_huella}</sum1:Huella>`));
  assert.match(xml, /<sum1:RegistroAnterior>/);
  assert.match(xml, /<sum1:SistemaInformatico>/);
});

test("el primer registro de la cadena se marca como tal", () => {
  const f = conHuella(factura());
  const rec = {
    ...buildAnulacionRecord({ invoice: f, previousRecord: null, organizationId: ORG, motivo: "x" }),
  };
  const xml = buildVerifactuAnulacionEnvelope({
    record: rec,
    annulled: f,
    issuerNif: ISSUER,
    issuerName: "Empresa Emisora SL",
    previousRecord: null,
  });
  assert.match(xml, /<sum1:PrimerRegistro>S<\/sum1:PrimerRegistro>/);
});
