import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, TrendingUp, ArrowUpDown, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";

const TYPE_LABELS = {
  salida_parte: { label: "Salida Parte", color: "bg-red-100 text-red-700 border-red-200", icon: TrendingDown },
  entrada_devolucion: { label: "Devolución", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: TrendingUp },
  ajuste_manual: { label: "Ajuste Manual", color: "bg-blue-100 text-blue-700 border-blue-200", icon: ArrowUpDown },
  salida_obra: { label: "Salida Obra", color: "bg-orange-100 text-orange-700 border-orange-200", icon: TrendingDown },
  entrada_obra: { label: "Retorno Obra", color: "bg-teal-100 text-teal-700 border-teal-200", icon: TrendingUp },
};

export default function StockMovements() {
  const [movements, setMovements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    Promise.all([
      base44.entities.StockMovement.list("-created_date", 500),
      base44.entities.Material.list("name", 500),
    ]).then(([m, mats]) => {
      setMovements(m); setMaterials(mats); setLoading(false);
    });
  }, []);

  // Low stock alerts
  const lowStockItems = materials.filter(m => m.is_active && m.min_stock > 0 && (m.stock_quantity || 0) <= m.min_stock);

  const filtered = movements.filter(m => {
    const matchSearch = !search || m.material_name?.toLowerCase().includes(search.toLowerCase()) || m.intervention_number?.toLowerCase().includes(search.toLowerCase()) || m.albaran_number?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || m.movement_type === filterType;
    return matchSearch && matchType;
  });

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Package className="h-6 w-6 text-accent" /> Movimientos de Stock</h1>
        <p className="text-muted-foreground text-sm mt-1">Registro de todas las entradas y salidas de material</p>
      </div>

      {/* Low stock alerts */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold text-amber-800 text-sm">Alertas de Stock Mínimo ({lowStockItems.length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {lowStockItems.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-amber-100">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.code || "-"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-destructive">{m.stock_quantity || 0} {m.unit}</p>
                  <p className="text-xs text-muted-foreground">mín: {m.min_stock}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Buscar material, nº parte, albarán..." value={search} onChange={e => setSearch(e.target.value)} className="rounded-xl max-w-xs" />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Movements list */}
      <div className="space-y-2">
        {filtered.map(mv => {
          const cfg = TYPE_LABELS[mv.movement_type] || TYPE_LABELS.ajuste_manual;
          const Icon = cfg.icon;
          const isOut = mv.quantity < 0;
          return (
            <div key={mv.id} className="bg-card rounded-2xl border border-border p-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", isOut ? "bg-red-50" : "bg-emerald-50")}>
                  <Icon className={cn("h-4 w-4", isOut ? "text-red-500" : "text-emerald-500")} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{mv.material_name} {mv.material_code ? `[${mv.material_code}]` : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {mv.technician_name} · {moment(mv.created_date).format("DD/MM/YYYY HH:mm")}
                    {mv.intervention_number ? ` · Parte: ${mv.intervention_number}` : ""}
                    {mv.albaran_number ? ` · Albarán: ${mv.albaran_number}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={cn("border text-xs", cfg.color)}>{cfg.label}</Badge>
                <div className="text-right">
                  <p className={cn("font-bold text-sm", isOut ? "text-destructive" : "text-emerald-600")}>
                    {mv.quantity > 0 ? "+" : ""}{mv.quantity}
                  </p>
                  <p className="text-xs text-muted-foreground">{mv.stock_before} → {mv.stock_after}</p>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">Sin movimientos registrados.</p>}
      </div>
    </div>
  );
}