import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { runtimeConfig } from "@/lib/runtime-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Plus, Loader2, Download, Search } from "lucide-react";
import { toast } from "sonner";
const canPurchaseOrdersUser = (u) =>
  u &&
  u.is_hidden_owner !== true &&
  u.role !== "superadmin" &&
  ["admin", "oficina", "encargado"].includes(u.role);

const STATUS_LABELS = {
  draft: "Borrador",
  pending_delivery: "Pendiente de entrega",
  delivered: "Entregado",
  delivered_with_issues: "Entregado con incidencias",
  cancelled: "Cancelado",
  send_error: "Error de envío",
};

const DELIVERY_LABELS = {
  company_address: "Empresa / almacén",
  project: "Obra",
  pickup_store: "Recoger en tienda",
};

function parseLines(json) {
  try {
    const p = JSON.parse(json || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export default function PurchaseOrders() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [deliveryType, setDeliveryType] = useState("company_address");
  const [projectId, setProjectId] = useState("");
  const [deliveryAddressManual, setDeliveryAddressManual] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [qtyDraft, setQtyDraft] = useState("1");
  const [obsDraft, setObsDraft] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");

  const [issueDialog, setIssueDialog] = useState({ open: false, orderId: "", notes: "" });
  const [statusBusy, setStatusBusy] = useState("");

  const loadAll = async () => {
    const me = await appApi.auth.me();
    setUser(me);
    const [listRes, sup, mat, proj] = await Promise.all([
      appApi.purchaseOrders.list(),
      appApi.entities.Supplier.list("name", 300),
      appApi.entities.Material.list("name", 800),
      appApi.entities.Project.list("name", 200),
    ]);
    setOrders(listRes?.orders || []);
    setSuppliers(sup);
    setMaterials(mat);
    setProjects((proj || []).filter((p) => p.status === "en_curso"));
    setLoading(false);
  };

  useEffect(() => {
    loadAll().catch(() => setLoading(false));
  }, []);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId]
  );

  const supplierEmailUsed = useMemo(() => {
    if (!selectedSupplier) return "";
    const o = String(selectedSupplier.order_email || "").trim();
    const e = String(selectedSupplier.email || "").trim();
    return o || e;
  }, [selectedSupplier]);

  const materialsFiltered = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    const sid = supplierId;
    let list = materials;
    if (sid) {
      const pref = materials.filter((m) => m.supplier_id === sid);
      const rest = materials.filter((m) => m.supplier_id !== sid);
      list = [...pref, ...rest];
    }
    if (!q) return list.slice(0, 80);
    return list
      .filter(
        (m) =>
          String(m.name || "")
            .toLowerCase()
            .includes(q) ||
          String(m.code || "")
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 80);
  }, [materials, materialSearch, supplierId]);

  const pedidosConfigured = Boolean(String(user?.pedidos_email_from || "").trim());

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      if (filterSupplier !== "all" && o.supplier_id !== filterSupplier) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [
          o.number,
          o.supplier_name,
          parseLines(o.lines_json)
            .map((l) => `${l.material_name} ${l.material_code}`)
            .join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filterStatus, filterSupplier, search]);

  const addLine = () => {
    const mid = selectedMaterialId;
    const qty = parseFloat(String(qtyDraft).replace(",", "."));
    if (!mid || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Selecciona material y cantidad válida.");
      return;
    }
    const mat = materials.find((m) => m.id === mid);
    if (!mat) return;
    setLines((prev) => [
      ...prev,
      {
        material_id: mat.id,
        material_code: mat.code || "",
        material_name: mat.name || "",
        unit: mat.unit || "ud",
        quantity: qty,
        observation: obsDraft.trim(),
      },
    ]);
    setSelectedMaterialId("");
    setQtyDraft("1");
    setObsDraft("");
  };

  const removeLine = (idx) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitOrder = async () => {
    if (!supplierId) {
      toast.error("Selecciona un proveedor.");
      return;
    }
    if (!supplierEmailUsed) {
      toast.error("El proveedor no tiene email de pedidos ni email principal.");
      return;
    }
    if (!pedidosConfigured) {
      toast.error("Configura el correo de pedidos de la empresa antes de tramitar pedidos.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Añade al menos una línea.");
      return;
    }
    const body = {
      supplier_id: supplierId,
      delivery_type: deliveryType,
      notes,
      lines: lines.map((l) => ({
        material_id: l.material_id,
        quantity: l.quantity,
        observation: l.observation || undefined,
      })),
    };
    if (deliveryType === "project") {
      body.project_id = projectId;
      body.delivery_address_manual = deliveryAddressManual.trim() || undefined;
    }
    setSending(true);
    try {
      try {
        await appApi.purchaseOrders.send(body);
        toast.success("Pedido tramitado y enviado al proveedor.");
      } catch (e) {
        if (e?.status === 502 && e?.data?.order) {
          toast.error(e?.message || "No se pudo enviar el correo; el pedido quedó registrado.");
        } else {
          throw e;
        }
      }
      setDialogOpen(false);
      setLines([]);
      setNotes("");
      setSupplierId("");
      setDeliveryType("company_address");
      setProjectId("");
      setDeliveryAddressManual("");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "No se pudo tramitar el pedido.");
    } finally {
      setSending(false);
    }
  };

  const patchStatus = async (orderId, status, issue_notes) => {
    setStatusBusy(orderId + status);
    try {
      const payload = { status };
      if (status === "delivered_with_issues") {
        payload.issue_notes = issue_notes ?? "";
      }
      await appApi.purchaseOrders.updateStatus(orderId, payload);
      toast.success("Estado actualizado.");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "No se pudo actualizar.");
    } finally {
      setStatusBusy("");
      setIssueDialog({ open: false, orderId: "", notes: "" });
    }
  };

  const downloadPdf = async (orderId) => {
    const base = runtimeConfig.apiUrl?.replace(/\/+$/, "") || "";
    const url = `${base}/api/purchase-orders/${encodeURIComponent(orderId)}/pdf`;
    const headers = {
      Authorization: `Bearer ${runtimeConfig.token || ""}`,
    };
    if (runtimeConfig.appId) {
      headers["X-App-Id"] = runtimeConfig.appId;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      toast.error("No se pudo descargar el PDF.");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Pedido-${orderId}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canPurchaseOrdersUser(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6 pb-28 lg:pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag className="h-7 w-7 text-accent" /> Pedidos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pedidos a proveedor con PDF y correo. El SMTP global es solo infraestructura; la identidad la marca tu empresa en Configuración → Pedidos.
          </p>
        </div>
        <Button
          className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground shrink-0"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" /> Nuevo pedido
        </Button>
      </div>

      {!pedidosConfigured && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 text-amber-950 px-4 py-3 text-sm">
          Configura el correo de pedidos de la empresa en Configuración antes de tramitar pedidos.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 rounded-xl"
              placeholder="Número, proveedor, material..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full lg:w-44">
          <Label className="text-xs text-muted-foreground">Estado</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="mt-1 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full lg:w-52">
          <Label className="text-xs text-muted-foreground">Proveedor</Label>
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="mt-1 rounded-xl">
              <SelectValue placeholder="Proveedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="hidden lg:block rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left">
              <th className="p-3 font-medium">Número</th>
              <th className="p-3 font-medium">Proveedor</th>
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Creado por</th>
              <th className="p-3 font-medium">Estado</th>
              <th className="p-3 font-medium">Entrega</th>
              <th className="p-3 font-medium">Líneas</th>
              <th className="p-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((o) => (
              <tr key={o.id} className="border-b border-border/80 hover:bg-muted/30">
                <td className="p-3 font-mono text-xs">{o.number}</td>
                <td className="p-3">{o.supplier_name}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {o.created_date ? new Date(o.created_date).toLocaleString("es-ES") : "—"}
                </td>
                <td className="p-3 text-xs">{o.requested_by_name || "—"}</td>
                <td className="p-3">
                  <Badge variant="outline" className="font-normal">
                    {STATUS_LABELS[o.status] || o.status}
                  </Badge>
                </td>
                <td className="p-3 text-xs">{DELIVERY_LABELS[o.delivery_type] || o.delivery_type}</td>
                <td className="p-3">{parseLines(o.lines_json).length}</td>
                <td className="p-3 text-right space-x-1">
                  {o.pdf_filename && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg h-8"
                      onClick={() => downloadPdf(o.id)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> PDF
                    </Button>
                  )}
                  <OrderStatusActions
                    order={o}
                    busy={statusBusy}
                    onDelivered={() => patchStatus(o.id, "delivered")}
                    onCancelled={() => patchStatus(o.id, "cancelled")}
                    onIssues={() => setIssueDialog({ open: true, orderId: o.id, notes: "" })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && (
          <p className="p-8 text-center text-muted-foreground text-sm">No hay pedidos con estos filtros.</p>
        )}
      </div>

      <div className="lg:hidden space-y-3">
        {filteredOrders.map((o) => (
          <div key={o.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <div className="flex justify-between gap-2">
              <span className="font-mono text-xs">{o.number}</span>
              <Badge variant="outline">{STATUS_LABELS[o.status] || o.status}</Badge>
            </div>
            <p className="font-medium">{o.supplier_name}</p>
            <p className="text-xs text-muted-foreground">
              {o.created_date ? new Date(o.created_date).toLocaleString("es-ES") : ""} ·{" "}
              {parseLines(o.lines_json).length} líneas · {DELIVERY_LABELS[o.delivery_type]}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {o.pdf_filename && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => downloadPdf(o.id)}
                >
                  <Download className="h-4 w-4 mr-1" /> PDF
                </Button>
              )}
              <OrderStatusActions
                order={o}
                busy={statusBusy}
                onDelivered={() => patchStatus(o.id, "delivered")}
                onCancelled={() => patchStatus(o.id, "cancelled")}
                onIssues={() => setIssueDialog({ open: true, orderId: o.id, notes: "" })}
              />
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Proveedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSupplier && (
                <p className="text-xs text-muted-foreground mt-1">
                  Email para el pedido:{" "}
                  <span className="font-medium text-foreground">
                    {supplierEmailUsed || "—"}
                  </span>
                  {!supplierEmailUsed && (
                    <span className="text-destructive block mt-1">
                      Sin email: no podrás tramitar hasta completarlo en Proveedores.
                    </span>
                  )}
                </p>
              )}
            </div>

            <div>
              <Label>Entregar en</Label>
              <Select value={deliveryType} onValueChange={setDeliveryType}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_address">Dirección empresa / almacén</SelectItem>
                  <SelectItem value="project">Obra en curso</SelectItem>
                  <SelectItem value="pickup_store">Recoger en tienda</SelectItem>
                </SelectContent>
              </Select>
              {deliveryType === "project" && (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs">Obra</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Seleccionar obra" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs">Dirección manual (si la obra no tiene dirección)</Label>
                  <Input
                    className="rounded-xl"
                    value={deliveryAddressManual}
                    onChange={(e) => setDeliveryAddressManual(e.target.value)}
                    placeholder="Solo si hace falta"
                  />
                </div>
              )}
            </div>

            <div>
              <Label>Líneas</Label>
              <div className="mt-2 space-y-2 rounded-xl border border-border p-3 bg-muted/20">
                <Input
                  className="rounded-xl mb-2"
                  placeholder="Buscar material por nombre o código..."
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                />
                <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materialsFiltered.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {(m.code ? `${m.code} · ` : "") + (m.name || "")} ({m.unit || "ud"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cantidad</Label>
                    <Input
                      className="rounded-xl mt-1"
                      type="number"
                      min="0"
                      step="any"
                      value={qtyDraft}
                      onChange={(e) => setQtyDraft(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Obs. línea</Label>
                    <Input
                      className="rounded-xl mt-1"
                      value={obsDraft}
                      onChange={(e) => setObsDraft(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="button" variant="secondary" className="rounded-xl w-full" onClick={addLine}>
                  Añadir línea
                </Button>
              </div>
              <ul className="mt-2 space-y-2">
                {lines.map((ln, idx) => (
                  <li
                    key={`${ln.material_id}-${idx}`}
                    className="flex justify-between gap-2 text-sm border border-border rounded-xl px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{ln.material_name}</span>{" "}
                      <span className="text-muted-foreground">
                        × {ln.quantity} {ln.unit}
                      </span>
                      {ln.observation ? (
                        <span className="text-xs block text-muted-foreground">{ln.observation}</span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive"
                      onClick={() => removeLine(idx)}
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Label>Observaciones generales</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Cerrar
            </Button>
            <Button
              className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={sending || !supplierEmailUsed || !pedidosConfigured}
              onClick={submitOrder}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Tramitar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={issueDialog.open}
        onOpenChange={(v) => !v && setIssueDialog({ open: false, orderId: "", notes: "" })}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Incidencias en la entrega</DialogTitle>
          </DialogHeader>
          <Textarea
            className="rounded-xl"
            rows={4}
            placeholder="Describe la incidencia..."
            value={issueDialog.notes}
            onChange={(e) => setIssueDialog((d) => ({ ...d, notes: e.target.value }))}
          />
          <DialogFooter>
            <Button
              className="rounded-xl"
              disabled={statusBusy || !issueDialog.notes.trim()}
              onClick={() =>
                patchStatus(issueDialog.orderId, "delivered_with_issues", issueDialog.notes.trim())
              }
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderStatusActions({ order, busy, onDelivered, onCancelled, onIssues }) {
  const pending = order.status === "pending_delivery" || order.status === "send_error";
  if (!pending && order.status !== "delivered") {
    return null;
  }
  return (
    <>
      {pending && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg h-8"
            disabled={busy}
            onClick={onDelivered}
          >
            Entregado
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg h-8"
            disabled={busy}
            onClick={onIssues}
          >
            Incidencias
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg h-8 text-destructive border-destructive/30"
            disabled={busy}
            onClick={onCancelled}
          >
            Cancelar
          </Button>
        </>
      )}
      {order.status === "delivered" && (
        <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={busy} onClick={onIssues}>
          Añadir incidencia
        </Button>
      )}
    </>
  );
}
