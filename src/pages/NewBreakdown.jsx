import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import BackButton from "../components/BackButton";
import ClientSelector from "../components/ClientSelector";

export default function NewBreakdown() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    client_name: "",
    work_center_id: "",
    work_center_name: "",
    contact_phone_snapshot: "",
    client_fault_id: "",
    description: "",
    priority: "media",
    assigned_user_id: "",
    assigned_user_email: "",
    assigned_user_name: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [me, clientList, userList] = await Promise.all([
      appApi.auth.me(),
      appApi.entities.Client.list("name", 500).catch(() => []),
      appApi.entities.User.list("full_name", 100).catch(() => []),
    ]);
    setUser(me);
    setClients(clientList || []);
    setUsers((userList || []).filter(u => u.is_active !== false));

    const isAdmin = me.role === "admin" || me.role === "superadmin" || me.role === "encargado";
    const isOficina = me.role === "oficina";
    if (!isAdmin && !isOficina) {
      toast.error("No tienes permiso para crear averías");
      navigate("/breakdowns");
    }
  };

  const handleClientChange = async (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const centers = await appApi.entities.WorkCenter.filter(
      { client_id: clientId },
      "name",
      100
    ).catch(() => []);
    setWorkCenters(centers || []);

    setForm(f => ({
      ...f,
      client_id: client.id,
      client_name: client.name,
      work_center_id: "",
      work_center_name: "",
      contact_phone_snapshot: client.phone || "",
    }));
  };

  const handleWorkCenterChange = (wcId) => {
    const wc = workCenters.find(c => c.id === wcId);
    if (!wc) {
      const client = clients.find(c => c.id === form.client_id);
      setForm(f => ({
        ...f,
        work_center_id: "",
        work_center_name: "",
        contact_phone_snapshot: client?.phone || "",
      }));
      return;
    }
    setForm(f => ({
      ...f,
      work_center_id: wc.id,
      work_center_name: wc.name,
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

  const handleSave = async () => {
    if (!form.client_id) {
      toast.error("El cliente es obligatorio");
      return;
    }
    if (!form.description.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }

    setSaving(true);
    try {
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
    } catch (err) {
      toast.error(err?.message || "Error al crear la avería");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6 pb-32">
      <div className="flex items-center gap-3">
        <BackButton label="Averías" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva Avería</h1>
      </div>

      {/* Cliente y Centro */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cliente</h2>

        <div>
          <Label>Cliente *</Label>
          <div className="mt-1">
            <ClientSelector
              clients={clients}
              selectedId={form.client_id}
              onChange={handleClientChange}
            />
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

      {/* Descripción y prioridad */}
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
          <Select
            value={form.priority}
            onValueChange={v => setForm(f => ({ ...f, priority: v }))}
          >
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

      {/* Asignación */}
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
                {u.full_name || u.email}
                {u.role ? ` (${u.role})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Save */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4 pb-20 lg:pb-4">
        <div className="max-w-2xl mx-auto flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || !form.client_id || !form.description.trim()}
            className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-8 h-12 text-base shadow-lg shadow-accent/25"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Crear Avería
          </Button>
        </div>
      </div>
    </div>
  );
}
