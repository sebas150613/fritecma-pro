import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, MapPin, Loader2, Save, LogIn, AlertTriangle } from "lucide-react";
import BackButton from "../components/BackButton";
import MaterialLineForm from "../components/MaterialLineForm";
import LaborSection from "../components/LaborSection";
import ClientSelector from "../components/ClientSelector";
import { Checkbox } from "@/components/ui/checkbox";
import { validateStockAvailability, deductStockForIntervention } from "../lib/stockUtils";
import moment from "moment";
import GasTypeCombobox from "@/components/GasTypeCombobox";
import {
  resolveCanonicalGasLabel,
  normalizeGasCompareKey,
  GAS_OTHER_REQUIRED_MESSAGE,
} from "@/lib/refrigerantGases";
import { syncGasMaterialStock, findGasMaterialForType } from "@/lib/gasMaterialSync";
import { buildOrganizationTariffProfile } from "@/lib/organizationTariffs";
import {
  parseTramosJson,
  ensureTramoIds,
  findTramoById,
  upsertDisplacementMaterialLine,
  computeTotalsFromLines,
} from "@/lib/displacementBilling";

function buildPriorityGasTypesFromBottles(bottles) {
  const active = (bottles || []).filter(
    (b) => b.status === "activa" && (parseFloat(b.carga_actual) || 0) > 0
  );
  const weight = {};
  active.forEach((b) => {
    const g = b.gas_type;
    if (!g) return;
    const k = normalizeGasCompareKey(g);
    weight[k] = (weight[k] || 0) + (parseFloat(b.carga_actual) || 0);
  });
  return Object.entries(weight)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => active.find((x) => normalizeGasCompareKey(x.gas_type) === k)?.gas_type)
    .filter(Boolean);
}

function shouldAppendGasMaterialLine(lines, materialId, bottleSerial) {
  if (!materialId || !bottleSerial) return true;
  const sn = String(bottleSerial);
  const obsPat = "Gas cargado desde botella SN";
  return !lines.some((l) => {
    if (l.material_id === materialId) return true;
    const o = String(l.observation || "");
    return o.includes(obsPat) && o.includes(sn);
  });
}

export default function NewIntervention() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [gasBottles, setGasBottles] = useState([]);
  const [users, setUsers] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [stockWarnings, setStockWarnings] = useState([]);
  const [checkedIn, setCheckedIn] = useState(null); // null=loading, true/false
  const [showCheckinWarning, setShowCheckinWarning] = useState(false);
  const [sinFichaje, setSinFichaje] = useState(false);
  const [gasBillingPreview, setGasBillingPreview] = useState(null);

  const [organizationTarifas, setOrganizationTarifas] = useState(null);

  const [form, setForm] = useState({
    client_id: "",
    client_name: "",
    work_center_id: "",
    work_center_name: "",
    date: moment().format("YYYY-MM-DDTHH:mm"),
    location_lat: null,
    location_lng: null,
    location_address: "",
    gas_type: "",
    gas_other_ui: false,
    gas_other_input: "",
    gas_bottle_id: "",
    gas_loaded_kg: 0,
    gas_recovered_kg: 0,
    description: "",
    technician_notes: "",
    discount_percent: 0,
    receptor_name: "",
    receptor_dni: "",
    client_conformidad: false,
    incident_status: "finalizado",
    helper_email: "",
    helper_name: "",
    tipo_horario: "",
    tarifa_aplicada: null,
    desplazamientos_cantidad: 0,
    desplazamiento_tramo_id: "",
  });

  const [lines, setLines] = useState([]);
  const [laborLines, setLaborLines] = useState([]);

  useEffect(() => {
    loadInitialData();
    getLocation();
    // Refresh gas bottles every 5 seconds to catch recent stock changes
    const interval = setInterval(async () => {
      const bottles = await appApi.entities.GasBottle.list("-created_date", 200).catch(() => []);
      setGasBottles(bottles || []);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadInitialData = async () => {
    try {
      const me = await appApi.auth.me();
      setUser(me);
      setOrganizationTarifas(buildOrganizationTariffProfile(me));
      const isAdmin = me.role === "admin";

      if (!isAdmin) {
        const today = new Date().toISOString().slice(0, 10);
        const records = await appApi.entities.TimeRecord.filter(
          { technician_email: me.email, work_date: today },
          "-timestamp",
          1
        );
        const lastType = records[0]?.type;
        const isCheckedIn = lastType === "entrada" || lastType === "reanudacion";
        setCheckedIn(isCheckedIn);

        // Check if already saw the clock-in warning today
        const storedWarning = localStorage.getItem("clockInWarningDate");
        const today_date = new Date().toISOString().slice(0, 10);
        const hasSeenTodayWarning = storedWarning === today_date;

        // Show warning only if: not checked in AND haven't seen warning today
        if (!isCheckedIn && !hasSeenTodayWarning) {
          setShowCheckinWarning(true);
        }
      } else {
        setCheckedIn(true);
      }

      const [clientList, materialList, bottleList, userList] = await Promise.all([
        appApi.entities.Client.list("name", 500).catch(() => []),
        appApi.entities.Material.filter({ is_active: true }, "name", 500).catch(() => []),
        appApi.entities.GasBottle.list("-created_date", 200).catch(() => []),
        appApi.entities.User.list("full_name", 100).catch(() => []),
      ]);
      setClients(clientList || []);
      setMaterials(materialList || []);
      setGasBottles(bottleList || []);
      setUsers(userList || []);
    } catch (error) {
      console.error("Error loading initial data:", error);
      setCheckedIn(true);
    }
  };

  const getLocation = () => {
    if (!navigator.geolocation) return;
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({
          ...f,
          location_lat: pos.coords.latitude,
          location_lng: pos.coords.longitude,
          location_address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        }));
        setGettingLocation(false);
      },
      () => setGettingLocation(false),
      { enableHighAccuracy: true }
    );
  };

  const handleClientChange = async (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const centers = await appApi.entities.WorkCenter.filter({ client_id: clientId }, "name", 100);
    setWorkCenters(centers);
    setForm(f => ({
      ...f,
      client_id: client.id,
      client_name: client.name,
      work_center_id: "",
      work_center_name: "",
      discount_percent: client.discount_percent || 0,
    }));
  };

  const addLine = () => {
    setLines(prev => [...prev, { _id: Date.now() + Math.random(), material_id: "", material_name: "", quantity: 1, unit_price: 0, total: 0, observation: "", unit: "ud", iva_percent: 21 }]);
  };

  const updateLine = (index, updatedLine) => {
    const newLines = [...lines];
    newLines[index] = updatedLine;
    setLines(newLines);
  };

  const removeLine = (index) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const legacyGasKeys = useMemo(
    () => [...new Set(gasBottles.map((b) => b.gas_type).filter(Boolean))],
    [gasBottles]
  );

  const priorityGasTypes = useMemo(() => buildPriorityGasTypesFromBottles(gasBottles), [gasBottles]);

  const resolvedGasType = useMemo(() => {
    if (form.gas_other_ui) {
      return resolveCanonicalGasLabel(form.gas_other_input, legacyGasKeys);
    }
    return resolveCanonicalGasLabel(form.gas_type, legacyGasKeys);
  }, [form.gas_type, form.gas_other_ui, form.gas_other_input, legacyGasKeys]);

  const tramosOptions = useMemo(
    () => ensureTramoIds(parseTramosJson(user?.desplazamiento_tramos_json)),
    [user?.desplazamiento_tramos_json]
  );

  const canAssignTramoUi =
    user?.role === "admin" ||
    user?.role === "superadmin" ||
    user?.role === "oficina" ||
    user?.role === "encargado";

  const totals = useMemo(() => {
    const materialLines = [...lines];
    if (gasBillingPreview) materialLines.push(gasBillingPreview);
    let allLines = [...laborLines, ...materialLines];
    const cantPrev = Math.max(0, parseInt(String(form.desplazamientos_cantidad ?? 0), 10) || 0);
    if (canAssignTramoUi && cantPrev > 0 && form.desplazamiento_tramo_id) {
      const tr = findTramoById(tramosOptions, form.desplazamiento_tramo_id);
      if (tr) {
        allLines = upsertDisplacementMaterialLine(allLines, {
          cantidad: cantPrev,
          tramo: tr,
        });
      }
    }
    const subtotal = allLines.reduce((sum, l) => sum + (l.total || 0), 0);
    const discountAmount = subtotal * (form.discount_percent / 100);
    const subtotalAfterDiscount = subtotal - discountAmount;
    const ivaByRate = {};
    allLines.forEach((l) => {
      const rate = l.iva_percent || 21;
      const lineAfterDiscount = (l.total || 0) * (1 - form.discount_percent / 100);
      ivaByRate[rate] = (ivaByRate[rate] || 0) + lineAfterDiscount * (rate / 100);
    });
    const ivaTotal = Object.values(ivaByRate).reduce((s, v) => s + v, 0);
    return {
      subtotal,
      discountAmount,
      subtotalAfterDiscount,
      ivaTotal,
      total: subtotalAfterDiscount + ivaTotal,
    };
  }, [
    laborLines,
    lines,
    gasBillingPreview,
    form.discount_percent,
    form.desplazamientos_cantidad,
    form.desplazamiento_tramo_id,
    tramosOptions,
    canAssignTramoUi,
  ]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (form.gas_other_ui && !String(form.gas_other_input || "").trim()) {
        setGasBillingPreview(null);
        return;
      }
      if (!(form.gas_loaded_kg > 0)) {
        setGasBillingPreview(null);
        return;
      }
      const fg = resolvedGasType;
      if (!fg) {
        setGasBillingPreview(null);
        return;
      }
      const mat = await findGasMaterialForType(fg, null, legacyGasKeys);
      if (cancelled || !mat) {
        if (!cancelled) setGasBillingPreview(null);
        return;
      }
      const qty = form.gas_loaded_kg;
      const unit_p = mat.sell_price || 0;
      const iv = mat.iva_percent ?? 21;
      setGasBillingPreview({
        _id: "__gas_preview__",
        material_id: mat.id,
        material_name: mat.name,
        material_code: mat.code || "",
        quantity: qty,
        unit: "kg",
        unit_price: unit_p,
        iva_percent: iv,
        total: qty * unit_p,
        observation: "",
      });
    };
    const id = setTimeout(run, 350);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [resolvedGasType, form.gas_loaded_kg, form.gas_other_ui, form.gas_other_input, legacyGasKeys]);

  const availableBottles = resolvedGasType
    ? gasBottles.filter(
        (b) =>
          b.status === "activa" &&
          normalizeGasCompareKey(b.gas_type) === normalizeGasCompareKey(resolvedGasType) &&
          (parseFloat(b.carga_actual) || 0) > 0
      )
    : [];

  const handleSave = async () => {
    if (!form.client_id) return;

    if (form.gas_other_ui && !String(form.gas_other_input || "").trim()) {
      alert(GAS_OTHER_REQUIRED_MESSAGE);
      return;
    }

    const finalGasType = form.gas_other_ui
      ? resolveCanonicalGasLabel(form.gas_other_input, legacyGasKeys)
      : resolveCanonicalGasLabel(form.gas_type, legacyGasKeys);

    // Validate stock availability before saving (solo líneas introducidas manualmente; el gas se valida por botella)
    const materialOnlyLinesInput = lines.filter(
      (l) => l.material_id && l.material_id !== "__free_text__"
    );
    const warnings = await validateStockAvailability(materialOnlyLinesInput);
    if (warnings.length > 0) {
      const proceed = window.confirm(
        `⚠️ Stock insuficiente para:\n${warnings.map(w => `• ${w.material_name}: solicitado ${w.requested}, disponible ${w.available}`).join("\n")}\n\n¿Continuar igualmente?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    const interventionNumber = `FRI-${moment().format("YYMMDD")}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    let materialLinesToPersist = [...lines];
    if (form.gas_bottle_id && form.gas_loaded_kg > 0 && finalGasType) {
      await syncGasMaterialStock(finalGasType);
      const gasMat = await findGasMaterialForType(finalGasType, null, legacyGasKeys);
      const bottle = gasBottles.find((b) => b.id === form.gas_bottle_id);
      if (gasMat && bottle && shouldAppendGasMaterialLine(materialLinesToPersist, gasMat.id, bottle.serial_number)) {
        const qty = form.gas_loaded_kg;
        const unit_p = gasMat.sell_price || 0;
        const iv = gasMat.iva_percent ?? 21;
        materialLinesToPersist.push({
          _id: Date.now() + Math.random(),
          material_id: gasMat.id,
          material_name: gasMat.name,
          material_code: gasMat.code || "",
          quantity: qty,
          unit: "kg",
          unit_price: unit_p,
          iva_percent: iv,
          total: qty * unit_p,
          observation: `Gas cargado desde botella SN ${bottle.serial_number}`,
        });
      }
    }

    const materialLinesForTotals = [...materialLinesToPersist];
    let allLines = [...laborLines, ...materialLinesForTotals];

    const cantDesp = Math.max(0, parseInt(String(form.desplazamientos_cantidad ?? 0), 10) || 0);
    const canAssignTramo = ["admin", "superadmin", "oficina", "encargado"].includes(user?.role);
    const tramosCfg = ensureTramoIds(parseTramosJson(user?.desplazamiento_tramos_json));
    const tramoSel =
      form.desplazamiento_tramo_id && canAssignTramo
        ? findTramoById(tramosCfg, form.desplazamiento_tramo_id)
        : null;

    let desplazamiento_pendiente_tarifa = false;
    let desplazamiento_tramo_id;
    let desplazamiento_tramo_nombre;
    let desplazamiento_precio_unitario;
    let desplazamiento_total;

    if (cantDesp > 0) {
      if (canAssignTramo && tramoSel) {
        allLines = upsertDisplacementMaterialLine(allLines, {
          cantidad: cantDesp,
          tramo: tramoSel,
        });
        desplazamiento_pendiente_tarifa = false;
        desplazamiento_tramo_id = tramoSel.id;
        desplazamiento_tramo_nombre = tramoSel.nombre;
        desplazamiento_precio_unitario = tramoSel.precio;
        desplazamiento_total = cantDesp * tramoSel.precio;
      } else {
        desplazamiento_pendiente_tarifa = true;
      }
    }

    const persistTotals = computeTotalsFromLines(allLines, form.discount_percent);

    const data = {
      number: interventionNumber,
      client_id: form.client_id,
      client_name: form.client_name,
      technician_email: user.email,
      technician_name: user.full_name,
      work_center_id: form.work_center_id || undefined,
      work_center_name: form.work_center_name || undefined,
      helper_email: form.helper_email || undefined,
      helper_name: form.helper_name || undefined,
      date: new Date(form.date).toISOString(),
      location_lat: form.location_lat,
      location_lng: form.location_lng,
      location_address: form.location_address,
      gas_type: finalGasType || undefined,
      gas_bottle_id: form.gas_bottle_id || undefined,
      gas_bottle_serial: gasBottles.find(b => b.id === form.gas_bottle_id)?.serial_number || undefined,
      gas_loaded_kg: form.gas_loaded_kg,
      gas_recovered_kg: form.gas_recovered_kg,
      gas_leak_kg: Math.max(0, (form.gas_loaded_kg || 0) - (form.gas_recovered_kg || 0)),
      description: form.description,
      materials_json: JSON.stringify(allLines),
      subtotal: persistTotals.subtotal,
      iva_total: persistTotals.ivaTotal,
      total: persistTotals.total,
      discount_percent: form.discount_percent,
      tipo_horario: form.tipo_horario || "normal",
      tarifa_aplicada: form.tarifa_aplicada || null,
      receptor_name: form.receptor_name || undefined,
      receptor_dni: form.receptor_dni || undefined,
      client_conformidad: form.client_conformidad,
      saved_at: new Date().toISOString(),
      incident_status: form.incident_status,
      status: form.incident_status === "finalizado" ? "pendiente_revision" : "en_curso",
      technician_notes: sinFichaje
        ? `[SIN FICHAJE PREVIO] ${form.technician_notes || ""}`
        : form.technician_notes,
      desplazamientos_cantidad: cantDesp,
      ...(desplazamiento_tramo_id
        ? {
            desplazamiento_tramo_id,
            desplazamiento_tramo_nombre,
            desplazamiento_precio_unitario,
            desplazamiento_total,
          }
        : {}),
      desplazamiento_pendiente_tarifa,
    };

    const created = await appApi.entities.Intervention.create(data);

    // Deduct gas from selected bottle
    if (form.gas_bottle_id && form.gas_loaded_kg > 0) {
      const bottle = gasBottles.find(b => b.id === form.gas_bottle_id);
      if (bottle) {
        const newKg = Math.max(0, (bottle.carga_actual || 0) - form.gas_loaded_kg);
        await appApi.entities.GasBottle.update(form.gas_bottle_id, {
          carga_actual: newKg,
          status: newKg <= 0 ? "vacia" : "activa",
        });
        await appApi.entities.GasTransfer.create({
          from_bottle_id: bottle.id,
          from_bottle_serial: bottle.serial_number,
          to_bottle_id: bottle.id,
          to_bottle_serial: bottle.serial_number,
          gas_type: bottle.gas_type,
          kg_transferred: form.gas_loaded_kg,
          technician_email: user.email,
          technician_name: user.full_name,
          timestamp: new Date().toISOString(),
          intervention_number: interventionNumber,
          notes: `Consumo en parte ${interventionNumber}`,
        });
      }
    }

    // Deduct stock after saving
    const materialOnlyLinesPersisted = materialLinesToPersist.filter(
      (l) => l.material_id && l.material_id !== "__free_text__"
    );
    await deductStockForIntervention({
      lines: materialOnlyLinesPersisted,
      interventionId: created.id,
      interventionNumber,
      technicianEmail: user.email,
      technicianName: user.full_name,
    });

    if (finalGasType && form.gas_bottle_id && form.gas_loaded_kg > 0) {
      await syncGasMaterialStock(finalGasType);
    }

    setSaving(false);
    navigate(`/interventions/${created.id}`);
  };

  if (checkedIn === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const canSeeBillingTotals =
    isAdmin || user?.role === "oficina" || user?.role === "encargado";
  const isFieldStaff = ["tecnico", "ayudante", "user"].includes(user?.role);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-48">
      {/* Checkin Warning Modal */}
      <Dialog open={showCheckinWarning} onOpenChange={(open) => {
        if (!open) {
          // Mark warning as seen for today when closing
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem("clockInWarningDate", today);
          setShowCheckinWarning(false);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Sin Fichaje de Entrada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">No has registrado tu entrada hoy. Se recomienda fichar antes de crear un parte de trabajo.</p>
            <p className="text-sm text-muted-foreground">Si continúas, el parte quedará marcado como <strong className="text-amber-600">"Sin fichaje previo"</strong> para revisión de administración.</p>
            <div className="flex flex-col gap-2 pt-1">
              <Button onClick={() => { 
                const today = new Date().toISOString().slice(0, 10);
                localStorage.setItem("clockInWarningDate", today);
                navigate("/"); 
              }} className="w-full rounded-xl">
                <LogIn className="h-4 w-4 mr-2" /> Ir a Fichar Entrada
              </Button>
              <Button variant="outline" onClick={() => { 
                const today = new Date().toISOString().slice(0, 10);
                localStorage.setItem("clockInWarningDate", today);
                setSinFichaje(true); 
                setShowCheckinWarning(false); 
              }} className="w-full rounded-xl text-amber-600 border-amber-300 hover:bg-amber-50">
                Continuar sin fichar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton label="Partes" />
        <h1 className="text-2xl font-bold tracking-tight">Nuevo Parte</h1>
      </div>

      {/* Client & Date */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cabecera</h2>

        <div>
          <Label>Cliente *</Label>
          <div className="mt-1">
            <ClientSelector
              clients={clients}
              selectedId={form.client_id}
              onChange={handleClientChange}
            />
          </div>
        </div>

        {form.client_id && (
          <div>
            <Label>Centro de Trabajo</Label>
            {workCenters.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground px-3 py-2 rounded-xl border border-dashed border-border">
                Este cliente no tiene centros registrados. Puedes añadirlos desde la ficha del cliente.
              </p>
            ) : (
              <select
                value={form.work_center_id}
                onChange={e => {
                  const wc = workCenters.find(c => c.id === e.target.value);
                  setForm(f => ({ ...f, work_center_id: e.target.value, work_center_name: wc?.name || "" }));
                }}
                className="mt-1 w-full flex h-9 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— Sin centro específico —</option>
                {workCenters.map(wc => (
                  <option key={wc.id} value={wc.id}>{wc.name}{wc.address ? ` · ${wc.address}` : ""}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Fecha y Hora</Label>
            <Input
              type="datetime-local"
              value={form.date}
              onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              className="mt-1 rounded-xl"
            />
          </div>
          <div>
            <Label>Ubicación GPS</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={form.location_address}
                onChange={(e) => setForm(f => ({ ...f, location_address: e.target.value }))}
                placeholder="Obteniendo ubicación..."
                className="rounded-xl"
              />
              <Button variant="outline" size="icon" onClick={getLocation} disabled={gettingLocation} className="rounded-xl">
                {gettingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Gas Section */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Control de Gas Refrigerante</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Tipo de Gas</Label>
            <div className="mt-1">
              <GasTypeCombobox
                value={form.gas_type}
                onChange={(v) => setForm((f) => ({ ...f, gas_type: v, gas_bottle_id: "" }))}
                otherUi={form.gas_other_ui}
                onOtherUiChange={(v) => setForm((f) => ({ ...f, gas_other_ui: v, gas_bottle_id: "" }))}
                otherDraft={form.gas_other_input}
                onOtherDraftChange={(v) => setForm((f) => ({ ...f, gas_other_input: v, gas_bottle_id: "" }))}
                legacyGasTypes={legacyGasKeys}
                priorityGasTypes={priorityGasTypes}
              />
            </div>
          </div>
          <div>
            <Label>Botella (S/N)</Label>
            {!resolvedGasType ? (
              <div className="mt-1 px-3 py-2 rounded-xl border border-input bg-muted/50 text-sm text-muted-foreground">
                Selecciona un tipo de gas primero
              </div>
            ) : availableBottles.length === 0 ? (
              <div className="mt-1 px-3 py-2 rounded-xl border border-destructive bg-destructive/10 text-sm text-destructive">
                No hay botellas activas con carga disponible para este tipo de gas.
              </div>
            ) : (
              <>
                <Select value={form.gas_bottle_id} onValueChange={(v) => setForm(f => ({ ...f, gas_bottle_id: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue placeholder="Seleccionar botella..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBottles.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.serial_number} · {b.carga_actual} kg disponibles</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.gas_bottle_id && gasBottles.find(b => b.id === form.gas_bottle_id) && (
                  <p className="text-xs text-muted-foreground mt-1">Stock actual: <strong>{gasBottles.find(b => b.id === form.gas_bottle_id)?.carga_actual} kg</strong></p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Kg Cargados</Label>
            <Input
              type="number"
              min="0"
              step="0.1"
              value={form.gas_loaded_kg || ""}
              onChange={(e) => setForm(f => ({ ...f, gas_loaded_kg: parseFloat(e.target.value) || 0 }))}
              className="mt-1 rounded-xl"
            />
          </div>
          <div>
            <Label>Kg Recuperados</Label>
            <Input
              type="number"
              min="0"
              step="0.1"
              value={form.gas_recovered_kg || ""}
              onChange={(e) => setForm(f => ({ ...f, gas_recovered_kg: parseFloat(e.target.value) || 0 }))}
              className="mt-1 rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Descripción</h2>
        <Textarea
          placeholder="Descripción del trabajo realizado..."
          value={form.description}
          onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
          rows={3}
          className="rounded-xl"
        />
        <Textarea
          placeholder="Notas técnicas internas..."
          value={form.technician_notes}
          onChange={(e) => setForm(f => ({ ...f, technician_notes: e.target.value }))}
          rows={2}
          className="rounded-xl"
        />
      </div>

      {/* Labor Section */}
      <LaborSection
        materials={materials}
        isAdmin={canSeeBillingTotals}
        onLaborLines={(lines) => {
          setLaborLines(lines);
          if (lines.length > 0 && lines[0]._tipoHorario) {
            setForm(f => ({
              ...f,
              tipo_horario: lines[0]._tipoHorario,
              tarifa_aplicada: lines[0].unit_price,
            }));
          }
        }}
        currentUser={user}
        allUsers={users}
        organizationTarifas={organizationTarifas}
      />

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          Desplazamiento
        </h2>
        <div>
          <Label>Número de desplazamientos</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={form.desplazamientos_cantidad}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                desplazamientos_cantidad: Math.max(0, parseInt(e.target.value, 10) || 0),
              }))
            }
            className="mt-1 rounded-xl max-w-[200px]"
          />
          {isFieldStaff && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Solo indica cuántos desplazamientos aplican. Oficina asignará el tramo y el importe.
            </p>
          )}
        </div>
        {canAssignTramoUi && (
          <div>
            <Label>Tramo de desplazamiento (opcional al crear)</Label>
            <Select
              value={form.desplazamiento_tramo_id || "__none__"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  desplazamiento_tramo_id: v === "__none__" ? "" : v,
                }))
              }
            >
              <SelectTrigger className="mt-1 rounded-xl">
                <SelectValue placeholder="Definir después en revisión…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Decidir en oficina —</SelectItem>
                {tramosOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre} ({t.precio.toFixed(2)} €)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!tramosOptions.length && (
              <p className="text-xs text-amber-700 mt-1.5">
                No hay tramos configurados. Añádelos en Configuración → Tarifas → Tramos de desplazamiento.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Material Lines */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Materiales y Mano de Obra</h2>
          <Button variant="outline" size="sm" onClick={addLine} className="rounded-xl">
            <Plus className="h-4 w-4 mr-1" /> Añadir Línea
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">
            Pulsa "Añadir Línea" para agregar materiales
          </p>
        ) : (
          <div className="space-y-3">
            {lines.map((line, i) => (
              <MaterialLineForm
                key={line._id || i}
                line={line}
                index={i}
                materials={materials}
                onUpdate={updateLine}
                onRemove={removeLine}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}

        {/* Totals */}
        {(lines.length > 0 || laborLines.length > 0) && canSeeBillingTotals && (
          <div className="border-t border-border pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{totals.subtotal.toFixed(2)} €</span>
            </div>
            {form.discount_percent > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Descuento ({form.discount_percent}%)</span>
                <span>-{totals.discountAmount.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IVA</span>
              <span>{totals.ivaTotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
              <span>Total</span>
              <span>{totals.total.toFixed(2)} €</span>
            </div>
          </div>
        )}
      </div>

      {/* Conformidad Cliente */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conformidad del Cliente</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Nombre Receptor *</Label>
            <Input
              value={form.receptor_name}
              onChange={(e) => setForm(f => ({ ...f, receptor_name: e.target.value }))}
              placeholder="Nombre completo del receptor"
              className="mt-1 rounded-xl"
            />
          </div>
          <div>
            <Label>DNI / Código Trabajador *</Label>
            <Input
              value={form.receptor_dni}
              onChange={(e) => setForm(f => ({ ...f, receptor_dni: e.target.value }))}
              placeholder="DNI o código de trabajador"
              className="mt-1 rounded-xl"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
          <Checkbox
            id="conformidad"
            checked={form.client_conformidad}
            onCheckedChange={(v) => setForm(f => ({ ...f, client_conformidad: v }))}
          />
          <label htmlFor="conformidad" className="text-sm font-medium cursor-pointer">
            El cliente/receptor confirma su conformidad con el trabajo realizado
          </label>
        </div>
      </div>

      {/* Estado de la Incidencia */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Estado de la Incidencia</h2>
        <Select value={form.incident_status} onValueChange={(v) => setForm(f => ({ ...f, incident_status: v }))}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="finalizado">Finalizado (Revisar y Facturar)</SelectItem>
            <SelectItem value="pendiente_operativa">Pendiente (Máquina Operativa)</SelectItem>
            <SelectItem value="pendiente_parada">Pendiente (Máquina Parada)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {form.incident_status === "finalizado"
            ? "✅ La incidencia pasará a validación de oficina."
            : "⏳ La incidencia permanecerá activa como tarea pendiente."}
        </p>
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4 pb-20 lg:pb-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            {canSeeBillingTotals && (
              <>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{totals.total.toFixed(2)} €</p>
              </>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !form.client_id}
            className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-8 h-12 text-base shadow-lg shadow-accent/25"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Guardar Parte
          </Button>
        </div>
      </div>
    </div>
  );
}

