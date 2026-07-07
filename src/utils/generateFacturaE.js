import moment from "moment";

// Export FacturaE 3.2.2 (XML sin firmar) para facturación B2G (FACe).
// El XML generado debe firmarse externamente (p. ej. con AutoFirma / XAdES)
// antes de presentarlo en FACe; muchos portales lo firman en la propia subida.

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n) => (Number(n) || 0).toFixed(2);

const cleanNif = (nif) => String(nif || "").replace(/[\s-]/g, "").toUpperCase();

const parseLines = (invoice) => {
  try {
    const lines = JSON.parse(invoice.lines_json || "[]");
    return Array.isArray(lines) ? lines.filter((l) => !l._isSection) : [];
  } catch {
    return [];
  }
};

/**
 * Genera y descarga el XML FacturaE de una factura F1.
 * @throws {Error} si faltan NIFs o la factura no es exportable.
 */
export function downloadFacturaE(invoice, emisor, client = {}) {
  if ((invoice.tipo_factura || "F1") !== "F1") {
    throw new Error("Solo se pueden exportar a FacturaE facturas F1 (no rectificativas).");
  }

  const sellerNif = cleanNif(emisor?.verifactu_nif);
  const buyerNif = cleanNif(invoice.client_nif || client.nif || client.cif || client.tax_id);
  if (!sellerNif) throw new Error("Falta el NIF del emisor (Configuración → Veri*factu).");
  if (!buyerNif) throw new Error("El cliente no tiene NIF/CIF: es obligatorio para FacturaE.");

  const lines = parseLines(invoice);
  if (lines.length === 0) throw new Error("La factura no tiene líneas exportables.");

  const issueDate = moment(invoice.issue_date).format("YYYY-MM-DD");
  const serie = invoice.serie || "";
  const total = money(invoice.total);
  const subtotal = money(invoice.subtotal);
  const ivaTotal = money(invoice.iva_total);

  // Desglose por tipo de IVA
  const byRate = {};
  lines.forEach((l) => {
    const rate = Number(l.iva_percent) || 21;
    if (!byRate[rate]) byRate[rate] = { base: 0, cuota: 0 };
    byRate[rate].base += Number(l.total) || 0;
    byRate[rate].cuota += (Number(l.total) || 0) * (rate / 100);
  });

  const taxesXml = Object.entries(byRate)
    .map(
      ([rate, v]) => `
      <Tax>
        <TaxTypeCode>01</TaxTypeCode>
        <TaxRate>${money(rate)}</TaxRate>
        <TaxableBase><TotalAmount>${money(v.base)}</TotalAmount></TaxableBase>
        <TaxAmount><TotalAmount>${money(v.cuota)}</TotalAmount></TaxAmount>
      </Tax>`
    )
    .join("");

  const linesXml = lines
    .map((l) => {
      const rate = Number(l.iva_percent) || 21;
      const lineTotal = Number(l.total) || 0;
      return `
        <InvoiceLine>
          <ItemDescription>${esc(l.material_name || "Concepto")}</ItemDescription>
          <Quantity>${Number(l.quantity) || 0}</Quantity>
          <UnitOfMeasure>01</UnitOfMeasure>
          <UnitPriceWithoutTax>${money(l.unit_price)}</UnitPriceWithoutTax>
          <TotalCost>${money(lineTotal)}</TotalCost>
          <GrossAmount>${money(lineTotal)}</GrossAmount>
          <TaxesOutputs>
            <Tax>
              <TaxTypeCode>01</TaxTypeCode>
              <TaxRate>${money(rate)}</TaxRate>
              <TaxableBase><TotalAmount>${money(lineTotal)}</TotalAmount></TaxableBase>
              <TaxAmount><TotalAmount>${money(lineTotal * (rate / 100))}</TotalAmount></TaxAmount>
            </Tax>
          </TaxesOutputs>
        </InvoiceLine>`;
    })
    .join("");

  const sellerAddress = esc(emisor?.emisor_direccion || "Dirección no indicada");
  const buyerAddress = esc(client.address || invoice.client_address || "Dirección no indicada");
  const buyerPostCode = esc(client.postal_code || "00000");
  const buyerTown = esc(client.city || "-");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.es/Facturae/2014/v3.2.1/Facturae">
  <FileHeader>
    <SchemaVersion>3.2.1</SchemaVersion>
    <Modality>I</Modality>
    <InvoiceIssuerType>EM</InvoiceIssuerType>
    <Batch>
      <BatchIdentifier>${esc(sellerNif + invoice.invoice_number)}</BatchIdentifier>
      <InvoicesCount>1</InvoicesCount>
      <TotalInvoicesAmount><TotalAmount>${total}</TotalAmount></TotalInvoicesAmount>
      <TotalOutstandingAmount><TotalAmount>${total}</TotalAmount></TotalOutstandingAmount>
      <TotalExecutableAmount><TotalAmount>${total}</TotalAmount></TotalExecutableAmount>
      <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
    </Batch>
  </FileHeader>
  <Parties>
    <SellerParty>
      <TaxIdentification>
        <PersonTypeCode>J</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${esc(sellerNif)}</TaxIdentificationNumber>
      </TaxIdentification>
      <LegalEntity>
        <CorporateName>${esc(emisor?.verifactu_nombre || "")}</CorporateName>
        <AddressInSpain>
          <Address>${sellerAddress}</Address>
          <PostCode>00000</PostCode>
          <Town>-</Town>
          <Province>-</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      </LegalEntity>
    </SellerParty>
    <BuyerParty>
      <TaxIdentification>
        <PersonTypeCode>J</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${esc(buyerNif)}</TaxIdentificationNumber>
      </TaxIdentification>
      <LegalEntity>
        <CorporateName>${esc(invoice.client_name || client.name || "")}</CorporateName>
        <AddressInSpain>
          <Address>${buyerAddress}</Address>
          <PostCode>${buyerPostCode}</PostCode>
          <Town>${buyerTown}</Town>
          <Province>-</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      </LegalEntity>
    </BuyerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>${esc(invoice.invoice_number)}</InvoiceNumber>
        <InvoiceSeriesCode>${esc(serie)}</InvoiceSeriesCode>
        <InvoiceDocumentType>FC</InvoiceDocumentType>
        <InvoiceClass>OO</InvoiceClass>
      </InvoiceHeader>
      <InvoiceIssueData>
        <IssueDate>${issueDate}</IssueDate>
        <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
        <TaxCurrencyCode>EUR</TaxCurrencyCode>
        <LanguageName>es</LanguageName>
      </InvoiceIssueData>
      <TaxesOutputs>${taxesXml}
      </TaxesOutputs>
      <InvoiceTotals>
        <TotalGrossAmount>${subtotal}</TotalGrossAmount>
        <TotalGrossAmountBeforeTaxes>${subtotal}</TotalGrossAmountBeforeTaxes>
        <TotalTaxOutputs>${ivaTotal}</TotalTaxOutputs>
        <TotalTaxesWithheld>0.00</TotalTaxesWithheld>
        <InvoiceTotal>${total}</InvoiceTotal>
        <TotalOutstandingAmount>${total}</TotalOutstandingAmount>
        <TotalExecutableAmount>${total}</TotalExecutableAmount>
      </InvoiceTotals>
      <Items>${linesXml}
      </Items>
    </Invoice>
  </Invoices>
</fe:Facturae>
`;

  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FacturaE_${invoice.invoice_number.replace(/[/\\]/g, "-")}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}
