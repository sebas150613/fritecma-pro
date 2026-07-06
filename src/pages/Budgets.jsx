import { useState, useEffect, useMemo } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import PullToRefresh from "../components/PullToRefresh";
import ClientSelector from "../components/ClientSelector";
import MaterialLineForm from "../components/MaterialLineForm";
import { computeTotalsFromLines } from "@/lib/displacementBilling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Search, ExternalLink, Send, Check, X, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const canManageBudgets = (u) =>
  u &&
  u.is_hidden_owner !== true &&
  ["admin", "superadmin", "encargado", "oficina"].includes(u.role);

const STATUS = {
  borrador: { label: "Borrador", color: "bg-slate-100 text-slate-700 border-slate-200" },
  enviado: { label: "Enviado al cliente", color: "bg-blue-100 text-blue-700 border-blue-200" },
  aceptado: { label: "Aceptado", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700 border-red-200" },
  caducado: { label: "Caducado", color: "bg-orange-100 text-orange-700 border-orange-200" },
  parte_generado: { label: "Parte generado", color: "bg-violet-100 text-violet-700 border-violet-200" },
  facturado: { label: "Facturado", color: "bg-teal-100 text-teal-700 border-teal-200" },
};

const euro = (n) =>
  (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const emptyForm = () => ({
  id: null,
  client_id: "",
  client_name: "",
  work_center_id: "",
  work_center_name: "",
  valid_until: moment().add(30, "days").format("YYYY-MM-DD"),
  description: "",
  discount_percent: 0,
  notes: "",
});

export default function Budgets() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [clients, setClients] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [lines, setLines] = useState([]);

  const loadData = async () => {
    const me = await appApi.auth.me();
    setUser(me);
    if (canManageBudgets(me)) {
      const [items, clientList, materialList] = await Promise.all([
        appApi.entities.Budget.list("-date", 1000),
        appApi.entities.Client.list("name", 1000),
        appApi.entities.Material.list("name", 2000),
      ]);
      setBudgets(items || []);
      setClients(clientList || []);
      setMaterials(materialList || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return budgets.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [b.number, b.client_name, b.description].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [budgets, statusFilter, search]);

  const totals = useMemo(() => computeTotalsFromLines(lines, form.discount_percent), [lines, form.discount_percent]);

  const openNew = () => {
    setForm(emptyForm());
    setLines([]);
    setWorkCenters([]);
    setFormOpen(true);
  };

  const openEdit = async (budget) => {
    setForm({
      id: budget.id,
      client_id: budget.client_id || "",
      client_name: budget.client_name || "",
      work_center_id: budget.work_center_id || "",
      work_center_name: budget.work_center_name || "",
      valid_until: budget.valid_until ? moment(budget.valid_until).format("YYYY-MM-DD") : "",
      description: budget.description || "",
      discount_percent: budget.discount_percent || 0,
      notes: budget.notes || "",
    });
    try {
      setLines(JSON.parse(budget.lines_json || "[]"));
    } catch {
      setLines([]);
    }
    if (budget.client_id) {
      const centers = await appApi.entities.WorkCenter.filter({ client_id: budget.client_id }, "name", 100).catch(() => []);
      setWorkCenters(centers || []);
    }
    setFormOpen(true);
  };

  const handleClientChange = async (clientId) => {
    const client = clients.find((c) => c.id === clientId);
    setForm((f) => ({
      ...f,
      client_id: clientId,
      client_name: client?.name || "",
      work_center_id: "",
      work_center_name: "",
    }));
    const centers = await appApi.entities.WorkCenter.filter({ client_id: clientId }, "name", 100).catch(() => []);
    setWorkCenters(centers || []);
  };

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { _id: Date.now() + Math.random(), material_id: "", material_name: "", quantity: 1, unit_price: 0, total: 0, observation: "", unit: "ud", iva_percent: 21 },
    ]);

  const updateLine = (index, line) => {
    const next = [...lines];
    next[index] = line;
    setLines(next);
  };

  const removeLine = (index) => setLines(lines.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!form.client_id) {
      toast.error("Selecciona un cliente.");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Describe el trabajo presupuestado.");
      return;
    }
    setSaving(true);
    try {
      const data = {
        client_id: form.client_id,
        client_name: form.client_name,
        work_center_id: form.work_center_id || undefined,
        work_center_name: form.work_center_name || undefined,
        valid_until: form.valid_until || undefined,
        description: form.description,
        lines_json: JSON.stringify(lines),
        subtotal: totals.subtotal,
        iva_total: totals.ivaTotal,
        total: totals.total,
        discount_percent: form.discount_percent || 0,
        notes: form.notes || undefined,
      };
      if (form.id) {
        await appApi.entities.Budget.update(form.id, data);
        toast.success("Presupuesto actualizado.");
      } else {
        await appApi.entities.Budget.create({
          ...data,
          number: `PRE-${moment().format("YYMMDD")}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
          date: new Date().toISOString(),
          status: "borrador",
          created_by: user.email,
          created_by_name: user.full_name,
        });
        toast.success("Presupuesto creado.");
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      console.error("[Budgets] Error al guardar:", err);
      toast.error("No se pudo guardar el presupuesto.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (budget, status) => {
    try {
      await appApi.entities.Budget.update(budget.id, {
        status,
        status_changed_at: new Date().toISOString(),
      });
      toast.success(`Presupuesto marcado como «${STATUS[status].label}».`);
      await loadData();
    } catch {
      toast.error("No se pudo cambiar el estado.");
    }
  };

  const generateParte = (budget) => {
    navigate(`/interventions/new?budgetId=${budget.id}`);
  };

  const [invoicingBudgetId, setInvoicingBudgetId] = useState(null);

  const invoiceBudget = async (budget) => {
    if (!window.confirm(`Se emitirá una factura Veri*factu con las líneas del presupuesto ${budget.number} por ${(Number(budget.total) || 0).toFixed(2)} €. ¿Continuar?`)) {
      return;
    }
    setInvoicingBudgetId(budget.id);
    try {
      let lines = [];
      try { lines = JSON.parse(budget.lines_json || "[]"); } catch { lines = []; }
      const res = await appApi.functions.invoke("processVerifactu", {
        mode: "facturar_libre",
        client_id: budget.client_id,
        budget_id: budget.id,
        descripcion: budget.description || `Presupuesto ${budget.number}`,
        lines: lines.map((l) => ({
          material_name: l.material_name || l.description || "",
          quantity: Number(l.quantity) || 0,
          unit: l.unit || "ud",
          unit_price: Number(l.unit_price) || 0,
          iva_percent: Number(l.iva_percent) || 21,
        })),
      });
      toast.success(`Factura emitida: ${res?.data?.invoice_number || ""}`);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "No se pudo facturar el presupuesto.");
    } finally {
      setInvoicingBudgetId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canManageBudgets(user)) {
    return <Navigate to="/" replace />;
  }

  const isExpired = (b) =>
    b.valid_until && ["borrador", "enviado"].includes(b.status) && moment(b.valid_until).isBefore(moment(), "day");

  const statusBadge = (b) => {
    const st = isExpired(b) ? STATUS.caducado : STATUS[b.status] || STATUS.borrador;
    return <Badge variant="outline" className={`border text-xs font-normal ${st.color}`}>{st.label}</Badge>;
  };

  const rowActions = (b) => (
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {["borrador"].includes(b.status) && (
        <Button size="sm" variant="outline" className="rounded-lg h-8 text-xs" onClick={() => changeStatus(b, "enviado")}>
          <Send className="h-3.5 w-3.5 mr-1" /> Enviado
        </Button>
      )}
      {["borrador", "enviado"].includes(b.status) && (
        <>
          <Button size="sm" variant="outline" className="rounded-lg h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => changeStatus(b, "aceptado")}>
            <Check className="h-3.5 w-3.5 mr-1" /> Aceptado
          </Button>
          <Button size="sm" variant="outline" className="rounded-lg h-8 text-xs text-red-700 border-red-200 hover:bg-red-50" onClick={() => changeStatus(b, "rechazado")}>
            <X className="h-3.5 w-3.5 mr-1" /> Rechazado
          </Button>
        </>
      )}
      {b.status === "aceptado" && (
        <>
          <Button size="sm" className="rounded-lg h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => generateParte(b)}>
            <ClipboardList className="h-3.5 w-3.5 mr-1" /> Generar parte
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg h-8 text-xs"
            disabled={invoicingBudgetId === b.id}
            onClick={() => invoiceBudget(b)}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            {invoicingBudgetId === b.id ? "Facturando..." : "Facturar"}
          </Button>
        </>
      )}
      {b.status === "parte_generado" && b.intervention_id && (
        <Link to={`/interventions/${b.intervention_id}`} className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
          {b.intervention_number || "Ver parte"} <ExternalLink className="h-3 w-3" />
        </Link>
      )}
      {b.status === "facturado" && b.invoice_number && (
        <Link to="/invoices" className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
          {b.invoice_number} <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );

  return (
    <PullToRefresh onRefresh={loadData}>
      <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6 pb-28 lg:pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-7 w-7 text-accent" /> Presupuestos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Presupuesta el trabajo antes de abrir el parte. Cuando el cliente acepte, genera el parte con las líneas ya cargadas.
            </p>
          </div>
          <Button onClick={openNew} className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground shrink-0">
            <Plus className="h-4 w-4 mr-2" /> Nuevo presupuesto
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 rounded-xl bg-card"
              placeholder="Buscar por número, cliente o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-52 rounded-xl bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
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
                <th className="p-3 font-medium">Válido hasta</th>
                <th className="p-3 font-medium text-right">Total</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-border/80 hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">
                    <button className="hover:text-accent hover:underline" onClick={() => openEdit(b)}>{b.number}</button>
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {b.date ? moment(b.date).format("DD/MM/YYYY") : "—"}
                  </td>
                  <td className="p-3">
                    {b.client_name}
                    {b.work_center_name && <span className="block text-xs text-muted-foreground">{b.work_center_name}</span>}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {b.valid_until ? moment(b.valid_until).format("DD/MM/YYYY") : "—"}
                  </td>
                  <td className="p-3 text-right font-semibold">{euro(b.total)}</td>
                  <td className="p-3">{statusBadge(b)}</td>
                  <td className="p-3">{rowActions(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-muted-foreground text-sm">
              No hay presupuestos con estos filtros. Crea el primero con «Nuevo presupuesto».
            </p>
          )}
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden space-y-3">
          {filtered.map((b) => (
            <div key={b.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <button className="font-mono text-xs hover:text-accent" onClick={() => openEdit(b)}>{b.number}</button>
                {statusBadge(b)}
              </div>
              <p className="font-medium">{b.client_name}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
              <p className="text-xs text-muted-foreground">
                {b.date ? moment(b.date).format("DD/MM/YYYY") : ""}
                {b.valid_until ? ` · válido hasta ${moment(b.valid_until).format("DD/MM/YYYY")}` : ""}
              </p>
              <div className="flex items-center justify-between pt-1 gap-2">
                <span className="font-bold">{euro(b.total)}</span>
                {rowActions(b)}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="p-8 text-center text-muted-foreground text-sm">No hay presupuestos con estos filtros.</p>
          )}
        </div>

        {/* Create / edit dialog */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar presupuesto" : "Nuevo presupuesto"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Cliente *</Label>
                <div className="mt-1">
                  <ClientSelector clients={clients} selectedId={form.client_id} onChange={handleClientChange} />
                </div>
              </div>

              {workCenters.length > 0 && (
                <div>
                  <Label>Centro de trabajo</Label>
                  <Select
                    value={form.work_center_id || "none"}
                    onValueChange={(v) => {
                      const wc = workCenters.find((w) => w.id === v);
                      setForm((f) => ({ ...f, work_center_id: v === "none" ? "" : v, work_center_name: wc?.name || "" }));
                    }}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="Sin centro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin centro</SelectItem>
                      {workCenters.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Válido hasta</Label>
                  <Input
                    type="date"
                    className="mt-1 rounded-xl"
                    value={form.valid_until}
                    onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Descuento (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="mt-1 rounded-xl"
                    value={form.discount_percent || ""}
                    onChange={(e) => setForm((f) => ({ ...f, discount_percent: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div>
                <Label>Descripción del trabajo *</Label>
                <Textarea
                  className="mt-1 rounded-xl"
                  rows={3}
                  placeholder="Trabajo a realizar, condiciones..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Lines */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Materiales y mano de obra</Label>
                  <Button variant="outline" size="sm" onClick={addLine} className="rounded-xl">
                    <Plus className="h-4 w-4 mr-1" /> Añadir línea
                  </Button>
                </div>
                {lines.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">
                    Pulsa «Añadir línea» para presupuestar materiales o mano de obra.
                  </p>
                ) : (
                  lines.map((line, i) => (
                    <MaterialLineForm
                      key={line._id || i}
                      line={line}
                      index={i}
                      materials={materials}
                      onUpdate={updateLine}
                      onRemove={removeLine}
                      isAdmin
                    />
                  ))
                )}
                {lines.length > 0 && (
                  <div className="border-t border-border pt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{euro(totals.subtotal)}</span>
                    </div>
                    {form.discount_percent > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Descuento ({form.discount_percent}%)</span>
                        <span>-{euro(totals.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IVA</span>
                      <span>{euro(totals.ivaTotal)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span className="text-accent">{euro(totals.total)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label>Notas internas</Label>
                <Textarea
                  className="mt-1 rounded-xl"
                  rows={2}
                  placeholder="No se muestran al cliente"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear presupuesto"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
