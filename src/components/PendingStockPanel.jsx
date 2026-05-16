import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Link } from "react-router-dom";
import { PackagePlus, ChevronRight, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

export default function PendingStockPanel({ user }) {
  const [entries, setEntries] = useState([]);
  const [validating, setValidating] = useState(null);

  const load = () => {
    appApi.entities.StockEntry.filter({ status: "pendiente" }, "-created_date", 20)
      .then(setEntries).catch(() => toast.error("Error al cargar entradas de stock pendientes"));
  };

  useEffect(() => { load(); }, []);

  if (entries.length === 0) return null;

  const handleValidate = async (entry) => {
    setValidating(entry.id);
    const mats = await appApi.entities.Material.filter({ id: entry.material_id });
    const currentStock = mats[0]?.stock_quantity || 0;
    const newStock = currentStock + entry.quantity;

    await appApi.entities.Material.update(entry.material_id, { stock_quantity: newStock });

    await appApi.entities.StockMovement.create({
      material_id: entry.material_id,
      material_name: entry.material_name,
      material_code: entry.material_code,
      quantity: entry.quantity,
      stock_before: currentStock,
      stock_after: newStock,
      movement_type: "entrada_albaran",
      albaran_number: entry.albaran_number,
      technician_email: entry.technician_email,
      technician_name: entry.technician_name,
      notes: `Albarán ${entry.albaran_number} — Validado por ${user?.full_name}`,
      supplier_id: entry.supplier_id,
      supplier_name: entry.supplier_name,
    });

    await appApi.entities.StockEntry.update(entry.id, {
      status: "validado",
      validated_by: user?.email,
      validated_by_name: user?.full_name,
      validated_at: new Date().toISOString(),
    });

    toast.success(`Entrada validada: ${entry.material_name} +${entry.quantity} ${entry.unit}`);
    setValidating(null);
    load();
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

