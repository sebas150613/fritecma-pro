import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { isHiddenOwner, requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { sendEmail } from "../services/email-service.js";
import {
  getOwnerEmailSettings,
  updateOwnerEmailSettings,
} from "../services/platform-settings-service.js";

const router = express.Router();

router.use(requireAuth);

const requireOwner = (req) => {
  if (!isHiddenOwner(req.currentUser)) {
    throw new HttpError(403, "Forbidden");
  }
};

router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    requireOwner(req);
    res.json(await getOwnerEmailSettings());
  })
);

router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    requireOwner(req);
    res.json(await updateOwnerEmailSettings(req.body || {}));
  })
);

router.post(
  "/test",
  asyncHandler(async (req, res) => {
    requireOwner(req);

    const to = String(req.body?.to || req.currentUser?.email || "").trim();
    const result = await sendEmail({
      to,
      subject: "FRIGEST SMTP test",
      body: [
        "This is a FRIGEST platform SMTP test.",
        `Sent at: ${new Date().toISOString()}`,
      ].join("\n"),
      html: `
        <p>This is a <strong>FRIGEST</strong> platform SMTP test.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `,
    });

    res.json(result);
  })
);

export default router;
