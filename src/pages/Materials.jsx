import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Package, Edit, Trash2, AlertTriangle, History, ScanLine, Layers } from "lucide-react";
import FamiliesManager from "../components/FamiliesManager";
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
  family_id: "", family_name: "", subfamily_id: "", subfamily_name: "",
};

export default function Materials() {
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
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
  const [familiesOpen, setFamiliesOpen] = useState(false);
  const [families, setFamilies] = useState([]);
  const [subfamilies, setSubfamilies] = useState([]);
  const [familyFilter, setFamilyFilter] = useState("all");

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
    const [items, sups, fams, subs] = await Promise.all([
      base44.entities.Material.list("name", 500),
      base44.entities.Supplier.list("name", 200),
      base44.entities.MaterialFamily.list("name", 200),
      base44.entities.MaterialSubfamily.list("name", 500),
    ]);
    setMaterials(items);
    setSuppliers(sups);
    setFamilies(fams);
    setSubfamilies(subs);
    setLoading(false);
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const isTecnico = user?.role === "user" || user?.role === "tecnico" || user?.role === "ayudante";
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
    const matchFamily = familyFilter === "all" || m.family_id === familyFilter;
    return matchSearch && matchCategory && matchFamily;
  });

  // Group filtered materials by family
  const grouped = familyFilter !== "all" ? null : filtered.reduce((acc, m) => {
    const key = m.family_name || "Sin familia";
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  function renderCard(m) {
    return (
      <div key={m.id} className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-3">
          <div>
            {m.code && <p className="text-xs text-muted-foreground">{m.code}</p>}
            <h3 className="font-semibold">{m.name}</h3>
            {(m.family_name || m.subfamily_name) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {m.family_name}{m.subfamily_name ? ` › ${m.subfamily_name}` : ""}
              </p>
            )}
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
          {!isTecnico && m.supplier_name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Proveedor</span>
              <span className="text-xs truncate max-w-[120px]">{m.supplier_name}</span>
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
          {!isTecnico && (
            <Button variant="outline" size="sm" onClick={() => openEdit(m)} className="flex-1 rounded-xl">
              <Edit className="h-3 w-3 mr-1" /> Editar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => openHistory(m)} className="rounded-xl gap-1 text-xs flex-1">
            <History className="h-3 w-3" /> Historial
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => handleDelete(m.id)} className="text-destructive rounded-xl">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {isAdmin ? "Stock / Materiales" : "Catálogo de Materiales"}
        </h1>
        {isAdmin && (
          <Button onClick={() => setFamiliesOpen(true)} variant="outline" className="rounded-xl px-4 gap-2">
            <Layers className="h-4 w-4" /> Familias
          </Button>
        )}
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
        {families.length > 0 && (
          <Select value={familyFilter} onValueChange={setFamilyFilter}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl bg-card">
              <SelectValue placeholder="Todas las familias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las familias</SelectItem>
              {families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Material Grid */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No se encontraron materiales</p>
        </div>
      ) : familyFilter !== "all" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => renderCard(m))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(filtered.reduce((acc, m) => { const key = m.family_name || "Sin familia"; if (!acc[key]) acc[key] = []; acc[key].push(m); return acc; }, {})).sort(([a],[b]) => a === "Sin familia" ? 1 : b === "Sin familia" ? -1 : a.localeCompare(b)).map(([familyName, items]) => (
            <div key={familyName}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4" /> {familyName} <span className="text-xs font-normal normal-case">({items.length})</span>
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map(m => renderCard(m))}
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
                <Label>Código *</Label>
                <Input value={form.code || ""} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="mt-1" placeholder="REF-001" />
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
            {!isTecnico && families.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Familia</Label>
                  <Select value={form.family_id || "__none__"} onValueChange={v => {
                    const fam = families.find(f => f.id === v);
                    setForm(f => ({ ...f, family_id: v === "__none__" ? "" : v, family_name: fam?.name || "", subfamily_id: "", subfamily_name: "" }));
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Sin familia" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin familia</SelectItem>
                      {families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Subfamilia</Label>
                  <Select value={form.subfamily_id || "__none__"} disabled={!form.family_id} onValueChange={v => {
                    const sub = subfamilies.find(s => s.id === v);
                    setForm(f => ({ ...f, subfamily_id: v === "__none__" ? "" : v, subfamily_name: sub?.name || "" }));
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Sin subfamilia" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin subfamilia</SelectItem>
                      {subfamilies.filter(s => s.family_id === form.family_id).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {!isTecnico && suppliers.length > 0 && (
              <div>
                <Label>Proveedor Principal</Label>
                <Select value={form.supplier_id || "__none__"} onValueChange={v => {
                  const sup = suppliers.find(s => s.id === v);
                  setForm(f => ({ ...f, supplier_id: v === "__none__" ? "" : v, supplier_name: sup?.name || "" }));
                }}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Sin proveedor asignado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin proveedor</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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
      <FamiliesManager open={familiesOpen} onClose={() => { setFamiliesOpen(false); loadData(); }} />
      <AlbaranScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        materials={materials}
        suppliers={suppliers}
        user={user}
        onStockUpdated={loadData}
      />
    </div>
    </PullToRefresh>
  );
}