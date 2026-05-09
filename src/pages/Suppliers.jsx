import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Truck, Phone, Mail, Edit, Trash2, FlaskConical, Package } from "lucide-react";
import MapLink from "../components/MapLink";
import { cn } from "@/lib/utils";

const CAT_LABELS = {
  gas_refrigerante: "Gas Refrigerante",
  repuestos: "Repuestos",
  consumibles: "Consumibles",
  herramientas: "Herramientas",
  general: "General",
};

const BOTTLE_STATUS_COLORS = {
  activa: "bg-emerald-100 text-emerald-700",
  vacia: "bg-amber-100 text-amber-700",
  baja: "bg-red-100 text-red-700",
  devuelta: "bg-slate-100 text-slate-600",
};

const EMPTY = {
  name: "", cif: "", address: "", city: "", postal_code: "",
  phone: "", email: "", contact_person: "", category: "general", notes: "", is_active: true,
};

export default function Suppliers() {
  const [user, setUser] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [bottles, setBottles] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const [me, s, b, m] = await Promise.all([
      appApi.auth.me(),
      appApi.entities.Supplier.list("name", 200),
      appApi.entities.GasBottle.list("serial_number", 500),
      appApi.entities.Material.list("name", 500),
    ]);
    setUser(me); setSuppliers(s); setBottles(b); setMaterials(m);
    setLoading(false);
  };

  const reload = async () => {
    const [s, b, m] = await Promise.all([
      appApi.entities.Supplier.list("name", 200),
      appApi.entities.GasBottle.list("serial_number", 500),
      appApi.entities.Material.list("name", 500),
    ]);
    setSuppliers(s); setBottles(b); setMaterials(m);
  };

  const openNew = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...s }); setModal(true); };

  const save = async () => {
    setSaving(true);
    if (editing) await appApi.entities.Supplier.update(editing.id, form);
    else await appApi.entities.Supplier.create(form);
    await reload(); setSaving(false); setModal(false);
  };

  const del = async () => {
    await appApi.entities.Supplier.delete(deleteTarget.id);
    await reload(); setDeleteTarget(null);
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
    </div>
  );

  // Group bottles by supplier for envases panel
  const bottlesBySupplier = {};
  bottles.forEach(b => {
    const key = b.supplier_id || "__sin_proveedor__";
    const name = b.supplier_name || "Sin proveedor asignado";
    if (!bottlesBySupplier[key]) bottlesBySupplier[key] = { name, bottles: [] };
    bottlesBySupplier[key].bottles.push(b);
  });

  // Materials per supplier
  const matsBySupplier = {};
  materials.forEach(m => {
    if (!m.supplier_id) return;
    if (!matsBySupplier[m.supplier_id]) matsBySupplier[m.supplier_id] = [];
    matsBySupplier[m.supplier_id].push(m);
  });

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-accent" /> Proveedores
          </h1>
          <p className="text-sm text-muted-foreground">Gestión de proveedores, envases y trazabilidad de compras</p>
        </div>
        {isAdmin && (
          <Button onClick={openNew} className="rounded-xl gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="h-4 w-4" /> Nuevo Proveedor
          </Button>
        )}
      </div>

      <Tabs defaultValue="proveedores">
        <TabsList className="rounded-xl">
          <TabsTrigger value="proveedores" className="rounded-lg">Proveedores ({suppliers.length})</TabsTrigger>
          <TabsTrigger value="envases" className="rounded-lg">Control de Envases (Cascos)</TabsTrigger>
        </TabsList>

        {/* PROVEEDORES TAB */}
        <TabsContent value="proveedores" className="mt-4">
          {suppliers.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <Truck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No hay proveedores registrados</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map(s => {
                const matCount = matsBySupplier[s.id]?.length || 0;
                const bottleCount = bottles.filter(b => b.supplier_id === s.id).length;
                const fullAddress = [s.address, s.city, s.postal_code].filter(Boolean).join(", ");
                return (
                  <div key={s.id} className="bg-card rounded-2xl border border-border p-5 space-y-3 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold">{s.name}</h3>
                        {s.cif && <p className="text-xs text-muted-foreground">CIF: {s.cif}</p>}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{CAT_LABELS[s.category] || s.category}</Badge>
                    </div>

                    <div className="space-y-1.5 text-sm">
                      {s.contact_person && (
                        <p className="text-muted-foreground">{s.contact_person}</p>
                      )}
                      {s.phone && (
                        <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline">
                          <Phone className="h-3.5 w-3.5" /> {s.phone}
                        </a>
                      )}
                      {s.email && (
                        <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline truncate">
                          <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{s.email}</span>
                        </a>
                      )}
                      {fullAddress && <MapLink address={fullAddress} className="text-xs" />}
                    </div>

                    <div className="flex gap-3 text-xs pt-1 border-t border-border">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Package className="h-3.5 w-3.5" /> {matCount} ref.
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <FlaskConical className="h-3.5 w-3.5" /> {bottleCount} envases
                      </span>
                    </div>

                    {isAdmin && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="flex-1 rounded-xl gap-1 text-xs h-8">
                          <Edit className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteTarget(s)}
                          className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 h-8 w-8 p-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ENVASES TAB */}
        <TabsContent value="envases" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Inventario de botellas / cascos de gas agrupados por proveedor. Permite controlar devoluciones y estado.
          </p>
          {Object.entries(bottlesBySupplier).length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <FlaskConical className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No hay botellas registradas</p>
            </div>
          ) : (
            Object.entries(bottlesBySupplier).map(([key, group]) => {
              const llenas = group.bottles.filter(b => b.status === "activa");
              const vacias = group.bottles.filter(b => b.status === "vacia");
              const devueltas = group.bottles.filter(b => b.status === "devuelta");
              return (
                <div key={key} className="bg-card rounded-2xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      {group.name}
                    </h3>
                    <div className="flex gap-3 text-xs">
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{llenas.length} llenas</span>
                      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{vacias.length} vacías</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{devueltas.length} devueltas</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b border-border">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nº Serie</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Gas</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Kg</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ubicación</th>
                          <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Casco</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.bottles.map(b => (
                          <tr key={b.id} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-mono font-medium">{b.serial_number}</td>
                            <td className="px-4 py-2.5">{b.gas_type}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={cn("font-medium", (b.current_kg || 0) <= 0 && "text-amber-600")}>
                                {b.current_kg || 0} / {b.capacity_kg || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground capitalize">
                              {b.location_type}{b.location_detail ? ` · ${b.location_detail}` : ""}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge className={cn("text-xs", BOTTLE_STATUS_COLORS[b.status] || "")}>
                                {b.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">{b.casco_owner}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Form Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nombre / Razón Social *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>CIF/NIF</Label>
                <Input value={form.cif || ""} onChange={e => setForm(f => ({ ...f, cif: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Persona de Contacto</Label>
                <Input value={form.contact_person || ""} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1 rounded-xl" placeholder="+34 ..." />
              </div>
              <div className="col-span-2">
                <Label>Email</Label>
                <Input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div className="col-span-2">
                <Label>Dirección</Label>
                <Input value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Ciudad</Label>
                <Input value={form.city || ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Código Postal</Label>
                <Input value={form.postal_code || ""} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div className="col-span-2">
                <Label>Notas</Label>
                <Textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 rounded-xl" rows={2} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setModal(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Proveedor"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Eliminar Proveedor
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">¿Eliminar <strong>{deleteTarget?.name}</strong>? Las referencias de materiales asociados no se eliminarán.</p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={del} className="rounded-xl">Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

