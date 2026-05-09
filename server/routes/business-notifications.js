import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { createJsonEntityStore } from "../lib/json-store.js";
import { canOperateOffice } from "../lib/roles.js";
import {
  notifyMaterialRequestApprovers,
  sendInterventionClientEmail,
} from "../services/business-email-service.js";

const router = express.Router();
const materialRequestStore = createJsonEntityStore("MaterialRequest");

router.use(requireAuth);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

router.post(
  "/interventions/:interventionId/send-client-email",
  asyncHandler(async (req, res) => {
    if (!canOperateOffice(req.currentUser?.role)) {
      throw new HttpError(403, "Forbidden");
    }

    const result = await sendInterventionClientEmail({
      organizationId: req.currentOrganization.id,
      interventionId: req.params.interventionId,
    });

    res.json(result);
  })
);

router.post(
  "/material-requests/:requestId/notify-approvers",
  asyncHandler(async (req, res) => {
    const actorEmail = normalizeEmail(req.currentUser?.email);
    const actorRole = req.currentUser?.role;

    const items = await materialRequestStore.filter({
      filter: { id: String(req.params.requestId || "") },
      limit: 1,
    });
    const request = items[0] || null;

    if (!request || request.organization_id !== req.currentOrganization.id) {
      throw new HttpError(404, "Material request not found");
    }

    const submitterEmail = normalizeEmail(request.technician_email);
    const isSubmitter = submitterEmail && submitterEmail === actorEmail;
    const isOffice = canOperateOffice(actorRole);

    if (!isSubmitter && !isOffice) {
      throw new HttpError(403, "Forbidden");
    }

    const result = await notifyMaterialRequestApprovers({
      organizationId: req.currentOrganization.id,
      requestId: req.params.requestId,
    });

    res.json(result);
  })
);

export default router;
