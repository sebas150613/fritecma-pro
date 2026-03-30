import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Package, Edit, Trash2, AlertTriangle, History, ScanLine } from "lucide-react";
import AlbaranScanner from "../components/AlbaranScanner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CATEGORIES = {
  gas_refrigerante: "Gas Refrigerante",
  repuesto: "Repuesto",
  consumible: "Consumible",
  herramienta: "Herramienta",
  mano_de_obra: "Mano de Obra",
  desplazamiento: "Desplazamiento",
  otro: "Otro",
};

const UNITS = { ud: "Unidad", kg: "Kg", m: "Metro", l: "Litro", h: "Hora" };

const emptyMaterial = {
  code: "", name: "", category: "repuesto", unit: "ud",
  cost_price: 0, sell_price: 0, stock_quantity: 0, min_stock: 0, iva_percent: 21, is_active: true,
};

export default function Materials() {
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [form, setForm] = useState({ ...emptyMaterial });
  const [historyMaterial, setHistoryMaterial] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const openHistory = async (mat) => {
    setHistoryMaterial(mat);
    setLoadingMovements(true);
    const items = await base44.entities.StockMovement.filter({ material_id: mat.id }, "-created_date", 100);
    setMovements(items);
    setLoadingMovements(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const items = await base44.entities.Material.list("name", 500);
    setMaterials(items);
    setLoading(false);
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const isTecnico = user?.role === "user" || user?.role === "tecnico";
  const canSeePrices = !isTecnico;
  const canCreate = !isTecnico;

  const openNew = () => {
    setEditingMaterial(null);
    setForm({ ...emptyMaterial });
    setDialogOpen(true);
  };

  const openEdit = (mat) => {
    setEditingMaterial(mat);
    setForm({ ...mat });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingMaterial) {
      await base44.entities.Material.update(editingMaterial.id, form);
    } else {
      await base44.entities.Material.create(form);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este material?")) return;
    await base44.entities.Material.delete(id);
    loadData();
  };

  const filtered = materials.filter(m => {
    const matchSearch = !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.code?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || m.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {isAdmin ? "Stock / Materiales" : "Catálogo de Materiales"}
        </h1>
        {canCreate && (
          <div className="flex gap-2">
            {isAdmin && (
              <Button onClick={() => setScannerOpen(true)} variant="outline" className="rounded-xl px-4 gap-2 border-accent text-accent hover:bg-accent/10">
                <ScanLine className="h-4 w-4" /> Escanear Albarán
              </Button>
            )}
            <Button onClick={openNew} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-6 shadow-lg shadow-accent/25">
              <Plus className="h-4 w-4 mr-2" /> Nuevo Material
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar material..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 rounded-xl bg-card" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48 rounded-xl bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Material Grid */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No se encontraron materiales</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => (
            <div key={m.id} className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  {m.code && <p className="text-xs text-muted-foreground">{m.code}</p>}
                  <h3 className="font-semibold">{m.name}</h3>
                </div>
                <Badge variant="outline" className="text-xs">{CATEGORIES[m.category] || m.category}</Badge>
              </div>

              <div className="space-y-2 text-sm">
                {canSeePrices && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Precio Venta</span>
                    <span className="font-semibold">{(m.sell_price || 0).toFixed(2)} €/{m.unit || "ud"}</span>
                  </div>
                )}
                {isAdmin && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Precio Coste</span>
                    <span>{(m.cost_price || 0).toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stock</span>
                  <span className={cn("font-semibold", m.stock_quantity <= m.min_stock && "text-destructive")}>
                    {m.stock_quantity || 0} {m.unit || "ud"}
                    {m.stock_quantity <= m.min_stock && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => openEdit(m)} className="flex-1 rounded-xl">
                  <Edit className="h-3 w-3 mr-1" /> {isTecnico ? "Actualizar Stock" : "Editar"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openHistory(m)} className="rounded-xl gap-1 text-xs">
                  <History className="h-3 w-3" /> Historial
                </Button>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => handleDelete(m.id)} className="text-destructive rounded-xl">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History Dialog */}
      <Dialog open={!!historyMaterial} onOpenChange={(v) => !v && setHistoryMaterial(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Movimientos: {historyMaterial?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            {loadingMovements ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
            ) : movements.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sin movimientos registrados.</p>
            ) : movements.map(mv => {
              const isOut = mv.quantity < 0;
              return (
                <div key={mv.id} className="bg-muted/40 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOut ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {isOut ? `─ ${Math.abs(mv.quantity)}` : `+ ${mv.quantity}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{mv.movement_type?.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock: {mv.stock_before} → {mv.stock_after} · {mv.technician_name}
                      {mv.notes && ` · ${mv.notes}`}
                    </p>
                  </div>
                  {mv.intervention_id && (
                    <Link to={`/interventions/${mv.intervention_id}`} className="text-xs text-blue-600 hover:underline font-medium">
                      Parte: {mv.intervention_number} →
                    </Link>
                  )}
                  <span className="text-xs text-muted-foreground">{new Date(mv.created_date).toLocaleDateString("es")}</span>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive rounded-xl h-7 w-7 p-0" onClick={async () => {
                      if (!confirm("¿Eliminar este movimiento del historial?")) return;
                      await base44.entities.StockMovement.delete(mv.id);
                      setMovements(prev => prev.filter(x => x.id !== mv.id));
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? "Editar Material" : "Nuevo Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isTecnico && (
              <div className="p-3 bg-muted/50 rounded-xl text-sm text-muted-foreground">
                Solo puedes modificar el campo <strong>Stock Actual</strong>.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código</Label>
                <Input value={form.code || ""} disabled={isTecnico} className="mt-1" />
              </div>
              <div>
                <Label>Categoría</Label>
                {isTecnico ? (
                  <Input value={CATEGORIES[form.category] || form.category} disabled className="mt-1" />
                ) : (
                  <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} disabled={isTecnico} onChange={isTecnico ? undefined : (e) => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unidad</Label>
                {isTecnico ? (
                  <Input value={UNITS[form.unit] || form.unit} disabled className="mt-1" />
                ) : (
                  <Select value={form.unit} onValueChange={(v) => setForm(f => ({ ...f, unit: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(UNITS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>IVA (%)</Label>
                <Input type="number" value={form.iva_percent || ""} disabled={isTecnico} onChange={isTecnico ? undefined : (e) => setForm(f => ({ ...f, iva_percent: parseFloat(e.target.value) || 0 }))} className="mt-1" />
              </div>
            </div>
            {canSeePrices && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Precio Coste (€)</Label>
                  <Input type="number" step="0.01" value={form.cost_price || ""} onChange={(e) => setForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label>Precio Venta (€)</Label>
                  <Input type="number" step="0.01" value={form.sell_price || ""} onChange={(e) => setForm(f => ({ ...f, sell_price: parseFloat(e.target.value) || 0 }))} className="mt-1" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stock Actual {isTecnico && <span className="text-accent font-medium">(editable)</span>}</Label>
                <Input type="number" value={form.stock_quantity ?? ""} onChange={(e) => setForm(f => ({ ...f, stock_quantity: parseFloat(e.target.value) || 0 }))} className="mt-1" />
              </div>
              <div>
                <Label>Stock Mínimo</Label>
                <Input type="number" value={form.min_stock || ""} disabled={isTecnico} onChange={isTecnico ? undefined : (e) => setForm(f => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))} className="mt-1" />
              </div>
            </div>
            {!isTecnico && (
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Material Activo</Label>
              </div>
            )}
            <Button onClick={handleSave} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
              {editingMaterial ? "Actualizar" : "Crear Material"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlbaranScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        materials={materials}
        user={user}
        onStockUpdated={loadData}
      />
    </div>
  );
}