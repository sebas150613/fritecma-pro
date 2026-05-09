import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { serverConfig } from "../config.js";
import { createJsonEntityStore } from "../lib/json-store.js";
import { buildTenantFilter } from "../lib/tenant.js";
import { assertPurchaseOrderAccess } from "../lib/purchase-orders-access.js";
import { assertLicenseAllowsWrite } from "../lib/license.js";
import {
  assertPedidosSmtpReadyForSend,
  sendCompanyPurchaseOrderMail,
} from "../services/company-purchase-email-service.js";
import { buildPurchaseOrderPdfBuffer } from "../services/purchase-order-pdf.js";

const router = express.Router();
const purchaseOrderStore = createJsonEntityStore("PurchaseOrder");
const supplierStore = createJsonEntityStore("Supplier");
const materialStore = createJsonEntityStore("Material");
const projectStore = createJsonEntityStore("Project");

router.use(requireAuth);

const ALLOWED_PATCH_STATUSES = new Set([
  "pending_delivery",
  "delivered",
  "delivered_with_issues",
  "cancelled",
]);

function supplierOrderEmail(supplier) {
  const order = String(supplier?.order_email || "").trim();
  if (order) {
    return order;
  }
  return String(supplier?.email || "").trim();
}

function parseSubmitMethod(raw) {
  const s = String(raw ?? "email").trim().toLowerCase();
  return s === "commercial" ? "commercial" : "email";
}

export function generatePurchaseOrderNumber() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `PED-${yy}${mm}${dd}-${suffix}`;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    assertPurchaseOrderAccess(req);
    const filter = buildTenantFilter(req.currentOrganization.id, {});
    const items = await purchaseOrderStore.filter({
      filter,
      sort: "-created_date",
      limit: 500,
    });
    res.json({ orders: items });
  })
);

router.post(
  "/test-smtp",
  asyncHandler(async (req, res) => {
    assertPurchaseOrderAccess(req);
    assertLicenseAllowsWrite(req);
    const settings = req.currentOrganizationSettings || {};
    assertPedidosSmtpReadyForSend(settings);
    const to = String(req.body?.to || req.currentUser?.email || "").trim();
    if (!to) {
      throw new HttpError(400, "Indica un email de destino o configura email en tu usuario.");
    }
    await sendCompanyPurchaseOrderMail(settings, {
      to,
      subject: "Prueba SMTP pedidos — FRIGEST",
      body: [
        "Este es un correo de prueba del SMTP de pedidos de tu empresa.",
        "No usa el SMTP global de plataforma FRIGEST.",
        `Enviado a las ${new Date().toISOString()}`,
      ].join("\n"),
    });
    res.json({
      ok: true,
      message:
        "Correo de prueba de pedidos enviado desde FRIGEST usando el SMTP de esta empresa.",
    });
  })
);

router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    assertPurchaseOrderAccess(req);
    const id = String(req.params.id || "").trim();
    const items = await purchaseOrderStore.filter({
      filter: buildTenantFilter(req.currentOrganization.id, { id }),
      limit: 1,
    });
    const order = items[0];
    if (!order?.pdf_filename) {
      throw new HttpError(404, "PDF no disponible para este pedido.");
    }
    const abs = path.join(serverConfig.privateUploadsDir, order.pdf_filename);
    try {
      const buf = await fs.readFile(abs);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Pedido-${order.number || id}.pdf"`
      );
      res.send(buf);
    } catch {
      throw new HttpError(404, "Archivo PDF no encontrado.");
    }
  })
);

router.post(
  "/send",
  asyncHandler(async (req, res) => {
    assertPurchaseOrderAccess(req);
    assertLicenseAllowsWrite(req);

    const orgId = req.currentOrganization.id;
    const settings = req.currentOrganizationSettings || {};

    const submitMethod = parseSubmitMethod(req.body?.submit_method);

    const pedidosFrom = String(settings.pedidos_email_from || "").trim();
    const pedidosReply =
      String(settings.pedidos_reply_to || "").trim() || pedidosFrom;

    const supplierId = String(req.body?.supplier_id || "").trim();
    if (!supplierId) {
      throw new HttpError(400, "supplier_id es obligatorio.");
    }

    const suppliers = await supplierStore.filter({
      filter: buildTenantFilter(orgId, { id: supplierId }),
      limit: 1,
    });
    const supplier = suppliers[0];
    if (!supplier) {
      throw new HttpError(404, "Proveedor no encontrado.");
    }

    const supplierContactEmail = supplierOrderEmail(supplier);

    if (submitMethod === "email") {
      assertPedidosSmtpReadyForSend(settings);
      if (!supplierContactEmail) {
        throw new HttpError(
          422,
          "El proveedor no tiene email de pedidos ni email principal. Complétalo antes de enviar por correo o elige «Pedido realizado al comercial»."
        );
      }
    }

    const deliveryType = String(req.body?.delivery_type || "").trim();
    if (!["company_address", "project", "pickup_store"].includes(deliveryType)) {
      throw new HttpError(422, "delivery_type no válido.");
    }

    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (rawLines.length === 0) {
      throw new HttpError(422, "Añade al menos una línea de material.");
    }

    const linesPayload = [];
    for (const row of rawLines) {
      const materialId = String(row?.material_id || "").trim();
      const qty = Number(row?.quantity);
      if (!materialId || !Number.isFinite(qty) || qty <= 0) {
        throw new HttpError(422, "Cada línea necesita material_id y cantidad > 0.");
      }
      const mats = await materialStore.filter({
        filter: buildTenantFilter(orgId, { id: materialId }),
        limit: 1,
      });
      const material = mats[0];
      if (!material) {
        throw new HttpError(422, `Material ${materialId} no válido para esta empresa.`);
      }
      linesPayload.push({
        material_id: material.id,
        material_code: material.code || "",
        material_name: material.name || "",
        unit: material.unit || "ud",
        quantity: qty,
        supplier_id: supplier.id,
        supplier_name: supplier.name || "",
        observation: row?.observation ? String(row.observation).slice(0, 500) : "",
      });
    }

    let projectId = "";
    let projectName = "";
    let deliveryLabel = "";
    let deliveryAddress = "";

    if (deliveryType === "company_address") {
      deliveryLabel = "Dirección de empresa / almacén";
      deliveryAddress = [
        settings.pedidos_entrega_direccion,
        settings.pedidos_entrega_contacto,
        settings.pedidos_entrega_telefono,
        settings.pedidos_entrega_observaciones,
      ]
        .filter(Boolean)
        .join("\n");
    } else if (deliveryType === "project") {
      projectId = String(req.body?.project_id || "").trim();
      if (!projectId) {
        throw new HttpError(422, "Selecciona una obra para este tipo de entrega.");
      }
      const projects = await projectStore.filter({
        filter: buildTenantFilter(orgId, { id: projectId }),
        limit: 1,
      });
      const project = projects[0];
      if (!project) {
        throw new HttpError(404, "Obra no encontrada.");
      }
      projectName = project.name || "";
      deliveryLabel = `Obra: ${projectName}`;
      const addr =
        String(project.address || "").trim() ||
        String(req.body?.delivery_address_manual || "").trim();
      if (!addr) {
        throw new HttpError(
          422,
          "La obra no tiene dirección. Indica una dirección de entrega manualmente."
        );
      }
      deliveryAddress = addr;
    } else {
      deliveryLabel = "Recoger en tienda";
      deliveryAddress = "Recoger en tienda del proveedor (sin envío a obra).";
    }

    const notes = req.body?.notes != null ? String(req.body.notes).slice(0, 4000) : "";

    const number = generatePurchaseOrderNumber();
    const linesJson = JSON.stringify(linesPayload);
    const companyName =
      String(settings.verifactu_nombre || req.currentOrganization?.name || "").trim() ||
      "Empresa";

    const pdfBuffer = await buildPurchaseOrderPdfBuffer({
      companyLegalName: settings.verifactu_nombre || companyName,
      companyNif: settings.verifactu_nif || "",
      companyAddress: settings.emisor_direccion || "",
      companyPhone: settings.emisor_telefono || "",
      logoUrl: settings.emisor_logo_url || "",
      pedidosContactEmail: pedidosReply || pedidosFrom,
      deliveryContact: settings.pedidos_entrega_contacto || "",
      deliveryPhone: settings.pedidos_entrega_telefono || "",
      orderNumber: number,
      createdAtIso: new Date().toISOString(),
      supplierName: supplier.name || "",
      supplierEmail: supplierContactEmail,
      submitMethod,
      requestedByName:
        req.currentUser?.full_name || req.currentUser?.email || "Usuario",
      requestedByEmail: req.currentUser?.email || "",
      deliveryTitle: deliveryLabel,
      deliveryDetail: deliveryAddress,
      lines: linesPayload,
      notes,
    });

    const safeBase = number.replace(/[^a-zA-Z0-9.-]/g, "_");
    const relPath = path.join("purchase-orders", orgId, `${safeBase}.pdf`);
    const absPath = path.join(serverConfig.privateUploadsDir, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, pdfBuffer);

    const pdfGeneratedAt = new Date().toISOString();

    if (submitMethod === "commercial") {
      const created = await purchaseOrderStore.create({
        organization_id: orgId,
        number,
        supplier_id: supplier.id,
        supplier_name: supplier.name || "",
        supplier_email: supplierContactEmail || "",
        submit_method: "commercial",
        status: "pending_delivery",
        lines_json: linesJson,
        delivery_type: deliveryType,
        delivery_label: deliveryLabel,
        delivery_address: deliveryAddress,
        project_id: projectId || undefined,
        project_name: projectName || undefined,
        requested_by_user_id: req.currentUser.id,
        requested_by_name: req.currentUser?.full_name || req.currentUser?.email || "",
        requested_by_email: req.currentUser?.email || "",
        sent_at: "",
        email_message_id: "",
        email_status: "not_sent_commercial",
        issue_notes: "",
        notes,
        pdf_filename: relPath,
        pdf_generated_at: pdfGeneratedAt,
      });

      res.status(201).json({ order: created, email: null });
      return;
    }

    const subject = `Pedido ${number} - ${companyName}`;
    const bodyText = [
      `Este pedido lo ha tramitado ${companyName} usando FRIGEST.`,
      "",
      `Número de pedido: ${number}`,
      `Empresa: ${companyName}`,
      `Solicitado por: ${req.currentUser?.full_name || ""} (${req.currentUser?.email || ""})`,
      "",
      `Entrega: ${deliveryLabel}`,
      deliveryAddress ? `Detalle entrega:\n${deliveryAddress}` : "",
      "",
      `Contacto entregas: ${settings.pedidos_entrega_contacto || "—"}`,
      `Teléfono entregas: ${settings.pedidos_entrega_telefono || "—"}`,
      `Email pedidos empresa: ${pedidosReply || pedidosFrom}`,
      "",
      "Va adjunto el PDF con el detalle de materiales y cantidades.",
      "",
      "—",
      "Pedido generado desde FRIGEST",
    ]
      .filter(Boolean)
      .join("\n");

    let emailResult = null;
    let emailStatus = "skipped";
    let sendErrorMessage = "";

    try {
      emailResult = await sendCompanyPurchaseOrderMail(settings, {
        to: supplierContactEmail,
        subject,
        body: bodyText,
        attachments: [
          {
            filename: `Pedido-${number}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
      emailStatus =
        emailResult?.provider === "company_smtp_stub"
          ? "sent_company_stub"
          : emailResult?.provider === "company_smtp"
            ? "sent_company"
            : "sent";
    } catch (err) {
      emailStatus = "error";
      sendErrorMessage = err?.message || String(err);
    }

    const finalStatus =
      emailStatus === "error" || sendErrorMessage ? "send_error" : "pending_delivery";

    const created = await purchaseOrderStore.create({
      organization_id: orgId,
      number,
      supplier_id: supplier.id,
      supplier_name: supplier.name || "",
      supplier_email: supplierContactEmail,
      submit_method: "email",
      status: finalStatus,
      lines_json: linesJson,
      delivery_type: deliveryType,
      delivery_label: deliveryLabel,
      delivery_address: deliveryAddress,
      project_id: projectId || undefined,
      project_name: projectName || undefined,
      requested_by_user_id: req.currentUser.id,
      requested_by_name: req.currentUser?.full_name || req.currentUser?.email || "",
      requested_by_email: req.currentUser?.email || "",
      sent_at: finalStatus === "pending_delivery" ? new Date().toISOString() : "",
      email_message_id: emailResult?.message_id || "",
      email_status: emailStatus + (sendErrorMessage ? `: ${sendErrorMessage}` : ""),
      issue_notes: "",
      notes,
      pdf_filename: relPath,
      pdf_generated_at: pdfGeneratedAt,
    });

    if (finalStatus === "send_error") {
      res.status(502).json({
        message: sendErrorMessage || "No se pudo enviar el correo al proveedor.",
        order: created,
      });
      return;
    }

    res.status(201).json({ order: created, email: emailResult });
  })
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    assertPurchaseOrderAccess(req);
    assertLicenseAllowsWrite(req);

    const id = String(req.params.id || "").trim();
    const items = await purchaseOrderStore.filter({
      filter: buildTenantFilter(req.currentOrganization.id, { id }),
      limit: 1,
    });
    const existing = items[0];
    if (!existing) {
      throw new HttpError(404, "Pedido no encontrado.");
    }

    const nextStatus = String(req.body?.status || "").trim();
    if (!ALLOWED_PATCH_STATUSES.has(nextStatus)) {
      throw new HttpError(422, "Estado no permitido.");
    }

    if (nextStatus === "delivered_with_issues") {
      const issueNotes = String(req.body?.issue_notes || "").trim();
      if (!issueNotes) {
        throw new HttpError(
          422,
          "Las incidencias requieren observaciones (issue_notes)."
        );
      }
      const updated = await purchaseOrderStore.update(existing.id, {
        status: nextStatus,
        issue_notes: issueNotes.slice(0, 4000),
      });
      res.json({ order: updated });
      return;
    }

    const patch = { status: nextStatus };
    if (nextStatus !== "delivered_with_issues") {
      patch.issue_notes = "";
    }

    const updated = await purchaseOrderStore.update(existing.id, patch);
    res.json({ order: updated });
  })
);

export default router;
