import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Link } from "react-router-dom";
import { PackagePlus, ChevronRight, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

export default function PendingStockPanel() {
  const [entries, setEntries] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [targetWarehouseId, setTargetWarehouseId] = useState("");
  const [validating, setValidating] = useState(null);

  const load = () => {
    appApi.entities.StockEntry.filter({ status: "pendiente" }, "-created_date", 20)
      .then(setEntries).catch(() => toast.error("Error al cargar entradas de stock pendientes"));
    appApi.entities.Warehouse.filter({ is_active: true }, "name", 50)
      .then((rows) => setWarehouses(rows || []))
      .catch(() => setWarehouses([]));
  };

  useEffect(() => { load(); }, []);

  if (entries.length === 0) return null;

  const handleValidate = async (entry) => {
    setValidating(entry.id);
    try {
      await appApi.stock.validateEntry({
        entry_id: entry.id,
        warehouse_id: targetWarehouseId || undefined,
      });
      toast.success(`Entrada validada: ${entry.material_name} +${entry.quantity} ${entry.unit}`);
      load();
    } catch (err) {
      toast.error(err?.message || "Error al validar la entrada");
    } finally {
      setValidating(null);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <PackagePlus className="h-4 w-4 text-accent" />
          Entradas de Stock Pendientes de Validar
          <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold">{entries.length}</Badge>
        </h3>
        <Link to="/stock-entry" className="text-xs text-accent hover:underline flex items-center gap-1">
          Ver módulo <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {warehouses.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">Almacén destino:</label>
          <select
            value={targetWarehouseId}
            onChange={(e) => setTargetWarehouseId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-card px-2 text-xs"
          >
            <option value="">Almacén principal</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        {entries.map(e => (
          <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{e.material_name}</p>
              <p className="text-xs text-muted-foreground">
                Alb: {e.albaran_number} · {e.technician_name} · {moment(e.created_date).fromNow()}
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono shrink-0">
              +{e.quantity} {e.unit}
            </Badge>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8 px-3 text-xs gap-1 shrink-0"
              onClick={() => handleValidate(e)}
              disabled={validating === e.id}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {validating === e.id ? "Validando..." : "Validar Entrada"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
