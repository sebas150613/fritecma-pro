import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import moment from "moment";

export default function AbsenceManagement() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    user_email: "",
    user_name: "",
    start_date: "",
    end_date: "",
    type: "vacaciones",
    notes: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      
      // Only encargado/admin allowed
      if (!["admin", "superadmin", "encargado"].includes(me.role)) {
        setLoading(false);
        return;
      }
      
      const [userList, absenceList] = await Promise.all([
        base44.entities.User.list("full_name", 200),
        base44.entities.Absence.list("-start_date", 200)
      ]);
      
      setUsers(userList || []);
      setAbsences(absenceList || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.user_email || !form.start_date || !form.end_date) return;
    
    setSaving(true);
    try {
      const data = {
        user_email: form.user_email,
        user_name: form.user_name,
        start_date: form.start_date,
        end_date: form.end_date,
        type: form.type,
        notes: form.notes || "",
        created_by_email: user.email,
        created_by_name: user.full_name
      };
      
      await base44.entities.Absence.create(data);
      await loadData();
      setDialogOpen(false);
      setForm({ user_email: "", user_name: "", start_date: "", end_date: "", type: "vacaciones", notes: "" });
    } catch (error) {
      console.error("Error saving absence:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar esta ausencia?")) return;
    try {
      await base44.entities.Absence.delete(id);
      await loadData();
    } catch (error) {
      console.error("Error deleting absence:", error);
    }
  };

  const typeLabels = { vacaciones: "Vacaciones", asuntos_propios: "Asuntos Propios", baja_medica: "Baja Médica", otro: "Otro" };
  const typeColors = { vacaciones: "bg-blue-100 text-blue-700", asuntos_propios: "bg-yellow-100 text-yellow-700", baja_medica: "bg-red-100 text-red-700", otro: "bg-gray-100 text-gray-700" };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  if (!user || !["admin", "superadmin", "encargado"].includes(user.role)) {
    return <div className="p-4 text-center text-destructive">No tienes permisos para acceder a esta página.</div>;
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Calendar className="h-6 w-6 text-accent" /> Gestión de Ausencias</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestiona vacaciones y ausencias de los técnicos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2 bg-accent hover:bg-accent/90">
          <Plus className="h-4 w-4" /> Nueva Ausencia
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar Ausencia</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Usuario *</Label>
              <Select value={form.user_email} onValueChange={(v) => {
                const u = users.find(x => x.email === v);
                setForm(f => ({ ...f, user_email: v, user_name: u?.full_name || "" }));
              }}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Seleccionar usuario..." /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => ["user", "tecnico", "ayudante"].includes(u.role)).map(u => (
                    <SelectItem key={u.email} value={u.email}>{u.full_name} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha Inicio *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Fecha Fin *</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>

            <div>
              <Label>Tipo de Ausencia</Label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacaciones">Vacaciones</SelectItem>
                  <SelectItem value="asuntos_propios">Asuntos Propios</SelectItem>
                  <SelectItem value="baja_medica">Baja Médica</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Observaciones</Label>
              <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas adicionales..." className="mt-1 rounded-xl" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.user_email || !form.start_date || !form.end_date} className="flex-1 rounded-xl bg-accent hover:bg-accent/90">
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        {absences.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Sin ausencias registradas.</p>
        ) : (
          absences.map(a => (
            <div key={a.id} className="bg-card rounded-xl border border-border p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{a.user_name}</p>
                  <Badge className={typeColors[a.type]}>{typeLabels[a.type]}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{moment(a.start_date).format("DD/MM/YYYY")} → {moment(a.end_date).format("DD/MM/YYYY")}</p>
                {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
                <p className="text-xs text-muted-foreground mt-1">Registrado por: {a.created_by_name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} className="text-destructive hover:text-destructive rounded-lg">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}