import { useState, useEffect, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Receipt, Download, Search, ExternalLink, QrCode, HandCoins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const canViewInvoices = (u) =>
  u &&
  u.is_hidden_owner !== true &&
  ["admin", "superadmin", "encargado", "oficina"].includes(u.role);

const VERIFACTU_STATUS = {
  pendiente: { label: "Pendiente envío", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  enviado: { label: "Enviado AEAT", color: "bg-blue-100 text-blue-700 border-blue-200" },
  aceptado: { label: "Aceptado AEAT", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rechazado: { label: "Rechazado AEAT", color: "bg-red-100 text-red-700 border-red-200" },
  error: { label: "Error de envío", color: "bg-red-100 text-red-700 border-red-200" },
  sin_envio: { label: "Sin envío", color: "bg-slate-100 text-slate-700 border-slate-200" },
  duplicado: { label: "Duplicado", color: "bg-orange-100 text-orange-700 border-orange-200" },
  sandbox_ok: { label: "Sandbox OK", color: "bg-teal-100 text-teal-700 border-teal-200" },
  validado_sandbox: { label: "Validado sandbox", color: "bg-teal-100 text-teal-700 border-teal-200" },
};

const TIPO_LABELS = {
  F1: "Factura",
  R1: "Rectificativa R1",
  R2: "Rectificativa R2",
  R3: "Rectificativa R3",
  R4: "Rectificativa R4",
  R5: "Rectificativa R5",
};

const euro = (n) =>
  (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const PAYMENT_METHODS = ["Transferencia", "Recibo domiciliado", "Efectivo", "Tarjeta", "Bizum"];

// Estado de cobro efectivo: "vencida" se deriva de pendiente + due_date pasada.
const paymentInfo = (inv) => {
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

export default function Invoices() {
  const [user, setUser] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [cobroFilter, setCobroFilter] = useState("all");
  const [payDialog, setPayDialog] = useState(null);
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [payDate, setPayDate] = useState(moment().format("YYYY-MM-DD"));
  const [paySaving, setPaySaving] = useState(false);

  const canManagePayments = ["admin", "superadmin", "oficina"].includes(user?.role);

  const loadData = async () => {
    const me = await appApi.auth.me();
    setUser(me);
    if (canViewInvoices(me)) {
      const items = await appApi.entities.Invoice.list("-issue_date", 1000);
      setInvoices(items || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, []);

  const months = useMemo(() => {
    const set = new Set(
      invoices
        .map((i) => (i.issue_date ? moment(i.issue_date).format("YYYY-MM") : null))
        .filter(Boolean)
    );
    return [...set].sort().reverse();
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.verifactu_status !== statusFilter) return false;
      if (cobroFilter !== "all" && paymentInfo(inv).key !== cobroFilter) return false;
      if (monthFilter !== "all" && (!inv.issue_date || !moment(inv.issue_date).format("YYYY-MM").startsWith(monthFilter))) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [inv.invoice_number, inv.client_name, inv.client_nif, inv.intervention_number]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, cobroFilter, monthFilter, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, inv) => {
        const cobro = paymentInfo(inv).key;
        const total = Number(inv.total) || 0;
        return {
          count: acc.count + 1,
          subtotal: acc.subtotal + (Number(inv.subtotal) || 0),
          iva: acc.iva + (Number(inv.iva_total) || 0),
          total: acc.total + total,
          cobrado: acc.cobrado + (cobro === "pagada" ? total : 0),
          pendiente: acc.pendiente + (cobro === "pendiente" || cobro === "vencida" ? total : 0),
          vencido: acc.vencido + (cobro === "vencida" ? total : 0),
        };
      },
      { count: 0, subtotal: 0, iva: 0, total: 0, cobrado: 0, pendiente: 0, vencido: 0 }
    );
  }, [filtered]);

  const markPaid = async () => {
    if (!payDialog) return;
    setPaySaving(true);
    try {
      await appApi.entities.Invoice.update(payDialog.id, {
        payment_status: "pagada",
        payment_method: payMethod,
        paid_at: payDate ? new Date(`${payDate}T12:00:00`).toISOString() : new Date().toISOString(),
      });
      setPayDialog(null);
      toast.success("Factura marcada como pagada.");
      await loadData();
    } catch (err) {
      toast.error(err?.message || "No se pudo actualizar el cobro.");
    } finally {
      setPaySaving(false);
    }
  };

  const markPending = async (inv) => {
    try {
      await appApi.entities.Invoice.update(inv.id, {
        payment_status: "pendiente",
        payment_method: "",
        paid_at: null,
      });
      toast.success("Factura marcada como pendiente de cobro.");
      await loadData();
    } catch (err) {
      toast.error(err?.message || "No se pudo actualizar el cobro.");
    }
  };

  const downloadCSV = () => {
    const rows = [
      ["Número", "Serie", "Tipo", "Fecha", "Cliente", "NIF", "Base (€)", "IVA (€)", "Total (€)", "Estado VeriFactu", "Cobro", "Vencimiento", "Pagada el", "Método", "Nº Parte", "Rectifica a"],
    ];
    filtered.forEach((inv) => {
      const pago = paymentInfo(inv);
      rows.push([
        inv.invoice_number || "",
        inv.serie || "",
        inv.tipo_factura || "F1",
        inv.issue_date ? moment(inv.issue_date).format("DD/MM/YYYY") : "",
        inv.client_name || "",
        inv.client_nif || "",
        (Number(inv.subtotal) || 0).toFixed(2),
        (Number(inv.iva_total) || 0).toFixed(2),
        (Number(inv.total) || 0).toFixed(2),
        VERIFACTU_STATUS[inv.verifactu_status]?.label || inv.verifactu_status || "",
        pago.label,
        inv.due_date ? moment(inv.due_date).format("DD/MM/YYYY") : "",
        inv.paid_at ? moment(inv.paid_at).format("DD/MM/YYYY") : "",
        inv.payment_method || "",
        inv.intervention_number || "",
        inv.factura_rectificada_number || "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas_${monthFilter === "all" ? "todas" : monthFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canViewInvoices(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <PullToRefresh onRefresh={loadData}>
      <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6 pb-28 lg:pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Receipt className="h-7 w-7 text-accent" /> Facturación
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Listado de todas las facturas emitidas (VeriFactu). Las facturas se emiten desde el parte de trabajo y son inalterables.
            </p>
          </div>
          <Button
            onClick={downloadCSV}
            disabled={filtered.length === 0}
            className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground shrink-0"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar CSV (gestoría)
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground">Facturas</p>
            <p className="text-xl font-bold">{totals.count}</p>
            <p className="text-xs text-muted-foreground mt-1">Base {euro(totals.subtotal)} · IVA {euro(totals.iva)}</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground">Total facturado</p>
            <p className="text-xl font-bold text-accent">{euro(totals.total)}</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground">Cobrado</p>
            <p className="text-xl font-bold text-emerald-600">{euro(totals.cobrado)}</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground">Pendiente de cobro</p>
            <p className="text-xl font-bold text-amber-600">{euro(totals.pendiente)}</p>
            {totals.vencido > 0 && (
              <p className="text-xs font-medium text-red-600 mt-1">Vencido: {euro(totals.vencido)}</p>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 rounded-xl bg-card"
              placeholder="Buscar por número, cliente, NIF o parte..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-full lg:w-44 rounded-xl bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{moment(m, "YYYY-MM").format("MMMM YYYY")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-52 rounded-xl bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(VERIFACTU_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cobroFilter} onValueChange={setCobroFilter}>
            <SelectTrigger className="w-full lg:w-44 rounded-xl bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el cobro</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="vencida">Vencidas</SelectItem>
              <SelectItem value="pagada">Pagadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left">
                <th className="p-3 font-medium">Número</th>
                <th className="p-3 font-medium">Fecha</th>
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Tipo</th>
                <th className="p-3 font-medium text-right">Base</th>
                <th className="p-3 font-medium text-right">Total</th>
                <th className="p-3 font-medium">Estado VeriFactu</th>
                <th className="p-3 font-medium">Cobro</th>
                <th className="p-3 font-medium text-right">Parte</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const st = VERIFACTU_STATUS[inv.verifactu_status] || VERIFACTU_STATUS.pendiente;
                const pago = paymentInfo(inv);
                return (
                  <tr key={inv.id} className="border-b border-border/80 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">
                      {inv.invoice_number}
                      {inv.factura_rectificada_number && (
                        <span className="block text-[10px] text-muted-foreground">
                          rectifica {inv.factura_rectificada_number}
                        </span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {inv.issue_date ? moment(inv.issue_date).format("DD/MM/YYYY") : "—"}
                    </td>
                    <td className="p-3">
                      {inv.client_name}
                      {inv.client_nif && <span className="block text-xs text-muted-foreground">{inv.client_nif}</span>}
                    </td>
                    <td className="p-3 text-xs">{TIPO_LABELS[inv.tipo_factura] || inv.tipo_factura || "Factura"}</td>
                    <td className="p-3 text-right">{euro(inv.subtotal)}</td>
                    <td className="p-3 text-right font-semibold">{euro(inv.total)}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2">
                        <Badge variant="outline" className={`border text-xs font-normal ${st.color}`}>{st.label}</Badge>
                        {inv.qr_url && (
                          <a href={inv.qr_url} target="_blank" rel="noreferrer" title="Verificación AEAT (QR)">
                            <QrCode className="h-4 w-4 text-muted-foreground hover:text-accent" />
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="space-y-1">
                        <Badge variant="outline" className={`border text-xs font-normal ${pago.color}`}>{pago.label}</Badge>
                        {pago.key === "pagada" && inv.paid_at && (
                          <p className="text-[10px] text-muted-foreground">
                            {moment(inv.paid_at).format("DD/MM/YYYY")}{inv.payment_method ? ` · ${inv.payment_method}` : ""}
                          </p>
                        )}
                        {(pago.key === "pendiente" || pago.key === "vencida") && inv.due_date && (
                          <p className={`text-[10px] ${pago.key === "vencida" ? "text-red-600" : "text-muted-foreground"}`}>
                            Vence {moment(inv.due_date).format("DD/MM/YYYY")}
                          </p>
                        )}
                        {canManagePayments && pago.key !== "no_aplica" && (
                          pago.key === "pagada" ? (
                            <button type="button" className="text-[10px] text-muted-foreground hover:text-accent hover:underline" onClick={() => markPending(inv)}>
                              Deshacer cobro
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-[10px] text-accent hover:underline"
                              onClick={() => { setPayDialog(inv); setPayMethod(PAYMENT_METHODS[0]); setPayDate(moment().format("YYYY-MM-DD")); }}
                            >
                              Marcar pagada
                            </button>
                          )
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      {inv.intervention_id ? (
                        <Link
                          to={`/interventions/${inv.intervention_id}`}
                          className="inline-flex items-center gap-1 text-accent hover:underline text-xs"
                        >
                          {inv.intervention_number || "Ver parte"} <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-muted-foreground text-sm">
              No hay facturas con estos filtros. Las facturas se emiten desde el detalle de cada parte de trabajo.
            </p>
          )}
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden space-y-3">
          {filtered.map((inv) => {
            const st = VERIFACTU_STATUS[inv.verifactu_status] || VERIFACTU_STATUS.pendiente;
            const pago = paymentInfo(inv);
            return (
              <div key={inv.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{inv.invoice_number}</span>
                  <span className="flex gap-1.5">
                    <Badge variant="outline" className={`border text-xs font-normal ${pago.color}`}>{pago.label}</Badge>
                    <Badge variant="outline" className={`border text-xs font-normal ${st.color}`}>{st.label}</Badge>
                  </span>
                </div>
                <p className="font-medium">{inv.client_name}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.issue_date ? moment(inv.issue_date).format("DD/MM/YYYY") : ""} ·{" "}
                  {TIPO_LABELS[inv.tipo_factura] || "Factura"}
                  {inv.factura_rectificada_number ? ` · rectifica ${inv.factura_rectificada_number}` : ""}
                  {(pago.key === "pendiente" || pago.key === "vencida") && inv.due_date
                    ? ` · vence ${moment(inv.due_date).format("DD/MM/YYYY")}`
                    : ""}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-bold">{euro(inv.total)}</span>
                  <span className="flex items-center gap-3">
                    {canManagePayments && (pago.key === "pendiente" || pago.key === "vencida") && (
                      <button
                        type="button"
                        className="text-accent text-xs hover:underline"
                        onClick={() => { setPayDialog(inv); setPayMethod(PAYMENT_METHODS[0]); setPayDate(moment().format("YYYY-MM-DD")); }}
                      >
                        Marcar pagada
                      </button>
                    )}
                    {inv.intervention_id && (
                      <Link to={`/interventions/${inv.intervention_id}`} className="text-accent text-xs hover:underline">
                        Ver parte {inv.intervention_number || ""}
                      </Link>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="p-8 text-center text-muted-foreground text-sm">No hay facturas con estos filtros.</p>
          )}
        </div>
      </div>

      {/* Dialog: marcar pagada */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-emerald-600" /> Registrar cobro
            </DialogTitle>
          </DialogHeader>
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <p className="font-mono text-xs">{payDialog?.invoice_number}</p>
              <p className="font-medium">{payDialog?.client_name}</p>
              <p className="font-bold mt-1">{euro(payDialog?.total)}</p>
            </div>
            <div>
              <Label className="text-xs">Método de pago</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha de cobro</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 rounded-xl" />
            </div>
            <Button
              className="w-full rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={markPaid}
              disabled={paySaving}
            >
              {paySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <HandCoins className="h-4 w-4 mr-2" />}
              Confirmar cobro
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
