/**
 * Volcado de registros de facturacion (art. 8.2.c RD 1007/2023).
 *
 * Lo que hay que poder exportar es el REGISTRO con su huella y su
 * encadenamiento, no un resumen comercial de la factura.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceRecordsXml } from "../server/services/verifactu-export.js";

const invoice = (overrides = {}) => ({
  invoice_number: "F-2026-0001",
  issue_date: "2026-03-10T09:00:00.000Z",
  issuer_nif: "12345678Z",
  issuer_name: "Empresa Emisora SL",
  client_name: "Cliente Uno",
  client_nif: "B11111111",
  subtotal: 100,
  iva_total: 21,
  total: 121,
  tipo_factura: "F1",
  hash_anterior: "",
  hash_huella: "A".repeat(64),
  invoice_chain_index: 1,
  verifactu_status: "aceptado",
  verifactu_csv: "CSV-1",
  verifactu_idregistro: "REG-1",
  verifactu_timestamp: "2026-03-10T09:00:01.000Z",
  ...overrides,
});

test("el XML declara UTF-8 y lleva los campos del registro, no solo los de la factura", () => {
  const { xml, count } = buildInvoiceRecordsXml({
    invoices: [invoice()],
    organizationId: "org-1",
  });

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.equal(count, 1);
  for (const tag of [
    "Huella",
    "HuellaAnterior",
    "IndiceCadena",
    "TipoHuella",
    "NumSerieFactura",
    "ImporteTotal",
  ]) {
    assert.match(xml, new RegExp(`<${tag}>`), `falta <${tag}> en el volcado`);
  }
});

test("exporta en orden de cadena aunque lleguen desordenadas", () => {
  const { xml } = buildInvoiceRecordsXml({
    invoices: [
      invoice({ invoice_number: "F-2026-0003", invoice_chain_index: 3 }),
      invoice({ invoice_number: "F-2026-0001", invoice_chain_index: 1 }),
      invoice({ invoice_number: "F-2026-0002", invoice_chain_index: 2 }),
    ],
    organizationId: "org-1",
  });

  const order = [...xml.matchAll(/<NumSerieFactura>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(order, ["F-2026-0001", "F-2026-0002", "F-2026-0003"]);
});

test("acota por periodo", () => {
  const invoices = [
    invoice({ invoice_number: "F-1", issue_date: "2026-01-15T10:00:00.000Z", invoice_chain_index: 1 }),
    invoice({ invoice_number: "F-2", issue_date: "2026-06-15T10:00:00.000Z", invoice_chain_index: 2 }),
  ];

  const { count, xml } = buildInvoiceRecordsXml({
    invoices,
    organizationId: "org-1",
    from: "2026-05-01T00:00:00.000Z",
    to: "2026-12-31T23:59:59.999Z",
  });

  assert.equal(count, 1);
  assert.match(xml, /<NumSerieFactura>F-2</);
  assert.ok(!xml.includes("<NumSerieFactura>F-1<"));
});

test("no vuelca borradores ni registros sin valor fiscal", () => {
  const { count } = buildInvoiceRecordsXml({
    invoices: [invoice(), invoice({ invoice_number: "F-X", verifactu_status: "sin_envio" })],
    organizationId: "org-1",
  });

  assert.equal(count, 1);
});

test("escapa el contenido para no romper el XML", () => {
  const { xml } = buildInvoiceRecordsXml({
    invoices: [invoice({ client_name: 'Bar "El Ancla" & Cía <SL>' })],
    organizationId: "org-1",
  });

  assert.ok(!xml.includes('Bar "El Ancla" & Cía <SL>'));
  assert.match(xml, /&amp;/);
  assert.match(xml, /&lt;SL&gt;/);
});

test("una exportacion vacia sigue siendo un documento valido", () => {
  const { xml, count } = buildInvoiceRecordsXml({
    invoices: [],
    organizationId: "org-1",
  });

  assert.equal(count, 0);
  assert.match(xml, /<NumeroRegistros>0<\/NumeroRegistros>/);
  assert.match(xml, /<\/ExportacionRegistrosFacturacion>/);
});
