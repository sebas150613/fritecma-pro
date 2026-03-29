import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, MapPin, Loader2, Save, LogIn, AlertTriangle } from "lucide-react";
import MaterialLineForm from "../components/MaterialLineForm";
import LaborSection from "../components/LaborSection";
import { Checkbox } from "@/components/ui/checkbox";
import { validateStockAvailability, deductStockForIntervention } from "../lib/stockUtils";
import moment from "moment";

const GAS_TYPES = ["R449A", "R134a", "R404A", "R410A", "R407C", "R22", "R32", "R290", "R600a", "R744", "otro"];

export default function NewIntervention() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [gasBottles, setGasBottles] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [stockWarnings, setStockWarnings] = useState([]);
  const [checkedIn, setCheckedIn] = useState(null); // null=loading, true/false
  const [showCheckinWarning, setShowCheckinWarning] = useState(false);
  const [sinFichaje, setSinFichaje] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    client_name: "",
    date: moment().format("YYYY-MM-DDTHH:mm"),
    location_lat: null,
    location_lng: null,
    location_address: "",
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

  const [lines, setLines] = useState([]);
  const [laborLines, setLaborLines] = useState([]);

  useEffect(() => {
    loadInitialData();
    getLocation();
  }, []);

  const loadInitialData = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const isAdmin = me.role === "admin";

    if (!isAdmin) {
      const today = new Date().toISOString().slice(0, 10);
      const records = await base44.entities.TimeRecord.filter(
        { technician_email: me.email, work_date: today },
        "-timestamp",
        1
      );
      const lastType = records[0]?.type;
      const isCheckedIn = lastType === "entrada" || lastType === "reanudacion";
      setCheckedIn(isCheckedIn);
      if (!isCheckedIn) setShowCheckinWarning(true);
    } else {
      setCheckedIn(true);
    }

    const [clientList, materialList, bottleList, userList] = await Promise.all([
      base44.entities.Client.list("name", 500),
      base44.entities.Material.filter({ is_active: true }, "name", 500),
      base44.entities.GasBottle.list("-created_date", 200),
      base44.entities.User.list("full_name", 100),
    ]);
    setClients(clientList);
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

  const handleClientChange = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setForm(f => ({
        ...f,
        client_id: client.id,
        client_name: client.name,
        discount_percent: client.discount_percent || 0,
      }));
    }
  };

  const addLine = () => {
    setLines([...lines, { material_id: "", material_name: "", quantity: 1, unit_price: 0, total: 0, observation: "", unit: "ud", iva_percent: 21 }]);
  };

  const updateLine = (index, updatedLine) => {
    const newLines = [...lines];
    newLines[index] = updatedLine;
    setLines(newLines);
  };

  const removeLine = (index) => {
    setLines(lines.filter((_, i) => i !== index));
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

  const totals = calcTotals();
  const availableBottles = gasBottles.filter(b => b.status === "activa" && (!form.gas_type || b.gas_type === form.gas_type) && (b.current_kg || 0) > 0);

  const handleSave = async () => {
    if (!form.client_id) return;

    // Validate stock availability before saving
    const materialOnlyLines = lines.filter(l => l.material_id && l.material_id !== "__free_text__");
    const warnings = await validateStockAvailability(materialOnlyLines);
    if (warnings.length > 0) {
      const proceed = window.confirm(
        `⚠️ Stock insuficiente para:\n${warnings.map(w => `• ${w.material_name}: solicitado ${w.requested}, disponible ${w.available}`).join("\n")}\n\n¿Continuar igualmente?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    const interventionNumber = `FRI-${moment().format("YYMMDD")}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const allLines = [...laborLines, ...lines];
    const data = {
      number: interventionNumber,
      client_id: form.client_id,
      client_name: form.client_name,
      technician_email: user.email,
      technician_name: user.full_name,
      helper_email: form.helper_email || undefined,
      helper_name: form.helper_name || undefined,
      date: new Date(form.date).toISOString(),
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
      saved_at: new Date().toISOString(),
      incident_status: form.incident_status,
      status: form.incident_status === "finalizado" ? "pendiente_revision" : "en_curso",
      technician_notes: sinFichaje
        ? `[SIN FICHAJE PREVIO] ${form.technician_notes || ""}`
        : form.technician_notes,
    };

    const created = await base44.entities.Intervention.create(data);

    // Deduct gas from selected bottle
    if (form.gas_bottle_id && form.gas_loaded_kg > 0) {
      const bottle = gasBottles.find(b => b.id === form.gas_bottle_id);
      if (bottle) {
        const newKg = Math.max(0, (bottle.current_kg || 0) - form.gas_loaded_kg);
        await base44.entities.GasBottle.update(form.gas_bottle_id, {
          current_kg: newKg,
          status: newKg <= 0 ? "vacia" : "activa",
        });
        await base44.entities.GasTransfer.create({
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
    await deductStockForIntervention({
      lines: materialOnlyLines,
      interventionId: created.id,
      interventionNumber,
      technicianEmail: user.email,
      technicianName: user.full_name,
    });

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

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32">
      {/* Checkin Warning Modal */}
      <Dialog open={showCheckinWarning} onOpenChange={setShowCheckinWarning}>
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
              <Button onClick={() => { navigate("/"); }} className="w-full rounded-xl">
                <LogIn className="h-4 w-4 mr-2" /> Ir a Fichar Entrada
              </Button>
              <Button variant="outline" onClick={() => { setSinFichaje(true); setShowCheckinWarning(false); }} className="w-full rounded-xl text-amber-600 border-amber-300 hover:bg-amber-50">
                Continuar sin fichar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo Parte de Trabajo</h1>
      </div>

      {/* Client & Date */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cabecera</h2>

        <div>
          <Label>Cliente *</Label>
          <Select value={form.client_id} onValueChange={handleClientChange}>
            <SelectTrigger className="mt-1 rounded-xl">
              <SelectValue placeholder="Seleccionar cliente..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
          <div>
            <Label>Tipo de Gas</Label>
            <Select value={form.gas_type} onValueChange={(v) => setForm(f => ({ ...f, gas_type: v, gas_bottle_id: "" }))}>
              <SelectTrigger className="mt-1 rounded-xl">
                <SelectValue placeholder="Seleccionar tipo de gas..." />
              </SelectTrigger>
              <SelectContent>
                {GAS_TYPES.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Botella (S/N)</Label>
            <Select value={form.gas_bottle_id} onValueChange={(v) => setForm(f => ({ ...f, gas_bottle_id: v }))} disabled={!form.gas_type}>
              <SelectTrigger className="mt-1 rounded-xl">
                <SelectValue placeholder={form.gas_type ? "Seleccionar botella..." : "Selecciona gas primero"} />
              </SelectTrigger>
              <SelectContent>
                {availableBottles.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.serial_number} · {b.current_kg} kg disponibles</SelectItem>
                ))}
                {availableBottles.length === 0 && form.gas_type && <SelectItem value="__none__" disabled>Sin botellas con stock</SelectItem>}
              </SelectContent>
            </Select>
            {form.gas_bottle_id && gasBottles.find(b => b.id === form.gas_bottle_id) && (
              <p className="text-xs text-muted-foreground mt-1">Stock actual: <strong>{gasBottles.find(b => b.id === form.gas_bottle_id)?.current_kg} kg</strong></p>
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
        isAdmin={isAdmin}
        onLaborLines={setLaborLines}
        currentUser={user}
        allUsers={users}
      />

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
                key={i}
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
        {(lines.length > 0 || laborLines.length > 0) && isAdmin && (
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
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            {isAdmin && (
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