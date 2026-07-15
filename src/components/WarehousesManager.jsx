import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Warehouse, Plus, Pencil, ArrowLeftRight, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

const PHYSICAL = (m) =>
  m.is_active !== false &&
  !["mano_de_obra", "desplazamiento", "gas_refrigerante"].includes(m.category);

/**
 * Gestión de almacenes (crear, renombrar, activar/desactivar) y traspasos de
 * material entre ubicaciones (principal ↔ almacenes ↔ furgonetas).
 */
export default function WarehousesManager({ open, onClose, materials = [], warehouses = [], warehouseStocks = [] }) {
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(null); // { id, name }
  const [vehicles, setVehicles] = useState([]);

  // Traspaso
  const [transferSearch, setTransferSearch] = useState("");
  const [transferMaterial, setTransferMaterial] = useState(null);
  const [transferQty, setTransferQty] = useState("");
  const [transferFrom, setTransferFrom] = useState("principal");
  const [transferTo, setTransferTo] = useState("principal");

  useEffect(() => {
    if (!open) return;
    appApi.entities.Vehicle.filter({ is_active: true }, "name", 100)
      .then((rows) => setVehicles(rows || []))
      .catch(() => setVehicles([]));
  }, [open]);

  const resetTransfer = () => {
    setTransferSearch("");
    setTransferMaterial(null);
    setTransferQty("");
    setTransferFrom("principal");
    setTransferTo("principal");
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Indica el nombre del almacén"); return; }
    setSaving(true);
    try {
      await appApi.entities.Warehouse.create({ name, is_active: true });
      toast.success(`Almacén "${name}" creado`);
      setNewName("");
      onClose();
    } catch (err) {
      toast.error(err?.message || "Error al crear el almacén");
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async () => {
    const name = (editing?.name || "").trim();
    if (!name) { toast.error("El nombre no puede quedar vacío"); return; }
    setSaving(true);
    try {
      await appApi.entities.Warehouse.update(editing.id, { name });
      toast.success("Almacén renombrado");
      setEditing(null);
      onClose();
    } catch (err) {
      toast.error(err?.message || "Error al renombrar el almacén");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (warehouse) => {
    const stockLeft = warehouseStocks
      .filter((r) => r.warehouse_id === warehouse.id)
      .reduce((sum, r) => sum + (r.quantity || 0), 0);
    if (warehouse.is_active !== false && stockLeft > 0) {
      toast.error("Este almacén todavía tiene stock. Traspásalo antes de desactivarlo.");
      return;
    }
    setSaving(true);
    try {
      await appApi.entities.Warehouse.update(warehouse.id, {
        is_active: warehouse.is_active === false,
      });
      toast.success(warehouse.is_active === false ? "Almacén reactivado" : "Almacén desactivado");
      onClose();
    } catch (err) {
      toast.error(err?.message || "Error al actualizar el almacén");
    } finally {
      setSaving(false);
    }
  };

  const locationOptions = [
    { value: "principal", label: "Almacén principal" },
    ...warehouses.map((w) => ({ value: `almacen:${w.id}`, label: `Almacén: ${w.name}` })),
    ...vehicles.map((v) => ({ value: `vehiculo:${v.id}`, label: `Furgoneta: ${v.name}${v.plate ? ` (${v.plate})` : ""}` })),
  ];

  const parseLocation = (value) => {
    if (value.startsWith("almacen:")) return { warehouse_id: value.slice(8) };
    if (value.startsWith("vehiculo:")) return { vehicle_id: value.slice(9) };
    return {};
  };

  const availableAt = (locationValue, material) => {
    if (!material) return null;
    if (locationValue === "principal") return material.stock_quantity || 0;
    if (locationValue.startsWith("almacen:")) {
      const id = locationValue.slice(8);
      const row = warehouseStocks.find(
        (r) => r.warehouse_id === id && r.material_id === material.id
      );
      return row?.quantity || 0;
    }
    return null; // furgoneta: no lo tenemos precargado
  };

  const handleTransfer = async () => {
    const qty = parseFloat(transferQty);
    if (!transferMaterial || !qty || qty <= 0) { toast.error("Selecciona material y cantidad válida"); return; }
    if (transferFrom === transferTo) { toast.error("El origen y el destino son la misma ubicación"); return; }
    setSaving(true);
    try {
      await appApi.stock.transfer({
        material_id: transferMaterial.id,
        quantity: qty,
        from: parseLocation(transferFrom),
        to: parseLocation(transferTo),
      });
      toast.success(`${qty} ${transferMaterial.unit || "ud"} de ${transferMaterial.name} traspasado`);
      resetTransfer();
      onClose();
    } catch (err) {
      toast.error(err?.message || "Error al traspasar el material");
    } finally {
      setSaving(false);
    }
  };

  const transferCandidates = materials.filter(PHYSICAL).filter((m) =>
    !transferSearch ||
    m.name?.toLowerCase().includes(transferSearch.toLowerCase()) ||
    (m.code || "").toLowerCase().includes(transferSearch.toLowerCase())
  );

  const fromAvailable = availableAt(transferFrom, transferMaterial);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-accent" /> Almacenes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Lista de almacenes */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              El almacén principal siempre existe. Añade almacenes adicionales si tu empresa
              tiene más de una nave o delegación.
            </p>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-muted/30">
              <span className="text-sm font-medium">Almacén principal</span>
              <Badge variant="outline" className="text-xs">Por defecto</Badge>
            </div>
            {warehouses.map((w) => (
              <div key={w.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border">
                {editing?.id === w.id ? (
                  <>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleRename} disabled={saving}>
                      <Check className="h-4 w-4 text-emerald-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">{w.name}</span>
                    {w.is_active === false && <Badge variant="outline" className="text-xs text-muted-foreground">Inactivo</Badge>}
                    <Button size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => setEditing({ id: w.id, name: w.name })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs"
                      onClick={() => handleToggleActive(w)} disabled={saving}>
                      {w.is_active === false ? "Reactivar" : "Desactivar"}
                    </Button>
                  </>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nombre del nuevo almacén (ej: Nave Ibiza)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-sm"
              />
              <Button size="sm" className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground shrink-0"
                onClick={handleCreate} disabled={saving}>
                <Plus className="h-4 w-4 mr-1" /> Crear
              </Button>
            </div>
          </div>

          {/* Traspaso entre ubicaciones */}
          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-accent" /> Traspasar material
            </h3>
            {!transferMaterial ? (
              <>
                <Input
                  placeholder="Buscar material por nombre o código..."
                  value={transferSearch}
                  onChange={(e) => setTransferSearch(e.target.value)}
                  className="text-sm"
                />
                {transferSearch && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {transferCandidates.slice(0, 20).map((m) => (
                      <button key={m.id} type="button" onClick={() => setTransferMaterial(m)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:bg-accent/10 text-left text-sm">
                        <span className="min-w-0 truncate">{m.code ? `[${m.code}] ` : ""}{m.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">{m.stock_quantity || 0} {m.unit || "ud"}</span>
                      </button>
                    ))}
                    {transferCandidates.length === 0 && (
                      <p className="text-center text-muted-foreground text-sm py-3">Sin resultados</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-muted/50 rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                  <span className="min-w-0 truncate">{transferMaterial.code ? `[${transferMaterial.code}] ` : ""}{transferMaterial.name}</span>
                  <button type="button" className="text-xs text-accent hover:underline shrink-0 ml-2" onClick={() => setTransferMaterial(null)}>
                    Cambiar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Desde</label>
                    <select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-card px-2 text-sm">
                      {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {fromAvailable !== null && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Disponible: {fromAvailable} {transferMaterial.unit || "ud"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Hasta</label>
                    <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-card px-2 text-sm">
                      {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Cantidad</label>
                  <Input type="number" min="0" step="0.01" value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={resetTransfer}>Cancelar</Button>
                  <Button className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
                    onClick={handleTransfer} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Traspasar
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
