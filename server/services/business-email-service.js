import { createJsonEntityStore } from "../lib/json-store.js";
import { HttpError } from "../lib/http-error.js";
import {
  getOrganizationMembershipsForOrganization,
  getUserStore,
} from "../lib/auth.js";
import { normalizeOrganizationRole } from "../lib/roles.js";
import { sendEmail } from "./email-service.js";

const interventionStore = createJsonEntityStore("Intervention");
const clientStore = createJsonEntityStore("Client");
const materialRequestStore = createJsonEntityStore("MaterialRequest");
const userStore = getUserStore();

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const assertTenantRecord = (record, organizationId, label) => {
  if (!record) {
    throw new HttpError(404, `${label} not found`);
  }
  if (record.organization_id && record.organization_id !== organizationId) {
    throw new HttpError(404, `${label} not found`);
  }
};

const listApproverEmails = async (organizationId) => {
  const memberships = await getOrganizationMembershipsForOrganization(organizationId);
  const approverUserIds = new Set(
    memberships
      .filter(
        (m) =>
          m.status !== "disabled" &&
          ["admin", "oficina"].includes(normalizeOrganizationRole(m.role))
      )
      .map((m) => m.user_id)
  );

  if (approverUserIds.size === 0) {
    return [];
  }

  const users = await userStore.list();
  const emails = users
    .filter(
      (u) =>
        approverUserIds.has(u.id) &&
        u.is_active !== false &&
        u.is_hidden_owner !== true &&
        u.email
    )
    .map((u) => String(u.email).trim())
    .filter(Boolean);

  return [...new Set(emails)];
};

/**
 * Sends intervention summary to the client email on file (tenant-scoped).
 * Content is composed server-side; from/reply-to come from owner email settings.
 */
export const sendInterventionClientEmail = async ({
  organizationId,
  interventionId,
}) => {
  const interventions = await interventionStore.filter({
    filter: { id: String(interventionId || "") },
    limit: 1,
  });
  const intervention = interventions[0] || null;
  assertTenantRecord(intervention, organizationId, "Intervention");

  const clients = await clientStore.filter({
    filter: { id: String(intervention.client_id || "") },
    limit: 1,
  });
  const client = clients[0] || null;
  assertTenantRecord(client, organizationId, "Client");

  const clientEmail = String(client.email || "").trim();
  if (!clientEmail) {
    throw new HttpError(422, "Client has no email on file");
  }

  const clientName = intervention.client_name || client.name || "Cliente";
  const number = intervention.number || intervention.id;
  const total = Number(intervention.total || 0);

  const subject = `Parte de Trabajo ${number} - FRIGEST`;
  const body = [
    `Estimado/a ${clientName},`,
    "",
    `Le enviamos el parte de trabajo ${number}.`,
    "",
    `Total: ${total.toFixed(2)} €`,
    "",
    "Gracias por confiar en FRIGEST.",
    "",
    "Un saludo.",
  ].join("\n");

  const result = await sendEmail({
    to: clientEmail,
    subject,
    body,
  });

  return {
    ...result,
    recipient: clientEmail,
    intervention_id: intervention.id,
  };
};

/**
 * Notifies org approvers (admin/oficina) about a new material request.
 * Caller must be the submitting technician or an office-capable role (enforced in route).
 */
export const notifyMaterialRequestApprovers = async ({
  organizationId,
  requestId,
}) => {
  const items = await materialRequestStore.filter({
    filter: { id: String(requestId || "") },
    limit: 1,
  });
  const request = items[0] || null;
  assertTenantRecord(request, organizationId, "Material request");

  const approverEmails = await listApproverEmails(organizationId);
  if (approverEmails.length === 0) {
    return {
      success: true,
      skipped: true,
      reason: "no_internal_approvers",
      material_request_id: request.id,
    };
  }

  const typeLabels = {
    material: "Material",
    herramienta: "Herramienta",
    consumible: "Consumible",
    otro: "Otro",
  };
  const urgencyLabels = {
    normal: "Normal",
    urgente: "Urgente",
    muy_urgente: "Muy urgente",
  };

  const techName = request.technician_name || request.technician_email || "Técnico";
  const typeLabel = typeLabels[request.request_type] || request.request_type || "Solicitud";
  const urgencyLabel = urgencyLabels[request.urgency] || request.urgency || "Normal";

  const subject = `Nueva solicitud de ${typeLabel} — ${techName}`;
  const body = [
    `${techName} ha registrado una nueva solicitud en la organización.`,
    "",
    `Tipo: ${typeLabel}`,
    `Descripción: ${request.description || "-"}`,
    `Cantidad: ${request.quantity ?? "-"} ${request.unit || "ud"}`,
    `Urgencia: ${urgencyLabel}`,
    `Notas: ${request.notes || "-"}`,
    "",
    "Revísala en la aplicación.",
  ].join("\n");

  const result = await sendEmail({
    to: approverEmails,
    subject,
    body,
  });

  return {
    ...result,
    notified_count: approverEmails.length,
    material_request_id: request.id,
  };
};
