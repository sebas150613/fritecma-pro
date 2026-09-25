import moment from "moment";

/** Estado de cobro de una factura. Compartido por Facturación y el Panel. */
export const paymentInfo = (inv) => {
  if (inv.payment_status === "no_aplica") {
    return { key: "no_aplica", label: "No aplica", color: "bg-slate-100 text-slate-500 border-slate-200" };
  }
  if (inv.payment_status === "pagada") {
    return { key: "pagada", label: "Pagada", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  }
  if (inv.due_date && moment(inv.due_date).isBefore(moment(), "day")) {
    return { key: "vencida", label: "Vencida", color: "bg-red-100 text-red-700 border-red-200" };
  }
  return { key: "pendiente", label: "Pendiente", color: "bg-amber-100 text-amber-700 border-amber-200" };
};

/** Quién ve las facturas (misma regla que la página de Facturación). */
export const canViewInvoices = (u) =>
  Boolean(u) &&
  u.is_hidden_owner !== true &&
  ["admin", "superadmin", "encargado", "oficina"].includes(u.role);
