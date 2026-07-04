import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Car, Plus, Pencil, ArrowDownToLine, ArrowUpFromLine, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { transferToVehicle, transferToWarehouse } from "../lib/vehicleStockUtils";

const PHYSICAL = (m) => !["mano_de_obra", "desplazamiento", "gas_refrigerante"].includes(m.category);

export default function MyVehicle() {
  const [user, setUser] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [stock, setStock] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [vehicleDialog, setVehicleDialog] = useState(null); // {id?, name, plate, assigned_user_id}
  const [addDialog, setAddDialog] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addMaterial, setAddMaterial] = useState(null);
  const [addQty, setAddQty] = useState("");
  const [returnDialog, setReturnDialog] = useState(null); // stock row
  const [returnQty, setReturnQty] = useState("");

  const loadData = async () => {
    try {
      const me = await appApi.auth.me();
      setUser(me);
      const [vList, mList, uList] = await Promise.all([
        appApi.entities.Vehicle.list("name", 100).catch(() => []),
        appApi.entities.Material.filter({ is_active: true }, "name", 500).catch(() => []),
        appApi.entities.User.list("full_name", 100).catch(() => []),
      ]);
      const activeVehicles = (vList || []).filter(v => v.is_active !== false);
      setVehicles(activeVehicles);
      setMaterials(mList || []);
      setUsers((uList || []).filter(u => u.is_active !== false));

      setSelectedId(prev => {
        if (prev && activeVehicles.some(v => v.id === prev)) return prev;
        const mine = activeVehicles.find(v => v.assigned_user_email === me.email);
        return mine?.id || activeVehicles[0]?.id || "";
      });
    } catch {
      toast.error("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const loadStock = async (vehicleId) => {
    if (!vehicleId) { setStock([]); return; }
    const rows = await appApi.entities.VehicleStock.filter({ vehicle_id: vehicleId }, "material_name", 500).catch(() => []);
    setStock(rows || []);
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadStock(selectedId); }, [selectedId]);

  const selectedVehicle = vehicles.find(v => v.id === selectedId);
  const canManageVehicles = ["admin", "superadmin", "encargado", "oficina"].includes(user?.role);

  // ── Vehicle create/edit ──
  const handleSaveVehicle = async () => {
    const d = vehicleDialog;
    if (!d.name?.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const assigned = users.find(u => u.id === d.assigned_user_id);
      const payload = {
        name: d.name.trim(),
        plate: d.plate?.trim() || "",
        assigned_user_id: assigned?.id || "",
        assigned_user_email: assigned?.email || "",
        assigned_user_name: assigned ? (assigned.full_name || assigned.email) : "",
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      if (d.id) {
        await appApi.entities.Vehicle.update(d.id, payload);
        toast.success("Vehículo actualizado");
      } else {
        const created = await appApi.entities.Vehicle.create({ ...payload, created_at: new Date().toISOString() });
        setSelectedId(created.id);
        toast.success("Vehículo creado");
      }
      setVehicleDialog(null);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Error al guardar el vehículo");
    } finally {
      setSaving(false);
    }
  };

  // ── Add material to vehicle (transfers from warehouse) ──
  const handleAddMaterial = async () => {
    const qty = parseFloat(addQty);
    if (!addMaterial || !qty || qty <= 0) { toast.error("Selecciona material y cantidad válida"); return; }
    setSaving(true);
    try {
      if (qty > (addMaterial.stock_quantity || 0)) {
        toast.warning(`En el almacén solo constan ${addMaterial.stock_quantity || 0} ${addMaterial.unit || "ud"}. Se traspasa igualmente; revisa el inventario.`, { duration: 6000 });
      }
      await transferToVehicle({ vehicle: selectedVehicle, material: addMaterial, quantity: qty, user });
      toast.success(`${qty} ${addMaterial.unit || "ud"} de ${addMaterial.name} traspasado a ${selectedVehicle.name}`);
      setAddDialog(false); setAddMaterial(null); setAddQty(""); setAddSearch("");
      await Promise.all([loadStock(selectedId), loadData()]);
    } catch (err) {
      toast.error(err?.message || "Error al traspasar el material");
    } finally {
      setSaving(false);
    }
  };

  // ── Return material to warehouse ──
  const handleReturn = async () => {
    const qty = parseFloat(returnQty);
    if (!returnDialog || !qty || qty <= 0) { toast.error("Cantidad no válida"); return; }
    setSaving(true);
    try {
      const mat = materials.find(m => m.id === returnDialog.material_id)
        || { id: returnDialog.material_id, name: returnDialog.material_name, code: returnDialog.material_code, unit: returnDialog.unit, stock_quantity: 0 };
      await transferToWarehouse({ vehicle: selectedVehicle, material: mat, quantity: qty, user });
      toast.success(`${qty} ${returnDialog.unit || "ud"} de ${returnDialog.material_name} devuelto al almacén`);
      setReturnDialog(null); setReturnQty("");
      await Promise.all([loadStock(selectedId), loadData()]);
    } catch (err) {
      toast.error(err?.message || "Error al devolver el material");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  const visibleStock = stock.filter(r => (r.quantity || 0) !== 0);
  const addCandidates = materials.filter(PHYSICAL).filter(m =>
    !addSearch || m.name.toLowerCase().includes(addSearch.toLowerCase()) || (m.code || "").toLowerCase().includes(addSearch.toLowerCase())
  );

  return (
    <PullToRefresh onRefresh={loadData}>
      <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Car className="h-6 w-6 text-accent" /> Mi Vehículo
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Material que llevas en la furgoneta</p>
          </div>
          {canManageVehicles && (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setVehicleDialog({ name: "", plate: "", assigned_user_id: "" })}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo vehículo
            </Button>
          )}
        </div>

        {vehicles.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground text-sm">
            No hay vehículos registrados.
            {canManageVehicles ? " Crea el primero con «Nuevo vehículo»." : " Pide a la oficina que dé de alta tu furgoneta."}
          </div>
        ) : (
          <>
            {/* Vehicle selector */}
            <div className="flex items-center gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 h-10 rounded-xl border border-input bg-card px-3 text-sm"
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.plate ? ` (${v.plate})` : ""}{v.assigned_user_name ? ` — ${v.assigned_user_name}` : ""}
                  </option>
                ))}
              </select>
              {canManageVehicles && selectedVehicle && (
                <Button variant="ghost" size="icon" className="h-10 w-10"
                  onClick={() => setVehicleDialog({ id: selectedVehicle.id, name: selectedVehicle.name, plate: selectedVehicle.plate || "", assigned_user_id: selectedVehicle.assigned_user_id || "" })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Stock list */}
            <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                  Material a bordo ({visibleStock.length})
                </h2>
                <Button size="sm" className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => setAddDialog(true)}>
                  <ArrowDownToLine className="h-4 w-4 mr-1" /> Añadir del almacén
                </Button>
              </div>

              {visibleStock.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">Furgoneta vacía. Usa «Añadir del almacén» para cargar material.</p>
              ) : (
                <div className="space-y-2">
                  {visibleStock.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.material_code ? `[${r.material_code}] ` : ""}{r.material_name}</p>
                        {(r.quantity || 0) < 0 && (
                          <p className="text-xs text-destructive">Descuadre: se ha usado más de lo que constaba. Ajusta el inventario.</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("font-bold text-sm", (r.quantity || 0) < 0 ? "text-destructive" : "")}>
                          {r.quantity} {r.unit || "ud"}
                        </span>
                        <Button variant="outline" size="sm" className="rounded-lg h-8"
                          onClick={() => { setReturnDialog(r); setReturnQty(String(Math.max(r.quantity || 0, 0) || "")); }}>
                          <ArrowUpFromLine className="h-3.5 w-3.5 mr-1" /> Devolver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Link to="/stock-movements" className="flex items-center gap-1.5 text-xs text-accent hover:underline pt-1">
                <History className="h-3.5 w-3.5" /> Ver historial de movimientos
              </Link>
            </div>
          </>
        )}

        {/* Dialog: create/edit vehicle */}
        <Dialog open={!!vehicleDialog} onOpenChange={(o) => !o && setVehicleDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{vehicleDialog?.id ? "Editar vehículo" : "Nuevo vehículo"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Nombre / Alias *</label>
                <Input value={vehicleDialog?.name || ""} placeholder="Ej: Furgoneta 1"
                  onChange={(e) => setVehicleDialog(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Matrícula</label>
                <Input value={vehicleDialog?.plate || ""} placeholder="0000 XXX"
                  onChange={(e) => setVehicleDialog(d => ({ ...d, plate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Técnico habitual</label>
                <select
                  value={vehicleDialog?.assigned_user_id || ""}
                  onChange={(e) => setVehicleDialog(d => ({ ...d, assigned_user_id: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">— Sin asignar —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setVehicleDialog(null)}>Cancelar</Button>
                <Button className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground" onClick={handleSaveVehicle} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: add material from warehouse */}
        <Dialog open={addDialog} onOpenChange={(o) => { setAddDialog(o); if (!o) { setAddMaterial(null); setAddQty(""); setAddSearch(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Añadir material a {selectedVehicle?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">El material se descuenta del stock del almacén y queda registrado el traspaso.</p>
              {!addMaterial ? (
                <>
                  <Input placeholder="Buscar material..." value={addSearch} onChange={(e) => setAddSearch(e.target.value)} autoFocus />
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {addCandidates.slice(0, 50).map(m => (
                      <button key={m.id} type="button" onClick={() => setAddMaterial(m)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:bg-accent/10 text-left text-sm">
                        <span className="truncate">{m.code ? `[${m.code}] ` : ""}{m.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">Almacén: {m.stock_quantity || 0} {m.unit || "ud"}</span>
                      </button>
                    ))}
                    {addCandidates.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">Sin resultados</p>}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-muted/50 rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                    <span className="truncate">{addMaterial.code ? `[${addMaterial.code}] ` : ""}{addMaterial.name}</span>
                    <button type="button" className="text-xs text-accent hover:underline shrink-0 ml-2" onClick={() => setAddMaterial(null)}>Cambiar</button>
                  </div>
                  <p className="text-xs text-muted-foreground">Disponible en almacén: {addMaterial.stock_quantity || 0} {addMaterial.unit || "ud"}</p>
                  <div>
                    <label className="text-xs text-muted-foreground">Cantidad a traspasar</label>
                    <Input type="number" min="0" step="0.01" value={addQty} onChange={(e) => setAddQty(e.target.value)} autoFocus />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" className="rounded-xl" onClick={() => setAddDialog(false)}>Cancelar</Button>
                    <Button className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground" onClick={handleAddMaterial} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Traspasar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: return material to warehouse */}
        <Dialog open={!!returnDialog} onOpenChange={(o) => !o && setReturnDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Devolver al almacén</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">{returnDialog?.material_name} — en furgoneta: <strong>{returnDialog?.quantity} {returnDialog?.unit || "ud"}</strong></p>
              <div>
                <label className="text-xs text-muted-foreground">Cantidad a devolver</label>
                <Input type="number" min="0" step="0.01" value={returnQty} onChange={(e) => setReturnQty(e.target.value)} autoFocus />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setReturnDialog(null)}>Cancelar</Button>
                <Button className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground" onClick={handleReturn} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Devolver
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
