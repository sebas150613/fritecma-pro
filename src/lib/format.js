/**
 * Formato de números para MOSTRAR en pantalla y en los PDF (coma decimal, es-ES).
 *
 * No usar para datos que se guardan, se exportan o se envían a la AEAT/FacturaE:
 * ahí el formato lo fija la norma (punto decimal) y se sigue usando toFixed().
 */

const cache = new Map();

function formatter(decimals) {
  if (!cache.has(decimals)) {
    cache.set(
      decimals,
      new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    );
  }
  return cache.get(decimals);
}

/** 1234.5 → "1234,50" (es-ES no agrupa miles por debajo de 10 000). */
export function formatNumber(value, decimals = 2) {
  const n = Number(value);
  return formatter(decimals).format(Number.isFinite(n) ? n : 0);
}

/** Cantidades sin ceros de relleno: 2 → "2", 0.5 → "0,5", 1.25 → "1,25". */
export function formatQty(value, maxDecimals = 2) {
  const n = Number(value);
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: maxDecimals }).format(
    Number.isFinite(n) ? n : 0
  );
}

/** 193.6 → "193,60 €" */
export function formatEUR(value, decimals = 2) {
  return `${formatNumber(value, decimals)} €`;
}
