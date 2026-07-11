import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, History, Snowflake } from "lucide-react";
import MachineHistory from "./MachineHistory";

export const MACHINE_TYPES = {
  camara: "Cámara frigorífica",
  vitrina: "Vitrina",
  compresor: "Compresor",
  clima: "Climatización",
  central_frio: "Central de Frío",
  otro: "Otro",
};

const emptyMachine = {
  name: "", machine_type: "otro", work_center_id: "",
  installation_mode: "autonoma", central_machine_id: "", central_machine_name: "",
  brand: "", model: "", serial_number: "",
  gas_type: "", gas_charge_kg: "",
  condenser_brand: "", condenser_model: "", condenser_serial_number: "",
  has_desuperheater: false,
  desuperheater_brand: "", desuperheater_model: "", desuperheater_serial_number: "",
  installed_at: "", warranty_until: "",
  location_notes: "", status: "activa", notes: "",
};

function machineValidationError(form) {
  if (!form.name?.trim()) return "El nombre es obligatorio.";
  if (form.machine_type === "central_frio") {
    if (!form.model?.trim() || !form.serial_number?.trim()) {
      return "La central de frío requiere modelo y nº de serie propios.";
    }
    if (!form.condenser_model?.trim() || !form.condenser_serial_number?.trim()) {
      const label = form.gas_type === "R744" ? "gas cooler" : "condensador";
      return `Indica modelo y nº de serie del ${label}.`;
    }
    if (form.has_desuperheater && (!form.desuperheater_model?.trim() || !form.desuperheater_serial_number?.trim())) {
      return "Indica modelo y nº de serie del desrecalentador, o desmarca la casilla si no lleva.";
    }
  } else if (form.installation_mode === "a_distancia" && !form.central_machine_id) {
    return "Selecciona la central de frío a la que está conectada, o márcala como autónoma.";
  }
  return null;
}

export default function MachinesInline({ client }) {
  const [machines, setMachines] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyMachine });
  const [saving, setSaving] = useState(false);
  const [historyMachine, setHistoryMachine] = useState(null);
  const [machineToDelete, setMachineToDelete] = useState(null);
  const [showRetired, setShowRetired] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (client?.id) loadMachines();
  }, [client?.id]);

  const loadMachines = async () => {
    setLoading(true);
    const [items, centers] = await Promise.all([
      appApi.entities.Machine.filter({ client_id: client.id }, "name", 200).catch(() => []),
      appApi.entities.WorkCenter.filter({ client_id: client.id }, "name", 100).catch(() => []),
    ]);
    setMachines(items || []);
    setWorkCenters(centers || []);
    setLoading(false);
  };

  const centrales = machines.filter(m => m.machine_type === "central_frio" && m.status !== "retirada");

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyMachine });
    setSaveError(null);
    setDialogOpen(true);
  };

  const openNewCentral = () => {
    setEditing(null);
    setForm({ ...emptyMachine, machine_type: "central_frio", work_center_id: form.work_center_id });
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({ ...emptyMachine, ...m, gas_charge_kg: m.gas_charge_kg ?? "" });
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const error = machineValidationError(form);
    if (error) {
      setSaveError(error);
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const center = workCenters.find(wc => wc.id === form.work_center_id);
      const isCentral = form.machine_type === "central_frio";
      const isRemote = !isCentral && form.installation_mode === "a_distancia";
      const central = isRemote ? centrales.find(c => c.id === form.central_machine_id) : null;
      const data = {
        ...form,
        client_id: client.id,
        client_name: client.name,
        work_center_id: form.work_center_id || "",
        work_center_name: center?.name || "",
        installation_mode: isCentral ? undefined : form.installation_mode,
        central_machine_id: isRemote ? form.central_machine_id : "",
        central_machine_name: isRemote ? (central?.name || "") : "",
        condenser_brand: isCentral ? form.condenser_brand : undefined,
        condenser_model: isCentral ? form.condenser_model : undefined,
        condenser_serial_number: isCentral ? form.condenser_serial_number : undefined,
        has_desuperheater: isCentral ? !!form.has_desuperheater : undefined,
        desuperheater_brand: (isCentral && form.has_desuperheater) ? form.desuperheater_brand : undefined,
        desuperheater_model: (isCentral && form.has_desuperheater) ? form.desuperheater_model : undefined,
        desuperheater_serial_number: (isCentral && form.has_desuperheater) ? form.desuperheater_serial_number : undefined,
        gas_charge_kg: form.gas_charge_kg === "" ? undefined : parseFloat(form.gas_charge_kg) || 0,
        updated_at: new Date().toISOString(),
        ...(editing ? {} : { created_at: new Date().toISOString() }),
      };
      if (editing) {
        await appApi.entities.Machine.update(editing.id, data);
      } else {
        await appApi.entities.Machine.create(data);
      }
      setDialogOpen(false);
      loadMachines();
    } finally {
      setSaving(false);
    }
  };

  const active = machines.filter(m => m.status !== "retirada");
  const retired = machines.filter(m => m.status === "retirada");
  const visible = showRetired ? [...active, ...retired] : active;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Snowflake className="h-3.5 w-3.5" /> Máquinas ({active.length})
        </p>
        <Button variant="ghost" size="sm" onClick={openNew} className="h-7 text-xs rounded-lg gap-1 text-accent hover:bg-accent/10">
          <Plus className="h-3 w-3" /> Añadir
        </Button>
      </div>

      {loading ? (
        <div className="h-8 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : machines.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-2">Sin máquinas registradas</p>
      ) : (
        <div className="space-y-2">
          {visible.map(m => (
            <div key={m.id} className={`bg-muted/40 rounded-xl p-3 flex items-start justify-between gap-2 ${m.status === "retirada" ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{MACHINE_TYPES[m.machine_type] || "Otro"}</Badge>
                  {m.status === "retirada" && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-slate-200 text-slate-600">Retirada</Badge>
                  )}
                </div>
                {(m.brand || m.model || m.serial_number) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {[m.brand, m.model].filter(Boolean).join(" ")}
                    {m.serial_number && ` · SN ${m.serial_number}`}
                  </p>
                )}
                {(m.gas_type || m.gas_charge_kg > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {m.gas_type}{m.gas_charge_kg > 0 && ` · ${m.gas_charge_kg} kg`}
                  </p>
                )}
                {m.machine_type === "central_frio" && (m.condenser_model || m.condenser_serial_number) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {m.gas_type === "R744" ? "Gas Cooler" : "Condensador"}: {[m.condenser_brand, m.condenser_model].filter(Boolean).join(" ")}
                    {m.condenser_serial_number && ` · SN ${m.condenser_serial_number}`}
                  </p>
                )}
                {m.machine_type === "central_frio" && m.has_desuperheater && (
                  <p className="text-xs text-muted-foreground truncate">
                    Desrecalentador: {[m.desuperheater_brand, m.desuperheater_model].filter(Boolean).join(" ")}
                    {m.desuperheater_serial_number && ` · SN ${m.desuperheater_serial_number}`}
                  </p>
                )}
                {m.installation_mode === "a_distancia" && m.central_machine_name && (
                  <p className="text-xs text-accent truncate">→ Central: {m.central_machine_name}</p>
                )}
                {m.work_center_name && (
                  <p className="text-xs text-muted-foreground truncate">{m.work_center_name}</p>
                )}
                {m.location_notes && (
                  <p className="text-xs text-muted-foreground italic truncate">{m.location_notes}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-accent" onClick={() => setHistoryMachine(m)} title="Ver historial">
                  <History className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(m)} title="Editar">
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:text-destructive" onClick={() => setMachineToDelete(m)} title="Eliminar">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {retired.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRetired(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline block mx-auto"
            >
              {showRetired ? "Ocultar retiradas" : `Ver ${retired.length} retirada${retired.length > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      )}

      <MachineHistory
        machine={historyMachine}
        open={!!historyMachine}
        onClose={() => setHistoryMachine(null)}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Máquina" : "Nueva Máquina"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Cliente: <strong>{client.name}</strong>
            </p>
            <div>
              <Label>Nombre / Alias *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 rounded-xl" placeholder="Ej: Cámara congelados almacén" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <select
                  value={form.machine_type}
                  onChange={e => setForm(f => ({ ...f, machine_type: e.target.value }))}
                  className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {Object.entries(MACHINE_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Centro de Trabajo</Label>
                <select
                  value={form.work_center_id}
                  onChange={e => setForm(f => ({ ...f, work_center_id: e.target.value }))}
                  className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Sin centro —</option>
                  {workCenters.map(wc => (
                    <option key={wc.id} value={wc.id}>{wc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {form.machine_type !== "central_frio" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Instalación</Label>
                  <select
                    value={form.installation_mode || "autonoma"}
                    onChange={e => setForm(f => ({ ...f, installation_mode: e.target.value, central_machine_id: "", central_machine_name: "" }))}
                    className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="autonoma">Autónoma</option>
                    <option value="a_distancia">A distancia (central)</option>
                  </select>
                </div>
                {form.installation_mode === "a_distancia" && (
                  <div>
                    <Label>Central de Frío</Label>
                    <select
                      value={form.central_machine_id || ""}
                      onChange={e => {
                        const c = centrales.find(x => x.id === e.target.value);
                        setForm(f => ({ ...f, central_machine_id: c?.id || "", central_machine_name: c?.name || "" }));
                      }}
                      className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Elegir —</option>
                      {centrales.map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.model ? ` · ${c.model}` : ""}</option>
                      ))}
                    </select>
                    {centrales.length === 0 && (
                      <button type="button" onClick={openNewCentral} className="mt-1 text-xs text-accent hover:underline">
                        No hay centrales dadas de alta — crear una ahora
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marca</Label>
                <Input value={form.brand || ""} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Modelo{form.machine_type === "central_frio" ? " *" : ""}</Label>
                <Input value={form.model || ""} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div>
              <Label>Nº de Serie{form.machine_type === "central_frio" ? " *" : ""}</Label>
              <Input value={form.serial_number || ""} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} className="mt-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gas Refrigerante</Label>
                <Input value={form.gas_type || ""} onChange={e => setForm(f => ({ ...f, gas_type: e.target.value }))} className="mt-1 rounded-xl" placeholder="R-448A" />
              </div>
              <div>
                <Label>Carga de Gas (kg)</Label>
                <Input type="number" step="0.1" min="0" value={form.gas_charge_kg} onChange={e => setForm(f => ({ ...f, gas_charge_kg: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>

            {form.machine_type === "central_frio" && (
              <div className="rounded-xl border border-dashed border-border p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {form.gas_type === "R744" ? "Gas Cooler" : "Condensador"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Marca</Label>
                    <Input value={form.condenser_brand || ""} onChange={e => setForm(f => ({ ...f, condenser_brand: e.target.value }))} className="mt-1 rounded-xl" />
                  </div>
                  <div>
                    <Label>Modelo *</Label>
                    <Input value={form.condenser_model || ""} onChange={e => setForm(f => ({ ...f, condenser_model: e.target.value }))} className="mt-1 rounded-xl" />
                  </div>
                </div>
                <div>
                  <Label>Nº de Serie *</Label>
                  <Input value={form.condenser_serial_number || ""} onChange={e => setForm(f => ({ ...f, condenser_serial_number: e.target.value }))} className="mt-1 rounded-xl" />
                </div>

                <label className="flex items-center gap-2 text-sm pt-1">
                  <input
                    type="checkbox"
                    checked={!!form.has_desuperheater}
                    onChange={e => setForm(f => ({ ...f, has_desuperheater: e.target.checked }))}
                    className="rounded border-input"
                  />
                  Incorpora desrecalentador / recuperador de calor
                </label>

                {form.has_desuperheater && (
                  <div className="space-y-3 pt-1 border-t border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Marca Desrecalentador</Label>
                        <Input value={form.desuperheater_brand || ""} onChange={e => setForm(f => ({ ...f, desuperheater_brand: e.target.value }))} className="mt-1 rounded-xl" />
                      </div>
                      <div>
                        <Label>Modelo *</Label>
                        <Input value={form.desuperheater_model || ""} onChange={e => setForm(f => ({ ...f, desuperheater_model: e.target.value }))} className="mt-1 rounded-xl" />
                      </div>
                    </div>
                    <div>
                      <Label>Nº de Serie *</Label>
                      <Input value={form.desuperheater_serial_number || ""} onChange={e => setForm(f => ({ ...f, desuperheater_serial_number: e.target.value }))} className="mt-1 rounded-xl" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha Instalación</Label>
                <Input type="date" value={form.installed_at || ""} onChange={e => setForm(f => ({ ...f, installed_at: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Fin de Garantía</Label>
                <Input type="date" value={form.warranty_until || ""} onChange={e => setForm(f => ({ ...f, warranty_until: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div>
              <Label>Ubicación en el Local</Label>
              <Input value={form.location_notes || ""} onChange={e => setForm(f => ({ ...f, location_notes: e.target.value }))} className="mt-1 rounded-xl" placeholder="Ej: trastienda, junto al muelle" />
            </div>
            {editing && (
              <div>
                <Label>Estado</Label>
                <select
                  value={form.status || "activa"}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="activa">Activa</option>
                  <option value="retirada">Retirada</option>
                </select>
              </div>
            )}
            <div>
              <Label>Notas</Label>
              <Textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 rounded-xl" placeholder="Acceso, llaves, observaciones..." />
            </div>
            {saveError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.name?.trim()} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Máquina"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        icon={null}
        open={!!machineToDelete}
        onOpenChange={(open) => {
          if (!open) setMachineToDelete(null);
        }}
        title="Eliminar máquina"
        description={
          <>
            Vas a eliminar <strong>{machineToDelete?.name}</strong>.
          </>
        }
        note="Si la máquina se ha sustituido o retirado pero quieres conservar su historial, edítala y márcala como «Retirada» en vez de eliminarla."
        confirmText="Eliminar máquina"
        variant="danger"
        onConfirm={async () => {
          if (!machineToDelete) return;
          await appApi.entities.Machine.delete(machineToDelete.id);
          setMachineToDelete(null);
          await loadMachines();
        }}
      />
    </div>
  );
}
