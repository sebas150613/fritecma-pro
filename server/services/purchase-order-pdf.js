import PDFDocument from "pdfkit";

/**
 * PDF del pedido representando a la empresa suscriptora (no la plataforma).
 */
export async function buildPurchaseOrderPdfBuffer(options) {
  const {
    companyLegalName,
    companyNif,
    companyAddress,
    companyPhone,
    logoUrl,
    pedidosContactEmail,
    deliveryContact,
    deliveryPhone,
    orderNumber,
    createdAtIso,
    supplierName,
    supplierEmail,
    requestedByName,
    requestedByEmail,
    deliveryTitle,
    deliveryDetail,
    lines,
    notes,
  } = options;

  let logoBuffer = null;
  if (logoUrl && /^https?:\/\//i.test(String(logoUrl))) {
    try {
      const res = await fetch(String(logoUrl));
      if (res.ok) {
        logoBuffer = Buffer.from(await res.arrayBuffer());
      }
    } catch {
      logoBuffer = null;
    }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, doc.page.margins.left, doc.y, { height: 42 });
        doc.moveDown(2);
      } catch {
        /* omit logo */
      }
    }

    doc.fontSize(16).fillColor("#111").text("Pedido a proveedor");
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor("#333");
    if (companyLegalName) {
      doc.text(companyLegalName);
    }
    if (companyNif) {
      doc.text(`CIF/NIF: ${companyNif}`);
    }
    if (companyAddress) {
      doc.text(companyAddress);
    }
    if (companyPhone) {
      doc.text(`Tel.: ${companyPhone}`);
    }
    if (pedidosContactEmail) {
      doc.text(`Email pedidos: ${pedidosContactEmail}`);
    }
    doc.moveDown();
    doc.fontSize(12).fillColor("#111").text(`Nº pedido: ${orderNumber}`);
    doc.fontSize(10).fillColor("#444").text(`Fecha: ${formatPdfDate(createdAtIso)}`);
    doc.moveDown();

    doc.fontSize(11).fillColor("#111").text("Proveedor", { underline: true });
    doc.fontSize(10).fillColor("#333").text(supplierName || "—");
    if (supplierEmail) {
      doc.text(`Email: ${supplierEmail}`);
    }
    doc.moveDown();

    doc.fontSize(11).fillColor("#111").text("Solicitado por", { underline: true });
    doc.fontSize(10).fillColor("#333").text(`${requestedByName || ""}`.trim() || "—");
    if (requestedByEmail) {
      doc.text(requestedByEmail);
    }
    doc.moveDown();

    doc.fontSize(11).fillColor("#111").text("Entregar en", { underline: true });
    doc.fontSize(10).fillColor("#333").text(deliveryTitle || "—");
    if (deliveryDetail) {
      doc.text(deliveryDetail);
    }
    if (deliveryContact || deliveryPhone) {
      doc.text(
        [deliveryContact ? `Contacto: ${deliveryContact}` : "", deliveryPhone ? `Tel.: ${deliveryPhone}` : ""]
          .filter(Boolean)
          .join(" · ")
      );
    }
    doc.moveDown();

    doc.fontSize(11).fillColor("#111").text("Materiales", { underline: true });
    doc.moveDown(0.4);

    doc.fontSize(10).fillColor("#222");
    for (const line of lines || []) {
      const code = line.material_code || "—";
      const name = line.material_name || "—";
      const qty = line.quantity != null ? String(line.quantity) : "";
      const unit = line.unit || "ud";
      const obs = line.observation ? ` · ${line.observation}` : "";
      doc.text(`${code} — ${name}`);
      doc
        .fontSize(9)
        .fillColor("#444")
        .text(`Cantidad: ${qty} ${unit}${obs}`);
      doc.fontSize(10).fillColor("#222");
      doc.moveDown(0.5);
      if (doc.y > doc.page.height - doc.page.margins.bottom - 100) {
        doc.addPage();
      }
    }

    doc.moveDown();
    if (notes) {
      doc.fontSize(11).fillColor("#111").text("Observaciones", { underline: true });
      doc.fontSize(10).fillColor("#333").text(notes);
      doc.moveDown();
    }

    doc.fontSize(8).fillColor("#888").text(
      "Pedido generado desde FRIGEST.",
      doc.page.margins.left,
      doc.page.height - 56,
      {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      }
    );

    doc.end();
  });
}

function formatPdfDate(iso) {
  if (!iso) {
    return new Date().toLocaleString("es-ES");
  }
  try {
    return new Date(iso).toLocaleString("es-ES");
  } catch {
    return String(iso);
  }
}
