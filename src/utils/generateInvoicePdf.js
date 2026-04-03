import { base44 } from "@/api/base44Client";
import moment from "moment";
import { jsPDF } from "jspdf";

export async function generateInvoicePdf(invoice, intervention) {
  if (!invoice) { alert("No hay factura generada para este parte."); return; }

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

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const allInvoices = [invoice, ...rectInvoices];
  for (let i = 0; i < allInvoices.length; i++) {
    if (i > 0) doc.addPage();
    await renderPage(doc, allInvoices[i], intervention, client, emisor);
  }

  doc.save(`Factura_${invoice.invoice_number.replace(/[/\\]/g, "-")}.pdf`);
}

// ── Constantes de diseño ─────────────────────────────────────────────────────
const ML = 14;          // margen izquierdo
const MR = 14;          // margen derecho
const PW = 210 - ML - MR; // ancho de página útil (182mm)
const BLUE  = [30, 58, 95];
const LBLUE = [235, 240, 248];
const GRAY  = [120, 120, 120];
const LGRAY = [245, 246, 248];
const DGRAY = [60, 60, 60];
const WHITE = [255, 255, 255];
const RED   = [180, 28, 28];

function sf(doc, size, style = "normal", color = [30, 30, 30]) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function rect(doc, x, y, w, h, fill, stroke) {
  if (fill) { doc.setFillColor(...fill); }
  if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(0.3); }
  doc.rect(x, y, w, h, fill && stroke ? "FD" : fill ? "F" : "D");
}

async function renderPage(doc, inv, intervention, client, emisor) {
  const lines = (() => { try { return JSON.parse(inv.lines_json || "[]"); } catch { return []; } })();
  const isRect    = inv.tipo_factura && inv.tipo_factura !== "F1";
  const isAceptado = inv.verifactu_status === "aceptado";

  let y = 14;

  // ── 1. BANDA SUPERIOR AZUL ──────────────────────────────────────────────
  rect(doc, 0, 0, 210, 30, BLUE);

  sf(doc, 18, "bold", WHITE);
  doc.text(isRect ? "FACTURA RECTIFICATIVA" : "FACTURA", ML, 13);

  sf(doc, 9, "normal", [180, 200, 230]);
  doc.text(`Nº ${inv.invoice_number}  ·  ${moment(inv.issue_date).format("DD/MM/YYYY")}  ·  Serie ${inv.serie || "A"}`, ML, 20);

  if (isRect) {
    sf(doc, 7.5, "bold", [255, 180, 180]);
    doc.text(`Rectifica factura: ${inv.factura_rectificada_number || ""}`, ML, 26.5);
  }

  // Nombre empresa (derecha, en banda)
  sf(doc, 10, "bold", WHITE);
  doc.text(emisor.nombre, ML + PW, 11, { align: "right" });
  sf(doc, 8, "normal", [180, 200, 230]);
  if (emisor.nif) doc.text(`NIF: ${emisor.nif}`, ML + PW, 17, { align: "right" });

  y = 38;

  // ── 2. BLOQUES EMISOR / CLIENTE (dos columnas) ──────────────────────────
  const colW = (PW - 6) / 2;
  const colR = ML + colW + 6;

  // Emisor
  rect(doc, ML, y, colW, 34, LGRAY, [220, 225, 232]);
  sf(doc, 6.5, "bold", GRAY);
  doc.text("EMISOR", ML + 3, y + 5);
  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.2);
  doc.line(ML + 3, y + 6.5, ML + colW - 3, y + 6.5);

  sf(doc, 9, "bold", BLUE);
  doc.text(emisor.nombre, ML + 3, y + 12);
  sf(doc, 8, "normal", DGRAY);
  let ey = y + 17;
  if (emisor.nif)       { doc.text(`NIF: ${emisor.nif}`, ML + 3, ey); ey += 5; }
  if (emisor.direccion) { doc.text(emisor.direccion, ML + 3, ey); ey += 5; }
  if (emisor.cp || emisor.ciudad) doc.text(`${emisor.cp} ${emisor.ciudad}`.trim(), ML + 3, ey);

  // Cliente
  rect(doc, colR, y, colW, 34, LGRAY, [220, 225, 232]);
  sf(doc, 6.5, "bold", GRAY);
  doc.text("CLIENTE / DESTINATARIO", colR + 3, y + 5);
  doc.line(colR + 3, y + 6.5, colR + colW - 3, y + 6.5);

  sf(doc, 9, "bold", BLUE);
  const clientName = inv.client_name || intervention.client_name || "";
  doc.text(clientName, colR + 3, y + 12);
  sf(doc, 8, "normal", DGRAY);
  let cy = y + 17;
  if (inv.client_nif) { doc.text(`NIF/CIF: ${inv.client_nif}`, colR + 3, cy); cy += 5; }
  const cAddr = inv.client_address || client.address || "";
  const cCity = [client.postal_code, client.city].filter(Boolean).join(" ");
  if (cAddr) { doc.text(cAddr, colR + 3, cy); cy += 5; }
  if (cCity) doc.text(cCity, colR + 3, cy);

  y += 40;

  // ── 3. REF PARTE ────────────────────────────────────────────────────────
  rect(doc, ML, y, PW, 7, LBLUE);
  sf(doc, 7.5, "normal", BLUE);
  const refParts = [
    `Parte: ${intervention.number || "—"}`,
    `Técnico: ${intervention.technician_name || "—"}`,
    `Intervención: ${moment(intervention.date).format("DD/MM/YYYY")}`,
  ];
  if (inv.rectificativa_motivo) refParts.push(`Motivo: ${inv.rectificativa_motivo}`);
  doc.text(refParts.join("   ·   "), ML + 3, y + 4.5);
  y += 12;

  // ── 4. TABLA DE LÍNEAS ──────────────────────────────────────────────────
  const ROW_H = 6.5;
  // Cabecera
  rect(doc, ML, y, PW, 7.5, BLUE);
  sf(doc, 7.5, "bold", WHITE);
  doc.text("Descripción",   ML + 3,       y + 5);
  doc.text("Cant.",         ML + 96,      y + 5, { align: "center" });
  doc.text("P. Unitario",   ML + 120,     y + 5, { align: "right" });
  doc.text("IVA %",         ML + 145,     y + 5, { align: "right" });
  doc.text("Total",         ML + PW - 2,  y + 5, { align: "right" });
  y += 7.5;

  if (lines.length === 0) {
    rect(doc, ML, y, PW, ROW_H, LGRAY);
    sf(doc, 8, "normal", GRAY);
    doc.text("Sin líneas de detalle", ML + PW / 2, y + 4.2, { align: "center" });
    y += ROW_H;
  } else {
    lines.forEach((m, idx) => {
      if (idx % 2 === 1) rect(doc, ML, y, PW, ROW_H, LGRAY);
      doc.setDrawColor(220, 222, 226);
      doc.setLineWidth(0.2);
      doc.line(ML, y + ROW_H, ML + PW, y + ROW_H);

      sf(doc, 8, "normal", [30, 30, 30]);
      const desc = doc.splitTextToSize(m.material_name || "—", 87);
      doc.text(desc[0], ML + 3, y + 4.2);

      doc.text(`${m.quantity} ${m.unit || "ud"}`,        ML + 96,     y + 4.2, { align: "center" });
      doc.text(`${(m.unit_price || 0).toFixed(2)} €`,    ML + 120,    y + 4.2, { align: "right" });
      doc.text(`${m.iva_percent || 21}%`,                ML + 145,    y + 4.2, { align: "right" });
      sf(doc, 8, "bold", [30, 30, 30]);
      doc.text(`${(m.total || 0).toFixed(2)} €`,         ML + PW - 2, y + 4.2, { align: "right" });
      y += ROW_H;
    });
  }
  y += 5;

  // ── 5. BLOQUE TOTALES (alineado a la derecha) ───────────────────────────
  const TW = 75;
  const TX = ML + PW - TW;

  // Agrupar IVA
  const ivaByRate = {};
  lines.forEach((m) => {
    const r = m.iva_percent || 21;
    if (!ivaByRate[r]) ivaByRate[r] = { base: 0, cuota: 0 };
    ivaByRate[r].base  += m.total || 0;
    ivaByRate[r].cuota += (m.total || 0) * (r / 100);
  });

  doc.setDrawColor(210, 215, 222);
  doc.setLineWidth(0.3);

  let ty = y;
  Object.entries(ivaByRate).forEach(([rate, v]) => {
    rect(doc, TX, ty, TW, 6, LGRAY, [210, 215, 222]);
    sf(doc, 7.5, "normal", DGRAY);
    doc.text(`Base imponible ${rate}%`, TX + 3, ty + 4);
    doc.text(`${v.base.toFixed(2)} €`, TX + TW - 3, ty + 4, { align: "right" });
    ty += 6;

    rect(doc, TX, ty, TW, 6, LGRAY, [210, 215, 222]);
    doc.text(`IVA ${rate}%`, TX + 3, ty + 4);
    doc.text(`${v.cuota.toFixed(2)} €`, TX + TW - 3, ty + 4, { align: "right" });
    ty += 6;
  });

  // Total final
  rect(doc, TX, ty, TW, 10, BLUE);
  sf(doc, 11, "bold", WHITE);
  doc.text("TOTAL", TX + 4, ty + 6.8);
  doc.text(`${(inv.total || 0).toFixed(2)} €`, TX + TW - 3, ty + 6.8, { align: "right" });
  ty += 10;

  y = ty + 10;

  // ── 6. VERI*FACTU (solo si aceptado) ────────────────────────────────────
  if (isAceptado) {
    const vfH = 24;
    rect(doc, ML, y, PW, vfH, LGRAY, [200, 210, 225]);

    // QR
    if (inv.qr_url) {
      try {
        const qrDataUrl = await fetchImageAsDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inv.qr_url)}`
        );
        doc.addImage(qrDataUrl, "PNG", ML + PW - 22, y + 3, 18, 18);
      } catch (_) { /* QR no disponible */ }
    }

    sf(doc, 6.5, "bold", BLUE);
    doc.text("FACTURA REGISTRADA EN LA AGENCIA TRIBUTARIA (VERI*FACTU)", ML + 3, y + 6);
    doc.setDrawColor(200, 210, 225);
    doc.line(ML + 3, y + 7.5, ML + PW - 26, y + 7.5);

    sf(doc, 7.5, "normal", DGRAY);
    let vfy = y + 12;
    if (inv.verifactu_csv)         { doc.text(`CSV: ${inv.verifactu_csv}`, ML + 3, vfy); vfy += 5; }
    if (inv.verifactu_idregistro)  { doc.text(`ID Registro AEAT: ${inv.verifactu_idregistro}`, ML + 3, vfy); vfy += 5; }
    if (inv.verifactu_timestamp)   { doc.text(`Recepción: ${moment(inv.verifactu_timestamp).format("DD/MM/YYYY HH:mm")}`, ML + 3, vfy); }

    y += vfH + 6;
  }

  // ── 7. PIE DE PÁGINA ────────────────────────────────────────────────────
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  doc.line(ML, y, ML + PW, y);
  y += 4;
  sf(doc, 6.5, "normal", GRAY);
  doc.text(
    `Emitido el ${moment().format("DD/MM/YYYY")}  ·  ${emisor.nombre}${emisor.nif ? `  ·  NIF ${emisor.nif}` : ""}`,
    ML + PW / 2, y, { align: "center" }
  );
}

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}