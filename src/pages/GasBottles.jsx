import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { Plus, ArrowRightLeft, FlaskConical, History, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";

const GAS_TYPES = ["R449A","R134a","R404A","R410A","R407C","R22","R32","R290","R600a","R744","otro"];
const BOTTLE_TYPES = ["Gas", "Recuperación"];
const LOCATION_LABELS = { taller: "Taller", furgoneta: "Furgoneta", cliente: "Cliente" };
const STATUS_COLORS = { activa: "bg-emerald-100 text-emerald-700 border-emerald-200", vacia: "bg-amber-100 text-amber-700 border-amber-200", devuelta: "bg-blue-100 text-blue-700 border-blue-200" };

const EMPTY_BOTTLE = { serial_number: "", gas_type: "R449A", tipo_botella: "Gas", capacity_kg: "", current_kg: "", owner_type: "fritecma", casco_owner: "fritecma", owner_client_id: "", owner_client_name: "", location_type: "taller", location_detail: "", status: "activa", notes: "" };
const EMPTY_TRANSFER = { from_bottle_id: "", to_bottle_id: "", kg_transferred: "", new_location_type: "", new_location_detail: "", notes: "" };

export default function GasBottles() {
  const [bottles, setBottles] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGas, setFilterGas] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");

  const [bottleModal, setBottleModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [historyBottle, setHistoryBottle] = useState(null);
  const [editingBottle, setEditingBottle] = useState(null);
  const [bottleForm, setBottleForm] = useState(EMPTY_BOTTLE);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER);
  const [saving, setSaving] = useState(false);
  const [transferError, setTransferError] = useState("");

  const [interventionMap, setInterventionMap] = useState({});

  useEffect(() => {
    Promise.all([
      base44.auth.me(),
      base44.entities.GasBottle.list("-created_date", 200),
      base44.entities.GasTransfer.list("-timestamp", 200),
      base44.entities.Client.list("name", 200),
      base44.entities.Intervention.list("-created_date", 500),
      base44.entities.Supplier.list("name", 200),
    ]).then(([u, b, t, c, invs, sups]) => {
      setUser(u); setBottles(b); setTransfers(t); setClients(c); setSuppliers(sups);
      // Build number → id map
      const map = {};
      invs.forEach(i => { if (i.number) map[i.number] = i.id; });
      setInterventionMap(map);
      setLoading(false);
    });
  }, []);

  const reload = async () => {
    const [b, t] = await Promise.all([
      base44.entities.GasBottle.list("-created_date", 200),
      base44.entities.GasTransfer.list("-timestamp", 200),
    ]);
    setBottles(b); setTransfers(t);
  };

  // Filtered bottles
  const filtered = bottles.filter(b => {
    const matchSearch = b.serial_number?.toLowerCase().includes(search.toLowerCase()) || b.gas_type?.toLowerCase().includes(search.toLowerCase()) || b.owner_client_name?.toLowerCase().includes(search.toLowerCase());
    const matchGas = filterGas === "all" || b.gas_type === filterGas;
    const matchOwner = filterOwner === "all" || b.owner_type === filterOwner;
    return matchSearch && matchGas && matchOwner;
  });

  // Gas balance summary (exclude retired/returned)
  const gasSummary = bottles.reduce((acc, b) => {
    if (b.status === "devuelta") return acc;
    const key = `${b.gas_type}__${b.owner_type}`;
    acc[key] = (acc[key] || 0) + (b.carga_actual || 0);
    return acc;
  }, {});

  // Bottle CRUD
  const openNew = () => { setEditingBottle(null); setBottleForm(EMPTY_BOTTLE); setBottleModal(true); };
  const openEdit = (b) => { setEditingBottle(b); setBottleForm({ ...b, tipo_botella: b.tipo_botella || "Gas" }); setBottleModal(true); };

  const saveBottle = async () => {
    setSaving(true);
    try {
      const cargaInicial = parseFloat(bottleForm.carga_inicial) || 0;
      const cargaActual = parseFloat(bottleForm.carga_actual) || 0;
      const tipoBot = bottleForm.tipo_botella && bottleForm.tipo_botella.trim() ? bottleForm.tipo_botella : "Gas";
      const newStatus = cargaActual >= 1 ? "activa" : "vacia";
      
      const data = {
        serial_number: bottleForm.serial_number,
        gas_type: bottleForm.gas_type,
        tipo_botella: tipoBot,
        carga_inicial: cargaInicial,
        carga_actual: cargaActual,
        owner_type: bottleForm.owner_type,
        casco_owner: bottleForm.casco_owner,
        owner_client_id: bottleForm.owner_client_id || "",
        owner_client_name: bottleForm.owner_client_name || "",
        supplier_id: bottleForm.supplier_id || "",
        supplier_name: bottleForm.supplier_name || "",
        location_type: bottleForm.location_type,
        location_detail: bottleForm.location_detail || "",
        status: newStatus,
        notes: bottleForm.notes || ""
      };
      
      if (editingBottle) await base44.entities.GasBottle.update(editingBottle.id, data);
      else await base44.entities.GasBottle.create(data);
      await reload(); setSaving(false); setBottleModal(false);
    } catch (err) {
      console.error("Error guardando botella:", err);
      setSaving(false);
    }
  };

  const deleteBottle = async (id) => {
    if (!confirm("¿Eliminar esta botella?")) return;
    await base44.entities.GasBottle.delete(id);
    await reload();
  };

  // Transfer
  const openTransfer = () => { setTransferForm(EMPTY_TRANSFER); setTransferError(""); setTransferModal(true); };

  const fromBottle = bottles.find(b => b.id === transferForm.from_bottle_id);
  const toBottle = bottles.find(b => b.id === transferForm.to_bottle_id);

  const confirmTransfer = async () => {
    setTransferError("");
    const kg = parseFloat(transferForm.kg_transferred);
    if (!transferForm.from_bottle_id || !transferForm.to_bottle_id) return setTransferError("Selecciona ambas botellas.");
    if (transferForm.from_bottle_id === transferForm.to_bottle_id) return setTransferError("Las botellas deben ser distintas.");
    if (!kg || kg <= 0) return setTransferError("Indica los Kg a traspasar.");
    if (fromBottle && kg > (fromBottle.carga_actual || 0)) return setTransferError(`La botella origen solo tiene ${fromBottle.carga_actual} kg.`);
    if (fromBottle && toBottle && fromBottle.gas_type !== toBottle.gas_type) return setTransferError("Las botellas deben contener el mismo tipo de gas.");

    setSaving(true);
    const now = new Date().toISOString();

    // Update origin (subtract)
    await base44.entities.GasBottle.update(transferForm.from_bottle_id, {
      carga_actual: (fromBottle.carga_actual || 0) - kg,
      status: ((fromBottle.carga_actual || 0) - kg) <= 0 ? "vacia" : "activa",
    });

    // Update destination (add) + optional location change
    const destUpdate = { carga_actual: (toBottle.carga_actual || 0) + kg };
    if (transferForm.new_location_type) {
      destUpdate.location_type = transferForm.new_location_type;
      destUpdate.location_detail = transferForm.new_location_detail || "";
    }
    await base44.entities.GasBottle.update(transferForm.to_bottle_id, destUpdate);

    // Log
    await base44.entities.GasTransfer.create({
      from_bottle_id: transferForm.from_bottle_id,
      from_bottle_serial: fromBottle?.serial_number,
      to_bottle_id: transferForm.to_bottle_id,
      to_bottle_serial: toBottle?.serial_number,
      gas_type: fromBottle?.gas_type,
      kg_transferred: kg,
      technician_email: user?.email,
      technician_name: user?.full_name,
      timestamp: now,
      new_location_type: transferForm.new_location_type || "",
      new_location_detail: transferForm.new_location_detail || "",
      notes: transferForm.notes || "",
    });

    await reload(); setSaving(false); setTransferModal(false);
  };

  const isTecnico = user?.role === "user" || user?.role === "tecnico";

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FlaskConical className="h-6 w-6 text-accent" /> Trazabilidad de Gases</h1>
          <p className="text-muted-foreground text-sm mt-1">Control de botellas, traspasos y saldos de gas refrigerante</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openTransfer} className="rounded-xl gap-2"><ArrowRightLeft className="h-4 w-4" /> Traspaso</Button>
          <Button onClick={openNew} className="rounded-xl gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="h-4 w-4" /> Nueva Botella</Button>
        </div>
      </div>

      <Tabs defaultValue="botellas">
        <TabsList className="rounded-xl">
          <TabsTrigger value="botellas">Botellas</TabsTrigger>
          <TabsTrigger value="saldos">Saldos</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        {/* ── BOTELLAS TAB ── */}
        <TabsContent value="botellas" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Buscar por Nº serie, gas, cliente..." value={search} onChange={e => setSearch(e.target.value)} className="rounded-xl max-w-xs" />
            <Select value={filterGas} onValueChange={setFilterGas}>
              <SelectTrigger className="w-40 rounded-xl"><SelectValue placeholder="Gas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los gases</SelectItem>
                {GAS_TYPES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="w-40 rounded-xl"><SelectValue placeholder="Propietario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="fritecma">Fritecma</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(b => {
              const pct = b.carga_inicial ? Math.min(100, ((b.carga_actual || 0) / b.carga_inicial) * 100) : null;
              const low = pct !== null && pct < 20;
              return (
                <div key={b.id} className="bg-card rounded-2xl border border-border p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">S/N: {b.serial_number}</p>
                      <h3 className="font-bold text-lg">{b.gas_type}</h3>
                    </div>
                    <Badge variant="outline" className={cn("border text-xs", STATUS_COLORS[b.status])}>{b.status}</Badge>
                  </div>

                  {/* Fill bar */}
                  {b.carga_inicial > 0 && (
                    <div>
                      <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                        <span>{(b.carga_actual || 0).toFixed(2)} kg</span>
                        <span>{b.carga_inicial} kg cap.</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", low ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${pct}%` }} />
                      </div>
                      {low && <p className="text-xs text-amber-600 flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" /> Nivel bajo</p>}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>📍 {LOCATION_LABELS[b.location_type]}{b.location_detail ? ` · ${b.location_detail}` : ""}</p>
                    <p>👤 {b.owner_type === "fritecma" ? "Fritecma" : `Cliente: ${b.owner_client_name || "-"}`}</p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(b)} className="rounded-xl flex-1 gap-1 text-xs"><Pencil className="h-3 w-3" /> Editar</Button>
                    <Button variant="ghost" size="sm" onClick={() => setHistoryBottle(b)} className="rounded-xl gap-1 text-xs"><History className="h-3 w-3" /></Button>
                    {!isTecnico && (
                      <Button variant="ghost" size="sm" onClick={() => deleteBottle(b.id)} className="rounded-xl text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="col-span-3 text-center text-muted-foreground py-12">No hay botellas registradas.</p>}
          </div>
        </TabsContent>

        {/* ── SALDOS TAB ── */}
        <TabsContent value="saldos" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(gasSummary).map(([key, kg]) => {
              const [gas, owner] = key.split("__");
              return (
                <div key={key} className="bg-card rounded-2xl border border-border p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-xl">{gas}</h3>
                    <Badge variant="outline" className={owner === "fritecma" ? "border-primary/30 text-primary" : "border-amber-300 text-amber-700"}>
                      {owner === "fritecma" ? "Fritecma" : "Cliente"}
                    </Badge>
                  </div>
                  <p className="text-3xl font-black text-accent">{kg.toFixed(2)} <span className="text-base font-medium text-muted-foreground">kg</span></p>
                </div>
              );
            })}
            {Object.keys(gasSummary).length === 0 && <p className="col-span-3 text-center text-muted-foreground py-12">Sin datos de stock.</p>}
          </div>
        </TabsContent>

        {/* ── HISTORIAL TAB ── */}
        <TabsContent value="historial" className="mt-4">
          <div className="space-y-3">
            {transfers.map(t => (
              <div key={t.id} className="bg-card rounded-2xl border border-border p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-mono">
                  <span className="px-2 py-1 bg-muted rounded-lg">{t.from_bottle_serial}</span>
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  <span className="px-2 py-1 bg-muted rounded-lg">{t.to_bottle_serial}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t.gas_type} · <span className="text-accent">{t.kg_transferred} kg</span></p>
                  <p className="text-xs text-muted-foreground">{t.technician_name} · {moment(t.timestamp).format("DD/MM/YYYY HH:mm")}{t.intervention_number ? ` · Parte: ${t.intervention_number}` : ""}</p>
                </div>
                {t.new_location_type && (
                  <span className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                    📍 → {LOCATION_LABELS[t.new_location_type]}{t.new_location_detail ? ` ${t.new_location_detail}` : ""}
                  </span>
                )}
                {t.notes && <p className="text-xs text-muted-foreground w-full">{t.notes}</p>}
              </div>
            ))}
            {transfers.length === 0 && <p className="text-center text-muted-foreground py-12">Sin movimientos registrados.</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── BOTTLE MODAL ── */}
      <Dialog open={bottleModal} onOpenChange={setBottleModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingBottle ? "Editar Botella" : "Nueva Botella"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nº de Serie *</Label>
                <Input value={bottleForm.serial_number} onChange={e => setBottleForm(f => ({ ...f, serial_number: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Tipo de Botella *</Label>
                <Select value={bottleForm.tipo_botella || "Gas"} onValueChange={v => setBottleForm(f => ({ ...f, tipo_botella: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{BOTTLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Gas *</Label>
                <Select value={bottleForm.gas_type} onValueChange={v => setBottleForm(f => ({ ...f, gas_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{GAS_TYPES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado (Solo lectura)</Label>
                <div className="mt-1 px-3 py-2 rounded-xl border border-input bg-muted/50 text-sm text-muted-foreground">
                  {bottleForm.status === "activa" ? "✅ Activa (Carga ≥ 1 kg)" : bottleForm.status === "vacia" ? "⚠️ Vacía (Carga < 1 kg)" : "↩️ Devuelta"}
                  {bottleForm.tipo_botella === "Gas" && bottleForm.status === "vacia" && (
                    <div className="mt-2">
                      <Label className="text-xs">Marcar como Devuelta</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setBottleForm(f => ({ ...f, status: "devuelta" }))}
                        className="w-full mt-1 rounded-lg text-xs"
                      >
                        ↩️ Devolver Botella
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Carga Inicial (kg)</Label>
                <Input type="number" min="0" step="0.01" value={bottleForm.carga_inicial} onChange={e => setBottleForm(f => ({ ...f, carga_inicial: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Carga Actual (kg)</Label>
                <Input type="number" min="0" step="0.01" value={bottleForm.carga_actual} onChange={e => setBottleForm(f => ({ ...f, carga_actual: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Propietario Gas</Label>
                <Select value={bottleForm.owner_type} onValueChange={v => setBottleForm(f => ({ ...f, owner_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fritecma">Fritecma</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Propiedad del Casco (Proveedor)</Label>
                <Select
                  value={bottleForm.supplier_id || "__fritecma__"}
                  onValueChange={v => {
                    if (v === "__fritecma__") {
                      setBottleForm(f => ({ ...f, supplier_id: "", supplier_name: "", casco_owner: "fritecma" }));
                    } else {
                      const sup = suppliers.find(s => s.id === v);
                      setBottleForm(f => ({ ...f, supplier_id: v, supplier_name: sup?.name || "", casco_owner: "cliente" }));
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__fritecma__">Fritecma (propio)</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {bottleForm.supplier_id && (
                  <p className="text-xs text-muted-foreground mt-1">Casco propiedad de: <strong>{bottleForm.supplier_name}</strong></p>
                )}
              </div>
              {bottleForm.owner_type === "cliente" && (
                <div className="col-span-2">
                  <Label>Cliente Propietario</Label>
                  <Select value={bottleForm.owner_client_id} onValueChange={v => {
                    const c = clients.find(x => x.id === v);
                    setBottleForm(f => ({ ...f, owner_client_id: v, owner_client_name: c?.name || "" }));
                  }}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Ubicación</Label>
                <Select value={bottleForm.location_type} onValueChange={v => setBottleForm(f => ({ ...f, location_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="taller">Taller</SelectItem>
                    <SelectItem value="furgoneta">Furgoneta</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Detalle Ubicación</Label>
                <Input value={bottleForm.location_detail} onChange={e => setBottleForm(f => ({ ...f, location_detail: e.target.value }))} placeholder="Nº furgoneta, cliente..." className="mt-1 rounded-xl" />
              </div>
              <div className="col-span-2">
                <Label>Observaciones</Label>
                <Input value={bottleForm.notes} onChange={e => setBottleForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setBottleModal(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={saveBottle} disabled={saving || !bottleForm.serial_number} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── HISTORY MODAL ── */}
      <Dialog open={!!historyBottle} onOpenChange={v => !v && setHistoryBottle(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Historial: {historyBottle?.serial_number} · {historyBottle?.gas_type}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {transfers.filter(t => t.from_bottle_id === historyBottle?.id || t.to_bottle_id === historyBottle?.id).length === 0
              ? <p className="text-center text-muted-foreground py-8">Sin movimientos registrados.</p>
              : transfers.filter(t => t.from_bottle_id === historyBottle?.id || t.to_bottle_id === historyBottle?.id).map(t => {
                  const isSalida = t.from_bottle_id === historyBottle?.id;
                  return (
                    <div key={t.id} className="bg-muted/50 rounded-xl p-3 flex flex-wrap items-center gap-3">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", isSalida ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                        {isSalida ? "─ Salida" : "+ Entrada"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{t.kg_transferred} kg · {t.gas_type}</p>
                        <p className="text-xs text-muted-foreground">{isSalida ? `→ ${t.to_bottle_serial}` : `← ${t.from_bottle_serial}`} · {t.technician_name} · {moment(t.timestamp).format("DD/MM/YY HH:mm")}</p>
                        {t.intervention_number && (
                          interventionMap[t.intervention_number]
                            ? <Link to={`/interventions/${interventionMap[t.intervention_number]}`} className="text-xs text-blue-600 hover:underline font-medium">Parte: {t.intervention_number} →</Link>
                            : <p className="text-xs text-blue-600">Parte: {t.intervention_number}</p>
                        )}
                        {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                      </div>
                    </div>
                  );
                })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── TRANSFER MODAL ── */}
      <Dialog open={transferModal} onOpenChange={setTransferModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" /> Traspaso de Gas</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Botella Origen *</Label>
              <Select value={transferForm.from_bottle_id} onValueChange={v => setTransferForm(f => ({ ...f, from_bottle_id: v }))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Seleccionar botella origen..." /></SelectTrigger>
                <SelectContent>
                  {bottles.filter(b => b.status === "activa" && (b.carga_actual || 0) > 0).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.serial_number} · {b.gas_type} · {b.carga_actual} kg</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromBottle && <p className="text-xs text-muted-foreground mt-1">Disponible: <strong>{fromBottle.carga_actual} kg</strong> · {LOCATION_LABELS[fromBottle.location_type]}</p>}
            </div>

            <div>
              <Label>Botella Destino *</Label>
              <Select value={transferForm.to_bottle_id} onValueChange={v => setTransferForm(f => ({ ...f, to_bottle_id: v }))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Seleccionar botella destino..." /></SelectTrigger>
                <SelectContent>
                  {bottles.filter(b => b.id !== transferForm.from_bottle_id).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.serial_number} · {b.gas_type} · {b.carga_actual || 0} kg</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {toBottle && <p className="text-xs text-muted-foreground mt-1">Tiene: <strong>{toBottle.carga_actual || 0} kg</strong> - {LOCATION_LABELS[toBottle.location_type]}</p>}
              </div>

            <div>
              <Label>Kg a Traspasar *</Label>
              <Input type="number" min="0.1" step="0.1" value={transferForm.kg_transferred} onChange={e => setTransferForm(f => ({ ...f, kg_transferred: e.target.value }))} className="mt-1 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nueva Ubicación Destino</Label>
                <Select value={transferForm.new_location_type} onValueChange={v => setTransferForm(f => ({ ...f, new_location_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Sin cambio" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="taller">Taller</SelectItem>
                    <SelectItem value="furgoneta">Furgoneta</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Detalle</Label>
                <Input value={transferForm.new_location_detail} onChange={e => setTransferForm(f => ({ ...f, new_location_detail: e.target.value }))} placeholder="Nº furgoneta..." className="mt-1 rounded-xl" />
              </div>
            </div>

            <div>
              <Label>Notas</Label>
              <Input value={transferForm.notes} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} placeholder="Motivo del traspaso..." className="mt-1 rounded-xl" />
            </div>

            {transferError && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-xl text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {transferError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setTransferModal(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={confirmTransfer} disabled={saving} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Procesando..." : "Confirmar Traspaso"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}