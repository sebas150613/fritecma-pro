import { HttpError } from "./http-error.js";
import { GLOBAL_ROLE_SUPERADMIN, resolveAppRole } from "./roles.js";

const PURCHASE_ORDER_MEMBERSHIP_ROLES = new Set(["admin", "oficina", "encargado"]);

/**
 * Operadores de pedidos a proveedor: solo membresía admin / oficina / encargado.
 * Bloquea owner oculto y rol global superadmin (plataforma).
 */
export function assertPurchaseOrderAccess(req) {
  if (!req.currentOrganization?.id) {
    throw new HttpError(403, "Forbidden");
  }
  if (req.currentUser?.is_hidden_owner === true) {
    throw new HttpError(403, "Forbidden");
  }
  const appRole = resolveAppRole(req.currentUser, req.currentOrganizationMembership);
  if (appRole === GLOBAL_ROLE_SUPERADMIN) {
    throw new HttpError(403, "Forbidden");
  }
  const raw = String(req.currentOrganizationMembership?.role || "").toLowerCase();
  if (!PURCHASE_ORDER_MEMBERSHIP_ROLES.has(raw)) {
    throw new HttpError(403, "Forbidden");
  }
}
