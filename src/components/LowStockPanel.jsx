import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appApi } from "@/api/app-api";

export default function LowStockPanel({ materials }) {
  const [warehouseStocks, setWarehouseStocks] = useState([]);

  useEffect(() => {
    appApi.entities.WarehouseStock.list("material_name", 2000)
      .then((rows) => setWarehouseStocks(rows || []))
      .catch(() => setWarehouseStocks([]));
  }, []);

  // Stock total = almacén principal + almacenes secundarios
  const totalStockFor = (m) =>
    (m.stock_quantity || 0) +
    warehouseStocks
      .filter((r) => r.material_id === m.id)
      .reduce((sum, r) => sum + (r.quantity || 0), 0);

  const lowStock = materials.filter(
    m => m.is_active !== false && m.min_stock > 0 && totalStockFor(m) <= m.min_stock
  );

  if (lowStock.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <h2 className="font-semibold text-amber-800">
          Avisos de Stock Bajo ({lowStock.length})
        </h2>
      </div>
      <div className="space-y-2">
        {lowStock.map(m => (
          <div
            key={m.id}
            className="flex items-center justify-between bg-white border border-amber-100 rounded-xl px-4 py-2.5 gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.name}</p>
              <p className="text-xs text-amber-700">
                Stock: <strong>{totalStockFor(m)} {m.unit || "ud"}</strong>
                {" "}· Mínimo: <strong>{m.min_stock} {m.unit || "ud"}</strong>
                {m.code && <span className="ml-2 text-muted-foreground">({m.code})</span>}
              </p>
            </div>
            <Link to="/materials">
              <Button size="sm" variant="outline"
                className="rounded-xl gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0">
                <ShoppingCart className="h-3.5 w-3.5" /> Gestionar Pedido
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
