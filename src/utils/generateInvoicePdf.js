import { base44 } from "@/api/base44Client";
import moment from "moment";

export async function generateInvoicePdf(invoice, intervention) {
  if (!invoice) {
    alert("No hay factura generada para este parte.");
    return;
  }

  // Cargar datos adicionales
  const [clientList, allUserList, rectInvoices] = await Promise.all([
    base44.entities.Client.filter({ id: intervention.client_id }, "-created_date", 1).catch(() => []),
    base44.entities.User.list("full_name", 100).catch(() => []),
    base44.entities.Invoice.filter({ factura_rectificada_id: invoice.id }, "-created_date", 10).catch(() => []),
  ]);

  const client = clientList[0] || {};
  const adminUser = allUserList.find((u) => u.verifactu_nif) || {};

  const emisorNombre = adminUser.verifactu_nombre || "FRITECMA S.L.";
  const emisorNif = adminUser.verifactu_nif || "";
  const emisorDireccion = adminUser.verifactu_direccion || "";
  const emisorCP = adminUser.verifactu_cp || "";
  const emisorCiudad = adminUser.verifactu_ciudad || "";
  const emisorTelefono = adminUser.verifactu_telefono || "";
  const emisorEmail = adminUser.verifactu_email || "";

  const allInvoicesToRender = [{ inv: invoice, esOriginal: true }];
  rectInvoices.forEach((r) => allInvoicesToRender.push({ inv: r, esOriginal: false }));

  const htmlPages = allInvoicesToRender.map(({ inv, esOriginal }) =>
    buildInvoicePage(inv, intervention, client, {
      emisorNombre, emisorNif, emisorDireccion, emisorCP, emisorCiudad, emisorTelefono, emisorEmail,
    }, esOriginal)
  );

  const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura ${invoice.invoice_number}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #111;
      background: white;
    }
    .page {
      width: 100%;
      page-break-after: always;
    }
    .page:last-child {
      page-break-after: avoid;
    }

    /* CABECERA */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1e3a5f;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .header-left { flex: 1; }
    .company-name {
      font-size: 15pt;
      font-weight: bold;
      color: #1e3a5f;
      margin-bottom: 3px;
    }
    .company-detail {
      font-size: 8pt;
      color: #444;
      line-height: 1.5;
    }
    .header-right {
      text-align: right;
      flex-shrink: 0;
      margin-left: 16px;
    }
    .invoice-title {
      font-size: 13pt;
      font-weight: bold;
      color: #1e3a5f;
      margin-bottom: 4px;
    }
    .invoice-meta {
      font-size: 8pt;
      color: #333;
      line-height: 1.6;
    }
    .invoice-meta strong { color: #111; }

    /* RECTIFICATIVA BADGE */
    .rect-badge {
      display: inline-block;
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #dc2626;
      font-weight: bold;
      font-size: 7.5pt;
      padding: 2px 7px;
      border-radius: 3px;
      margin-top: 4px;
    }

    /* BLOQUES CLIENTE/EMISOR */
    .parties {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
    }
    .party-block {
      flex: 1;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 7px 10px;
    }
    .party-title {
      font-size: 7pt;
      font-weight: bold;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 2px;
    }
    .party-name {
      font-size: 9.5pt;
      font-weight: bold;
      color: #111;
      margin-bottom: 2px;
    }
    .party-detail {
      font-size: 8pt;
      color: #444;
      line-height: 1.5;
    }

    /* PARTE REFERENCIA */
    .ref-bar {
      background: #f3f4f6;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 7.5pt;
      color: #374151;
      margin-bottom: 10px;
    }
    .ref-bar strong { color: #111; }

    /* TABLA LÍNEAS */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 8.5pt;
    }
    thead tr {
      background-color: #1e3a5f;
      color: white;
    }
    thead th {
      padding: 5px 7px;
      text-align: left;
      font-weight: 600;
      font-size: 7.5pt;
    }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }
    tbody tr {
      border-bottom: 1px solid #e5e7eb;
    }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody td {
      padding: 4px 7px;
      vertical-align: top;
    }
    tbody td.right { text-align: right; }
    tbody td.center { text-align: center; }

    /* TOTALES */
    .totals-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    .totals-box {
      width: 240px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      overflow: hidden;
    }
    .totals-line {
      display: flex;
      justify-content: space-between;
      padding: 4px 10px;
      font-size: 8.5pt;
      border-bottom: 1px solid #e5e7eb;
    }
    .totals-line:last-child { border-bottom: none; }
    .totals-line.grand {
      background: #1e3a5f;
      color: white;
      font-weight: bold;
      font-size: 10pt;
    }

    /* QR / VERIFACTU */
    .verifactu-block {
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      background: #f9fafb;
    }
    .verifactu-info { flex: 1; }
    .verifactu-title {
      font-size: 7pt;
      font-weight: bold;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .verifactu-data {
      font-size: 7.5pt;
      color: #111;
      margin-top: 2px;
      line-height: 1.5;
      word-break: break-all;
    }
    .qr-img {
      width: 70px;
      height: 70px;
      flex-shrink: 0;
    }

    /* PIE */
    .footer {
      font-size: 7pt;
      color: #9ca3af;
      text-align: center;
      margin-top: 6px;
      border-top: 1px solid #e5e7eb;
      padding-top: 4px;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${htmlPages.join("\n")}
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

function buildInvoicePage(inv, intervention, client, emisor, esOriginal) {
  const lines = inv.lines_json ? JSON.parse(inv.lines_json) : [];
  const isRect = inv.tipo_factura && inv.tipo_factura !== "F1";
  const isAceptado = inv.verifactu_status === "aceptado";
  const qrUrl = inv.qr_url || "";

  // Agrupar IVA por tasa
  const ivaByRate = {};
  lines.forEach((m) => {
    const rate = m.iva_percent || 21;
    if (!ivaByRate[rate]) ivaByRate[rate] = { base: 0, cuota: 0 };
    ivaByRate[rate].base += m.total || 0;
    ivaByRate[rate].cuota += (m.total || 0) * (rate / 100);
  });

  const ivaRows = Object.entries(ivaByRate).map(([rate, vals]) => `
    <div class="totals-line">
      <span>Base IVA ${rate}%</span>
      <span>${vals.base.toFixed(2)} €</span>
    </div>
    <div class="totals-line">
      <span>IVA ${rate}%</span>
      <span>${vals.cuota.toFixed(2)} €</span>
    </div>
  `).join("");

  const lineRows = lines.map((m) => `
    <tr>
      <td>${m.material_name || "—"}</td>
      <td class="center">${m.quantity} ${m.unit || "ud"}</td>
      <td class="right">${(m.unit_price || 0).toFixed(2)} €</td>
      <td class="center">${m.iva_percent || 21}%</td>
      <td class="right"><strong>${(m.total || 0).toFixed(2)} €</strong></td>
    </tr>
  `).join("");

  const verifactuSection = isAceptado ? `
    <div class="verifactu-block">
      ${qrUrl ? `<img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(qrUrl)}" alt="QR AEAT" />` : ""}
      <div class="verifactu-info">
        <div class="verifactu-title">✓ Factura Veri*factu — Registrada en AEAT</div>
        <div class="verifactu-data">
          ${inv.verifactu_csv ? `<span><strong>CSV:</strong> ${inv.verifactu_csv}</span><br/>` : ""}
          ${inv.verifactu_idregistro ? `<span><strong>ID Registro:</strong> ${inv.verifactu_idregistro}</span><br/>` : ""}
          ${inv.verifactu_timestamp ? `<span><strong>Recepción AEAT:</strong> ${moment(inv.verifactu_timestamp).format("DD/MM/YYYY HH:mm")}</span><br/>` : ""}
          <span><strong>Hash:</strong> ${(inv.hash_huella || "").slice(0, 32)}...</span>
        </div>
      </div>
    </div>
  ` : `
    <div class="verifactu-block">
      <div class="verifactu-info">
        <div class="verifactu-title">Veri*factu — ${inv.verifactu_status || "pendiente"}</div>
        <div class="verifactu-data">
          <span><strong>Hash:</strong> ${(inv.hash_huella || "").slice(0, 32)}...</span>
        </div>
      </div>
    </div>
  `;

  const rectBadge = isRect ? `<div class="rect-badge">⚠ FACTURA RECTIFICATIVA — ANULA FACTURA ${inv.factura_rectificada_number || ""}</div>` : "";
  const tipoLabel = esOriginal
    ? (isRect ? "Factura Rectificativa" : "Factura")
    : "Factura Rectificativa";

  return `
  <div class="page">
    <!-- CABECERA -->
    <div class="header">
      <div class="header-left">
        <div class="company-name">${emisor.emisorNombre}</div>
        <div class="company-detail">
          ${emisor.emisorNif ? `NIF: ${emisor.emisorNif}<br/>` : ""}
          ${emisor.emisorDireccion ? `${emisor.emisorDireccion}<br/>` : ""}
          ${emisor.emisorCP || emisor.emisorCiudad ? `${emisor.emisorCP} ${emisor.emisorCiudad}<br/>` : ""}
          ${emisor.emisorTelefono ? `Tel: ${emisor.emisorTelefono} · ` : ""}${emisor.emisorEmail || ""}
        </div>
      </div>
      <div class="header-right">
        <div class="invoice-title">${tipoLabel}</div>
        <div class="invoice-meta">
          <strong>Nº:</strong> ${inv.invoice_number}<br/>
          <strong>Fecha:</strong> ${moment(inv.issue_date).format("DD/MM/YYYY")}<br/>
          <strong>Serie:</strong> ${inv.serie || "A"}
        </div>
        ${rectBadge}
      </div>
    </div>

    <!-- DATOS PARTES -->
    <div class="parties">
      <div class="party-block">
        <div class="party-title">Emisor</div>
        <div class="party-name">${emisor.emisorNombre}</div>
        <div class="party-detail">
          ${emisor.emisorNif ? `NIF: ${emisor.emisorNif}<br/>` : ""}
          ${emisor.emisorDireccion || ""}
        </div>
      </div>
      <div class="party-block">
        <div class="party-title">Cliente / Destinatario</div>
        <div class="party-name">${inv.client_name || intervention.client_name}</div>
        <div class="party-detail">
          ${inv.client_nif ? `NIF/CIF: ${inv.client_nif}<br/>` : ""}
          ${inv.client_address || client.address || ""}${(inv.client_address || client.address) && (client.city) ? "<br/>" : ""}
          ${client.city ? `${client.postal_code || ""} ${client.city}` : ""}
        </div>
      </div>
    </div>

    <!-- REFERENCIA PARTE -->
    <div class="ref-bar">
      <strong>Parte de trabajo:</strong> ${intervention.number || "—"} &nbsp;|&nbsp;
      <strong>Técnico:</strong> ${intervention.technician_name || "—"} &nbsp;|&nbsp;
      <strong>Fecha intervención:</strong> ${moment(intervention.date).format("DD/MM/YYYY")}
      ${inv.rectificativa_motivo ? ` &nbsp;|&nbsp; <strong>Motivo:</strong> ${inv.rectificativa_motivo}` : ""}
    </div>

    <!-- TABLA LÍNEAS -->
    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="center" style="width:80px">Cantidad</th>
          <th class="right" style="width:90px">P. Unit.</th>
          <th class="center" style="width:55px">IVA %</th>
          <th class="right" style="width:90px">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows || `<tr><td colspan="5" style="padding:8px;color:#6b7280;text-align:center;">Sin líneas de detalle</td></tr>`}
      </tbody>
    </table>

    <!-- TOTALES -->
    <div class="totals-row">
      <div class="totals-box">
        ${ivaRows}
        <div class="totals-line grand">
          <span>TOTAL</span>
          <span>${(inv.total || 0).toFixed(2)} €</span>
        </div>
      </div>
    </div>

    <!-- VERIFACTU / QR -->
    ${verifactuSection}

    <!-- PIE -->
    <div class="footer">
      Documento generado el ${moment().format("DD/MM/YYYY HH:mm")} · ${emisor.emisorNombre} · Sistema Veri*factu (Ley 11/2021 Antifraude)
    </div>
  </div>`;
}