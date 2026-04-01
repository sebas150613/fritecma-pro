import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Users, Edit, Trash2, Phone, Mail as MailIcon } from "lucide-react";
import MapLink from "../components/MapLink";
import WorkCentersInline from "../components/WorkCentersInline";
import { Badge } from "@/components/ui/badge";

const TIERS = { standard: "Estándar", preferente: "Preferente", especial: "Especial" };

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [me, items] = await Promise.all([
      base44.auth.me(),
      base44.entities.Client.list("name", 500),
    ]);
    setUser(me);
    setClients(items);
    setLoading(false);
  };

  const isTecnico = user?.role === "user" || user?.role === "tecnico" || user?.role === "ayudante";

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
    if (editingClient) {
      await base44.entities.Client.update(editingClient.id, form);
    } else {
      await base44.entities.Client.create(form);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este cliente?")) return;
    await base44.entities.Client.delete(id);
    loadData();
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
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No se encontraron clientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isExpanded = expandedClient === c.id;
            return (
              <div key={c.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                {/* Collapsed/Header View */}
                <button
                  onClick={() => setExpandedClient(isExpanded ? null : c.id)}
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
                        🏢 Ver centros
                      </Button>
                      {!isTecnico && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openEdit(c)} className="rounded-xl">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(c.id)} className="text-destructive rounded-xl">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                    {<WorkCentersInline client={c} readOnly={isTecnico} />}
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
                <Input value={form.cif || ""} onChange={(e) => setForm(f => ({ ...f, cif: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone || ""} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Persona de Contacto</Label>
              <Input value={form.contact_person || ""} onChange={(e) => setForm(f => ({ ...f, contact_person: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={form.address || ""} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ciudad</Label>
                <Input value={form.city || ""} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Código Postal</Label>
                <Input value={form.postal_code || ""} onChange={(e) => setForm(f => ({ ...f, postal_code: e.target.value }))} className="mt-1" />
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
            <Button onClick={handleSave} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
              {editingClient ? "Actualizar" : "Crear Cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}