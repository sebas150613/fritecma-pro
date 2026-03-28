import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, MapPin, Loader2, Save } from "lucide-react";
import MaterialLineForm from "../components/MaterialLineForm";
import SignaturePad from "../components/SignaturePad";
import moment from "moment";

const GAS_TYPES = ["R449A", "R134a", "R404A", "R410A", "R407C", "R22", "R32", "R290", "R600a", "R744", "otro"];

export default function NewIntervention() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    client_name: "",
    date: moment().format("YYYY-MM-DDTHH:mm"),
    location_lat: null,
    location_lng: null,
    location_address: "",
    gas_type: "",
    gas_loaded_kg: 0,
    gas_recovered_kg: 0,
    description: "",
    technician_notes: "",
    discount_percent: 0,
    technician_signature: "",
    client_signature: "",
  });

  const [lines, setLines] = useState([]);

  useEffect(() => {
    loadInitialData();
    getLocation();
  }, []);

  const loadInitialData = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const [clientList, materialList] = await Promise.all([
      base44.entities.Client.list("name", 500),
      base44.entities.Material.filter({ is_active: true }, "name", 500),
    ]);
    setClients(clientList);
    setMaterials(materialList);
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
    const subtotal = lines.reduce((sum, l) => sum + (l.total || 0), 0);
    const discountAmount = subtotal * (form.discount_percent / 100);
    const subtotalAfterDiscount = subtotal - discountAmount;
    const ivaByRate = {};
    lines.forEach(l => {
      const rate = l.iva_percent || 21;
      const lineAfterDiscount = (l.total || 0) * (1 - form.discount_percent / 100);
      ivaByRate[rate] = (ivaByRate[rate] || 0) + lineAfterDiscount * (rate / 100);
    });
    const ivaTotal = Object.values(ivaByRate).reduce((s, v) => s + v, 0);
    return { subtotal, discountAmount, subtotalAfterDiscount, ivaTotal, total: subtotalAfterDiscount + ivaTotal };
  };

  const totals = calcTotals();
  const gasLeak = Math.max(0, (form.gas_loaded_kg || 0) - (form.gas_recovered_kg || 0));

  const handleSave = async () => {
    if (!form.client_id) return;
    setSaving(true);

    const interventionNumber = `FRI-${moment().format("YYMMDD")}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const data = {
      number: interventionNumber,
      client_id: form.client_id,
      client_name: form.client_name,
      technician_email: user.email,
      technician_name: user.full_name,
      date: new Date(form.date).toISOString(),
      location_lat: form.location_lat,
      location_lng: form.location_lng,
      location_address: form.location_address,
      gas_type: form.gas_type || undefined,
      gas_loaded_kg: form.gas_loaded_kg,
      gas_recovered_kg: form.gas_recovered_kg,
      gas_leak_kg: gasLeak,
      description: form.description,
      technician_notes: form.technician_notes,
      materials_json: JSON.stringify(lines),
      subtotal: totals.subtotal,
      iva_total: totals.ivaTotal,
      total: totals.total,
      discount_percent: form.discount_percent,
      technician_signature: form.technician_signature,
      client_signature: form.client_signature,
      status: "pendiente_revision",
    };

    const created = await base44.entities.Intervention.create(data);
    setSaving(false);
    navigate(`/interventions/${created.id}`);
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32">
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

        <div>
          <Label>Tipo de Gas</Label>
          <Select value={form.gas_type} onValueChange={(v) => setForm(f => ({ ...f, gas_type: v }))}>
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

        <div className="grid grid-cols-3 gap-3">
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
          <div>
            <Label>Fuga Estimada</Label>
            <Input value={`${gasLeak.toFixed(1)} kg`} readOnly className="mt-1 rounded-xl bg-muted font-semibold" />
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
              />
            ))}
          </div>
        )}

        {/* Totals */}
        {lines.length > 0 && (
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

      {/* Signatures */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Firmas</h2>
        <SignaturePad label="Firma del Técnico" onSave={(sig) => setForm(f => ({ ...f, technician_signature: sig }))} />
        <SignaturePad label="Firma del Cliente (Conformidad)" onSave={(sig) => setForm(f => ({ ...f, client_signature: sig }))} />
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{totals.total.toFixed(2)} €</p>
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