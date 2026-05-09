export const DISPLACEMENT_LINE_MARKER = "_isDisplacementLine";

export function parseTramosJson(raw) {
  if (raw == null || raw === "") return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function ensureTramoIds(tramos) {
  return (tramos || []).map((t, i) => ({
    id: String(t?.id ?? "").trim() || `tramo-${i + 1}-${Date.now()}`,
    nombre: String(t?.nombre ?? "").trim() || `Tramo ${i + 1}`,
    descripcion: t?.descripcion != null ? String(t.descripcion) : "",
    precio: Math.max(0, Number(t?.precio) || 0),
  }));
}

export function findTramoById(tramos, id) {
  if (!id) return null;
  return (tramos || []).find((t) => t.id === id) || null;
}

export function stripDisplacementLines(lines) {
  return (lines || []).filter((l) => !l?.[DISPLACEMENT_LINE_MARKER]);
}

export function upsertDisplacementMaterialLine(lines, { cantidad, tramo }) {
  const base = stripDisplacementLines(lines);
  const qty = Math.max(0, Math.floor(Number(cantidad) || 0));
  if (qty === 0 || !tramo) {
    return base;
  }
  const unit = Math.max(0, Number(tramo.precio) || 0);
  const total = qty * unit;
  base.push({
    _id: "__frigest_desplazamiento__",
    material_id: "__desplazamiento__",
    material_name: `Desplazamiento — ${tramo.nombre}`,
    unit: "ud",
    quantity: qty,
    unit_price: unit,
    iva_percent: 21,
    total,
    observation: tramo.descripcion?.trim()
      ? `${tramo.descripcion.trim()} · ${tramo.nombre}`
      : `Tramo: ${tramo.nombre}`,
    [DISPLACEMENT_LINE_MARKER]: true,
  });
  return base;
}

export function computeTotalsFromLines(lines, discountPercent = 0) {
  const subtotal = (lines || []).reduce((sum, l) => sum + (l.total || 0), 0);
  const discountAmount = subtotal * (Number(discountPercent) / 100);
  const ivaByRate = {};
  (lines || []).forEach((l) => {
    const rate = l.iva_percent || 21;
    const lineAfterDiscount = (l.total || 0) * (1 - Number(discountPercent) / 100);
    ivaByRate[rate] = (ivaByRate[rate] || 0) + lineAfterDiscount * (rate / 100);
  });
  const ivaTotal = Object.values(ivaByRate).reduce((s, v) => s + v, 0);
  const total = subtotal - discountAmount + ivaTotal;
  return { subtotal, discountAmount, ivaTotal, total };
}
