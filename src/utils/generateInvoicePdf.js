import { base44 } from "@/api/base44Client";
import moment from "moment";

export async function generateInvoicePdf(invoice, intervention) {
  if (!invoice) {
    alert("No hay factura generada para este parte.");
    return;
  }

  const [clientList, allUserList, rectInvoices] = await Promise.all([
    base44.entities.Client.filter({ id: intervention.client_id }, "-created_date", 1).catch(() => []),
    base44.entities.User.list("full_name", 100).catch(() => []),
    base44.entities.Invoice.filter({ factura_rectificada_id: invoice.id }, "-created_date", 10).catch(() => []),
  ]);

  const client = clientList[0] || {};
  const adminUser = allUserList.find((u) => u.verifactu_nif) || {};

  const emisor = {
    nombre:    adminUser.verifactu_nombre    || "FRITECMA S.L.",
    nif:       adminUser.verifactu_nif       || "",
    direccion: adminUser.verifactu_direccion || "",
    cp:        adminUser.verifactu_cp        || "",
    ciudad:    adminUser.verifactu_ciudad    || "",
    telefono:  adminUser.verifactu_telefono  || "",
    email:     adminUser.verifactu_email     || "",
  };

  const allInvoices = [invoice, ...rectInvoices];

  const pages = allInvoices
    .map((inv) => buildPage(inv, intervention, client, emisor))
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Factura ${invoice.invoice_number}</title>
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    color: #1a1a1a;
    background: #fff;
  }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: avoid; }

  /* CABECERA */
  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 9px;
    margin-bottom: 10px;
  }
  .co-name {
    font-size: 14pt;
    font-weight: bold;
    color: #1e3a5f;
    margin-bottom: 3px;
  }
  .co-detail { font-size: 7.5pt; color: #555; line-height: 1.6; }
  .inv-meta { text-align: right; }
  .inv-tipo {
    font-size: 13pt;
    font-weight: bold;
    color: #1e3a5f;
    margin-bottom: 4px;
  }
  .inv-data { font-size: 8pt; color: #333; line-height: 1.7; }
  .inv-data strong { color: #111; }
  .rect-alert {
    display: inline-block;
    margin-top: 5px;
    background: #fef2f2;
    border: 1px solid #fca5a5;
    color: #b91c1c;
    font-weight: bold;
    font-size: 7pt;
    padding: 2px 6px;
    border-radius: 3px;
  }

  /* PARTES */
  .parties { display: flex; gap: 8px; margin-bottom: 9px; }
  .party {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 6px 9px;
  }
  .party-lbl {
    font-size: 6.5pt;
    font-weight: bold;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 2px;
    margin-bottom: 4px;
  }
  .party-name { font-size: 9pt; font-weight: bold; margin-bottom: 2px; }
  .party-detail { font-size: 7.5pt; color: #444; line-height: 1.5; }

  /* REF BAR */
  .ref-bar {
    background: #f3f4f6;
    border-radius: 3px;
    padding: 4px 9px;
    font-size: 7.5pt;
    color: #374151;
    margin-bottom: 9px;
  }

  /* TABLA */
  table { width: 100%; border-collapse: collapse; margin-bottom: 9px; font-size: 8pt; }
  thead tr { background: #1e3a5f; color: #fff; }
  thead th { padding: 5px 7px; font-size: 7.5pt; font-weight: 600; }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; }
  tbody tr { border-bottom: 1px solid #e5e7eb; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td { padding: 4px 7px; }
  tbody td.r { text-align: right; }
  tbody td.c { text-align: center; }

  /* TOTALES */
  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 9px; }
  .totals-box {
    width: 230px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    overflow: hidden;
    font-size: 8pt;
  }
  .t-line { display: flex; justify-content: space-between; padding: 3px 9px; border-bottom: 1px solid #e5e7eb; }
  .t-line:last-child { border-bottom: none; }
  .t-grand {
    background: #1e3a5f;
    color: #fff;
    font-weight: bold;
    font-size: 10pt;
    padding: 5px 9px;
  }

  /* VERIFACTU - solo si aceptado */
  .vf-block {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 7px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: #f9fafb;
    margin-bottom: 8px;
  }
  .vf-info { flex: 1; }
  .vf-title { font-size: 7pt; font-weight: bold; color: #374151; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3px; }
  .vf-data { font-size: 7.5pt; color: #111; line-height: 1.6; word-break: break-all; }
  .qr-img { width: 68px; height: 68px; flex-shrink: 0; }

  /* PIE */
  .footer {
    font-size: 6.5pt;
    color: #9ca3af;
    text-align: center;
    border-top: 1px solid #e5e7eb;
    padding-top: 4px;
    margin-top: 4px;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${pages}
<script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}

function buildPage(inv, intervention, client, emisor) {
  const lines = (() => { try { return JSON.parse(inv.lines_json || "[]"); } catch { return []; } })();
  const isRect = inv.tipo_factura && inv.tipo_factura !== "F1";
  const isAceptado = inv.verifactu_status === "aceptado";

  // Título del documento
  const tipoLabel = isRect ? "Factura Rectificativa" : "Factura";

  // Filas de líneas
  const lineRows = lines.length > 0
    ? lines.map((m) => `
      <tr>
        <td>${m.material_name || "—"}</td>
        <td class="c">${m.quantity} ${m.unit || "ud"}</td>
        <td class="r">${(m.unit_price || 0).toFixed(2)} €</td>
        <td class="c">${m.iva_percent || 21}%</td>
        <td class="r"><strong>${(m.total || 0).toFixed(2)} €</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="padding:8px;color:#9ca3af;text-align:center;">Sin líneas de detalle</td></tr>`;

  // Agrupación IVA
  const ivaByRate = {};
  lines.forEach((m) => {
    const r = m.iva_percent || 21;
    if (!ivaByRate[r]) ivaByRate[r] = { base: 0, cuota: 0 };
    ivaByRate[r].base += m.total || 0;
    ivaByRate[r].cuota += (m.total || 0) * (r / 100);
  });
  const ivaRows = Object.entries(ivaByRate).map(([rate, v]) => `
    <div class="t-line"><span>Base imponible ${rate}%</span><span>${v.base.toFixed(2)} €</span></div>
    <div class="t-line"><span>IVA ${rate}%</span><span>${v.cuota.toFixed(2)} €</span></div>
  `).join("");

  // Bloque Veri*factu — solo si aceptado
  const vfBlock = isAceptado ? `
    <div class="vf-block">
      ${inv.qr_url ? `<img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=68x68&data=${encodeURIComponent(inv.qr_url)}" alt="QR AEAT"/>` : ""}
      <div class="vf-info">
        <div class="vf-title">Factura registrada en la Agencia Tributaria (Veri*factu)</div>
        <div class="vf-data">
          ${inv.verifactu_csv ? `<strong>CSV:</strong> ${inv.verifactu_csv}<br/>` : ""}
          ${inv.verifactu_idregistro ? `<strong>ID Registro:</strong> ${inv.verifactu_idregistro}<br/>` : ""}
          ${inv.verifactu_timestamp ? `<strong>Fecha recepción AEAT:</strong> ${moment(inv.verifactu_timestamp).format("DD/MM/YYYY HH:mm")}<br/>` : ""}
        </div>
      </div>
    </div>` : "";

  const rectAlert = isRect
    ? `<div class="rect-alert">⚠ RECTIFICATIVA — ANULA FACTURA ${inv.factura_rectificada_number || ""}</div>` : "";

  const clientAddr = [
    inv.client_address || client.address,
    [client.postal_code, client.city].filter(Boolean).join(" "),
  ].filter(Boolean).join("<br/>");

  return `
<div class="page">
  <div class="hdr">
    <div>
      <div class="co-name">${emisor.nombre}</div>
      <div class="co-detail">
        ${emisor.nif ? `NIF: ${emisor.nif}<br/>` : ""}
        ${emisor.direccion ? `${emisor.direccion}<br/>` : ""}
        ${(emisor.cp || emisor.ciudad) ? `${emisor.cp} ${emisor.ciudad}<br/>` : ""}
        ${emisor.telefono ? `Tel: ${emisor.telefono}` : ""}${emisor.telefono && emisor.email ? " · " : ""}${emisor.email || ""}
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-tipo">${tipoLabel}</div>
      <div class="inv-data">
        <strong>Nº:</strong> ${inv.invoice_number}<br/>
        <strong>Fecha:</strong> ${moment(inv.issue_date).format("DD/MM/YYYY")}<br/>
        <strong>Serie:</strong> ${inv.serie || "A"}
      </div>
      ${rectAlert}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-lbl">Emisor</div>
      <div class="party-name">${emisor.nombre}</div>
      <div class="party-detail">
        ${emisor.nif ? `NIF: ${emisor.nif}<br/>` : ""}
        ${emisor.direccion || ""}
      </div>
    </div>
    <div class="party">
      <div class="party-lbl">Cliente</div>
      <div class="party-name">${inv.client_name || intervention.client_name}</div>
      <div class="party-detail">
        ${inv.client_nif ? `NIF/CIF: ${inv.client_nif}<br/>` : ""}
        ${clientAddr}
      </div>
    </div>
  </div>

  <div class="ref-bar">
    <strong>Parte:</strong> ${intervention.number || "—"} &nbsp;·&nbsp;
    <strong>Técnico:</strong> ${intervention.technician_name || "—"} &nbsp;·&nbsp;
    <strong>Fecha intervención:</strong> ${moment(intervention.date).format("DD/MM/YYYY")}
    ${inv.rectificativa_motivo ? ` &nbsp;·&nbsp; <strong>Motivo rectificación:</strong> ${inv.rectificativa_motivo}` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th class="c" style="width:80px">Cantidad</th>
        <th class="r" style="width:90px">P. Unitario</th>
        <th class="c" style="width:55px">IVA %</th>
        <th class="r" style="width:90px">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals-box">
      ${ivaRows}
      <div class="t-line t-grand">
        <span>TOTAL</span>
        <span>${(inv.total || 0).toFixed(2)} €</span>
      </div>
    </div>
  </div>

  ${vfBlock}

  <div class="footer">
    Emitido el ${moment().format("DD/MM/YYYY")} · ${emisor.nombre}${emisor.nif ? ` · NIF ${emisor.nif}` : ""}
  </div>
</div>`;
}