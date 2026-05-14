import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Plus, Phone, Pencil, Trash2, Building, History } from "lucide-react";
import WorkCenterHistory from "./WorkCenterHistory";
import MapLink from "./MapLink";
import { validatePostalCode } from "@/lib/spanishPostalCodes";
import { AddressAutocomplete } from "./AddressAutocomplete";

const emptyCenter = {
  name: "", address: "", city: "", postal_code: "",
  contact_person: "", phone: "", email: "", notes: "", is_active: true,
};

export default function WorkCentersInline({ client, readOnly = false }) {
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyCenter });
  const [saving, setSaving] = useState(false);
  const [historyCenter, setHistoryCenter] = useState(null);
  const [centerToDelete, setCenterToDelete] = useState(null);

  useEffect(() => {
    if (client?.id) loadCenters();
  }, [client?.id]);

  const loadCenters = async () => {
    setLoading(true);
    const items = await appApi.entities.WorkCenter.filter({ client_id: client.id }, "name", 100);
    setCenters(items);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyCenter });
    setDialogOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ ...c });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, client_id: client.id, client_name: client.name };
    if (editing) {
      await appApi.entities.WorkCenter.update(editing.id, data);
    } else {
      await appApi.entities.WorkCenter.create(data);
    }
    setSaving(false);
    setDialogOpen(false);
    loadCenters();
  };

  const handleDelete = (center) => {
    setCenterToDelete(center);
  };

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Building className="h-3.5 w-3.5" /> Centros de Trabajo ({centers.length})
        </p>
        {!readOnly && (
          <Button variant="ghost" size="sm" onClick={openNew} className="h-7 text-xs rounded-lg gap-1 text-accent hover:bg-accent/10">
            <Plus className="h-3 w-3" /> Añadir
          </Button>
        )}
      </div>

      {loading ? (
        <div className="h-8 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : centers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-2">Sin centros registrados</p>
      ) : (
        <div className="space-y-2">
          {centers.map(c => (
            <div key={c.id} className="bg-muted/40 rounded-xl p-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-medium truncate">{c.name}</p>
                {c.address && (
                  <MapLink address={`${c.address}${c.postal_code ? ", " + c.postal_code : ""}${c.city ? ", " + c.city : ""}`} className="text-xs" />
                )}
                {c.contact_person && (
                  <p className="text-xs text-muted-foreground">{c.contact_person}</p>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" />{c.phone}
                  </a>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-accent" onClick={() => setHistoryCenter(c)} title="Ver historial">
                  <History className="h-3 w-3" />
                </Button>
                {!readOnly && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(c)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:text-destructive" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <WorkCenterHistory
        center={historyCenter}
        open={!!historyCenter}
        onClose={() => setHistoryCenter(null)}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Centro" : "Nuevo Centro de Trabajo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Cliente: <strong>{client.name}</strong>
            </p>
            <div>
              <Label>Nombre del Centro *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 rounded-xl" placeholder="Ej: Supermercado Central, Sede Madrid..." />
            </div>
            <div>
              <Label>Dirección</Label>
              <AddressAutocomplete
                value={form.address || ""}
                onChange={(v) => setForm(f => ({ ...f, address: v }))}
                onPick={(s) => setForm(f => ({
                  ...f,
                  address: s.address_line1 || f.address,
                  ...(s.city ? { city: s.city } : {}),
                  ...(s.postal_code ? { postal_code: s.postal_code } : {}),
                }))}
                className="mt-1 rounded-xl"
                placeholder="Calle Mayor 1, Madrid..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ciudad</Label>
                <Input value={form.city || ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Código Postal</Label>
                {(() => {
                  const cpResult = validatePostalCode(form.postal_code);
                  return (
                    <>
                      <Input value={form.postal_code || ""} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} className="mt-1 rounded-xl" />
                      {cpResult.valid === true && (
                        <p className="text-xs mt-1 text-muted-foreground">{cpResult.message}</p>
                      )}
                      {cpResult.valid === false && (
                        <p className="text-xs mt-1 text-destructive">{cpResult.message}</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <div>
              <Label>Persona de Contacto</Label>
              <Input value={form.contact_person || ""} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} className="mt-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 rounded-xl" placeholder="Horarios, acceso, etc." />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.name} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Centro"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        icon={null}
        open={!!centerToDelete}
        onOpenChange={(open) => {
          if (!open) setCenterToDelete(null);
        }}
        title="Eliminar centro de trabajo"
        description={
          <>
            Vas a eliminar <strong>{centerToDelete?.name}</strong>.
          </>
        }
        note="Esta acción elimina el centro de trabajo del cliente actual. El historial operativo debe revisarse antes de continuar."
        confirmText="Eliminar centro de trabajo"
        variant="danger"
        onConfirm={async () => {
          if (!centerToDelete) return;
          await appApi.entities.WorkCenter.delete(centerToDelete.id);
          setCenterToDelete(null);
          await loadCenters();
        }}
      />
    </div>
  );
}

