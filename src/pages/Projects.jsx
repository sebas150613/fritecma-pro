import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Building2, Package, ArrowDownToLine, Undo2, ChevronsUpDown, AlertTriangle, Trash2, BarChart2 } from "lucide-react";
import MapLink from "../components/MapLink";
import ProjectDetailModal from "../components/ProjectDetailModal";
import { cn } from "@/lib/utils";
import moment from "moment";

const STATUS_COLORS = {
  en_curso: "bg-blue-100 text-blue-700 border-blue-200",
  pausada: "bg-amber-100 text-amber-700 border-amber-200",
  finalizada: "bg-emerald-100 text-emerald-700 border-emerald-200",
  facturada: "bg-purple-100 text-purple-700 border-purple-200",
};
const STATUS_LABELS = { en_curso: "En Curso", pausada: "Pausada", finalizada: "Finalizada", facturada: "Facturada" };

const EMPTY_PROJECT = { name: "", reference: "", client_id: "", client_name: "", address: "", start_date: moment().format("YYYY-MM-DD"), end_date: "", status: "en_curso", description: "", notes: "" };

export default function Projects() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [clients, setClients] = useState([]);
  const [projectMaterials, setProjectMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedProject, setSelectedProject] = useState(null);
  const [projectModal, setProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT);
  const [valeModal, setValeModal] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [valeForm, setValeForm] = useState({ material_id: "", quantity: "", notes: "" });
  const [returnLine, setReturnLine] = useState(null);
  const [returnQty, setReturnQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [detailProject, setDetailProject] = useState(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const [u, p, m, c, pm] = await Promise.all([
      base44.auth.me(),
      base44.entities.Project.list("-created_date", 200),
      base44.entities.Material.filter({ is_active: true }, "name", 500),
      base44.entities.Client.list("name", 200),
      base44.entities.ProjectMaterial.list("-created_date", 1000),
    ]);
    setUser(u); setProjects(p); setMaterials(m); setClients(c); setProjectMaterials(pm);
    setLoading(false);
  };

  const reload = async () => {
    const [p, pm] = await Promise.all([
      base44.entities.Project.list("-created_date", 200),
      base44.entities.ProjectMaterial.list("-created_date", 1000),
    ]);
    setProjects(p); setProjectMaterials(pm);
  };

  // Lines for a project: net quantity = out - returned
  const getProjectInventory = (projectId) => {
    const lines = projectMaterials.filter(pm => pm.project_id === projectId);
    const byMaterial = {};
    lines.forEach(l => {
      if (!byMaterial[l.material_id]) byMaterial[l.material_id] = { ...l, net: 0 };
      byMaterial[l.material_id].net += l.movement_type === "salida" ? (l.quantity_out || 0) : -(l.quantity_out || 0);
    });
    return Object.values(byMaterial).filter(x => x.net > 0);
  };

  // Project CRUD
  const openNew = () => { setProjectForm(EMPTY_PROJECT); setProjectModal(true); };
  const saveProject = async () => {
    setSaving(true);
    const data = { ...projectForm };
    if (projectForm.id) await base44.entities.Project.update(projectForm.id, data);
    else await base44.entities.Project.create(data);
    await reload(); setSaving(false); setProjectModal(false);
  };

  // Vale de salida
  const openVale = (project) => { setSelectedProject(project); setValeForm({ material_id: "", quantity: "", notes: "" }); setValeModal(true); };

  const confirmVale = async () => {
    if (!valeForm.material_id || !valeForm.quantity) return;
    setSaving(true);
    const mat = materials.find(m => m.id === valeForm.material_id);
    const qty = parseFloat(valeForm.quantity);

    // Check stock
    if ((mat?.stock_quantity || 0) < qty) {
      const ok = window.confirm(`⚠️ Stock insuficiente: ${mat?.name} tiene ${mat?.stock_quantity || 0} ${mat?.unit}. ¿Continuar?`);
      if (!ok) { setSaving(false); return; }
    }

    // Log in ProjectMaterial
    await base44.entities.ProjectMaterial.create({
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      material_id: mat.id,
      material_name: mat.name,
      material_code: mat.code || "",
      unit: mat.unit || "ud",
      unit_price: mat.sell_price || 0,
      quantity_out: qty,
      quantity_returned: 0,
      technician_email: user.email,
      technician_name: user.full_name,
      movement_type: "salida",
      notes: valeForm.notes,
    });

    // Deduct stock
    await base44.entities.Material.update(mat.id, { stock_quantity: (mat.stock_quantity || 0) - qty });
    await base44.entities.StockMovement.create({
      material_id: mat.id,
      material_name: mat.name,
      material_code: mat.code || "",
      quantity: -qty,
      stock_before: mat.stock_quantity || 0,
      stock_after: (mat.stock_quantity || 0) - qty,
      movement_type: "salida_obra",
      technician_email: user.email,
      technician_name: user.full_name,
      notes: `Obra: ${selectedProject.name}`,
    });

    await reload(); setSaving(false); setValeModal(false);
  };

  // Return
  const openReturn = (project, line) => { setSelectedProject(project); setReturnLine(line); setReturnQty(""); setReturnModal(true); };

  const confirmReturn = async () => {
    if (!returnQty) return;
    setSaving(true);
    const qty = parseFloat(returnQty);
    const mat = materials.find(m => m.id === returnLine.material_id);

    await base44.entities.ProjectMaterial.create({
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      material_id: returnLine.material_id,
      material_name: returnLine.material_name,
      material_code: returnLine.material_code || "",
      unit: returnLine.unit || "ud",
      unit_price: returnLine.unit_price || 0,
      quantity_out: qty,
      quantity_returned: qty,
      technician_email: user.email,
      technician_name: user.full_name,
      movement_type: "devolucion",
    });

    // Restore stock
    if (mat) {
      await base44.entities.Material.update(mat.id, { stock_quantity: (mat.stock_quantity || 0) + qty });
      await base44.entities.StockMovement.create({
        material_id: mat.id,
        material_name: mat.name,
        material_code: mat.code || "",
        quantity: qty,
        stock_before: mat.stock_quantity || 0,
        stock_after: (mat.stock_quantity || 0) + qty,
        movement_type: "entrada_obra",
        technician_email: user.email,
        technician_name: user.full_name,
        notes: `Retorno obra: ${selectedProject.name}`,
      });
    }

    await reload(); setSaving(false); setReturnModal(false);
  };

  const deleteProject = async () => {
    if (!deleteProjectTarget) return;
    setDeleting(true);
    await base44.entities.Project.delete(deleteProjectTarget.id);
    await reload();
    setDeleting(false);
    setDeleteProjectTarget(null);
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isTecnico = user?.role === "user" || user?.role === "tecnico";
  const canCreate = !isTecnico;
  const selectedMat = materials.find(m => m.id === valeForm.material_id);
  const canSeePrices = isAdmin || user?.role === "oficina";

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Building2 className="h-6 w-6 text-accent" /> Obras y Proyectos</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestión de materiales por obra con trazabilidad de stock</p>
        </div>
        {canCreate && (
          <Button onClick={openNew} className="rounded-xl gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="h-4 w-4" /> Nueva Obra</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {projects.map(project => {
          const inventory = getProjectInventory(project.id);
          const total = inventory.reduce((s, l) => s + l.net * (l.unit_price || 0), 0);
          return (
            <div key={project.id} className="bg-card rounded-2xl border border-border p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-mono">{project.reference || project.id?.slice(0, 8)}</p>
                  <h3 className="font-bold text-lg">{project.name}</h3>
                  <p className="text-sm text-muted-foreground">{project.client_name}</p>
                </div>
                <Badge variant="outline" className={cn("border text-xs", STATUS_COLORS[project.status])}>{STATUS_LABELS[project.status]}</Badge>
              </div>

              {project.address && <MapLink address={project.address} className="text-xs" />}

              {/* Inventory */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Inventario Activo</p>
                {inventory.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sin material asignado</p>
                ) : (
                  <div className="space-y-1">
                    {inventory.map(line => (
                      <div key={line.material_id} className="flex items-center justify-between text-sm">
                        <span className="truncate flex-1">{line.material_name}</span>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                            <span className="font-medium">{line.net} {line.unit}</span>
                           {canSeePrices && <span className="text-xs text-muted-foreground">{((line.net * (line.unit_price || 0)).toFixed(2))} €</span>}
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-accent" onClick={() => openReturn(project, line)} title="Devolver">
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                {canSeePrices && <p className="text-sm font-bold">Total consumido: {total.toFixed(2)} €</p>}
                {!canSeePrices && <span />}
                <div className="flex gap-2">
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => setDetailProject(project)}
                      className="rounded-xl gap-1 text-xs h-8">
                      <BarChart2 className="h-3.5 w-3.5" /> Detalle
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => setDeleteProjectTarget(project)}
                      className="rounded-xl gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-8">
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openVale(project)} className="rounded-xl gap-1 bg-accent hover:bg-accent/90 text-accent-foreground text-xs h-8">
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Vale de Salida
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {projects.length === 0 && <p className="col-span-2 text-center text-muted-foreground py-12">No hay obras registradas.</p>}
      </div>

      {/* New Project Modal */}
      <Dialog open={projectModal} onOpenChange={setProjectModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Obra</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Nombre de Obra *</Label>
              <Input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} className="mt-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Referencia / Nº Obra</Label>
                <Input value={projectForm.reference} onChange={e => setProjectForm(f => ({ ...f, reference: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={projectForm.status} onValueChange={v => setProjectForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Cliente *</Label>
              <Select value={projectForm.client_id} onValueChange={v => { const c = clients.find(x => x.id === v); setProjectForm(f => ({ ...f, client_id: v, client_name: c?.name || "" })); }}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={projectForm.address} onChange={e => setProjectForm(f => ({ ...f, address: e.target.value }))} className="mt-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha Inicio</Label>
                <Input type="date" value={projectForm.start_date} onChange={e => setProjectForm(f => ({ ...f, start_date: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Fecha Fin Prevista</Label>
                <Input type="date" value={projectForm.end_date} onChange={e => setProjectForm(f => ({ ...f, end_date: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} className="mt-1 rounded-xl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setProjectModal(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={saveProject} disabled={saving || !projectForm.name || !projectForm.client_id} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Guardando..." : "Crear Obra"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vale de Salida Modal */}
      <Dialog open={valeModal} onOpenChange={setValeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" /> Vale de Salida — {selectedProject?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Material *</Label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between mt-1 rounded-xl font-normal">
                    <span className="truncate">{selectedMat ? selectedMat.name : "Buscar material..."}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar..." className="h-10" />
                    <CommandList className="max-h-56">
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        {materials.map(m => (
                          <CommandItem key={m.id} value={`${m.code || ""} ${m.name}`} onSelect={() => { setValeForm(f => ({ ...f, material_id: m.id })); setComboOpen(false); }}>
                            <span>{m.code && <span className="text-muted-foreground text-xs mr-1">[{m.code}]</span>}{m.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">Stock: {m.stock_quantity || 0}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedMat && <p className="text-xs text-muted-foreground mt-1">Stock actual: <strong>{selectedMat.stock_quantity || 0} {selectedMat.unit}</strong></p>}
            </div>
            <div>
              <Label>Cantidad *</Label>
              <Input type="number" min="0.01" step="0.01" value={valeForm.quantity} onChange={e => setValeForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={valeForm.notes} onChange={e => setValeForm(f => ({ ...f, notes: e.target.value }))} placeholder="Motivo de la salida..." className="mt-1 rounded-xl" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setValeModal(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={confirmVale} disabled={saving || !valeForm.material_id || !valeForm.quantity} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Procesando..." : "Confirmar Salida"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirm */}
      <Dialog open={!!deleteProjectTarget} onOpenChange={v => !v && setDeleteProjectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="h-5 w-5" /> Eliminar Obra</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que quieres eliminar la obra <strong>{deleteProjectTarget?.name}</strong>?
            Los movimientos de material asociados no se eliminarán.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteProjectTarget(null)} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={deleteProject} disabled={deleting} className="rounded-xl">
              {deleting ? "Eliminando..." : "Eliminar Obra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Modal */}
      <Dialog open={returnModal} onOpenChange={setReturnModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5" /> Retorno de Material</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-muted rounded-xl p-3 text-sm">
              <p className="font-medium">{returnLine?.material_name}</p>
              <p className="text-muted-foreground">En obra: {returnLine?.net} {returnLine?.unit}</p>
            </div>
            <div>
              <Label>Cantidad a Devolver *</Label>
              <Input type="number" min="0.01" step="0.01" max={returnLine?.net} value={returnQty} onChange={e => setReturnQty(e.target.value)} className="mt-1 rounded-xl" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setReturnModal(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={confirmReturn} disabled={saving || !returnQty} className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
                {saving ? "Procesando..." : "Confirmar Retorno"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Project Detail Modal */}
      <ProjectDetailModal
        project={detailProject}
        projectMaterials={projectMaterials}
        onClose={() => setDetailProject(null)}
      />
    </div>
  );
}