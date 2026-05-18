import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Plus, X, UserPlus, AlertTriangle, Building2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import BackButton from "../components/BackButton";
import ClientSelector from "../components/ClientSelector";

// ─── helpers ─────────────────────────────────────────────────────────────────

const EMPTY_NEW_CLIENT = {
  name: "", cif: "", phone: "", email: "",
  contact_person: "", address: "", city: "", postal_code: "", notes: "",
};

const EMPTY_NEW_CENTER = {
  name: "", phone: "", contact_person: "",
  address: "", city: "", postal_code: "", email: "", notes: "",
};

function normalize(str) {
  return (str || "").trim().toLowerCase();
}

function findDuplicates(clients, nc) {
  const name = normalize(nc.name);
  const cif  = normalize(nc.cif);
  const email = normalize(nc.email);
  const phone = normalize(nc.phone);

  return clients.filter((c) => {
    if (cif  && normalize(c.cif)   === cif)   return true;
    if (email && normalize(c.email) === email)  return true;
    if (phone && normalize(c.phone) === phone)  return true;
    if (name.length >= 3 && normalize(c.name).includes(name)) return true;
    return false;
  });
}

// ─── sub-forms ────────────────────────────────────────────────────────────────

function FieldRow({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function FormField({ label, children, optional = false }) {
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

function inputCls() {
  return "rounded-xl text-sm h-9";
}

function NewClientForm({ data, onChange }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value });
  return (
    <div className="space-y-3">
      <FormField label="Nombre del cliente *">
        <Input value={data.name} onChange={set("name")} placeholder="Empresa S.L." className={inputCls()} autoFocus />
      </FormField>

      <FieldRow>
        <FormField label="CIF/NIF" optional>
          <Input value={data.cif} onChange={set("cif")} placeholder="B12345678" className={inputCls()} />
        </FormField>
        <FormField label="Teléfono">
          <Input value={data.phone} onChange={set("phone")} placeholder="600 000 000" className={inputCls()} />
        </FormField>
      </FieldRow>

      <FieldRow>
        <FormField label="Email" optional>
          <Input value={data.email} onChange={set("email")} type="email" placeholder="info@empresa.com" className={inputCls()} />
        </FormField>
        <FormField label="Persona de contacto" optional>
          <Input value={data.contact_person} onChange={set("contact_person")} placeholder="Nombre Apellido" className={inputCls()} />
        </FormField>
      </FieldRow>

      <FormField label="Dirección" optional>
        <Input value={data.address} onChange={set("address")} placeholder="Calle Mayor 1" className={inputCls()} />
      </FormField>

      <FieldRow>
        <FormField label="Ciudad" optional>
          <Input value={data.city} onChange={set("city")} placeholder="Barcelona" className={inputCls()} />
        </FormField>
        <FormField label="Código postal" optional>
          <Input value={data.postal_code} onChange={set("postal_code")} placeholder="08001" className={inputCls()} />
        </FormField>
      </FieldRow>

      <FormField label="Notas" optional>
        <Textarea value={data.notes} onChange={set("notes")} placeholder="Notas internas del cliente" rows={2} className="rounded-xl text-sm" />
      </FormField>
    </div>
  );
}

function NewCenterForm({ data, onChange }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value });
  return (
    <div className="space-y-3">
      <FormField label="Nombre del centro *">
        <Input value={data.name} onChange={set("name")} placeholder="Sede central / Planta A" className={inputCls()} />
      </FormField>

      <FieldRow>
        <FormField label="Teléfono" optional>
          <Input value={data.phone} onChange={set("phone")} placeholder="600 000 000" className={inputCls()} />
        </FormField>
        <FormField label="Persona de contacto" optional>
          <Input value={data.contact_person} onChange={set("contact_person")} placeholder="Nombre Apellido" className={inputCls()} />
        </FormField>
      </FieldRow>

      <FormField label="Dirección" optional>
        <Input value={data.address} onChange={set("address")} placeholder="Calle Mayor 1" className={inputCls()} />
      </FormField>

      <FieldRow>
        <FormField label="Ciudad" optional>
          <Input value={data.city} onChange={set("city")} placeholder="Barcelona" className={inputCls()} />
        </FormField>
        <FormField label="Código postal" optional>
          <Input value={data.postal_code} onChange={set("postal_code")} placeholder="08001" className={inputCls()} />
        </FormField>
      </FieldRow>

      <FieldRow>
        <FormField label="Email" optional>
          <Input value={data.email} onChange={set("email")} type="email" placeholder="centro@empresa.com" className={inputCls()} />
        </FormField>
        <FormField label="Notas" optional>
          <Input value={data.notes} onChange={set("notes")} placeholder="Notas del centro" className={inputCls()} />
        </FormField>
      </FieldRow>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function NewBreakdown() {
  const navigate = useNavigate();

  const [user, setUser]         = useState(null);
  const [clients, setClients]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [saving, setSaving]     = useState(false);

  // Existing-client form fields
  const [form, setForm] = useState({
    client_id: "", client_name: "",
    work_center_id: "", work_center_name: "",
    contact_phone_snapshot: "",
    client_fault_id: "",
    description: "",
    priority: "media",
    assigned_user_id: "", assigned_user_email: "", assigned_user_name: "",
  });

  // New-client mode
  const [mode, setMode]               = useState("existing"); // "existing" | "new_client"
  const [newClient, setNewClient]     = useState(EMPTY_NEW_CLIENT);
  const [addCenter, setAddCenter]     = useState(false);
  const [newCenter, setNewCenter]     = useState(EMPTY_NEW_CENTER);
  const [duplicates, setDuplicates]   = useState([]);
  const [dupDismissed, setDupDismissed] = useState(false);

  // ── load ──
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const me = await appApi.auth.me();
      setUser(me);

      const isAdmin   = me.role === "admin" || me.role === "superadmin" || me.role === "encargado";
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
    } catch {
      toast.error("Error al cargar los datos");
    }
  };

  // ── duplicate detection ──
  useEffect(() => {
    if (mode !== "new_client") { setDuplicates([]); return; }
    setDuplicates(findDuplicates(clients, newClient));
    setDupDismissed(false);
  }, [mode, newClient.name, newClient.cif, newClient.email, newClient.phone, clients]);

  // ── mode switch ──
  const switchToNewClient = () => {
    setMode("new_client");
    setForm(f => ({ ...f, client_id: "", client_name: "", work_center_id: "", work_center_name: "", contact_phone_snapshot: "" }));
    setWorkCenters([]);
    setNewClient(EMPTY_NEW_CLIENT);
    setAddCenter(false);
    setNewCenter(EMPTY_NEW_CENTER);
    setDuplicates([]);
    setDupDismissed(false);
  };

  const switchToExisting = () => {
    setMode("existing");
    setNewClient(EMPTY_NEW_CLIENT);
    setAddCenter(false);
    setNewCenter(EMPTY_NEW_CENTER);
    setDuplicates([]);
    setDupDismissed(false);
  };

  // ── existing client handlers ──
  const handleClientChange = useCallback(async (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const centers = await appApi.entities.WorkCenter.filter({ client_id: clientId }, "name", 100).catch(() => []);
    setWorkCenters(centers || []);
    setForm(f => ({
      ...f,
      client_id: client.id, client_name: client.name,
      work_center_id: "", work_center_name: "",
      contact_phone_snapshot: client.phone || "",
    }));
  }, [clients]);

  const handleWorkCenterChange = (wcId) => {
    const wc = workCenters.find(c => c.id === wcId);
    if (!wc) {
      const client = clients.find(c => c.id === form.client_id);
      setForm(f => ({ ...f, work_center_id: "", work_center_name: "", contact_phone_snapshot: client?.phone || "" }));
      return;
    }
    setForm(f => ({
      ...f,
      work_center_id: wc.id, work_center_name: wc.name,
      contact_phone_snapshot: wc.phone || clients.find(c => c.id === f.client_id)?.phone || "",
    }));
  };

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

  // ── validation ──
  const isExistingReady = mode === "existing" && !!form.client_id && !!form.description.trim();
  const isNewClientReady = mode === "new_client" && !!newClient.name.trim() && !!form.description.trim() &&
    (!addCenter || !!newCenter.name.trim()) &&
    (duplicates.length === 0 || dupDismissed);
  const canSubmit = isExistingReady || isNewClientReady;

  // ── save ──
  const handleSave = async () => {
    if (!form.description.trim()) { toast.error("La descripción es obligatoria"); return; }

    if (mode === "new_client") {
      if (!newClient.name.trim()) { toast.error("El nombre del cliente es obligatorio"); return; }
      if (addCenter && !newCenter.name.trim()) { toast.error("El nombre del centro es obligatorio"); return; }
      if (duplicates.length > 0 && !dupDismissed) {
        toast.error("Revisa los posibles duplicados antes de continuar");
        return;
      }
    } else {
      if (!form.client_id) { toast.error("El cliente es obligatorio"); return; }
    }

    setSaving(true);
    try {
      if (mode === "new_client") {
        const contactPhone = addCenter
          ? (newCenter.phone || newClient.phone || "")
          : (newClient.phone || "");

        const result = await appApi.breakdowns.createWithClient({
          new_client: { ...newClient },
          new_work_center: addCenter ? { ...newCenter } : null,
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
        navigate(`/breakdowns/${result.breakdown.id}`);
      } else {
        const payload = {
          client_id: form.client_id,
          client_name: form.client_name,
          work_center_id: form.work_center_id || undefined,
          work_center_name: form.work_center_name || undefined,
          contact_phone_snapshot: form.contact_phone_snapshot || undefined,
          client_fault_id: form.client_fault_id?.trim() || undefined,
          description: form.description.trim(),
          priority: form.priority,
          assigned_user_id: form.assigned_user_id || undefined,
          assigned_user_email: form.assigned_user_email || undefined,
          assigned_user_name: form.assigned_user_name || undefined,
          status: "abierta",
        };
        const created = await appApi.breakdowns.create(payload);
        toast.success(`Avería ${created.number} creada`);
        navigate(`/breakdowns/${created.id}`);
      }
    } catch (err) {
      toast.error(err?.message || "Error al crear la avería");
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6 pb-32">
      <div className="flex items-center gap-3">
        <BackButton label="Averías" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva Avería</h1>
      </div>

      {/* ── Cliente ── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cliente</h2>
          {mode === "existing" ? (
            <button
              type="button"
              onClick={switchToNewClient}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 font-medium transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Crear cliente nuevo
            </button>
          ) : (
            <button
              type="button"
              onClick={switchToExisting}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Usar cliente existente
            </button>
          )}
        </div>

        {/* Modo: cliente existente */}
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

        {/* Modo: cliente nuevo */}
        {mode === "new_client" && (
          <>
            <div className="bg-muted/40 rounded-xl p-4 border border-border/60">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="h-4 w-4 text-accent" />
                <span className="text-sm font-semibold">Datos del nuevo cliente</span>
              </div>
              <NewClientForm data={newClient} onChange={setNewClient} />
            </div>

            {/* Aviso de duplicados */}
            {duplicates.length > 0 && !dupDismissed && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Posible cliente duplicado
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Ya existe{duplicates.length > 1 ? "n" : ""} {duplicates.length} cliente{duplicates.length > 1 ? "s" : ""} parecido{duplicates.length > 1 ? "s" : ""}. Revisa antes de crear uno nuevo.
                    </p>
                  </div>
                </div>
                <ul className="space-y-1 ml-6">
                  {duplicates.map(c => (
                    <li key={c.id} className="text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-medium">{c.name}</span>
                      {c.cif   && <span className="text-amber-600 dark:text-amber-500"> · {c.cif}</span>}
                      {c.phone && <span className="text-amber-600 dark:text-amber-500"> · {c.phone}</span>}
                      {c.email && <span className="text-amber-600 dark:text-amber-500"> · {c.email}</span>}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDupDismissed(true)}
                  className="ml-6 rounded-lg text-xs h-7 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                >
                  Continuar de todos modos
                </Button>
              </div>
            )}

            {/* Centro de trabajo opcional */}
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
                {addCenter ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {addCenter && (
                <div className="p-4 border-t border-border bg-muted/20">
                  <NewCenterForm data={newCenter} onChange={setNewCenter} />
                </div>
              )}
            </div>
          </>
        )}

        {/* ID cliente — siempre visible */}
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
            <SelectTrigger className="mt-1 rounded-xl">
              <SelectValue />
            </SelectTrigger>
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

      {/* ── Save bar ── */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4 pb-20 lg:pb-4">
        <div className="max-w-2xl mx-auto flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || !canSubmit}
            className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-8 h-12 text-base shadow-lg shadow-accent/25"
          >
            {saving
              ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
              : <Save className="h-5 w-5 mr-2" />}
            Crear Avería
          </Button>
        </div>
      </div>
    </div>
  );
}
