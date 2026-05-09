import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, MapPin, Loader2, Save } from "lucide-react";
import BackButton from "../components/BackButton";
import MaterialLineForm from "../components/MaterialLineForm";
import LaborSection from "../components/LaborSection";
import { buildOrganizationTariffProfile } from "@/lib/organizationTariffs";
import { validateStockAvailability, deductStockForIntervention } from "../lib/stockUtils";
import moment from "moment";

const GAS_TYPES = ["R449A", "R134a", "R404A", "R410A", "R407C", "R22", "R32", "R290", "R600a", "R744", "otro"];

const INCIDENT_STATUS_OPTIONS = [
  { value: "finalizado", label: "Finalizado (Revisar y Facturar)" },
  { value: "pendiente_operativa", label: "Pendiente (Máquina Operativa)" },
  { value: "pendiente_parada", label: "Pendiente (Máquina Parada)" },
];

export default function NewVisit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [intervention, setIntervention] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [gasBottles, setGasBottles] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [lines, setLines] = useState([]);
  const [laborLines, setLaborLines] = useState([]);

  const [form, setForm] = useState({
    date: moment().format("YYYY-MM-DDTHH:mm"),
    location_address: "",
    location_lat: null,
    location_lng: null,
    gas_type: "",
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
  });

  useEffect(() => {
    loadData();
    getLocation();
  }, [id]);

  const loadData = async () => {
    const [me, invList, materialList, bottleList, userList] = await Promise.all([
      appApi.auth.me(),
      appApi.entities.Intervention.filter({ id }, "-created_date", 1),
      appApi.entities.Material.filter({ is_active: true }, "name", 500),
      appApi.entities.GasBottle.list("-created_date", 200),
      appApi.entities.User.list("full_name", 100),
    ]);
    setUser(me);
    if (invList[0]) setIntervention(invList[0]);
    setMaterials(materialList);
    setGasBottles(bottleList);
    setUsers(userList);
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

  const calcTotals = () => {
    const allLines = [...laborLines, ...lines];
    const subtotal = allLines.reduce((sum, l) => sum + (l.total || 0), 0);
    const discountAmount = subtotal * (form.discount_percent / 100);
    const subtotalAfterDiscount = subtotal - discountAmount;
    const ivaByRate = {};
    allLines.forEach(l => {
      const rate = l.iva_percent || 21;
      const lineAfterDiscount = (l.total || 0) * (1 - form.discount_percent / 100);
      ivaByRate[rate] = (ivaByRate[rate] || 0) + lineAfterDiscount * (rate / 100);
    });
    const ivaTotal = Object.values(ivaByRate).reduce((s, v) => s + v, 0);
    return { subtotal, discountAmount, subtotalAfterDiscount, ivaTotal, total: subtotalAfterDiscount + ivaTotal };
  };

  const handleSave = async () => {
    if (!intervention) return;
    const materialOnlyLines = lines.filter(l => l.material_id);
    const warnings = await validateStockAvailability(materialOnlyLines);
    if (warnings.length > 0) {
      const proceed = window.confirm(
        `⚠️ Stock insuficiente para:\n${warnings.map(w => `• ${w.material_name}: solicitado ${w.requested}, disponible ${w.available}`).join("\n")}\n\n¿Continuar igualmente?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    const allLines = [...laborLines, ...lines];
    const totals = calcTotals();
    const now = new Date().toISOString();

    // Get existing visits count
    const existingVisits = await appApi.entities.Visit.filter({ intervention_id: id }, "-created_date", 100);
    const visitNumber = existingVisits.length + 1;

    const visitData = {
      intervention_id: id,
      intervention_number: intervention.number,
      visit_number: visitNumber,
      client_id: intervention.client_id,
      client_name: intervention.client_name,
      technician_email: user.email,
      technician_name: user.full_name,
      helper_email: form.helper_email || undefined,
      helper_name: form.helper_name || undefined,
      date: new Date(form.date).toISOString(),
      saved_at: now,
      location_lat: form.location_lat,
      location_lng: form.location_lng,
      location_address: form.location_address,
      gas_type: form.gas_type || undefined,
      gas_bottle_id: form.gas_bottle_id || undefined,
      gas_bottle_serial: gasBottles.find(b => b.id === form.gas_bottle_id)?.serial_number || undefined,
      gas_loaded_kg: form.gas_loaded_kg,
      gas_recovered_kg: form.gas_recovered_kg,
      gas_leak_kg: Math.max(0, (form.gas_loaded_kg || 0) - (form.gas_recovered_kg || 0)),
      description: form.description,
      technician_notes: form.technician_notes,
      materials_json: JSON.stringify(allLines),
      subtotal: totals.subtotal,
      iva_total: totals.ivaTotal,
      total: totals.total,
      discount_percent: form.discount_percent,
      receptor_name: form.receptor_name || undefined,
      receptor_dni: form.receptor_dni || undefined,
      client_conformidad: form.client_conformidad,
    };

    const created = await appApi.entities.Visit.create(visitData);

    // Deduct gas from bottle
    if (form.gas_bottle_id && form.gas_loaded_kg > 0) {
      const bottle = gasBottles.find(b => b.id === form.gas_bottle_id);
      if (bottle) {
        const newKg = Math.max(0, (bottle.current_kg || 0) - form.gas_loaded_kg);
        await appApi.entities.GasBottle.update(form.gas_bottle_id, {
          current_kg: newKg,
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
          timestamp: now,
          intervention_number: intervention.number,
          notes: `Visita ${visitNumber} - ${intervention.number}`,
        });
      }
    }

    // Deduct stock
    await deductStockForIntervention({
      lines: materialOnlyLines,
      interventionId: id,
      interventionNumber: `${intervention.number}-V${visitNumber}`,
      technicianEmail: user.email,
      technicianName: user.full_name,
    });

    // Update intervention incident_status
    await appApi.entities.Intervention.update(id, {
      incident_status: form.incident_status,
      status: form.incident_status === "finalizado" ? "pendiente_revision" : "en_curso",
    });

    setSaving(false);
    navigate(`/interventions/${id}`);
  };

  const totals = calcTotals();
  const canEditPrices =
    user?.role === "admin" ||
    user?.role === "superadmin" ||
    user?.role === "oficina" ||
    user?.role === "encargado";
  const availableBottles = gasBottles.filter(b => b.status === "activa" && (!form.gas_type || b.gas_type === form.gas_type) && (b.current_kg || 0) > 0);

  if (!intervention && !saving) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32">
      <div className="flex items-center gap-3">
        <BackButton label="Parte" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nueva Visita</h1>
          <p className="text-sm text-muted-foreground">{intervention?.number} · {intervention?.client_name}</p>
        </div>
      </div>

      {/* Fecha y Ubicación */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cabecera</h2>

        {/* Operarios */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Operario 1 (Técnico Principal)</Label>
            <Input value={user?.full_name || ""} disabled className="mt-1 rounded-xl bg-muted/50" />
          </div>
          <div>
            <Label>Operario 2 (Ayudante / Opcional)</Label>
            <Select value={form.helper_email} onValueChange={(v) => {
              const u = users.find(x => x.email === v);
              setForm(f => ({ ...f, helper_email: v === "__none__" ? "" : v, helper_name: v === "__none__" ? "" : (u?.full_name || "") }));
            }}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Sin ayudante" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin ayudante</SelectItem>
                {users.filter(u => u.email !== user?.email).map(u => (
                  <SelectItem key={u.email} value={u.email}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Fecha y Hora</Label>
            <Input type="datetime-local" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Ubicación GPS</Label>
            <div className="flex gap-2 mt-1">
              <Input value={form.location_address} onChange={(e) => setForm(f => ({ ...f, location_address: e.target.value }))} placeholder="Obteniendo ubicación..." className="rounded-xl" />
              <Button variant="outline" size="icon" onClick={getLocation} disabled={gettingLocation} className="rounded-xl">
                {gettingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>


      {/* Gas */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Control de Gas Refrigerante</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Tipo de Gas</Label>
            <Select value={form.gas_type} onValueChange={(v) => setForm(f => ({ ...f, gas_type: v, gas_bottle_id: "" }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Sin gas..." /></SelectTrigger>
              <SelectContent>{GAS_TYPES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Botella (S/N)</Label>
            <Select value={form.gas_bottle_id} onValueChange={(v) => setForm(f => ({ ...f, gas_bottle_id: v }))} disabled={!form.gas_type}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder={form.gas_type ? "Seleccionar..." : "Selecciona gas primero"} /></SelectTrigger>
              <SelectContent>
                {availableBottles.map(b => <SelectItem key={b.id} value={b.id}>{b.serial_number} · {b.current_kg} kg</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Kg Cargados</Label>
            <Input type="number" min="0" step="0.1" value={form.gas_loaded_kg || ""} onChange={(e) => setForm(f => ({ ...f, gas_loaded_kg: parseFloat(e.target.value) || 0 }))} className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Kg Recuperados</Label>
            <Input type="number" min="0" step="0.1" value={form.gas_recovered_kg || ""} onChange={(e) => setForm(f => ({ ...f, gas_recovered_kg: parseFloat(e.target.value) || 0 }))} className="mt-1 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Descripción</h2>
        <Textarea placeholder="Descripción del trabajo realizado..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="rounded-xl" />
        <Textarea placeholder="Notas técnicas internas..." value={form.technician_notes} onChange={(e) => setForm(f => ({ ...f, technician_notes: e.target.value }))} rows={2} className="rounded-xl" />
      </div>

      {/* Labor */}
      <LaborSection
        materials={materials}
        isAdmin={canEditPrices}
        onLaborLines={setLaborLines}
        currentUser={user}
        allUsers={users}
        organizationTarifas={buildOrganizationTariffProfile(user)}
      />

      {/* Materiales */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Materiales y Mano de Obra</h2>
          <Button variant="outline" size="sm" onClick={() => setLines(prev => [...prev, { _id: Date.now() + Math.random(), material_id: "", material_name: "", quantity: 1, unit_price: 0, total: 0, observation: "", unit: "ud", iva_percent: 21 }])} className="rounded-xl">
            <Plus className="h-4 w-4 mr-1" /> Añadir Línea
          </Button>
        </div>
        {lines.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">Pulsa "Añadir Línea" para agregar materiales</p>
        ) : (
          <div className="space-y-3">
            {lines.map((line, i) => (
              <MaterialLineForm key={line._id || i} line={line} index={i} materials={materials}
                onUpdate={(idx, updated) => { const l = [...lines]; l[idx] = updated; setLines(l); }}
                onRemove={(idx) => setLines(lines.filter((_, j) => j !== idx))}
                isAdmin={canEditPrices}
              />
            ))}
          </div>
        )}
        {(lines.length > 0 || laborLines.length > 0) && canEditPrices && (
          <div className="border-t border-border pt-4 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{totals.subtotal.toFixed(2)} €</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">IVA</span><span>{totals.ivaTotal.toFixed(2)} €</span></div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border"><span>Total</span><span>{totals.total.toFixed(2)} €</span></div>
          </div>
        )}
      </div>

      {/* Conformidad */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conformidad del Cliente</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Nombre Receptor</Label>
            <Input value={form.receptor_name} onChange={(e) => setForm(f => ({ ...f, receptor_name: e.target.value }))} placeholder="Nombre completo del receptor" className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>DNI / Código Trabajador</Label>
            <Input value={form.receptor_dni} onChange={(e) => setForm(f => ({ ...f, receptor_dni: e.target.value }))} placeholder="DNI o código de trabajador" className="mt-1 rounded-xl" />
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
          <Checkbox id="conformidad" checked={form.client_conformidad} onCheckedChange={(v) => setForm(f => ({ ...f, client_conformidad: v }))} />
          <label htmlFor="conformidad" className="text-sm font-medium cursor-pointer">El cliente/receptor confirma su conformidad con el trabajo realizado</label>
        </div>
      </div>

      {/* Estado de la Incidencia */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Estado de la Incidencia</h2>
        <Select value={form.incident_status} onValueChange={(v) => setForm(f => ({ ...f, incident_status: v }))}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INCIDENT_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {form.incident_status === "finalizado"
            ? "✅ La incidencia pasará a validación de oficina."
            : "⏳ La incidencia permanecerá activa como tarea pendiente."}
        </p>
      </div>

      {/* Save */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            {canEditPrices && (
              <>
                <p className="text-sm text-muted-foreground">Total visita</p>
                <p className="text-2xl font-bold">{totals.total.toFixed(2)} €</p>
              </>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-8 h-12 text-base shadow-lg shadow-accent/25">
            {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Guardar Visita
          </Button>
        </div>
      </div>
    </div>
  );
}

