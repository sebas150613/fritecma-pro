import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormDraft, isNetworkError } from "../hooks/useFormDraft";
import { useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Save, UserPlus, AlertTriangle, Building2, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import BackButton from "../components/BackButton";
import ClientSelector from "../components/ClientSelector";

// ─── constants ────────────────────────────────────────────────────────────────

const EMPTY_NEW_CLIENT = {
  name: "", cif: "", phone: "", email: "",
  contact_person: "", address: "", city: "", postal_code: "", notes: "",
};

const EMPTY_NEW_CENTER = {
  name: "", phone: "", contact_person: "",
  address: "", city: "", postal_code: "", email: "", notes: "",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalize(str) {
  return (str || "").trim().toLowerCase();
}

function findDuplicates(clients, nc) {
  const name  = normalize(nc.name);
  const cif   = normalize(nc.cif);
  const email = normalize(nc.email);
  const phone = normalize(nc.phone);
  return clients.filter((c) => {
    if (cif   && normalize(c.cif)   === cif)   return true;
    if (email && normalize(c.email) === email)  return true;
    if (phone && normalize(c.phone) === phone)  return true;
    if (name.length >= 3 && normalize(c.name).includes(name)) return true;
    return false;
  });
}

// ─── small form components ────────────────────────────────────────────────────

function FormField({ label, optional = false, children }) {
  return (
    <div>
      <Label className="text-xs">
        {label}
        {optional && <span className="text-muted-foreground font-normal ml-1">(opcional)</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Row2({ children }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

const iCls = "rounded-xl text-sm h-9";

function NewClientForm({ data, onChange }) {
  const set = (f) => (e) => onChange({ ...data, [f]: e.target.value });
  return (
    <div className="space-y-3">
      <FormField label="Nombre del cliente *">
        <Input value={data.name} onChange={set("name")} placeholder="Empresa S.L." className={iCls} autoFocus />
      </FormField>
      <Row2>
        <FormField label="CIF/NIF" optional>
          <Input value={data.cif} onChange={set("cif")} placeholder="B12345678" className={iCls} />
        </FormField>
        <FormField label="Teléfono">
          <Input value={data.phone} onChange={set("phone")} placeholder="600 000 000" className={iCls} />
        </FormField>
      </Row2>
      <Row2>
        <FormField label="Email" optional>
          <Input value={data.email} onChange={set("email")} type="email" placeholder="info@empresa.com" className={iCls} />
        </FormField>
        <FormField label="Persona de contacto" optional>
          <Input value={data.contact_person} onChange={set("contact_person")} placeholder="Nombre Apellido" className={iCls} />
        </FormField>
      </Row2>
      <FormField label="Dirección" optional>
        <Input value={data.address} onChange={set("address")} placeholder="Calle Mayor 1" className={iCls} />
      </FormField>
      <Row2>
        <FormField label="Ciudad" optional>
          <Input value={data.city} onChange={set("city")} placeholder="Barcelona" className={iCls} />
        </FormField>
        <FormField label="Código postal" optional>
          <Input value={data.postal_code} onChange={set("postal_code")} placeholder="08001" className={iCls} />
        </FormField>
      </Row2>
      <FormField label="Notas" optional>
        <Textarea value={data.notes} onChange={set("notes")} placeholder="Notas internas" rows={2} className="rounded-xl text-sm" />
      </FormField>
    </div>
  );
}

function NewCenterForm({ data, onChange }) {
  const set = (f) => (e) => onChange({ ...data, [f]: e.target.value });
  return (
    <div className="space-y-3">
      <FormField label="Nombre del centro *">
        <Input value={data.name} onChange={set("name")} placeholder="Sede central / Planta A" className={iCls} />
      </FormField>
      <Row2>
        <FormField label="Teléfono" optional>
          <Input value={data.phone} onChange={set("phone")} placeholder="600 000 000" className={iCls} />
        </FormField>
        <FormField label="Persona de contacto" optional>
          <Input value={data.contact_person} onChange={set("contact_person")} placeholder="Nombre Apellido" className={iCls} />
        </FormField>
      </Row2>
      <FormField label="Dirección" optional>
        <Input value={data.address} onChange={set("address")} placeholder="Calle Mayor 1" className={iCls} />
      </FormField>
      <Row2>
        <FormField label="Ciudad" optional>
          <Input value={data.city} onChange={set("city")} placeholder="Barcelona" className={iCls} />
        </FormField>
        <FormField label="Código postal" optional>
          <Input value={data.postal_code} onChange={set("postal_code")} placeholder="08001" className={iCls} />
        </FormField>
      </Row2>
      <Row2>
        <FormField label="Email" optional>
          <Input value={data.email} onChange={set("email")} type="email" placeholder="centro@empresa.com" className={iCls} />
        </FormField>
        <FormField label="Notas" optional>
          <Input value={data.notes} onChange={set("notes")} placeholder="Notas del centro" className={iCls} />
        </FormField>
      </Row2>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function NewBreakdown() {
  const navigate = useNavigate();

  const [user, setUser]       = useState(null);
  const [clients, setClients] = useState([]);
  const [users, setUsers]     = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [machines, setMachines] = useState([]);
  const [saving, setSaving]   = useState(false);

  // shared form (description, priority, assignment, client_fault_id, contact_phone)
  const [form, setForm] = useState({
    client_id: "", client_name: "",
    work_center_id: "", work_center_name: "",
    machine_id: "", machine_name: "",
    contact_phone_snapshot: "",
    client_fault_id: "",
    description: "",
    priority: "media",
    assigned_user_id: "", assigned_user_email: "", assigned_user_name: "",
  });

  // new-client dialog state
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [draftClient, setDraftClient]   = useState(EMPTY_NEW_CLIENT);
  const [addCenter, setAddCenter]       = useState(false);
  const [draftCenter, setDraftCenter]   = useState(EMPTY_NEW_CENTER);
  const [duplicates, setDuplicates]     = useState([]);
  const [dupDismissed, setDupDismissed] = useState(false);

  // confirmed new-client data (null = existing client mode)
  const [newClient, setNewClient]   = useState(null); // saved after dialog confirm
  const [newCenter, setNewCenter]   = useState(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const draftData = useMemo(
    () => ({ form, newClient, newCenter }),
    [form, newClient, newCenter]
  );

  const restoreDraft = async (d) => {
    if (d?.form) setForm((f) => ({ ...f, ...d.form }));
    setNewClient(d?.newClient || null);
    setNewCenter(d?.newCenter || null);
    if (d?.form?.client_id) {
      const [centers, machineList] = await Promise.all([
        appApi.entities.WorkCenter.filter({ client_id: d.form.client_id }, "name", 100).catch(() => []),
        appApi.entities.Machine.filter({ client_id: d.form.client_id }, "name", 200).catch(() => []),
      ]);
      setWorkCenters(centers || []);
      setMachines((machineList || []).filter(m => m.status !== "retirada"));
    }
    toast.success("Borrador recuperado.");
  };

  const { clearDraft } = useFormDraft({
    storageKey: `new-breakdown:${user?.email || "anon"}`,
    ready: initialLoadDone,
    data: draftData,
    onRestore: restoreDraft,
    label: "una avería",
  });

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const me = await appApi.auth.me();
      setUser(me);
      const isAdmin   = ["admin", "superadmin", "encargado"].includes(me.role);
      const isOficina = me.role === "oficina";
      if (!isAdmin && !isOficina) {
        toast.error("No tienes permiso para crear averías");
        navigate("/breakdowns");
        return;
      }
      const [clientList, userList] = await Promise.all([
        appApi.entities.Client.list("name", 500).catch(() => []),
        appApi.entities.User.list("full_name", 100).catch(() => []),
      ]);
      setClients(clientList || []);
      setUsers((userList || []).filter(u => u.is_active !== false));
      setInitialLoadDone(true);
    } catch {
      toast.error("Error al cargar los datos");
    }
  };

  // ── duplicate detection (runs inside dialog) ──────────────────────────────
  useEffect(() => {
    if (!dialogOpen) return;
    setDuplicates(findDuplicates(clients, draftClient));
    setDupDismissed(false);
  }, [dialogOpen, draftClient.name, draftClient.cif, draftClient.email, draftClient.phone, clients]);

  // ── dialog open/close ─────────────────────────────────────────────────────
  const openDialog = () => {
    // pre-fill draft from existing confirmed data (if re-editing)
    setDraftClient(newClient || EMPTY_NEW_CLIENT);
    setAddCenter(!!newCenter);
    setDraftCenter(newCenter || EMPTY_NEW_CENTER);
    setDuplicates([]);
    setDupDismissed(false);
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  const confirmDialog = () => {
    if (!draftClient.name.trim()) {
      toast.error("El nombre del cliente es obligatorio");
      return;
    }
    if (addCenter && !draftCenter.name.trim()) {
      toast.error("El nombre del centro es obligatorio");
      return;
    }
    if (duplicates.length > 0 && !dupDismissed) {
      toast.error("Revisa los posibles duplicados antes de confirmar");
      return;
    }
    setNewClient({ ...draftClient });
    setNewCenter(addCenter ? { ...draftCenter } : null);
    setDialogOpen(false);
  };

  const clearNewClient = () => {
    setNewClient(null);
    setNewCenter(null);
    setDraftClient(EMPTY_NEW_CLIENT);
    setDraftCenter(EMPTY_NEW_CENTER);
    setAddCenter(false);
  };

  // ── existing client handlers ──────────────────────────────────────────────
  const handleClientChange = useCallback(async (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const [centers, machineList] = await Promise.all([
      appApi.entities.WorkCenter.filter({ client_id: clientId }, "name", 100).catch(() => []),
      appApi.entities.Machine.filter({ client_id: clientId }, "name", 200).catch(() => []),
    ]);
    setWorkCenters(centers || []);
    setMachines((machineList || []).filter(m => m.status !== "retirada"));
    setForm(f => ({
      ...f,
      client_id: client.id, client_name: client.name,
      work_center_id: "", work_center_name: "",
      machine_id: "", machine_name: "",
      contact_phone_snapshot: client.phone || "",
    }));
  }, [clients]);

  const handleWorkCenterChange = (wcId) => {
    const wc = workCenters.find(c => c.id === wcId);
    if (!wc) {
      const client = clients.find(c => c.id === form.client_id);
      setForm(f => ({ ...f, work_center_id: "", work_center_name: "", machine_id: "", machine_name: "", contact_phone_snapshot: client?.phone || "" }));
      return;
    }
    setForm(f => ({
      ...f,
      work_center_id: wc.id, work_center_name: wc.name,
      machine_id: "", machine_name: "",
      contact_phone_snapshot: wc.phone || clients.find(c => c.id === f.client_id)?.phone || "",
    }));
  };

  const handleMachineChange = (machineId) => {
    const m = machines.find(x => x.id === machineId);
    setForm(f => ({ ...f, machine_id: m?.id || "", machine_name: m?.name || "" }));
  };

  // Máquinas del centro elegido (o sin centro asignado); si no hay centro, todas
  const machineOptions = form.work_center_id
    ? machines.filter(m => !m.work_center_id || m.work_center_id === form.work_center_id)
    : machines;

  const handleAssignedUserChange = (userId) => {
    if (!userId || userId === "__none__") {
      setForm(f => ({ ...f, assigned_user_id: "", assigned_user_email: "", assigned_user_name: "" }));
      return;
    }
    const u = users.find(x => x.id === userId);
    if (!u) return;
    setForm(f => ({
      ...f,
      assigned_user_id: u.id,
      assigned_user_email: u.email,
      assigned_user_name: u.full_name || u.email,
    }));
  };

  const mode = newClient ? "new_client" : "existing";

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (mode === "existing" && !form.client_id)          { toast.error("Selecciona un cliente"); return; }
    if (mode === "new_client" && !newClient?.name?.trim()) { toast.error("El nombre del cliente es obligatorio"); return; }
    if (!form.description.trim())                         { toast.error("La descripción de la avería es obligatoria"); return; }

    setSaving(true);
    try {
      if (mode === "new_client") {
        const contactPhone = newCenter?.phone || newClient.phone || "";
        const result = await appApi.breakdowns.createWithClient({
          new_client: { ...newClient },
          new_work_center: newCenter || null,
          breakdown: {
            description: form.description.trim(),
            priority: form.priority,
            client_fault_id: form.client_fault_id?.trim() || undefined,
            contact_phone_snapshot: contactPhone || undefined,
            assigned_user_id: form.assigned_user_id || undefined,
            assigned_user_email: form.assigned_user_email || undefined,
            assigned_user_name: form.assigned_user_name || undefined,
            status: "abierta",
          },
        });
        toast.success(`Avería ${result.breakdown.number} creada`);
        clearDraft();
        navigate(`/breakdowns/${result.breakdown.id}`, { replace: true });
      } else {
        const created = await appApi.breakdowns.create({
          client_id: form.client_id,
          client_name: form.client_name,
          work_center_id: form.work_center_id || undefined,
          work_center_name: form.work_center_name || undefined,
          machine_id: form.machine_id || undefined,
          machine_name: form.machine_name || undefined,
          contact_phone_snapshot: form.contact_phone_snapshot || undefined,
          client_fault_id: form.client_fault_id?.trim() || undefined,
          description: form.description.trim(),
          priority: form.priority,
          assigned_user_id: form.assigned_user_id || undefined,
          assigned_user_email: form.assigned_user_email || undefined,
          assigned_user_name: form.assigned_user_name || undefined,
          status: "abierta",
        });
        toast.success(`Avería ${created.number} creada`);
        clearDraft();
        navigate(`/breakdowns/${created.id}`, { replace: true });
      }
    } catch (err) {
      if (isNetworkError(err)) {
        toast.error(
          "Sin conexión: la avería NO se ha creado. Los datos siguen en pantalla y hay una copia local — reintenta cuando vuelva la cobertura.",
          { duration: 10000 }
        );
      } else {
        toast.error(err?.message || "Error al crear la avería");
      }
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6 pb-28 lg:pb-10">
        <div className="flex items-center gap-3">
          <BackButton label="Averías" />
          <h1 className="text-2xl font-bold tracking-tight">Nueva Avería</h1>
        </div>

        {/* ── Cliente ── */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cliente</h2>

          {/* Caso: cliente nuevo confirmado → chip resumen */}
          {mode === "new_client" && newClient && (
            <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
              <UserPlus className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{newClient.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cliente nuevo
                  {newCenter && <span> · Centro: <span className="font-medium">{newCenter.name}</span></span>}
                  {newClient.phone && <span> · {newClient.phone}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={openDialog}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Editar datos del cliente"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={clearNewClient}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Quitar cliente nuevo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Caso: cliente existente */}
          {mode === "existing" && (
            <>
              <div>
                <Label>Cliente *</Label>
                <div className="mt-1">
                  <ClientSelector clients={clients} selectedId={form.client_id} onChange={handleClientChange} />
                </div>
              </div>

              {form.client_id && (
                <div>
                  <Label>Centro de Trabajo</Label>
                  {workCenters.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground px-3 py-2 rounded-xl border border-dashed border-border">
                      Este cliente no tiene centros registrados.
                    </p>
                  ) : (
                    <select
                      value={form.work_center_id}
                      onChange={e => handleWorkCenterChange(e.target.value)}
                      className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Sin centro específico —</option>
                      {workCenters.map(wc => (
                        <option key={wc.id} value={wc.id}>
                          {wc.name}{wc.address ? ` · ${wc.address}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {form.client_id && machineOptions.length > 0 && (
                <div>
                  <Label>Máquina</Label>
                  <select
                    value={form.machine_id}
                    onChange={e => handleMachineChange(e.target.value)}
                    className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— Sin máquina específica —</option>
                    {machineOptions.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.model ? ` · ${m.model}` : ""}{m.work_center_name ? ` · ${m.work_center_name}` : ""}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const selected = machines.find(m => m.id === form.machine_id);
                    if (!selected?.central_machine_name) return null;
                    return (
                      <p className="mt-1.5 text-xs text-accent">
                        ⚠ Conectada a la central: <strong>{selected.central_machine_name}</strong> — si el problema es de temperatura/rendimiento, revisa también la central.
                      </p>
                    );
                  })()}
                </div>
              )}

              {form.contact_phone_snapshot && (
                <div>
                  <Label>Teléfono de contacto</Label>
                  <Input
                    value={form.contact_phone_snapshot}
                    onChange={e => setForm(f => ({ ...f, contact_phone_snapshot: e.target.value }))}
                    placeholder="Teléfono"
                    className="mt-1 rounded-xl"
                  />
                </div>
              )}
            </>
          )}

          {/* Botón crear cliente nuevo (siempre visible si no hay cliente nuevo confirmado) */}
          {mode === "existing" && (
            <button
              type="button"
              onClick={openDialog}
              className="flex items-center gap-2 text-xs text-accent hover:text-accent/80 font-medium transition-colors py-1"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Crear cliente nuevo
            </button>
          )}

          <div>
            <Label>ID Avería Cliente</Label>
            <Input
              value={form.client_fault_id}
              onChange={e => setForm(f => ({ ...f, client_fault_id: e.target.value }))}
              placeholder="Referencia interna del cliente (opcional)"
              className="mt-1 rounded-xl"
            />
          </div>
        </div>

        {/* ── Detalle ── */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Detalle</h2>
          <div>
            <Label>Descripción *</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe la avería..."
              rows={4}
              className="mt-1 rounded-xl"
            />
          </div>
          <div>
            <Label>Prioridad</Label>
            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baja">Baja</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Asignación ── */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Asignación</h2>
          <div>
            <Label>Asignar a técnico</Label>
            <select
              value={form.assigned_user_id || "__none__"}
              onChange={e => handleAssignedUserChange(e.target.value)}
              className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="__none__">— Sin asignar —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}{u.role ? ` (${u.role})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Botón de acción — en el flujo, sin fixed ── */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-8 h-12 text-base shadow-lg shadow-accent/25"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Crear Avería
          </Button>
        </div>
      </div>

      {/* ── Dialog: nuevo cliente ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-accent" />
              {newClient ? "Editar datos del cliente" : "Nuevo cliente"}
            </DialogTitle>
          </DialogHeader>

          {/* scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <NewClientForm data={draftClient} onChange={setDraftClient} />

            {/* Aviso duplicados */}
            {duplicates.length > 0 && !dupDismissed && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Posible cliente duplicado</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {duplicates.length === 1 ? "Ya existe 1 cliente parecido." : `Ya existen ${duplicates.length} clientes parecidos.`} Revisa antes de crear uno nuevo.
                    </p>
                  </div>
                </div>
                <ul className="space-y-1 ml-6">
                  {duplicates.map(c => (
                    <li key={c.id} className="text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-medium">{c.name}</span>
                      {c.cif   && <span className="opacity-70"> · {c.cif}</span>}
                      {c.phone && <span className="opacity-70"> · {c.phone}</span>}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDupDismissed(true)}
                  className="ml-6 rounded-lg text-xs h-7 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                >
                  Continuar de todos modos
                </Button>
              </div>
            )}

            {/* Centro de trabajo colapsable */}
            <div className="border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setAddCenter(v => !v)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors",
                  addCenter ? "bg-muted/60" : "hover:bg-muted/30"
                )}
              >
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Añadir centro de trabajo
                  <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </span>
                {addCenter
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {addCenter && (
                <div className="p-4 border-t border-border bg-muted/20">
                  <NewCenterForm data={draftCenter} onChange={setDraftCenter} />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 flex flex-row gap-2 justify-end">
            <Button type="button" variant="outline" onClick={closeDialog} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmDialog}
              className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              Confirmar datos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
