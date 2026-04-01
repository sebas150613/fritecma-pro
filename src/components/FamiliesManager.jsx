import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function FamiliesManager({ open, onClose }) {
  const [families, setFamilies] = useState([]);
  const [subfamilies, setSubfamilies] = useState([]);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubFamily, setNewSubFamily] = useState("");

  const load = async () => {
    const [fams, subs] = await Promise.all([
      base44.entities.MaterialFamily.list("name", 200),
      base44.entities.MaterialSubfamily.list("name", 500),
    ]);
    setFamilies(fams);
    setSubfamilies(subs);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const addFamily = async () => {
    if (!newFamilyName.trim()) return;
    await base44.entities.MaterialFamily.create({ name: newFamilyName.trim(), is_active: true });
    setNewFamilyName("");
    toast.success("Familia creada");
    load();
  };

  const deleteFamily = async (id) => {
    if (!confirm("¿Eliminar esta familia y sus subfamilias?")) return;
    const subs = subfamilies.filter(s => s.family_id === id);
    for (const s of subs) await base44.entities.MaterialSubfamily.delete(s.id);
    await base44.entities.MaterialFamily.delete(id);
    if (selectedFamily === id) setSelectedFamily(null);
    load();
  };

  const addSubfamily = async () => {
    const famId = newSubFamily || selectedFamily;
    if (!newSubName.trim() || !famId) { toast.error("Selecciona una familia y escribe un nombre"); return; }
    const fam = families.find(f => f.id === famId);
    await base44.entities.MaterialSubfamily.create({ family_id: famId, family_name: fam?.name || "", name: newSubName.trim(), is_active: true });
    setNewSubName("");
    toast.success("Subfamilia creada");
    load();
  };

  const deleteSubfamily = async (id) => {
    if (!confirm("¿Eliminar esta subfamilia?")) return;
    await base44.entities.MaterialSubfamily.delete(id);
    load();
  };

  const filteredSubs = selectedFamily ? subfamilies.filter(s => s.family_id === selectedFamily) : subfamilies;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestionar Familias y Subfamilias</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* Families */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Familias</h3>
            <div className="flex gap-2">
              <Input placeholder="Nueva familia..." value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addFamily()} className="text-sm" />
              <Button size="sm" onClick={addFamily} className="shrink-0"><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {families.map(f => (
                <div key={f.id}
                  onClick={() => setSelectedFamily(selectedFamily === f.id ? null : f.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${selectedFamily === f.id ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}>
                  <span className="flex items-center gap-2">
                    <ChevronRight className={`h-3 w-3 transition-transform ${selectedFamily === f.id ? "rotate-90" : ""}`} />
                    {f.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs opacity-60">{subfamilies.filter(s => s.family_id === f.id).length}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteFamily(f.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {families.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin familias</p>}
            </div>
          </div>

          {/* Subfamilies */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">
              Subfamilias {selectedFamily && <span className="text-muted-foreground font-normal">— {families.find(f => f.id === selectedFamily)?.name}</span>}
            </h3>
            <div className="space-y-2">
              {families.length > 0 && (
                <Select value={newSubFamily || selectedFamily || ""} onValueChange={setNewSubFamily}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Familia padre..." /></SelectTrigger>
                  <SelectContent>
                    {families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2">
                <Input placeholder="Nueva subfamilia..." value={newSubName} onChange={e => setNewSubName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSubfamily()} className="text-sm" />
                <Button size="sm" onClick={addSubfamily} className="shrink-0"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {filteredSubs.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm">
                  <span>
                    {!selectedFamily && <span className="text-xs text-muted-foreground mr-2">{s.family_name}</span>}
                    {s.name}
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => deleteSubfamily(s.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {filteredSubs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin subfamilias{selectedFamily ? " en esta familia" : ""}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}