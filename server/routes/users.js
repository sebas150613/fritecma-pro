import express from "express";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/async-handler.js";
import {
  canAccessHiddenUsers,
  getUserStore,
  requireAuth,
  stripSensitiveUserFields,
  syncMembershipSnapshotForUser,
} from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { getOrganizationMembershipStore } from "../lib/tenant.js";
import { normalizeOrganizationRole } from "../lib/roles.js";
import { assertSeatAvailableForOrganization } from "../services/billing-service.js";
import { sendInvitationEmail } from "../services/account-security-service.js";
import { serverConfig } from "../config.js";
import { requireWritableLicense } from "../lib/license.js";

const router = express.Router();
const userStore = getUserStore();
const membershipStore = getOrganizationMembershipStore();

const buildServerBaseUrl = (req) => {
  const forwardedProto = req.headers["x-forwarded-proto"]?.toString();
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  if (host) {
    return `${forwardedProto || req.protocol || "http"}://${host}`;
  }

  return `http://${serverConfig.host}:${serverConfig.port}`;
};

router.use(requireAuth);

router.post(
  "/invite",
  requireWritableLicense,
  asyncHandler(async (req, res) => {
    if (!["admin", "superadmin"].includes(req.currentUser?.role)) {
      throw new HttpError(403, "Forbidden");
    }

    const { email, role } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "email is required" });
    }

    const desiredRole = normalizeOrganizationRole(role);

    if (desiredRole === "superadmin" && !canAccessHiddenUsers(req.currentUser)) {
      throw new HttpError(403, "Forbidden");
    }
    const existingUsers = await userStore.filter({
      filter: { email: normalizedEmail },
      limit: 1,
    });
    const existingUser = existingUsers[0] || null;
    let userRecord = existingUser;
    const nextInvitationToken = randomUUID();

    if (existingUser) {
      const otherMemberships = await membershipStore.filter({
        filter: { user_id: existingUser.id },
      });
      const belongsElsewhere = otherMemberships.some(
        (membership) => membership.organization_id !== req.currentOrganization.id
      );
      if (belongsElsewhere) {
        throw new HttpError(409, "Este usuario ya pertenece a otra empresa.");
      }
    }

    if (existingUser) {
      const patch = {
        is_active: true,
        invited_by: req.currentUser?.email || null,
      };

      if (!existingUser.password_hash) {
        patch.invitation_token = nextInvitationToken;
      }

      userRecord = await userStore.update(existingUser.id, patch);
    } else {
      const createPayload = {
        email: normalizedEmail,
        role: desiredRole,
        full_name: normalizedEmail || "Invitado",
        is_active: true,
        invitation_token: nextInvitationToken,
        invited_by: req.currentUser?.email || null,
      };

      if (!canAccessHiddenUsers(req.currentUser)) {
        delete createPayload.is_hidden_owner;
        delete createPayload.owner_panel_enabled;
      }

      userRecord = await userStore.create(createPayload);
    }

    const memberships = await membershipStore.filter({
      filter: {
        organization_id: req.currentOrganization.id,
        user_id: userRecord.id,
      },
      limit: 1,
    });
    const existingMembership = memberships[0] || null;
    const willConsumeSeat =
      !existingMembership || existingMembership.status === "disabled";

    if (willConsumeSeat) {
      await assertSeatAvailableForOrganization(req.currentOrganization.id, 1);
    }

    const membershipPayload = {
      organization_id: req.currentOrganization.id,
      organization_name: req.currentOrganization.name,
      user_id: userRecord.id,
      user_email: userRecord.email || normalizedEmail,
      user_name: userRecord.full_name || userRecord.email || "Invitado",
      role: normalizeOrganizationRole(desiredRole),
      status: userRecord.is_active === false ? "disabled" : "active",
    };

    if (existingMembership) {
      await membershipStore.update(existingMembership.id, membershipPayload);
    } else {
      await membershipStore.create(membershipPayload);
    }

    await syncMembershipSnapshotForUser(userRecord, {
      includeRole: false,
      includeStatus: false,
    });

    const appOrigin = String(req.headers.origin || "").trim();
    const redirectUri = appOrigin
      ? `${appOrigin.replace(/\/+$/, "")}/`
      : `${buildServerBaseUrl(req)}/`;
    const inviteUrl = userRecord.invitation_token
      ? `${buildServerBaseUrl(
          req
        )}/api/auth/accept-invite?token=${encodeURIComponent(
          userRecord.invitation_token
        )}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}`
      : null;
    const loginUrl = `${buildServerBaseUrl(
      req
    )}/api/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}`;
    const emailDelivery = await sendInvitationEmail({
      to: normalizedEmail,
      organizationName: req.currentOrganization.name,
      invitedBy: req.currentUser?.full_name || req.currentUser?.email || "",
      role: desiredRole,
      activationUrl: inviteUrl,
      loginUrl,
      requiresActivation: Boolean(inviteUrl),
    });

    res
      .status(existingUser ? 200 : 201)
      .json({
        ...stripSensitiveUserFields(userRecord),
        role: desiredRole,
        invite_url: inviteUrl,
        email_delivery: emailDelivery,
      });
  })
);

export default router;
