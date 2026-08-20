/**
 * Deteccion de alteraciones en la cadena de registros de facturacion
 * (art. 8.2.a y 8.2.b RD 1007/2023).
 *
 * La norma considera alteracion la modificacion de un registro y tambien "la
 * ocultacion o eliminacion" de cualquiera de ellos. Estos tests cubren los tres
 * vectores: dato cambiado, eslabon roto y registro borrado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { auditInvoiceChain } from "../server/services/verifactu-service.js";
import { computeAeatInvoiceFingerprint } from "../server/services/verifactu-aeat.js";

const ISSUER = "12345678Z";

/** Construye una cadena valida de n facturas, encadenadas como en produccion. */
const buildChain = (count) => {
  const invoices = [];
  let previousHash = "";

  for (let i = 1; i <= count; i += 1) {
    const issueDate = `2026-0${i}-10T09:00:00.000Z`;
    const total = 100 * i;
    const ivaTotal = 21 * i;
    const invoiceNumber = `F-2026-000${i}`;
    const hash = computeAeatInvoiceFingerprint({
      invoiceNumber,
      issueDate,
      issuerNif: ISSUER,
      ivaTotal,
      total,
      previousHash,
      tipoFactura: "F1",
      generatedAt: issueDate,
    });

    invoices.push({
      id: `id-${i}`,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      issuer_nif: ISSUER,
      client_name: `Cliente ${i}`,
      iva_total: ivaTotal,
      total,
      tipo_factura: "F1",
      hash_anterior: previousHash,
      hash_huella: hash,
      invoice_chain_index: i,
      verifactu_status: "aceptado",
    });

    previousHash = hash;
  }

  return invoices;
};

test("una cadena intacta no produce ninguna anomalia", () => {
  const { verified, tampered } = auditInvoiceChain(buildChain(4));
  assert.equal(verified.length, 4);
  assert.deepEqual(tampered, []);
});

test("detecta un importe modificado despues de emitir", () => {
  const chain = buildChain(3);
  chain[1].total = 999; // alguien toca la BD directamente

  const { tampered } = auditInvoiceChain(chain);
  assert.equal(tampered.length, 1);
  assert.equal(tampered[0].invoice_number, "F-2026-0002");
  assert.ok(
    tampered[0].problems.some((p) => p.includes("huella no coincide")),
    `problemas: ${JSON.stringify(tampered[0].problems)}`
  );
});

test("detecta un eslabon que no apunta al anterior", () => {
  const chain = buildChain(3);
  chain[2].hash_anterior = "B".repeat(64);

  const { tampered } = auditInvoiceChain(chain);
  const flagged = tampered.find((t) => t.invoice_number === "F-2026-0003");
  assert.ok(flagged, "la tercera factura debe salir marcada");
  assert.ok(
    flagged.problems.some((p) => p.includes("hash anterior no apunta")),
    `problemas: ${JSON.stringify(flagged.problems)}`
  );
});

test("detecta la ELIMINACION de un registro intermedio", () => {
  const chain = buildChain(4);
  const sinLaSegunda = chain.filter((i) => i.invoice_chain_index !== 2);

  const { tampered } = auditInvoiceChain(sinLaSegunda);
  assert.ok(tampered.length > 0, "borrar un registro debe detectarse");

  const flagged = tampered.find((t) => t.invoice_number === "F-2026-0003");
  assert.ok(flagged, "la factura que sigue al hueco debe salir marcada");
  assert.ok(
    flagged.problems.some((p) => p.includes("ruptura de secuencia")),
    `problemas: ${JSON.stringify(flagged.problems)}`
  );
});

test("detecta una factura añadida al final con datos inventados", () => {
  const chain = buildChain(2);
  chain.push({
    id: "id-falsa",
    invoice_number: "F-2026-0003",
    issue_date: "2026-03-10T09:00:00.000Z",
    issuer_nif: ISSUER,
    client_name: "Cliente simulado",
    iva_total: 21,
    total: 100,
    tipo_factura: "F1",
    hash_anterior: chain[1].hash_huella,
    hash_huella: "C".repeat(64),
    invoice_chain_index: 3,
    verifactu_status: "aceptado",
  });

  const { tampered } = auditInvoiceChain(chain);
  assert.equal(tampered.length, 1);
  assert.equal(tampered[0].invoice_number, "F-2026-0003");
});

test("no examina registros que no son fiscales", () => {
  const chain = buildChain(2);
  chain.push({
    id: "id-borrador",
    invoice_number: "F-BORRADOR",
    verifactu_status: "sin_envio",
    invoice_chain_index: 99,
    hash_huella: "",
    hash_anterior: "",
  });

  const { fiscalInvoices, tampered } = auditInvoiceChain(chain);
  assert.equal(fiscalInvoices.length, 2);
  assert.deepEqual(tampered, []);
});

test("la primera factura no puede declarar un hash anterior", () => {
  const chain = buildChain(1);
  chain[0].hash_anterior = "D".repeat(64);

  const { tampered } = auditInvoiceChain(chain);
  assert.equal(tampered.length, 1);
  assert.ok(
    tampered[0].problems.some((p) => p.includes("primera factura de la cadena")),
    `problemas: ${JSON.stringify(tampered[0].problems)}`
  );
});
