import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import {
  getUserStore,
  invalidateSessionToken,
  requireAuth,
} from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { getOrganizationMembershipStore } from "../lib/tenant.js";

const router = express.Router();
const userStore = getUserStore();
const membershipStore = getOrganizationMembershipStore();

router.use(requireAuth);

router.delete(
  "/me",
  asyncHandler(async (req, res) => {
    const currentUser = req.currentUser;

    if (!currentUser?.id) {
      throw new HttpError(401, "Authentication required");
    }

    if (currentUser.is_hidden_owner === true) {
      throw new HttpError(403, "La cuenta owner no se puede eliminar desde este flujo.");
    }

    const memberships = await membershipStore.filter({
      filter: { user_id: currentUser.id },
    });

    for (const membership of memberships) {
      await membershipStore.delete(membership.id);
    }

    await userStore.delete(currentUser.id);

    if (req.authSessionToken) {
      await invalidateSessionToken(req.authSessionToken);
    }

    res.status(204).send();
  })
);

export default router;
