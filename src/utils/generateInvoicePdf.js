import { base44 } from "@/api/base44Client";
import moment from "moment";
import { jsPDF } from "jspdf";

// Genera y descarga el PDF de factura sin usar window.print() ni capturas de pantalla
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

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  for (let i = 0; i < allInvoices.length; i++) {
    if (i > 0) doc.addPage();
    await renderInvoicePage(doc, allInvoices[i], intervention, client, emisor);
  }

  const filename = `Factura_${invoice.invoice_number.replace(/\//g, "-")}.pdf`;
  doc.save(filename);
}

// ─── Colores ─────────────────────────────────────────────────────────────────
const BLUE  = [30, 58, 95];   // #1e3a5f
const GRAY  = [107, 114, 128];
const LGRAY = [243, 244, 246];
const BLACK = [26, 26, 26];
const WHITE = [255, 255, 255];
const RED   = [185, 28, 28];

// Ancho útil A4 (210mm - 2*14mm margen)
const W = 182;
const L = 14; // margen izquierdo
const TOP = 14; // margen superior

function setFont(doc, size, style = "normal", color = BLACK) {
  doc.setFontSize(size);
  doc.setFont("helvetica", style);
  doc.setTextColor(...color);
}

async function renderInvoicePage(doc, inv, intervention, client, emisor) {
  let y = TOP;
  const lines = (() => { try { return JSON.parse(inv.lines_json || "[]"); } catch { return []; } })();
  const isRect = inv.tipo_factura && inv.tipo_factura !== "F1";
  const isAceptado = inv.verifactu_status === "aceptado";
  const tipoLabel = isRect ? "FACTURA RECTIFICATIVA" : "FACTURA";

  // ── CABECERA ───────────────────────────────────────────────────────────────
  // Empresa (izquierda)
  setFont(doc, 14, "bold", BLUE);
  doc.text(emisor.nombre, L, y);
  y += 5;

  setFont(doc, 8, "normal", GRAY);
  if (emisor.nif) { doc.text(`NIF: ${emisor.nif}`, L, y); y += 4; }
  if (emisor.direccion) { doc.text(emisor.direccion, L, y); y += 4; }
  if (emisor.cp || emisor.ciudad) { doc.text(`${emisor.cp} ${emisor.ciudad}`.trim(), L, y); y += 4; }
  const contactLine = [emisor.telefono ? `Tel: ${emisor.telefono}` : "", emisor.email].filter(Boolean).join("  ·  ");
  if (contactLine) { doc.text(contactLine, L, y); y += 4; }

  // Datos factura (derecha)
  const rightX = L + W;
  let ry = TOP;
  setFont(doc, 13, "bold", BLUE);
  doc.text(tipoLabel, rightX, ry, { align: "right" });
  ry += 5;

  setFont(doc, 8, "normal", BLACK);
  doc.text(`Nº: ${inv.invoice_number}`, rightX, ry, { align: "right" }); ry += 4;
  doc.text(`Fecha: ${moment(inv.issue_date).format("DD/MM/YYYY")}`, rightX, ry, { align: "right" }); ry += 4;
  doc.text(`Serie: ${inv.serie || "A"}`, rightX, ry, { align: "right" }); ry += 4;

  if (isRect) {
    setFont(doc, 7, "bold", RED);
    doc.text(`⚠ ANULA FACTURA: ${inv.factura_rectificada_number || ""}`, rightX, ry, { align: "right" });
    ry += 4;
  }

  y = Math.max(y, ry) + 4;

  // Línea divisora
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.6);
  doc.line(L, y, L + W, y);
  y += 6;

  // ── EMISOR / CLIENTE ───────────────────────────────────────────────────────
  const halfW = (W - 4) / 2;

  // Caja emisor
  doc.setFillColor(...LGRAY);
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.roundedRect(L, y, halfW, 26, 2, 2, "FD");
  // Caja cliente
  doc.roundedRect(L + halfW + 4, y, halfW, 26, 2, 2, "FD");

  setFont(doc, 6.5, "bold", GRAY);
  doc.text("EMISOR", L + 3, y + 4);
  doc.text("CLIENTE / DESTINATARIO", L + halfW + 7, y + 4);

  doc.setDrawColor(229, 231, 235);
  doc.line(L + 3, y + 5, L + halfW - 3, y + 5);
  doc.line(L + halfW + 7, y + 5, L + W - 3, y + 5);

  setFont(doc, 8.5, "bold", BLACK);
  doc.text(emisor.nombre, L + 3, y + 10);
  doc.text(inv.client_name || intervention.client_name, L + halfW + 7, y + 10);

  setFont(doc, 7.5, "normal", [68, 68, 68]);
  let eyOffset = 14;
  if (emisor.nif) { doc.text(`NIF: ${emisor.nif}`, L + 3, y + eyOffset); eyOffset += 4; }
  if (emisor.direccion) { doc.text(emisor.direccion, L + 3, y + eyOffset); eyOffset += 4; }

  let cyOffset = 14;
  if (inv.client_nif) { doc.text(`NIF/CIF: ${inv.client_nif}`, L + halfW + 7, y + cyOffset); cyOffset += 4; }
  const clientAddr = inv.client_address || client.address || "";
  const clientCity = [client.postal_code, client.city].filter(Boolean).join(" ");
  if (clientAddr) { doc.text(clientAddr, L + halfW + 7, y + cyOffset); cyOffset += 4; }
  if (clientCity) { doc.text(clientCity, L + halfW + 7, y + cyOffset); }

  y += 32;

  // ── REF PARTE ─────────────────────────────────────────────────────────────
  doc.setFillColor(...LGRAY);
  doc.setDrawColor(209, 213, 219);
  doc.roundedRect(L, y, W, 7, 1.5, 1.5, "FD");
  setFont(doc, 7.5, "normal", [55, 65, 81]);
  const refText = [
    `Parte: ${intervention.number || "—"}`,
    `Técnico: ${intervention.technician_name || "—"}`,
    `Fecha: ${moment(intervention.date).format("DD/MM/YYYY")}`,
    inv.rectificativa_motivo ? `Motivo: ${inv.rectificativa_motivo}` : "",
  ].filter(Boolean).join("   ·   ");
  doc.text(refText, L + 3, y + 4.5);
  y += 12;

  // ── TABLA LÍNEAS ──────────────────────────────────────────────────────────
  const cols = { desc: L, qty: L + 90, price: L + 116, iva: L + 144, total: L + 162 };
  const rowH = 6;

  // Cabecera tabla
  doc.setFillColor(...BLUE);
  doc.rect(L, y, W, 7, "F");
  setFont(doc, 7.5, "bold", WHITE);
  doc.text("Descripción", cols.desc + 2, y + 4.5);
  doc.text("Cant.", cols.qty, y + 4.5, { align: "center" });
  doc.text("P. Unit.", cols.price + 10, y + 4.5, { align: "right" });
  doc.text("IVA%", cols.iva + 9, y + 4.5, { align: "right" });
  doc.text("Total", cols.total + 16, y + 4.5, { align: "right" });
  y += 7;

  // Filas
  if (lines.length === 0) {
    doc.setFillColor(249, 250, 251);
    doc.rect(L, y, W, rowH, "F");
    setFont(doc, 8, "normal", GRAY);
    doc.text("Sin líneas de detalle", L + W / 2, y + 4, { align: "center" });
    y += rowH;
  } else {
    lines.forEach((m, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(L, y, W, rowH, "F");
      }
      doc.setDrawColor(229, 231, 235);
      doc.line(L, y + rowH, L + W, y + rowH);

      setFont(doc, 8, "normal", BLACK);
      const descText = doc.splitTextToSize(m.material_name || "—", 84);
      doc.text(descText[0], cols.desc + 2, y + 4);

      doc.text(`${m.quantity} ${m.unit || "ud"}`, cols.qty, y + 4, { align: "center" });
      doc.text(`${(m.unit_price || 0).toFixed(2)} €`, cols.price + 10, y + 4, { align: "right" });
      doc.text(`${m.iva_percent || 21}%`, cols.iva + 9, y + 4, { align: "right" });
      setFont(doc, 8, "bold", BLACK);
      doc.text(`${(m.total || 0).toFixed(2)} €`, cols.total + 16, y + 4, { align: "right" });
      y += rowH;
    });
  }
  y += 4;

  // ── TOTALES ───────────────────────────────────────────────────────────────
  const totW = 70;
  const totX = L + W - totW;

  // Agrupar IVA
  const ivaByRate = {};
  lines.forEach((m) => {
    const r = m.iva_percent || 21;
    if (!ivaByRate[r]) ivaByRate[r] = { base: 0, cuota: 0 };
    ivaByRate[r].base += m.total || 0;
    ivaByRate[r].cuota += (m.total || 0) * (r / 100);
  });

  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);

  let ty = y;
  Object.entries(ivaByRate).forEach(([rate, v]) => {
    doc.setFillColor(...LGRAY);
    doc.rect(totX, ty, totW, 5.5, "FD");
    setFont(doc, 7.5, "normal", BLACK);
    doc.text(`Base imponible ${rate}%`, totX + 2, ty + 3.8);
    doc.text(`${v.base.toFixed(2)} €`, totX + totW - 2, ty + 3.8, { align: "right" });
    ty += 5.5;

    doc.rect(totX, ty, totW, 5.5, "FD");
    doc.text(`IVA ${rate}%`, totX + 2, ty + 3.8);
    doc.text(`${v.cuota.toFixed(2)} €`, totX + totW - 2, ty + 3.8, { align: "right" });
    ty += 5.5;
  });

  // Total final
  doc.setFillColor(...BLUE);
  doc.rect(totX, ty, totW, 8, "F");
  setFont(doc, 10, "bold", WHITE);
  doc.text("TOTAL", totX + 3, ty + 5.5);
  doc.text(`${(inv.total || 0).toFixed(2)} €`, totX + totW - 2, ty + 5.5, { align: "right" });
  ty += 8;

  y = ty + 8;

  // ── VERI*FACTU (solo si aceptado) ─────────────────────────────────────────
  if (isAceptado) {
    doc.setDrawColor(209, 213, 219);
    doc.setFillColor(249, 250, 251);
    doc.setLineWidth(0.3);
    doc.roundedRect(L, y, W, 22, 2, 2, "FD");

    setFont(doc, 6.5, "bold", [55, 65, 81]);
    doc.text("FACTURA REGISTRADA EN LA AGENCIA TRIBUTARIA (VERI*FACTU)", L + 3, y + 5);

    setFont(doc, 7.5, "normal", BLACK);
    let vfy = y + 10;
    if (inv.verifactu_csv) {
      doc.text(`CSV: ${inv.verifactu_csv}`, L + 3, vfy); vfy += 4.5;
    }
    if (inv.verifactu_idregistro) {
      doc.text(`ID Registro AEAT: ${inv.verifactu_idregistro}`, L + 3, vfy); vfy += 4.5;
    }
    if (inv.verifactu_timestamp) {
      doc.text(`Fecha recepción: ${moment(inv.verifactu_timestamp).format("DD/MM/YYYY HH:mm")}`, L + 3, vfy);
    }

    // QR como imagen externa (si hay URL)
    if (inv.qr_url) {
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inv.qr_url)}`;
      try {
        const qrRes = await fetchImageAsDataUrl(qrApiUrl);
        doc.addImage(qrRes, "PNG", L + W - 22, y + 2, 18, 18);
      } catch (_) {
        // QR no disponible, omitir
      }
    }

    y += 26;
  }

  // ── PIE ───────────────────────────────────────────────────────────────────
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(L, y, L + W, y);
  y += 4;
  setFont(doc, 6.5, "normal", GRAY);
  const footerText = `Emitido el ${moment().format("DD/MM/YYYY")} · ${emisor.nombre}${emisor.nif ? ` · NIF ${emisor.nif}` : ""}`;
  doc.text(footerText, L + W / 2, y, { align: "center" });
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