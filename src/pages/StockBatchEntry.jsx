import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CheckCircle, Package, Search, Clock } from "lucide-react";
import { toast } from "sonner";

const EMPTY_LINE = { materialId: "", materialName: "", materialCode: "", currentStock: 0, unit: "ud", quantity: "", supplierId: "", supplierName: "" };

function parseOrderLines(json) {
  try {
    const p = JSON.parse(json || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export default function StockBatchEntry() {
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [lines, setLines] = useState([{ ...EMPTY_LINE, id: Date.now() }]);
  const [albaran, setAlbaran] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerms, setSearchTerms] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const [openOrders, setOpenOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [markDelivered, setMarkDelivered] = useState(true);

  useEffect(() => {
    appApi.auth.me().then(setUser).catch(() => toast.error("Error al cargar tu perfil"));
    appApi.entities.Material.filter({ is_active: true }).then(setMaterials).catch(() => toast.error("Error al cargar materiales"));
    appApi.entities.Supplier.filter({ is_active: true }).then(setSuppliers).catch(() => toast.error("Error al cargar proveedores"));
    // Pedidos pendientes de entrega, para recepcionar contra pedido (solo roles con acceso a pedidos)
    appApi.purchaseOrders
      .list()
      .then((res) =>
        setOpenOrders(
          (res?.orders || []).filter((o) => o.status === "pending_delivery" || o.status === "send_error")
        )
      )
      .catch(() => setOpenOrders([]));
  }, []);

  const isTecnico = user?.role === "user" || user?.role === "tecnico";
  const savePending = isTecnico;

  const selectedOrder = openOrders.find((o) => o.id === selectedOrderId) || null;

  const applyOrder = (orderId) => {
    setSelectedOrderId(orderId);
    const order = openOrders.find((o) => o.id === orderId);
    if (!order) return;
    const orderLines = parseOrderLines(order.lines_json);
    if (orderLines.length === 0) {
      toast.error("El pedido no tiene líneas legibles.");
      return;
    }
    const now = Date.now();
    const newLines = orderLines.map((ol, idx) => {
      const mat = materials.find((m) => m.id === ol.material_id);
      return {
        id: now + idx,
        materialId: ol.material_id,
        materialName: ol.material_name || mat?.name || "",
        materialCode: ol.material_code || mat?.code || "",
        currentStock: mat?.stock_quantity || 0,
        unit: ol.unit || mat?.unit || "ud",
        quantity: String(ol.quantity || ""),
        supplierId: order.supplier_id || "",
        supplierName: order.supplier_name || "",
      };
    });
    setLines(newLines);
    setSearchTerms(
      Object.fromEntries(newLines.map((l) => [l.id, l.materialName]))
    );
    toast.success(`${newLines.length} línea(s) cargadas del pedido ${order.number}. Ajusta cantidades si la entrega es parcial.`);
  };

  const filteredMaterials = (lineId) => {
    const term = (searchTerms[lineId] || "").toLowerCase();
    if (!term) return materials.slice(0, 20);
    return materials.filter(m =>
      m.name?.toLowerCase().includes(term) || m.code?.toLowerCase().includes(term)
    ).slice(0, 20);
  };

  const selectMaterial = (lineId, material) => {
    setLines(prev => prev.map(l => l.id === lineId ? {
      ...l,
      materialId: material.id,
      materialName: material.name,
      materialCode: material.code || "",
      currentStock: material.stock_quantity || 0,
      unit: material.unit || "ud"
    } : l));
    setSearchTerms(prev => ({ ...prev, [lineId]: material.name }));
    setOpenDropdown(null);
  };

  const updateLine = (lineId, field, value) => {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
  };

  const selectSupplier = (lineId, supplier) => {
    setLines(prev => prev.map(l => l.id === lineId ? {
      ...l, supplierId: supplier.id, supplierName: supplier.name
    } : l));
  };

  const addLine = () => {
    setLines(prev => [...prev, { ...EMPTY_LINE, id: Date.now() }]);
  };

  const removeLine = (lineId) => {
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  const handleConfirm = async () => {
    const validLines = lines.filter(
      (l) => l.materialId && Number(l.quantity) > 0
    );
    if (!albaran.trim()) { toast.error("Introduce el Nº de Albarán antes de confirmar"); return; }
    if (!validLines.length) { toast.error("Añade al menos una línea con material y cantidad válidos"); return; }

    setSaving(true);
    try {
      for (const line of validLines) {
        const qty = parseFloat(line.quantity);
        const mat = materials.find(m => m.id === line.materialId);

        const orderRef = selectedOrder
          ? { purchase_order_id: selectedOrder.id, purchase_order_number: selectedOrder.number || "" }
          : {};
        const orderNote = selectedOrder ? ` — Pedido ${selectedOrder.number}` : "";

        if (savePending) {
          // Técnico: guardar como pendiente, sin tocar el stock todavía
          await appApi.entities.StockEntry.create({
            albaran_number: albaran.trim(),
            material_id: line.materialId,
            material_name: line.materialName,
            material_code: line.materialCode || "",
            quantity: qty,
            unit: line.unit || "ud",
            supplier_id: line.supplierId || undefined,
            supplier_name: line.supplierName || undefined,
            technician_email: user?.email || "",
            technician_name: user?.full_name || "",
            status: "pendiente",
            notes: `Albarán ${albaran.trim()}${orderNote}`,
            ...orderRef,
          });
        } else {
          // Admin/Encargado: actualizar stock directamente y marcar como validado
          const newStock = (mat?.stock_quantity || 0) + qty;
          await appApi.entities.Material.update(line.materialId, { stock_quantity: newStock });
          await appApi.entities.StockMovement.create({
            material_id: line.materialId,
            material_name: line.materialName,
            material_code: line.materialCode,
            quantity: qty,
            stock_before: mat?.stock_quantity || 0,
            stock_after: newStock,
            movement_type: "entrada_albaran",
            albaran_number: albaran.trim(),
            technician_email: user?.email || "",
            technician_name: user?.full_name || "",
            notes: (line.supplierName ? `Albarán ${albaran.trim()} — Proveedor: ${line.supplierName}` : `Albarán ${albaran.trim()} — Entrada lote manual`) + orderNote,
            supplier_id: line.supplierId || undefined,
            supplier_name: line.supplierName || undefined,
            ...orderRef,
          });
          await appApi.entities.StockEntry.create({
            albaran_number: albaran.trim(),
            material_id: line.materialId,
            material_name: line.materialName,
            material_code: line.materialCode || "",
            quantity: qty,
            unit: line.unit || "ud",
            supplier_id: line.supplierId || undefined,
            supplier_name: line.supplierName || undefined,
            technician_email: user?.email || "",
            technician_name: user?.full_name || "",
            status: "validado",
            validated_by: user?.email,
            validated_by_name: user?.full_name,
            validated_at: new Date().toISOString(),
            notes: `Albarán ${albaran.trim()}${orderNote}`,
            ...orderRef,
          });
        }
      }

      // Marcar el pedido como entregado si se recepcionó contra pedido
      if (selectedOrder && markDelivered && !savePending) {
        try {
          await appApi.purchaseOrders.updateStatus(selectedOrder.id, { status: "delivered" });
          setOpenOrders((prev) => prev.filter((o) => o.id !== selectedOrder.id));
        } catch {
          toast.error("Stock registrado, pero no se pudo marcar el pedido como entregado.");
        }
      }

      if (!savePending) {
        const updatedMaterials = await appApi.entities.Material.filter({ is_active: true });
        setMaterials(updatedMaterials);
      }

      toast.success(savePending
        ? `${validLines.length} línea(s) enviadas para validación por el encargado`
        : `${validLines.length} línea(s) registradas y validadas correctamente`);
      setLines([{ ...EMPTY_LINE, id: Date.now() }]);
      setSearchTerms({});
      setAlbaran("");
      setSelectedOrderId("");
    } catch (e) {
      toast.error("Error al guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-32 md:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="h-6 w-6 text-accent" />
          Recepción de material
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {savePending
            ? "Como técnico, tus entradas quedarán pendientes de validación por el encargado."
            : "Añade múltiples materiales en una sola sesión. El stock se incrementará automáticamente al confirmar."}
        </p>
        {savePending && (
          <div className="mt-2 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 w-fit">
            <Clock className="h-4 w-4 shrink-0" />
            Las entradas serán revisadas y validadas por un encargado antes de actualizar el stock físico.
          </div>
        )}
      </div>

      {/* Recepción contra pedido a proveedor */}
      {openOrders.length > 0 && (
        <div className="mb-4 p-4 bg-card border border-border rounded-xl space-y-2">
          <label className="text-sm font-semibold">Recepcionar contra pedido a proveedor (opcional)</label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Select
              value={selectedOrderId || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  setSelectedOrderId("");
                } else {
                  applyOrder(v);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-96 text-sm">
                <SelectValue placeholder="Sin pedido — entrada manual" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin pedido — entrada manual</SelectItem>
                {openOrders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.number} · {o.supplier_name} · {parseOrderLines(o.lines_json).length} líneas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOrder && !savePending && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={markDelivered}
                  onChange={(e) => setMarkDelivered(e.target.checked)}
                />
                Marcar pedido como entregado al confirmar
              </label>
            )}
          </div>
          {selectedOrder && (
            <p className="text-xs text-muted-foreground">
              Líneas precargadas del pedido {selectedOrder.number}. Si la entrega es parcial, ajusta las cantidades y
              desmarca «Marcar pedido como entregado».
            </p>
          )}
        </div>
      )}

      {/* Albaran number */}
      <div className="mb-4 flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
        <label className="text-sm font-semibold whitespace-nowrap">Nº Albarán <span className="text-destructive">*</span></label>
        <Input
          placeholder="Ej: ALB-2024-001"
          value={albaran}
          onChange={e => setAlbaran(e.target.value)}
          className="max-w-xs"
        />
        {albaran.trim() && <span className="text-xs text-emerald-600 font-medium">✓ Registrado</span>}
      </div>

      {/* Table header */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
          <div className="col-span-4">Material (Código / Nombre)</div>
          <div className="col-span-2 text-center">Stock Actual</div>
          <div className="col-span-2 text-center">Cantidad Entrada</div>
          <div className="col-span-3">Proveedor</div>
          <div className="col-span-1"></div>
        </div>

        <div className="divide-y divide-border">
          {lines.map((line) => (
            <div key={line.id} className="p-3 md:p-2">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                {/* Material search */}
                <div className="md:col-span-4 relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 text-sm"
                      placeholder="Buscar por código o nombre..."
                      value={searchTerms[line.id] || ""}
                      onChange={e => {
                        setSearchTerms(prev => ({ ...prev, [line.id]: e.target.value }));
                        updateLine(line.id, "materialId", "");
                        setOpenDropdown(line.id);
                      }}
                      onFocus={() => setOpenDropdown(line.id)}
                      onBlur={() => setTimeout(() => setOpenDropdown(null), 200)}
                    />
                  </div>
                  {openDropdown === line.id && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {filteredMaterials(line.id).length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>
                      ) : filteredMaterials(line.id).map(m => (
                        <button
                          key={m.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between gap-2"
                          onMouseDown={() => selectMaterial(line.id, m)}
                        >
                          <span>
                            {m.code && <span className="font-mono text-xs text-muted-foreground mr-2">{m.code}</span>}
                            {m.name}
                          </span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {m.stock_quantity ?? 0} {m.unit}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Current stock */}
                <div className="md:col-span-2 flex md:justify-center items-center gap-2">
                  <span className="md:hidden text-xs text-muted-foreground w-24">Stock actual:</span>
                  {line.materialId ? (
                    <Badge variant="secondary" className="font-mono text-xs">{line.currentStock} {line.unit}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>

                {/* Quantity */}
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="md:hidden text-xs text-muted-foreground w-24">Cantidad:</span>
                  <Input type="number" min="0" step="0.01" placeholder="0" className="text-sm text-center"
                    value={line.quantity} onChange={e => updateLine(line.id, "quantity", e.target.value)} />
                  {line.unit && <span className="text-xs text-muted-foreground shrink-0">{line.unit}</span>}
                </div>

                {/* Supplier */}
                <div className="md:col-span-3 flex items-center gap-2">
                  <span className="md:hidden text-xs text-muted-foreground w-24">Proveedor:</span>
                  <Select
                    value={line.supplierId || "__none__"}
                    onValueChange={v => {
                      const s = suppliers.find(s => s.id === v);
                      if (s) selectSupplier(line.id, s);
                      else updateLine(line.id, "supplierId", "");
                    }}
                  >
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Sin proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin proveedor</SelectItem>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Remove */}
                <div className="md:col-span-1 flex justify-end md:justify-center">
                  <Button variant="ghost" size="icon" aria-label="Eliminar línea" className="text-muted-foreground hover:text-destructive h-8 w-8"
                    onClick={() => lines.length > 1 && removeLine(line.id)} disabled={lines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Stock preview after entry — only for non-pending */}
              {!savePending && line.materialId && Number(line.quantity) > 0 && (
                <div className="mt-1 ml-1 text-xs text-muted-foreground">
                  Stock resultante: <span className="font-semibold text-green-600">{(line.currentStock + Number(line.quantity || 0)).toFixed(2)} {line.unit}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add line */}
        <div className="p-3 border-t border-border bg-muted/20">
          <Button variant="outline" size="sm" onClick={addLine} className="gap-2">
            <Plus className="h-4 w-4" /> Añadir línea
          </Button>
        </div>
      </div>

      {/* Summary & Confirm */}
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-card border border-border rounded-xl">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {lines.filter((l) => l.materialId && Number(l.quantity) > 0).length}
          </span> línea(s) listas para {savePending ? "enviar" : "confirmar"}
        </div>
        <Button
          onClick={handleConfirm}
          disabled={saving || !albaran.trim() || !lines.some((l) => l.materialId && Number(l.quantity) > 0)}
          className={`gap-2 ${savePending ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"} text-white`}
        >
          {savePending ? <Clock className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
          {saving ? "Guardando..." : savePending ? "Enviar para Validación" : "Confirmar Entrada de Stock"}
        </Button>
      </div>
    </div>
  );
}

