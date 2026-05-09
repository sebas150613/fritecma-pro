import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { resolveCurrentUser } from "../lib/auth.js";
import { serverConfig } from "../config.js";

const router = express.Router();

router.get(
  "/prod/public-settings/by-id/:appId",
  asyncHandler(async (req, res) => {
    const requestedAppId = req.params.appId;

    if (requestedAppId !== serverConfig.appId) {
      return res.status(404).json({
        message: "App not found",
      });
    }

    try {
      const user = await resolveCurrentUser(req);

      if (!user || user.is_active === false) {
        return res.status(403).json({
          message: "User not registered for this app",
          extra_data: {
            reason: "user_not_registered",
          },
        });
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.status(403).json({
          message: "Authentication required",
          extra_data: {
            reason: "auth_required",
          },
        });
      }

      throw error;
    }

    res.json({
      id: requestedAppId,
      public_settings: {
        auth_required: !serverConfig.allowAuthBypass,
        backend_provider: "rest",
      },
    });
  })
);

export default router;
