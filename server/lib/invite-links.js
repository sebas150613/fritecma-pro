import { serverConfig } from "../config.js";

/** Public API base (same logic as /api/users/invite) for accept-invite links behind reverse proxy. */
export const buildServerBaseUrl = (req) => {
  const forwardedProto = req.headers["x-forwarded-proto"]?.toString();
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  if (host) {
    return `${forwardedProto || req.protocol || "http"}://${host}`;
  }

  return `http://${serverConfig.host}:${serverConfig.port}`;
};

/**
 * @returns {{ redirectUri: string, inviteUrl: string | null, loginUrl: string }}
 */
export const buildInvitationUrls = (req, invitationToken) => {
  const appOrigin = String(req.headers.origin || "").trim();
  const redirectUri = appOrigin
    ? `${appOrigin.replace(/\/+$/, "")}/`
    : `${buildServerBaseUrl(req)}/`;

  const base = buildServerBaseUrl(req);
  const inviteUrl = invitationToken
    ? `${base}/api/auth/accept-invite?token=${encodeURIComponent(
        invitationToken
      )}&redirect_uri=${encodeURIComponent(redirectUri)}`
    : null;
  const loginUrl = `${base}/api/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}`;

  return { redirectUri, inviteUrl, loginUrl };
};
