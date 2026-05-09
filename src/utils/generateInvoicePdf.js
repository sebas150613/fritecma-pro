import { appApi } from "@/api/app-api";
import moment from "moment";
import { jsPDF } from "jspdf";

// ── Constantes de diseño ──────────────────────────────────────────────────────
const ML    = 14;
const PW    = 210 - ML * 2;   // 182 mm
const PH    = 297;
const BLUE  = [30, 58, 95];
const AMBER = [180, 100, 20];
const GRAY  = [120, 120, 120];
const LGRAY = [245, 246, 248];
const DGRAY = [60, 60, 60];
const WHITE = [255, 255, 255];
const RED   = [160, 30, 30];

function sf(doc, size, style, color) {
  doc.setFont("helvetica", style || "normal");
  doc.setFontSize(size);
  doc.setTextColor(...(color || [30, 30, 30]));
}

function fillRect(doc, x, y, w, h, fill, strokeColor) {
  if (fill)        doc.setFillColor(...fill);
  if (strokeColor) { doc.setDrawColor(...strokeColor); doc.setLineWidth(0.3); }
  doc.rect(x, y, w, h, fill && strokeColor ? "FD" : fill ? "F" : "D");
}

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Entrada principal ─────────────────────────────────────────────────────────
export async function generateInvoicePdf(invoice, intervention) {
  if (!invoice) { alert("No hay factura generada para este parte."); return; }

  const [clientList, currentUser] = await Promise.all([
    appApi.entities.Client.filter({ id: intervention.client_id }, "-created_date", 1).catch(() => []),
    appApi.auth.me().catch(() => null),
  ]);

  const client    = clientList[0] || {};

  const emisor = {
    nombre:    currentUser?.verifactu_nombre || "FRIGEST S.L.",
    nif:       currentUser?.verifactu_nif    || "",
    direccion: currentUser?.emisor_direccion || "",
    telefono:  currentUser?.emisor_telefono  || "",
    logo_url:  currentUser?.emisor_logo_url  || "",
  };

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const isRect = invoice.tipo_factura && invoice.tipo_factura !== "F1";

  if (isRect) {
    // Página 1: Factura rectificativa
    await renderPage(doc, invoice, intervention, client, emisor, { isRectificativa: true });

    // Página 2: Factura original como referencia
    if (invoice.factura_rectificada_id) {
      const origList = await appApi.entities.Invoice.filter(
        { id: invoice.factura_rectificada_id }, "-created_date", 1
      ).catch(() => []);

      if (origList.length > 0) {
        doc.addPage();
        const origInvoice = origList[0];
        await renderPage(doc, origInvoice, intervention, client, emisor, {
          isOriginalRef: true,
          rectificativaNumber: invoice.invoice_number,
          // Bloque comparativo
          rectificativaInvoice: invoice,
        });
      }
    }
  } else {
    await renderPage(doc, invoice, intervention, client, emisor, {});
  }

  doc.save(`Factura_${invoice.invoice_number.replace(/[/\\]/g, "-")}.pdf`);
}

// ── Renderiza una página ──────────────────────────────────────────────────────
async function renderPage(doc, inv, intervention, client, emisor, opts = {}) {
  const { isRectificativa, isOriginalRef, rectificativaNumber, rectificativaInvoice } = opts;
  const lines      = (() => { try { return JSON.parse(inv.lines_json || "[]"); } catch { return []; } })();
  const isAceptado = inv.verifactu_status === "aceptado";

  // ── BANDA SUPERIOR ────────────────────────────────────────────────────────
  const bandColor = isOriginalRef ? [50, 50, 50] : BLUE;
  fillRect(doc, 0, 0, 210, 32, bandColor);

  // Título
  if (isOriginalRef) {
    sf(doc, 16, "bold", WHITE);
    doc.text("FACTURA ORIGINAL RECTIFICADA", ML, 13);
    sf(doc, 8, "normal", [180, 180, 180]);
    doc.text("Documento informativo / referencia — No vigente", ML, 20);
    sf(doc, 7.5, "normal", [200, 180, 140]);
    doc.text(`Rectificada por: ${rectificativaNumber}`, ML, 27);
  } else if (isRectificativa) {
    sf(doc, 16, "bold", WHITE);
    doc.text("FACTURA RECTIFICATIVA", ML, 13);
    sf(doc, 9, "normal", [180, 200, 230]);
    doc.text(`Nº ${inv.invoice_number}  ·  ${moment(inv.issue_date).format("DD/MM/YYYY")}  ·  Serie ${inv.serie || "R"}`, ML, 20);
    if (inv.factura_rectificada_number) {
      sf(doc, 7.5, "bold", [255, 180, 100]);
      doc.text(`Rectifica la factura: ${inv.factura_rectificada_number}`, ML, 27);
    }
  } else {
    sf(doc, 18, "bold", WHITE);
    doc.text("FACTURA", ML, 14);
    sf(doc, 9, "normal", [180, 200, 230]);
    doc.text(`Nº ${inv.invoice_number}  ·  ${moment(inv.issue_date).format("DD/MM/YYYY")}  ·  Serie ${inv.serie || "A"}`, ML, 21);
  }

  // Logo o texto emisor en la derecha
  if (emisor.logo_url) {
    try {
      const logoData = await fetchImageAsDataUrl(emisor.logo_url);
      doc.addImage(logoData, ML + PW - 40, 6, 40, 20, undefined, "FAST");
    } catch (_) {
      sf(doc, 10, "bold", WHITE);
      doc.text(emisor.nombre, ML + PW, 16, { align: "right" });
    }
  } else {
    sf(doc, 10, "bold", WHITE);
    doc.text(emisor.nombre, ML + PW, 12, { align: "right" });
    sf(doc, 8, "normal", [180, 200, 230]);
    if (emisor.nif)      doc.text(`NIF: ${emisor.nif}`, ML + PW, 18, { align: "right" });
    if (emisor.telefono) doc.text(`Tel: ${emisor.telefono}`, ML + PW, 24, { align: "right" });
  }

  let y = 40;

  // ── AVISO "NO VIGENTE" si es original de referencia ──────────────────────
  if (isOriginalRef) {
    const warnText = `Esta factura ha sido rectificada y queda anulada. Documento válido: ${rectificativaNumber}`;
    const warnLines = doc.splitTextToSize(warnText, PW - 10);
    const warnBoxH = warnLines.length * 5 + 7;
    fillRect(doc, ML, y, PW, warnBoxH, [255, 240, 220], [220, 160, 60]);
    sf(doc, 7.5, "bold", AMBER);
    doc.text(warnLines, ML + PW / 2, y + 5.5, { align: "center" });
    y += warnBoxH + 4;
  }

  // ── MOTIVO DE RECTIFICACIÓN ──────────────────────────────────────────────
  const colW = (PW - 6) / 2;
  const colR = ML + colW + 6;
  const boxH = 36;

  fillRect(doc, ML, y, colW, boxH, LGRAY, [215, 220, 230]);
  sf(doc, 6.5, "bold", GRAY);
  doc.text("EMISOR", ML + 3, y + 5);
  doc.setDrawColor(200, 205, 215); doc.setLineWidth(0.2);
  doc.line(ML + 3, y + 6.5, ML + colW - 3, y + 6.5);
  sf(doc, 9, "bold", BLUE);
  doc.text(emisor.nombre, ML + 3, y + 13);
  sf(doc, 8, "normal", DGRAY);
  let ey = y + 19;
  if (emisor.nif)      { doc.text(`NIF: ${emisor.nif}`,      ML + 3, ey); ey += 5; }
  if (emisor.direccion){ doc.text(emisor.direccion,           ML + 3, ey); ey += 5; }
  if (emisor.telefono) { doc.text(`Tel: ${emisor.telefono}`,  ML + 3, ey); }

  fillRect(doc, colR, y, colW, boxH, LGRAY, [215, 220, 230]);
  sf(doc, 6.5, "bold", GRAY);
  doc.text("CLIENTE / DESTINATARIO", colR + 3, y + 5);
  doc.line(colR + 3, y + 6.5, colR + colW - 3, y + 6.5);
  sf(doc, 9, "bold", BLUE);
  doc.text(inv.client_name || intervention.client_name || "", colR + 3, y + 13);
  sf(doc, 8, "normal", DGRAY);
  let cy = y + 19;
  if (inv.client_nif) { doc.text(`NIF/CIF: ${inv.client_nif}`, colR + 3, cy); cy += 5; }
  const cAddr = inv.client_address || client.address || "";
  const cCity = [client.postal_code, client.city].filter(Boolean).join(" ");
  if (cAddr) { doc.text(cAddr, colR + 3, cy); cy += 5; }
  if (cCity) { doc.text(cCity, colR + 3, cy); }

  y += boxH + 10;

  // ── DATOS DE REFERENCIA (solo en rectificativa) ───────────────────────────
  if (isRectificativa && inv.factura_rectificada_number) {
    const refH = 9;
    fillRect(doc, ML, y, PW, refH, [240, 244, 255], [200, 210, 240]);
    sf(doc, 7, "bold", [50, 70, 150]);
    doc.text("FACTURA RECTIFICADA:", ML + 3, y + 5.5);
    sf(doc, 7, "normal", DGRAY);
    const refDate = inv.issue_date ? moment(inv.issue_date).format("DD/MM/YYYY") : "";
    doc.text(
      `Nº ${inv.factura_rectificada_number}  ·  Fecha emisión original: ver documento adjunto`,
      ML + 45, y + 5.5
    );
    y += refH + 6;
  }

  // ── TABLA DE LÍNEAS ───────────────────────────────────────────────────────
  const ROW_H = 6.5;
  const headerColor = isOriginalRef ? [60, 60, 60] : BLUE;
  fillRect(doc, ML, y, PW, 7.5, headerColor);
  sf(doc, 7.5, "bold", WHITE);
  doc.text("Descripción",   ML + 3,      y + 5);
  doc.text("Cant.",         ML + 96,     y + 5, { align: "center" });
  doc.text("P. Unitario",   ML + 122,    y + 5, { align: "right" });
  doc.text("IVA %",         ML + 147,    y + 5, { align: "right" });
  doc.text("Total",         ML + PW - 2, y + 5, { align: "right" });
  y += 7.5;

  if (lines.length === 0) {
    fillRect(doc, ML, y, PW, ROW_H, LGRAY);
    sf(doc, 8, "normal", GRAY);
    doc.text("Sin líneas de detalle", ML + PW / 2, y + 4.2, { align: "center" });
    y += ROW_H;
  } else {
    lines.forEach((m, idx) => {
      if (idx % 2 === 1) fillRect(doc, ML, y, PW, ROW_H, LGRAY);
      doc.setDrawColor(220, 222, 226); doc.setLineWidth(0.2);
      doc.line(ML, y + ROW_H, ML + PW, y + ROW_H);
      sf(doc, 8, "normal");
      const isLabor = m._isLabor || m.category === "mano_de_obra" || (m.material_name || "").toLowerCase().includes("mano de obra");
      const rawName = m.material_name || "—";
      const displayName = (isRectificativa && isLabor && inv.factura_rectificada_number)
        ? `Rectificación de factura ${inv.factura_rectificada_number} – Mano de obra`
        : rawName;
      const desc = doc.splitTextToSize(displayName, 87);
      doc.text(desc[0], ML + 3, y + 4.2);
      doc.text(`${m.quantity} ${m.unit || "ud"}`,     ML + 96,     y + 4.2, { align: "center" });
      doc.text(`${(m.unit_price || 0).toFixed(2)} €`, ML + 122,    y + 4.2, { align: "right" });
      doc.text(`${m.iva_percent || 21}%`,             ML + 147,    y + 4.2, { align: "right" });
      sf(doc, 8, "bold");
      const totalVal = m.total || 0;
      const totalColor = isOriginalRef && totalVal < 0 ? RED : undefined;
      if (totalColor) doc.setTextColor(...totalColor);
      doc.text(`${totalVal.toFixed(2)} €`, ML + PW - 2, y + 4.2, { align: "right" });
      y += ROW_H;
    });
  }

  // ── BLOQUE COMPARATIVO (solo en página original de referencia) ─────────────
  if (isOriginalRef && rectificativaInvoice) {
    y += 8;
    const compW = PW;
    const colW3 = compW / 3;

    fillRect(doc, ML, y, PW, 7, [50, 50, 50]);
    sf(doc, 7.5, "bold", WHITE);
    doc.text("COMPARATIVA",            ML + colW3 / 2,     y + 4.5, { align: "center" });
    doc.text("Original",               ML + colW3 * 1.5,   y + 4.5, { align: "center" });
    doc.text("Rectificativa",          ML + colW3 * 2.5,   y + 4.5, { align: "center" });
    y += 7;

    const rows = [
      ["Base imponible", inv.subtotal, rectificativaInvoice.subtotal],
      ["IVA",           inv.iva_total, rectificativaInvoice.iva_total],
      ["TOTAL",         inv.total,     rectificativaInvoice.total],
    ];

    rows.forEach((row, i) => {
      const bg = i % 2 === 0 ? LGRAY : WHITE;
      fillRect(doc, ML, y, PW, 6.5, bg, [210, 215, 222]);
      const isTotalRow = i === rows.length - 1;
      sf(doc, 7.5, isTotalRow ? "bold" : "normal", DGRAY);
      doc.text(row[0],                          ML + 3,            y + 4.2);
      doc.text(`${(row[1] || 0).toFixed(2)} €`, ML + colW3 * 1.5, y + 4.2, { align: "center" });

      const diff = (row[2] || 0) - (row[1] || 0);
      if (diff !== 0) doc.setTextColor(...RED);
      doc.text(`${(row[2] || 0).toFixed(2)} €`, ML + colW3 * 2.5, y + 4.2, { align: "center" });
      doc.setTextColor(30, 30, 30);
      y += 6.5;
    });
  }

  // ── TOTALES ───────────────────────────────────────────────────────────────
  const TW = 76;
  const TX = ML + PW - TW;
  const ivaByRate = {};
  lines.forEach((m) => {
    const r = m.iva_percent || 21;
    if (!ivaByRate[r]) ivaByRate[r] = { base: 0, cuota: 0 };
    ivaByRate[r].base  += m.total || 0;
    ivaByRate[r].cuota += (m.total || 0) * (r / 100);
  });
  const numRates  = Object.keys(ivaByRate).length || 1;
  const totalsH   = numRates * 12 + 10;
  const vfH       = isAceptado ? 30 : 0;
  const footerH   = 10;
  const bottomY   = PH - ML - footerH - vfH - totalsH - 4;
  let ty = Math.max(y + 8, bottomY);

  Object.entries(ivaByRate).forEach(([rate, v]) => {
    fillRect(doc, TX, ty, TW, 6, LGRAY, [210, 215, 222]);
    sf(doc, 7.5, "normal", DGRAY);
    doc.text("Base imponible",          TX + 3,      ty + 4);
    doc.text(`${v.base.toFixed(2)} €`,  TX + TW - 3, ty + 4, { align: "right" });
    ty += 6;

    fillRect(doc, TX, ty, TW, 6, LGRAY, [210, 215, 222]);
    doc.text(`IVA ${rate}%`,            TX + 3,      ty + 4);
    doc.text(`${v.cuota.toFixed(2)} €`, TX + TW - 3, ty + 4, { align: "right" });
    ty += 6;
  });

  const totalColor = isOriginalRef ? [60, 60, 60] : BLUE;
  fillRect(doc, TX, ty, TW, 10, totalColor);
  sf(doc, 11, "bold", WHITE);
  doc.text("TOTAL",                            TX + 4,      ty + 7);
  doc.text(`${(inv.total || 0).toFixed(2)} €`, TX + TW - 3, ty + 7, { align: "right" });
  ty += 10;

  // ── VERI*FACTU (solo si aceptado y no es original de referencia) ──────────
  if (isAceptado && !isOriginalRef) {
    ty += 4;
    fillRect(doc, ML, ty, PW, 26, LGRAY, [200, 210, 225]);

    if (inv.qr_url) {
      try {
        const qrDataUrl = await fetchImageAsDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inv.qr_url)}`
        );
        doc.addImage(qrDataUrl, "PNG", ML + PW - 24, ty + 3, 20, 20);
      } catch (_) { /* QR no disponible */ }
    }

    sf(doc, 6.5, "bold", BLUE);
    doc.text("FACTURA REGISTRADA EN LA AGENCIA TRIBUTARIA (VERI*FACTU)", ML + 3, ty + 6);
    doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
    doc.line(ML + 3, ty + 7.5, ML + PW - 28, ty + 7.5);

    sf(doc, 7.5, "normal", DGRAY);
    let vfy = ty + 13;
    if (inv.verifactu_csv)        { doc.text(`CSV: ${inv.verifactu_csv}`, ML + 3, vfy); vfy += 5; }
    if (inv.verifactu_idregistro) { doc.text(`ID Registro AEAT: ${inv.verifactu_idregistro}`, ML + 3, vfy); vfy += 5; }
    if (inv.verifactu_timestamp)  { doc.text(`Recepción: ${moment(inv.verifactu_timestamp).format("DD/MM/YYYY HH:mm")}`, ML + 3, vfy); }
    ty += 26;
  }

  // ── PIE ───────────────────────────────────────────────────────────────────
  const footerY = PH - ML - 6;
  doc.setDrawColor(...GRAY); doc.setLineWidth(0.3);
  doc.line(ML, footerY - 4, ML + PW, footerY - 4);
  sf(doc, 6.5, "normal", GRAY);
  const footerLabel = isOriginalRef
    ? `Documento de referencia  ·  Rectificada por ${rectificativaNumber}  ·  ${emisor.nombre}${emisor.nif ? `  ·  NIF ${emisor.nif}` : ""}`
    : `Emitido el ${moment().format("DD/MM/YYYY")}  ·  ${emisor.nombre}${emisor.nif ? `  ·  NIF ${emisor.nif}` : ""}`;
  doc.text(footerLabel, ML + PW / 2, footerY, { align: "center" });
}

