import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import moment from "moment";

// Borradores locales de formularios: si la app se cierra o se queda sin red
// antes de guardar, el trabajo del técnico se puede recuperar al volver.
// Se guardan en localStorage por usuario y por pantalla (clave `storageKey`).
const PREFIX = "frigest:draft:";
const DRAFT_VERSION = 1;
const SAVE_DEBOUNCE_MS = 1200;
const MAX_DRAFT_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 días

// Un fallo de fetch por falta de conexión llega como TypeError
// ("Failed to fetch" en Chrome, "Load failed" en Safari, "NetworkError..." en Firefox).
export function isNetworkError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error) return false;
  return (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(String(error.message || ""))
  );
}

function readStoredDraft(fullKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(fullKey) || "null");
    if (!stored || stored.v !== DRAFT_VERSION || !stored.data) return null;
    return stored;
  } catch {
    return null;
  }
}

/**
 * Autoguarda un snapshot serializable del formulario y ofrece recuperarlo al volver.
 *
 * @param {object} options
 * @param {string} options.storageKey  Clave única de la pantalla (incluye usuario/contexto).
 * @param {boolean} options.ready      true cuando la carga inicial (y prefills) ha terminado.
 *                                     Hasta entonces no se guarda ni se ofrece restaurar.
 * @param {object} options.data        Estado del formulario a persistir (serializable).
 * @param {(data: object) => void} options.onRestore  Repone el estado guardado en la página.
 * @param {string} [options.label]     Nombre visible del formulario para el aviso.
 * @returns {{ clearDraft: () => void }} Llamar a clearDraft tras un guardado con éxito.
 */
export function useFormDraft({ storageKey, ready, data, onRestore, label = "este formulario" }) {
  const fullKey = PREFIX + storageKey;
  const offeredRef = useRef(false);
  const baselineRef = useRef(null);
  const timerRef = useRef(null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(fullKey);
    } catch {
      // localStorage no disponible — sin borradores, la app sigue funcionando
    }
  }, [fullKey]);

  // Al terminar la carga inicial: fijar el estado "prístino" como referencia y,
  // si hay un borrador previo con contenido distinto, ofrecer recuperarlo.
  useEffect(() => {
    if (!ready || offeredRef.current) return;
    offeredRef.current = true;
    baselineRef.current = JSON.stringify(data);

    const stored = readStoredDraft(fullKey);
    if (!stored) return;
    const age = Date.now() - (stored.savedAt || 0);
    if (age > MAX_DRAFT_AGE_MS || JSON.stringify(stored.data) === baselineRef.current) {
      clearDraft();
      return;
    }

    const when = stored.savedAt ? moment(stored.savedAt).format("DD/MM HH:mm") : "";
    toast(`Hay un borrador sin guardar de ${label}${when ? ` (${when})` : ""}. ¿Quieres recuperarlo?`, {
      duration: 30000,
      action: {
        label: "Recuperar",
        onClick: () => onRestoreRef.current?.(stored.data),
      },
      cancel: {
        label: "Descartar",
        onClick: () => clearDraft(),
      },
    });
  }, [ready]); // solo debe dispararse al completarse la carga inicial

  // Autoguardado con debounce mientras el formulario difiera del estado inicial.
  useEffect(() => {
    if (!ready || baselineRef.current === null) return undefined;
    const serialized = JSON.stringify(data);
    if (serialized === baselineRef.current) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          fullKey,
          JSON.stringify({ v: DRAFT_VERSION, savedAt: Date.now(), data })
        );
      } catch {
        // Cuota llena o storage bloqueado: no romper la escritura del formulario
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [ready, data, fullKey]);

  return { clearDraft };
}
