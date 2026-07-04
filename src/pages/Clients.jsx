import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Users, Edit, Trash2, Phone, Mail as MailIcon, Wrench } from "lucide-react";
import MapLink from "../components/MapLink";
import WorkCentersInline from "../components/WorkCentersInline";
import MachinesInline from "../components/MachinesInline";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRIORITY_COLORS, BREAKDOWN_STATUS_LABELS } from "@/lib/status-constants";
import { toast } from "sonner";
import { validateFiscalId, normalizeFiscalId } from "@/lib/spanishFiscalId";
import { validatePostalCode } from "@/lib/spanishPostalCodes";

const BD_STATUS_COLORS = {
  abierta:   "bg-blue-100 text-blue-700",
  pendiente: "bg-amber-100 text-amber-700",
  terminada: "bg-emerald-100 text-emerald-700",
};
const BD_STATUS_LABELS = BREAKDOWN_STATUS_LABELS;
const BD_PRIORITY_COLORS = PRIORITY_COLORS;

const TIERS = { standard: "Estándar", preferente: "Preferente", especial: "Especial" };

const TARIFA_FIELDS = [
  { key: "tarifa_normal",   label: "Normal (horario laboral)",  default: 45 },
  { key: "tarifa_extra",    label: "Extra (horas extra)",       default: 60 },
  { key: "tarifa_nocturna", label: "Nocturno",                  default: 70 },
  { key: "tarifa_festiva",  label: "Festivo / Fin de semana",   default: 80 },
];

const emptyClient = {
  name: "", cif: "", address: "", city: "", postal_code: "",
  phone: "", email: "", contact_person: "", discount_percent: 0,
  price_tier: "standard", notes: "",
};

export default function Clients() {
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [form, setForm] = useState({ ...emptyClient });
  const [expandedClient, setExpandedClient] = useState(null);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [clientBreakdowns, setClientBreakdowns] = useState({});
  const [loadingBreakdowns, setLoadingBreakdowns] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [me, items] = await Promise.all([
      appApi.auth.me(),
      appApi.entities.Client.list("name", 500),
    ]);
    setUser(me);
    setClients(items);
    setLoading(false);
  };

  const isTecnico = user?.role === "user" || user?.role === "tecnico" || user?.role === "ayudante";
  const canEditTarifas = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";

  const openNew = () => {
    setEditingClient(null);
    setForm({ ...emptyClient });
    setDialogOpen(true);
  };

  const openEdit = (client) => {
    setEditingClient(client);
    setForm({ ...client });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (form.cif?.trim()) {
      const cifResult = validateFiscalId(form.cif);
      if (!cifResult.valid) {
        toast.error(cifResult.message || "El CIF/NIF introducido no es válido.");
        return;
      }
    }
    if (editingClient) {
      await appApi.entities.Client.update(editingClient.id, form);
    } else {
      await appApi.entities.Client.create(form);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = (client) => {
    setClientToDelete(client);
  };

  const handleToggleClient = async (clientId) => {
    const isExpanding = expandedClient !== clientId;
    setExpandedClient(isExpanding ? clientId : null);
    if (isExpanding && clientBreakdowns[clientId] === undefined && !loadingBreakdowns[clientId]) {
      setLoadingBreakdowns(prev => ({ ...prev, [clientId]: true }));
      try {
        const items = await appApi.breakdowns.byClient(clientId).catch(() => []);
        setClientBreakdowns(prev => ({ ...prev, [clientId]: items || [] }));
      } finally {
        setLoadingBreakdowns(prev => ({ ...prev, [clientId]: false }));
      }
    }
  };

  const filtered = clients.filter(c => {
    return !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.cif?.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 lg:p-8 max-w-7xl mx-auto space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        {!isTecnico && (
          <Button onClick={openNew} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-6 shadow-lg shadow-accent/25">
            <Plus className="h-4 w-4 mr-2" /> Nuevo Cliente
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre o CIF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 rounded-xl bg-card" />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center space-y-3">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          {search ? (
            <>
              <p className="text-muted-foreground">Sin resultados para «{search}»</p>
              <Button variant="outline" onClick={() => setSearch("")} className="rounded-xl">
                Limpiar búsqueda
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">No hay clientes registrados</p>
              {!isTecnico && (
                <Button variant="outline" onClick={openNew} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-2" /> Crear primer cliente
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isExpanded = expandedClient === c.id;
            return (
              <div key={c.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                {/* Collapsed/Header View */}
                <button
                  onClick={() => handleToggleClient(c.id)}
                  className="w-full px-3 sm:px-5 py-3 flex items-center justify-between hover:bg-accent/5 transition-colors text-left"
                >
                  <h3 className="font-semibold text-sm whitespace-normal break-words flex-1 pr-2">{c.name}</h3>
                  <span className="text-muted-foreground text-lg flex-shrink-0">{isExpanded ? '−' : '+'}</span>
                </button>

                {/* Expanded View */}
                {isExpanded && (
                  <div className="border-t border-border px-3 sm:px-5 py-4 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {c.cif && <p className="text-xs text-muted-foreground mb-2">{c.cif}</p>}
                        <Badge variant="outline" className="text-xs">{TIERS[c.price_tier] || "Estándar"}</Badge>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                      {c.contact_person && (
                        <p className="whitespace-normal break-words">{c.contact_person}</p>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                          <Phone className="h-3 w-3 flex-shrink-0" /><span className="whitespace-normal break-words">{c.phone}</span>
                        </a>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2 min-w-0">
                          <MailIcon className="h-3 w-3 flex-shrink-0" /><span className="whitespace-normal break-words text-xs">{c.email}</span>
                        </div>
                      )}
                      {c.address && (
                        <MapLink address={`${c.address}${c.postal_code ? ", " + c.postal_code : ""}${c.city ? ", " + c.city : ""}`} className="text-xs sm:text-sm" />
                      )}
                    </div>

                    {c.discount_percent > 0 && (
                      <p className="text-xs text-accent font-medium">Descuento: {c.discount_percent}%</p>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-border">
                      <Button variant="outline" size="sm" onClick={() => setExpandedClient(null)} className="flex-1 rounded-xl text-xs">
                        Ver centros de trabajo
                      </Button>
                      {!isTecnico && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openEdit(c)} className="rounded-xl">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(c)} className="text-destructive rounded-xl">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                    {<WorkCentersInline client={c} readOnly={isTecnico} />}
                    <MachinesInline client={c} />

                    {/* Averías del cliente */}
                    <div className="border-t border-border pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Wrench className="h-3.5 w-3.5" /> Averías
                        </h4>
                        {!isTecnico && (
                          <Link to={`/breakdowns/new`} state={{ prefillClientId: c.id }}>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] rounded-lg">
                              <Plus className="h-3 w-3 mr-1" /> Nueva
                            </Button>
                          </Link>
                        )}
                      </div>

                      {loadingBreakdowns[c.id] ? (
                        <p className="text-xs text-muted-foreground">Cargando averías...</p>
                      ) : (clientBreakdowns[c.id] || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">Sin averías registradas</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(clientBreakdowns[c.id] || []).slice(0, 5).map(bd => (
                            <Link key={bd.id} to={`/breakdowns/${bd.id}`}>
                              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-border hover:border-accent/40 hover:bg-accent/5 transition-colors">
                                <div className="min-w-0">
                                  <span className="text-[11px] font-mono text-muted-foreground">{bd.number}</span>
                                  {bd.work_center_name && (
                                    <span className="text-[11px] text-muted-foreground ml-2">· {bd.work_center_name}</span>
                                  )}
                                  <p className="text-xs truncate max-w-[180px]">{bd.description}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge className={cn("text-[10px] px-1.5 py-0", BD_PRIORITY_COLORS[bd.priority] || "")}>
                                    {bd.priority}
                                  </Badge>
                                  <Badge className={cn("text-[10px] px-1.5 py-0", BD_STATUS_COLORS[bd.status] || "")}>
                                    {BD_STATUS_LABELS[bd.status] || bd.status}
                                  </Badge>
                                </div>
                              </div>
                            </Link>
                          ))}
                          {(clientBreakdowns[c.id] || []).length > 5 && (
                            <Link to={`/breakdowns?client=${encodeURIComponent(c.name)}`} className="text-xs text-accent hover:underline block text-center pt-1">
                              Ver todas las averías →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CIF/NIF</Label>
                {(() => {
                  const cifResult = validateFiscalId(form.cif);
                  return (
                    <>
                      <Input
                        value={form.cif || ""}
                        onChange={(e) => setForm(f => ({ ...f, cif: e.target.value }))}
                        onBlur={(e) => {
                          const normalized = normalizeFiscalId(e.target.value);
                          if (normalized !== e.target.value) setForm(f => ({ ...f, cif: normalized }));
                        }}
                        placeholder="B12345674"
                        className="mt-1"
                      />
                      {cifResult.valid === true && (
                        <p className="text-xs mt-1 text-emerald-600">{cifResult.message}</p>
                      )}
                      {cifResult.valid === false && (
                        <p className="text-xs mt-1 text-destructive">{cifResult.message}</p>
                      )}
                    </>
                  );
                })()}
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone || ""} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+34 612 345 678" className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Persona de Contacto</Label>
              <Input value={form.contact_person || ""} onChange={(e) => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="Nombre del responsable" className="mt-1" />
            </div>
            <div>
              <Label>Dirección</Label>
              <AddressAutocomplete
                value={form.address || ""}
                onChange={(v) => setForm(f => ({ ...f, address: v }))}
                onPick={(s) => setForm(f => ({
                  ...f,
                  address: s.address_line1 || f.address,
                  ...(s.city ? { city: s.city } : {}),
                  ...(s.postal_code ? { postal_code: s.postal_code } : {}),
                }))}
                className="mt-1"
                placeholder="Calle Mayor 1, Madrid..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ciudad</Label>
                <Input value={form.city || ""} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Código Postal</Label>
                {(() => {
                  const cpResult = validatePostalCode(form.postal_code);
                  return (
                    <>
                      <Input
                        value={form.postal_code || ""}
                        onChange={(e) => setForm(f => ({ ...f, postal_code: e.target.value }))}
                        className="mt-1"
                      />
                      {cpResult.valid === true && (
                        <p className="text-xs mt-1 text-muted-foreground">{cpResult.message}</p>
                      )}
                      {cpResult.valid === false && (
                        <p className="text-xs mt-1 text-destructive">{cpResult.message}</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tarifa</Label>
                <Select value={form.price_tier} onValueChange={(v) => setForm(f => ({ ...f, price_tier: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIERS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descuento (%)</Label>
                <Input type="number" min="0" max="100" value={form.discount_percent || ""} onChange={(e) => setForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) || 0 }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" />
            </div>

            {/* Matriz de tarifas MO */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Tarifas Mano de Obra (€/h)</h3>
                {!canEditTarifas && <span className="text-xs text-muted-foreground">Solo Admin/Encargado</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TARIFA_FIELDS.map(tf => (
                  <div key={tf.key}>
                    <Label className="text-xs">{tf.label}</Label>
                    <Input
                      type="number" step="0.5" min="0"
                      value={form[tf.key] ?? tf.default}
                      onChange={e => canEditTarifas && setForm(f => ({ ...f, [tf.key]: parseFloat(e.target.value) || 0 }))}
                      disabled={!canEditTarifas}
                      className="mt-1 rounded-xl"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={!form.name?.trim()} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
              {editingClient ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        icon={null}
        open={!!clientToDelete}
        onOpenChange={(open) => {
          if (!open) setClientToDelete(null);
        }}
        title="Eliminar cliente"
        description={
          <>
            Vas a eliminar <strong>{clientToDelete?.name}</strong>.
          </>
        }
        note="Los centros de trabajo y el historial relacionado deben revisarse antes de eliminar este cliente."
        confirmText="Eliminar cliente"
        variant="danger"
        onConfirm={async () => {
          if (!clientToDelete) return;
          await appApi.entities.Client.delete(clientToDelete.id);
          setClientToDelete(null);
          await loadData();
        }}
      />
    </div>
  );
}

