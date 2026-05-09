import { HttpError } from "./http-error.js";

export const LICENSE_READ_ONLY_MESSAGE =
  "Licencia caducada. Contacte con FRIGEST para renovación.";

export const BLOCKED_LICENSE_STATUSES = new Set(["paused", "canceled", "past_due"]);

export const isLicenseRestrictedStatus = (status) =>
  BLOCKED_LICENSE_STATUSES.has(String(status || "").toLowerCase());

export const assertLicenseAllowsWrite = (req) => {
  if (req.currentUser?.is_hidden_owner === true) {
    return;
  }

  if (req.currentUser?.license_read_only === true) {
    throw new HttpError(403, LICENSE_READ_ONLY_MESSAGE);
  }
};

export const requireWritableLicense = (req, _res, next) => {
  try {
    assertLicenseAllowsWrite(req);
    next();
  } catch (error) {
    next(error);
  }
};
