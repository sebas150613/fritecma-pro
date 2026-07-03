import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { getStoredAuthToken, runtimeConfig } from "@/lib/runtime-config";
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

const SUBMIT_METHOD_LABELS = {
  email: "Email",
  commercial: "Realizado al comercial",
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
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);
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
  const [pendingRequests, setPendingRequests] = useState([]);
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);

  const loadAll = async () => {
    const me = await appApi.auth.me();
    setUser(me);
    const [listRes, sup, mat, proj, reqs] = await Promise.all([
      appApi.purchaseOrders.list(),
      appApi.entities.Supplier.list("name", 300),
      appApi.entities.Material.list("name", 800),
      appApi.entities.Project.list("name", 200),
      appApi.entities.MaterialRequest.filter({ status: "aprobado" }).catch(() => []),
    ]);
    setOrders(listRes?.orders || []);
    setSuppliers(sup);
    setMaterials(mat);
    setProjects((proj || []).filter((p) => p.status === "en_curso"));
    setPendingRequests((reqs || []).filter((r) => !r.purchase_order_id));
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

  const pedidosConfigured = useMemo(() => {
    if (!user) {
      return false;
    }
    const enabled = user.pedidos_smtp_enabled === true;
    const host = String(user.pedidos_smtp_host || "").trim();
    const port = Number(user.pedidos_smtp_port);
    const from = String(user.pedidos_email_from || "").trim();
    const smtpUser = String(user.pedidos_smtp_user || "").trim();
    const passOk = user.pedidos_smtp_pass_configured === true || !smtpUser;
    return (
      enabled &&
      Boolean(host) &&
      Number.isFinite(port) &&
      port > 0 &&
      Boolean(from) &&
      passOk
    );
  }, [user]);

  const canSendPurchaseEmail = pedidosConfigured && Boolean(supplierEmailUsed);

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

  const validateBasicsForSubmit = () => {
    if (!supplierId) {
      toast.error("Selecciona un proveedor.");
      return false;
    }
    if (lines.length === 0) {
      toast.error("Añade al menos una línea.");
      return false;
    }
    if (deliveryType === "project") {
      if (!projectId) {
        toast.error("Selecciona una obra.");
        return false;
      }
      const p = projects.find((x) => x.id === projectId);
      const manual = deliveryAddressManual.trim();
      const fromProject = String(p?.address || "").trim();
      if (!fromProject && !manual) {
        toast.error(
          "Indica una dirección de entrega (la obra no tiene dirección en ficha)."
        );
        return false;
      }
    }
    return true;
  };

  const buildSendPayload = () => {
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
    return body;
  };

  const resetOrderForm = async () => {
    setDialogOpen(false);
    setMethodDialogOpen(false);
    setLines([]);
    setNotes("");
    setSupplierId("");
    setDeliveryType("company_address");
    setProjectId("");
    setDeliveryAddressManual("");
    setSelectedRequestIds([]);
    await loadAll();
  };

  const linkSelectedRequests = async (order) => {
    if (!order?.id || selectedRequestIds.length === 0) return;
    try {
      await Promise.all(
        selectedRequestIds.map((id) =>
          appApi.entities.MaterialRequest.update(id, {
            purchase_order_id: order.id,
            purchase_order_number: order.number || "",
          })
        )
      );
      toast.success(`${selectedRequestIds.length} solicitud(es) vinculadas al pedido ${order.number || ""}.`);
    } catch {
      toast.error("El pedido se creó, pero no se pudieron vincular algunas solicitudes.");
    }
  };

  const toggleRequestSelected = (id) => {
    setSelectedRequestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const startOrderFromRequests = () => {
    const selected = pendingRequests.filter((r) => selectedRequestIds.includes(r.id));
    if (selected.length === 0) {
      toast.error("Marca al menos una solicitud.");
      return;
    }
    const newLines = [];
    const unmatched = [];
    selected.forEach((r) => {
      const desc = String(r.description || "").trim().toLowerCase();
      const mat = materials.find((m) => {
        const code = String(m.code || "").trim().toLowerCase();
        const name = String(m.name || "").trim().toLowerCase();
        return (code && desc.includes(code)) || (name && desc && (desc.includes(name) || name === desc));
      });
      if (mat) {
        newLines.push({
          material_id: mat.id,
          material_code: mat.code || "",
          material_name: mat.name || "",
          unit: mat.unit || "ud",
          quantity: Number(r.quantity) || 1,
          observation: `Solicitud de ${r.technician_name || r.technician_email}`,
        });
      } else {
        unmatched.push(r);
      }
    });
    setLines(newLines);
    setNotes(
      unmatched.length
        ? "Solicitudes sin material en catálogo (añadir línea a mano):\n" +
            unmatched
              .map((r) => `• ${r.technician_name || r.technician_email}: ${r.quantity} ${r.unit || "ud"} — ${r.description}`)
              .join("\n")
        : ""
    );
    setDialogOpen(true);
    if (unmatched.length) {
      toast(`${unmatched.length} solicitud(es) sin coincidencia en catálogo: revisa las observaciones del pedido.`);
    }
  };

  const submitOrderWithMethod = async (submitMethod) => {
    const body = { ...buildSendPayload(), submit_method: submitMethod };
    setSending(true);
    try {
      try {
        const sendResult = await appApi.purchaseOrders.send(body);
        await linkSelectedRequests(sendResult?.order);
        if (submitMethod === "email") {
          toast.success("Pedido tramitado y enviado al proveedor por correo.");
        } else {
          toast.success(
            "Pedido registrado como pendiente de entrega (realizado al comercial, sin envío de correo)."
          );
        }
      } catch (e) {
        if (e?.status === 502 && e?.data?.order) {
          await linkSelectedRequests(e.data.order);
          toast.error(e?.message || "No se pudo enviar el correo; el pedido quedó registrado.");
        } else {
          throw e;
        }
      }
      await resetOrderForm();
    } catch (e) {
      toast.error(e?.message || "No se pudo tramitar el pedido.");
    } finally {
      setSending(false);
    }
  };

  const openMethodChoice = () => {
    if (!validateBasicsForSubmit()) return;
    setMethodDialogOpen(true);
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
      Authorization: `Bearer ${getStoredAuthToken() || ""}`,
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
            <ShoppingBag className="h-7 w-7 text-accent" /> Pedidos a proveedor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registra pedidos con PDF: envío por correo (SMTP propio en Configuración → Pedidos) o solo en aplicación si ya lo gestionaste con el comercial presencial o por teléfono.
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
          Para <strong>enviar el pedido por correo</strong> al proveedor necesitas el SMTP de pedidos en
          Configuración. Si el pedido ya lo hiciste con el comercial (presencial o teléfono), puedes
          tramitarlo igualmente con «Pedido realizado al comercial» sin SMTP.
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm">
                Solicitudes de material aprobadas sin pedido ({pendingRequests.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Marca las que quieras incluir y crea el pedido: quedarán vinculadas automáticamente.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={selectedRequestIds.length === 0}
              onClick={startOrderFromRequests}
            >
              Crear pedido con seleccionadas ({selectedRequestIds.length})
            </Button>
          </div>
          <ul className="space-y-1">
            {pendingRequests.map((r) => (
              <li key={r.id}>
                <label className="flex items-start gap-3 text-sm rounded-xl px-3 py-2 hover:bg-muted/40 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-current"
                    checked={selectedRequestIds.includes(r.id)}
                    onChange={() => toggleRequestSelected(r.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{r.description}</span>{" "}
                    <span className="text-muted-foreground">
                      × {r.quantity} {r.unit || "ud"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {r.technician_name || r.technician_email}
                      {r.created_date ? ` · ${new Date(r.created_date).toLocaleDateString("es-ES")}` : ""}
                      {r.urgency && r.urgency !== "normal" ? ` · ${r.urgency === "muy_urgente" ? "MUY URGENTE" : "Urgente"}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
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
              <th className="p-3 font-medium">Tramitación</th>
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
                <td className="p-3 text-xs">
                  <span className="text-muted-foreground">
                    {SUBMIT_METHOD_LABELS[o.submit_method === "commercial" ? "commercial" : "email"]}
                  </span>
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
            <p className="text-xs font-medium text-foreground">
              {SUBMIT_METHOD_LABELS[o.submit_method === "commercial" ? "commercial" : "email"]}
            </p>
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setMethodDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo pedido</DialogTitle>
          </DialogHeader>
          {selectedRequestIds.length > 0 && (
            <p className="text-xs rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
              Al tramitar, se vincularán {selectedRequestIds.length} solicitud(es) de material a este pedido.
            </p>
          )}
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
                  Email del proveedor (solo si envías por correo):{" "}
                  <span className="font-medium text-foreground">
                    {supplierEmailUsed || "—"}
                  </span>
                  {!supplierEmailUsed && (
                    <span className="block mt-1 text-amber-800 dark:text-amber-200">
                      Sin email: usa «Pedido realizado al comercial» o completa el email en Proveedores
                      para enviar por correo.
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
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" className="rounded-xl w-full sm:w-auto" onClick={() => setDialogOpen(false)}>
              Cerrar
            </Button>
            <Button
              className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto"
              disabled={sending}
              onClick={openMethodChoice}
            >
              Tramitar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={methodDialogOpen} onOpenChange={setMethodDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>¿Cómo quieres tramitar este pedido?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Elige si FRIGEST debe enviar el PDF por correo al proveedor o solo registrar el pedido
            acordado con el comercial.
          </p>
          <div className="flex flex-col gap-3 pt-1">
            <Button
              type="button"
              variant="default"
              className="rounded-xl h-auto min-h-[4rem] py-4 px-4 justify-start text-left whitespace-normal"
              disabled={sending || !canSendPurchaseEmail}
              onClick={() => submitOrderWithMethod("email")}
            >
              <span className="flex flex-col items-start gap-1 w-full">
                <span className="font-semibold">Enviar pedido por correo</span>
                <span className="text-xs font-normal text-muted-foreground leading-snug">
                  Valida SMTP de la empresa y envía el PDF al email del proveedor.
                </span>
              </span>
            </Button>
            {!canSendPurchaseEmail ? (
              <p className="text-xs text-amber-800 dark:text-amber-200 px-0.5">
                Configura el SMTP de pedidos y el email del proveedor, o usa la opción siguiente.
              </p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl h-auto min-h-[4rem] py-4 px-4 justify-start text-left whitespace-normal"
              disabled={sending}
              onClick={() => submitOrderWithMethod("commercial")}
            >
              <span className="flex flex-col items-start gap-1 w-full">
                <span className="font-semibold">Pedido realizado al comercial</span>
                <span className="text-xs font-normal text-muted-foreground leading-snug">
                  Sin envío de correo. Queda pendiente de entrega con PDF para archivo interno.
                </span>
              </span>
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              onClick={() => setMethodDialogOpen(false)}
            >
              Volver
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
