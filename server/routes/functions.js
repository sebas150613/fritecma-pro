import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth.js";
import { getFunctionDefinition } from "../lib/function-registry.js";
import { HttpError, notImplemented } from "../lib/http-error.js";
import { requireWritableLicense } from "../lib/license.js";
import { mergeDecryptedOrgSecretsForServer } from "../lib/tenant.js";
import { sendEmail } from "../services/email-service.js";
import {
  processVerifactu,
  processVerifactuRetry,
  retryVerifactuSubmissions,
  sendClockInNotifications,
  syncGasBottleStatus,
  testVerifactuSandbox,
  verifyInvoiceHashes,
} from "../services/verifactu-service.js";

const router = express.Router();
const functionHandlers = {
  processVerifactu: ({ payload, currentUser }) =>
    processVerifactu({ payload, currentUser }),
  processVerifactuRetry: ({ payload, currentUser }) =>
    processVerifactuRetry({ payload, currentUser }),
  retryVerifactuSubmissions: ({ payload, currentUser }) =>
    retryVerifactuSubmissions({ payload, currentUser }),
  sendClockInNotifications: ({ payload, currentUser }) =>
    sendClockInNotifications({ payload, currentUser, sendEmail }),
  syncGasBottleStatus: ({ payload, currentUser }) =>
    syncGasBottleStatus({ payload, currentUser }),
  testVerifactuSandbox: ({ payload, currentUser }) =>
    testVerifactuSandbox({ payload, currentUser }),
  verifyInvoiceHashes: ({ payload, currentUser }) =>
    verifyInvoiceHashes({ payload, currentUser, sendEmail }),
};

router.use(requireAuth);

router.post(
  "/:name",
  requireWritableLicense,
  asyncHandler(async (req, res) => {
    const currentUser = mergeDecryptedOrgSecretsForServer(
      req.currentUser,
      req.currentOrganizationSettings
    );
    const payload = req.body || {};

    const requireRoles = (...roles) => {
      if (!currentUser || !roles.includes(currentUser.role)) {
        throw new HttpError(403, "Forbidden");
      }
    };

    const definition = getFunctionDefinition(req.params.name);
    const handler = functionHandlers[req.params.name];

    if (!definition || !handler) {
      throw notImplemented(
        `Function "${req.params.name}" is not implemented in the REST backend scaffold yet.`
      );
    }

    requireRoles(...definition.roles);
    return res.json(await handler({ payload, currentUser }));
  })
);

export default router;
