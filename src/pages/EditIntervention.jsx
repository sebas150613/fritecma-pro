import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import BackButton from "../components/BackButton";
import { Save, Loader2, Plus } from "lucide-react";
import MaterialLineForm from "../components/MaterialLineForm";
import moment from "moment";
import GasTypeCombobox from "@/components/GasTypeCombobox";
import {
  resolveCanonicalGasLabel,
  normalizeGasCompareKey,
  isOfficialGasType,
  GAS_TYPE_OTHER_LABEL,
  GAS_OTHER_REQUIRED_MESSAGE,
} from "@/lib/refrigerantGases";
import {
  parseTramosJson,
  ensureTramoIds,
  findTramoById,
  upsertDisplacementMaterialLine,
  stripDisplacementLines,
  computeTotalsFromLines,
} from "@/lib/displacementBilling";

const STATUS_OPTIONS = [
  { value: "en_curso", label: "En Curso" },
  { value: "pendiente_revision", label: "Pendiente Revisión" },
  { value: "validado", label: "Validado" },
  { value: "completado", label: "Completado" },
];

export default function EditIntervention() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState(null);
  const [workCenters, setWorkCenters] = useState([]);
  const [gasBottleLegacy, setGasBottleLegacy] = useState([]);

  const [form, setForm] = useState({
    client_id: "",
    client_name: "",
    work_center_id: "",
    work_center_name: "",
    date: "",
    location_address: "",
    gas_type: "",
    gas_other_ui: false,
    gas_other_input: "",
    gas_loaded_kg: 0,
    gas_recovered_kg: 0,
    description: "",
    technician_notes: "",
    discount_percent: 0,
    status: "pendiente_revision",
    receptor_name: "",
    receptor_dni: "",
    client_conformidad: false,
    incident_status: "",
  });

  const [lines, setLines] = useState([]);
  const [originalLines, setOriginalLines] = useState([]);
  const [depCantidad, setDepCantidad] = useState(0);
  const [depTramoId, setDepTramoId] = useState("");

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
    const [me, interventions, materialList, clientList, bottleList] = await Promise.all([
      appApi.auth.me(),
      appApi.entities.Intervention.filter({ id }, "-created_date", 1),
      appApi.entities.Material.filter({ is_active: true }, "name", 500),
      appApi.entities.Client.list("name", 500),
      appApi.entities.GasBottle.list("-created_date", 200).catch(() => []),
    ]);
    setUser(me);
    setMaterials(materialList);
    setClients(clientList);
    const leg = [...new Set((bottleList || []).map((b) => b.gas_type).filter(Boolean))];
    setGasBottleLegacy(leg);

    if (interventions.length > 0) {
      const inv = interventions[0];
      setOriginal(inv);
      if (inv.client_id) {
        const centers = await appApi.entities.WorkCenter.filter({ client_id: inv.client_id }, "name", 100);
        setWorkCenters(centers);
      }
      const gt = inv.gas_type || "";
      const isExplicitOther =
        normalizeGasCompareKey(gt) === normalizeGasCompareKey(GAS_TYPE_OTHER_LABEL);
      const isUnknownCustom = gt && !isOfficialGasType(gt);
      const isOther = Boolean(gt && (isExplicitOther || isUnknownCustom));
      setForm({
        client_id: inv.client_id || "",
        client_name: inv.client_name || "",
        work_center_id: inv.work_center_id || "",
        work_center_name: inv.work_center_name || "",
        date: inv.date ? moment(inv.date).format("YYYY-MM-DDTHH:mm") : "",
        location_address: inv.location_address || "",
        gas_type: isOther ? "" : resolveCanonicalGasLabel(gt, leg),
        gas_other_ui: isOther,
        gas_other_input: isOther ? gt : "",
        gas_loaded_kg: inv.gas_loaded_kg || 0,
        gas_recovered_kg: inv.gas_recovered_kg || 0,
        description: inv.description || "",
        technician_notes: inv.technician_notes || "",
        discount_percent: inv.discount_percent || 0,
        status: inv.status || "pendiente_revision",
        receptor_name: inv.receptor_name || "",
        receptor_dni: inv.receptor_dni || "",
        client_conformidad: inv.client_conformidad || false,
        incident_status: inv.incident_status || "",
      });
      const parsedLines = inv.materials_json ? JSON.parse(inv.materials_json) : [];
      setLines(parsedLines);
      setOriginalLines(parsedLines);
      setDepCantidad(inv.desplazamientos_cantidad ?? 0);
      setDepTramoId(inv.desplazamiento_tramo_id || "");
    }
    } catch (err) {
      console.error("[EditIntervention] Error loading data:", err);
      toast.error("Error al cargar los datos del parte.");
    } finally {
    setLoading(false);
    }
  };

  const calcTotals = (linesArg) => {
    const list = linesArg ?? lines;
    return computeTotalsFromLines(list, form.discount_percent || 0);
  };

  const handleSave = async () => {
    if (form.gas_other_ui && !String(form.gas_other_input || "").trim()) {
      toast.error(GAS_OTHER_REQUIRED_MESSAGE);
      return;
    }
    const finalGas = form.gas_other_ui
      ? resolveCanonicalGasLabel(form.gas_other_input, gasBottleLegacy)
      : resolveCanonicalGasLabel(form.gas_type, gasBottleLegacy);

    setSaving(true);
    const tramosOrg = ensureTramoIds(parseTramosJson(user?.desplazamiento_tramos_json));
    const tramoSel = depTramoId ? findTramoById(tramosOrg, depTramoId) : null;
    let outLines = [...lines];
    const cant = Math.max(0, parseInt(String(depCantidad), 10) || 0);
    const canDep =
      user?.role === "admin" ||
      user?.role === "superadmin" ||
      user?.role === "oficina" ||
      user?.role === "encargado";
    if (canDep) {
      if (cant > 0 && tramoSel) {
        outLines = upsertDisplacementMaterialLine(outLines, { cantidad: cant, tramo: tramoSel });
      } else if (cant === 0) {
        outLines = stripDisplacementLines(outLines);
      }
    }
    const totals = calcTotals(outLines);
    const gasLeak = Math.max(0, (form.gas_loaded_kg || 0) - (form.gas_recovered_kg || 0));

    // Build changes summary for audit
    const changes = [];
    if (original.description !== form.description) changes.push("descripción");
    if (original.status !== form.status) changes.push(`estado: ${original.status} → ${form.status}`);
    if (original.gas_type !== finalGas) changes.push("tipo de gas");
    if (original.technician_notes !== form.technician_notes) changes.push("notas técnicas");
    if (original.discount_percent !== form.discount_percent) changes.push("descuento");
    const materialsChanged = JSON.stringify(lines) !== original.materials_json;
    if (materialsChanged) changes.push("materiales/líneas");

    let dispPatch = {};
    if (canDep && cant > 0 && tramoSel) {
      dispPatch = {
        desplazamientos_cantidad: cant,
        desplazamiento_tramo_id: tramoSel.id,
        desplazamiento_tramo_nombre: tramoSel.nombre,
        desplazamiento_precio_unitario: tramoSel.precio,
        desplazamiento_total: cant * tramoSel.precio,
        desplazamiento_pendiente_tarifa: false,
      };
    } else if (canDep && cant === 0) {
      dispPatch = {
        desplazamientos_cantidad: 0,
        desplazamiento_tramo_id: undefined,
        desplazamiento_tramo_nombre: undefined,
        desplazamiento_precio_unitario: undefined,
        desplazamiento_total: undefined,
        desplazamiento_pendiente_tarifa: false,
      };
    }

    await appApi.entities.Intervention.update(id, {
      client_id: form.client_id,
      client_name: form.client_name,
      work_center_id: form.work_center_id || undefined,
      work_center_name: form.work_center_name || undefined,
      date: new Date(form.date).toISOString(),
      location_address: form.location_address,
      gas_type: finalGas || undefined,
      gas_loaded_kg: form.gas_loaded_kg,
      gas_recovered_kg: form.gas_recovered_kg,
      gas_leak_kg: gasLeak,
      description: form.description,
      technician_notes: form.technician_notes,
      discount_percent: form.discount_percent,
      status: form.status,
      receptor_name: form.receptor_name || undefined,
      receptor_dni: form.receptor_dni || undefined,
      client_conformidad: form.client_conformidad,
      incident_status: form.incident_status || undefined,
      materials_json: JSON.stringify(outLines),
      subtotal: totals.subtotal,
      iva_total: totals.ivaTotal,
      total: totals.total,
      ...dispPatch,
    });

    // Adjust stock for changed material quantities
    try {
      const origById = new Map(originalLines.filter(l => l.material_id && l.material_id !== "__free_text__").map(l => [l.material_id, l]));
      for (const line of outLines) {
        if (!line.material_id || line.material_id === "__free_text__" || line._isLabor || line._isDisplacementLine) continue;
        const orig = origById.get(line.material_id);
        const origQty = orig?.quantity || 0;
        const newQty = line.quantity || 0;
        const delta = newQty - origQty;
        if (delta !== 0) {
          const mat = await appApi.entities.Material.get(line.material_id).catch(() => null);
          if (mat && mat.stock !== undefined) {
            const newStock = (mat.stock || 0) - delta;
            await appApi.entities.Material.update(line.material_id, { stock: newStock });
            await appApi.entities.StockMovement.create({
              material_id: line.material_id,
              material_name: line.material_name || mat.name,
              movement_type: delta > 0 ? "salida_parte" : "entrada_ajuste",
              quantity: Math.abs(delta),
              stock_before: mat.stock || 0,
              stock_after: newStock,
              intervention_number: original.number,
              notes: `Ajuste por edición de parte ${original.number}`,
              timestamp: new Date().toISOString(),
            }).catch(() => {});
          }
        }
      }
      // Handle removed materials
      const newById = new Map(outLines.map(l => [l.material_id, l]));
      for (const orig of originalLines) {
        if (!orig.material_id || orig.material_id === "__free_text__" || orig._isLabor || orig._isDisplacementLine) continue;
        if (!newById.has(orig.material_id)) {
          const mat = await appApi.entities.Material.get(orig.material_id).catch(() => null);
          if (mat && mat.stock !== undefined) {
            const restoreQty = orig.quantity || 0;
            await appApi.entities.Material.update(orig.material_id, { stock: (mat.stock || 0) + restoreQty });
            await appApi.entities.StockMovement.create({
              material_id: orig.material_id,
              material_name: orig.material_name || mat.name,
              movement_type: "entrada_ajuste",
              quantity: restoreQty,
              stock_before: mat.stock || 0,
              stock_after: (mat.stock || 0) + restoreQty,
              intervention_number: original.number,
              notes: `Reposición por edición de parte ${original.number} (línea eliminada)`,
              timestamp: new Date().toISOString(),
            }).catch(() => {});
          }
        }
      }
    } catch (stockErr) {
      console.error("[EditIntervention] Error adjusting stock:", stockErr);
      toast.error("Parte guardado pero hubo un error al ajustar el stock. Revisa el inventario.", { duration: 8000 });
    }

    await appApi.entities.AuditLog.create({
      action: "modificacion",
      entity_type: "Intervention",
      entity_id: id,
      entity_reference: original.number,
      user_email: user.email,
      user_name: user.full_name,
      changes_summary: changes.length > 0 ? changes.join(", ") : "Sin cambios detectados",
      timestamp: new Date().toISOString(),
    });

    // Update linked breakdown if intervention is connected to one
    if (original.breakdown_id) {
      try {
        const bdPatch = {
          last_intervention_id: id,
          last_intervention_number: original.number,
        };
        await appApi.breakdowns.update(original.breakdown_id, bdPatch);
      } catch (e) {
        console.error("[EditIntervention] Error updating breakdown after edit:", e);
      }
    }

    setSaving(false);
    navigate(`/interventions/${id}`);
  };

  const canEditPrices =
    user?.role === "admin" ||
    user?.role === "superadmin" ||
    user?.role === "oficina" ||
    user?.role === "encargado";
  const canManageDep = canEditPrices;
  const tramosOrg = ensureTramoIds(parseTramosJson(user?.desplazamiento_tramos_json));

  const previewLines = useMemo(() => {
    if (!canManageDep) return lines;
    const tramoSel = depTramoId ? findTramoById(tramosOrg, depTramoId) : null;
    const cant = Math.max(0, parseInt(String(depCantidad), 10) || 0);
    if (cant > 0 && tramoSel) {
      return upsertDisplacementMaterialLine(lines, { cantidad: cant, tramo: tramoSel });
    }
    if (cant === 0) {
      return stripDisplacementLines(lines);
    }
    return lines;
  }, [lines, depCantidad, depTramoId, tramosOrg, canManageDep]);

  const totals = calcTotals(previewLines);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  // Bloqueo legal: parte facturado, completado o con invoice aceptada es inalterable (Ley Antifraude)
  if (original?.status === 'facturado' || original?.status === 'completado' || original?.status === 'anulado') {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 text-center max-w-md mx-auto">
        <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-8 w-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold">Parte bloqueado</h2>
        <p className="text-muted-foreground text-sm">Este parte ha sido facturado bajo el protocolo Veri*factu y es inalterable según la Ley 11/2021 (Antifraude). No se puede modificar ningún dato.</p>
        <p className="text-xs text-muted-foreground">Si hay un error, genera una <strong>Factura Rectificativa</strong> desde el detalle del parte.</p>
        <Button variant="outline" onClick={() => navigate(`/interventions/${id}`)} className="rounded-xl mt-2">Volver al Parte</Button>
      </div>
    );
  }

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32">
      <div className="flex items-center gap-3">
        <BackButton label="Parte" to={`/interventions/${id}`} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar Parte</h1>
          <p className="text-sm text-muted-foreground">{original?.number}</p>
        </div>
      </div>

      {/* Cliente y Fecha */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cabecera</h2>
        <div>
          <Label>Cliente</Label>
          <Select value={form.client_id} onValueChange={async (v) => {
            const c = clients.find(x => x.id === v);
            if (c) {
              setForm(f => ({ ...f, client_id: c.id, client_name: c.name, work_center_id: "", work_center_name: "" }));
              const centers = await appApi.entities.WorkCenter.filter({ client_id: v }, "name", 100);
              setWorkCenters(centers);
            }
          }}>
            <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {form.client_id && (
          <div>
            <Label>Centro de Trabajo</Label>
            <Select value={form.work_center_id} onValueChange={v => {
              const wc = workCenters.find(x => x.id === v);
              setForm(f => ({ ...f, work_center_id: v, work_center_name: wc?.name || "" }));
            }}>
              <SelectTrigger className="mt-1 rounded-xl">
                <SelectValue placeholder={workCenters.length === 0 ? "Sin centros registrados" : "Seleccionar sede..."} />
              </SelectTrigger>
              <SelectContent>
                {workCenters.map(wc => (
                  <SelectItem key={wc.id} value={wc.id}>{wc.name}{wc.city ? ` · ${wc.city}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Fecha y Hora</Label>
            <Input type="datetime-local" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Dirección</Label>
            <Input value={form.location_address} onChange={(e) => setForm(f => ({ ...f, location_address: e.target.value }))} className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Descuento (%)</Label>
            <Input type="number" min="0" max="100" value={form.discount_percent} onChange={(e) => setForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) || 0 }))} className="mt-1 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Gas */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Gas Refrigerante</h2>
        <div>
          <Label>Tipo de Gas</Label>
          <div className="mt-1">
            <GasTypeCombobox
              value={form.gas_type}
              onChange={(v) => setForm((f) => ({ ...f, gas_type: v }))}
              otherUi={form.gas_other_ui}
              onOtherUiChange={(v) => setForm((f) => ({ ...f, gas_other_ui: v }))}
              otherDraft={form.gas_other_input}
              onOtherDraftChange={(v) => setForm((f) => ({ ...f, gas_other_input: v }))}
              legacyGasTypes={gasBottleLegacy}
              priorityGasTypes={[]}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Kg Cargados</Label>
            <Input type="number" min="0" step="0.1" value={form.gas_loaded_kg} onChange={(e) => setForm(f => ({ ...f, gas_loaded_kg: parseFloat(e.target.value) || 0 }))} className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Kg Recuperados</Label>
            <Input type="number" min="0" step="0.1" value={form.gas_recovered_kg} onChange={(e) => setForm(f => ({ ...f, gas_recovered_kg: parseFloat(e.target.value) || 0 }))} className="mt-1 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Descripción</h2>
        <Textarea placeholder="Descripción del trabajo..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="rounded-xl" />
        <Textarea placeholder="Notas técnicas..." value={form.technician_notes} onChange={(e) => setForm(f => ({ ...f, technician_notes: e.target.value }))} rows={2} className="rounded-xl" />
      </div>

      {/* Estado de la Incidencia */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Estado de la Incidencia</h2>
        <Select value={form.incident_status || ""} onValueChange={(v) => setForm(f => ({ ...f, incident_status: v }))}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Seleccionar estado..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="finalizado">Finalizado</SelectItem>
            <SelectItem value="pendiente_operativa">Pendiente (Maquina Operativa)</SelectItem>
            <SelectItem value="pendiente_parada">Pendiente (Maquina Parada)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conformidad del Cliente */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conformidad del Cliente</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Nombre Receptor *</Label>
            <Input value={form.receptor_name} onChange={(e) => setForm(f => ({ ...f, receptor_name: e.target.value }))} placeholder="Nombre y apellidos" className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>DNI / Código Trabajador *</Label>
            <Input value={form.receptor_dni} onChange={(e) => setForm(f => ({ ...f, receptor_dni: e.target.value }))} placeholder="DNI o código" className="mt-1 rounded-xl" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <input type="checkbox" id="edit-conformidad" checked={form.client_conformidad} onChange={(e) => setForm(f => ({ ...f, client_conformidad: e.target.checked }))} className="h-4 w-4 rounded border-input" />
          <Label htmlFor="edit-conformidad" className="text-sm">El cliente da su conformidad al trabajo realizado</Label>
        </div>
      </div>

      {canManageDep && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Desplazamiento
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <Label className="text-xs">Número de desplazamientos</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={depCantidad}
                onChange={(e) => setDepCantidad(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="mt-1 rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Tramo</Label>
              <Select value={depTramoId || "__none__"} onValueChange={(v) => setDepTramoId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue placeholder="Tramo…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin tramo —</SelectItem>
                  {tramosOrg.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre} · {t.precio.toFixed(2)} €
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Al guardar el parte se actualizarán la línea de desplazamiento en materiales y los totales.
          </p>
        </div>
      )}

      {/* Materiales */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Materiales</h2>
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { material_id: "", material_name: "", quantity: 1, unit_price: 0, total: 0, observation: "", unit: "ud", iva_percent: 21 }])} className="rounded-xl">
            <Plus className="h-4 w-4 mr-1" /> Añadir
          </Button>
        </div>
        <div className="space-y-3">
          {lines.map((line, i) => (
            <MaterialLineForm
              key={i}
              line={line}
              index={i}
              materials={materials}
              onUpdate={(idx, updated) => { const l = [...lines]; l[idx] = updated; setLines(l); }}
              onRemove={(idx) => setLines(lines.filter((_, j) => j !== idx))}
              isAdmin={canEditPrices}
            />
          ))}
        </div>
        {lines.length > 0 && (
          <div className="border-t border-border pt-4 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{totals.subtotal.toFixed(2)} €</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">IVA</span><span>{totals.ivaTotal.toFixed(2)} €</span></div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border"><span>Total</span><span>{totals.total.toFixed(2)} €</span></div>
          </div>
        )}
      </div>

      {/* Guardar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <p className="text-2xl font-bold">{totals.total.toFixed(2)} €</p>
          <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-8 h-12 text-base shadow-lg shadow-accent/25">
            {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Guardar Cambios
          </Button>
        </div>
      </div>
    </div>
  );
}

