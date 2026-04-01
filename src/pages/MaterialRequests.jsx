import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const TYPE_LABELS = { material: "Material", herramienta: "Herramienta", consumible: "Consumible", otro: "Otro" };
const URGENCY_CONFIG = {
  normal: { label: "Normal", color: "bg-slate-100 text-slate-700 border-slate-200" },
  urgente: { label: "Urgente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  muy_urgente: { label: "Muy Urgente", color: "bg-red-100 text-red-700 border-red-200" },
};
const STATUS_CONFIG = {
  pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  aprobado: { label: "Aprobado", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle },
  denegado: { label: "Denegado", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

const EMPTY_FORM = { request_type: "material", description: "", quantity: 1, unit: "ud", urgency: "normal", notes: "" };

export default function MaterialRequests() {
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [resolveDialog, setResolveDialog] = useState(null); // { request, action }
  const [resolveNotes, setResolveNotes] = useState("");

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      loadRequests();
    });
  }, []);

  const loadRequests = async () => {
    const items = await base44.entities.MaterialRequest.list("-created_date", 200);
    setRequests(items);
    setLoading(false);
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isEncargado = user?.role === "encargado";
  const canApprove = isAdmin || isEncargado;

  const handleSubmit = async () => {
    if (!form.description.trim()) { toast.error("Introduce una descripción"); return; }
    setSaving(true);
    await base44.entities.MaterialRequest.create({
      ...form,
      technician_email: user.email,
      technician_name: user.full_name,
      status: "pendiente",
      quantity: parseFloat(form.quantity) || 1,
    });
    // Notify encargados via email
    try {
      await base44.integrations.Core.SendEmail({
        to: "encargado@fritecma.com",
        subject: `Nueva solicitud de ${TYPE_LABELS[form.request_type]} — ${user.full_name}`,
        body: `El técnico ${user.full_name} ha realizado una nueva solicitud:\n\nTipo: ${TYPE_LABELS[form.request_type]}\nDescripción: ${form.description}\nCantidad: ${form.quantity} ${form.unit}\nUrgencia: ${URGENCY_CONFIG[form.urgency]?.label}\nNotas: ${form.notes || "-"}\n\nRevísala en la aplicación.`,
      });
    } catch (_) { /* silenciar si no está configurado */ }
    toast.success("Solicitud enviada correctamente");
    setDialogOpen(false);
    setForm({ ...EMPTY_FORM });
    setSaving(false);
    loadRequests();
  };

  const handleResolve = async () => {
    const { request, action } = resolveDialog;
    await base44.entities.MaterialRequest.update(request.id, {
      status: action,
      resolved_by: user.email,
      resolved_at: new Date().toISOString(),
      resolution_notes: resolveNotes,
    });
    toast.success(action === "aprobado" ? "Solicitud aprobada" : "Solicitud denegada");
    setResolveDialog(null);
    setResolveNotes("");
    loadRequests();
  };

  const myRequests = user?.role === "user" || user?.role === "tecnico"
    ? requests.filter(r => r.technician_email === user?.email)
    : requests;

  const filtered = myRequests.filter(r => statusFilter === "all" || r.status === statusFilter);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-accent" /> Solicitudes de Material
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Pide materiales o herramientas al encargado</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl gap-2">
          <Plus className="h-4 w-4" /> Nueva Solicitud
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="px-3 py-1 text-sm font-normal">
          {filtered.filter(r => r.status === "pendiente").length} pendientes
        </Badge>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
            No hay solicitudes registradas.
          </div>
        )}
        {filtered.map(r => {
          const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente;
          const uc = URGENCY_CONFIG[r.urgency] || URGENCY_CONFIG.normal;
          const Icon = sc.icon;
          return (
            <div key={r.id} className="bg-card rounded-2xl border border-border p-4 flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{r.description}</span>
                  <Badge variant="outline" className={`text-xs border ${uc.color}`}>{uc.label}</Badge>
                  <Badge variant="outline" className="text-xs">{TYPE_LABELS[r.request_type]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.technician_name} · {moment(r.created_date).format("DD/MM/YYYY HH:mm")} · {r.quantity} {r.unit}
                </p>
                {r.notes && <p className="text-xs text-muted-foreground mt-1">Notas: {r.notes}</p>}
                {r.resolution_notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">Resp. encargado: {r.resolution_notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={`border text-xs flex items-center gap-1 ${sc.color}`}>
                  <Icon className="h-3 w-3" /> {sc.label}
                </Badge>
                {canApprove && r.status === "pendiente" && (
                  <>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8 px-3 text-xs"
                      onClick={() => { setResolveDialog({ request: r, action: "aprobado" }); setResolveNotes(""); }}>
                      Aprobar
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/30 rounded-xl h-8 px-3 text-xs"
                      onClick={() => { setResolveDialog({ request: r, action: "denegado" }); setResolveNotes(""); }}>
                      Denegar
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Solicitud de Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.request_type} onValueChange={v => setForm(f => ({ ...f, request_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Urgencia</Label>
                <Select value={form.urgency} onValueChange={v => setForm(f => ({ ...f, urgency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(URGENCY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descripción / Referencia *</Label>
              <Input className="mt-1" placeholder="Ej: Filtro compresor ref. FC-200" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cantidad</Label>
                <Input type="number" min="0.01" step="0.01" className="mt-1" value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>Unidad</Label>
                <Input className="mt-1" placeholder="ud, kg, m..." value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea className="mt-1" rows={3} placeholder="Información adicional..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button onClick={handleSubmit} disabled={saving} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
              {saving ? "Enviando..." : "Enviar Solicitud"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={v => !v && setResolveDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{resolveDialog?.action === "aprobado" ? "Aprobar solicitud" : "Denegar solicitud"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">{resolveDialog?.request?.description}</p>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea className="mt-1" rows={2} placeholder="Comentario al técnico..." value={resolveNotes}
                onChange={e => setResolveNotes(e.target.value)} />
            </div>
            <Button onClick={handleResolve} className={`w-full rounded-xl ${resolveDialog?.action === "aprobado" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-destructive hover:bg-destructive/90 text-white"}`}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}