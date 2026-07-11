/**
 * Validación de redirect_uri para prevenir open-redirect y la fuga del token
 * de sesión hacia dominios externos (hallazgo A-1 de la auditoría 2026-07-11).
 *
 * Un destino es seguro sólo si su origen está en la lista blanca configurada
 * (APP_ALLOWED_ORIGINS). Fuera de producción se admite además cualquier host
 * loopback, para no romper el flujo de desarrollo. Sin dependencias del stack
 * HTTP para poder testearse de forma aislada.
 */
import { isLoopbackHost } from "./security-config.js";

export const isSafeRedirectUri = (
  candidate,
  { allowedOrigins = [], isProduction = false } = {}
) => {
  const raw = String(candidate || "").trim();
  if (!raw) {
    return false;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  const origin = `${url.protocol}//${url.host}`;
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  if (!isProduction && isLoopbackHost(url.hostname)) {
    return true;
  }
  return false;
};

export const resolveSafeRedirectUri = (
  candidate,
  { allowedOrigins = [], isProduction = false, fallback } = {}
) => {
  if (isSafeRedirectUri(candidate, { allowedOrigins, isProduction })) {
    return String(candidate).trim();
  }
  const firstAllowed = allowedOrigins[0];
  if (isProduction && firstAllowed) {
    return `${firstAllowed.replace(/\/+$/, "")}/`;
  }
  return fallback;
};
