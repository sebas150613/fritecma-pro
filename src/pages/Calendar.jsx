import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle2, Circle, Calendar as CalendarIcon, UserX } from "lucide-react";
import moment from "moment";

const EVENT_TYPES = { tarea: "Tarea", cita: "Cita", recordatorio: "Recordatorio", mantenimiento: "Mantenimiento", otro: "Otro" };
const PRIORITY_COLORS = { baja: "bg-blue-100 text-blue-700", normal: "bg-gray-100 text-gray-700", alta: "bg-amber-100 text-amber-700", urgente: "bg-red-100 text-red-700" };
const TYPE_COLORS = { tarea: "#3b82f6", cita: "#10b981", recordatorio: "#f59e0b", mantenimiento: "#ef4444", otro: "#8b5cf6" };

export default function Calendar() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(moment());
  const [interventions, setInterventions] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asignado_a: "",
    asignado_a_name: "",
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    event_type: "tarea",
    priority: "normal",
    location: "",
    color: "#3b82f6",
    completed: false
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Suscripción en tiempo real a cambios en eventos
    const unsubscribe = appApi.entities.CalendarEvent.subscribe((event) => {
      loadEvents();
    });
    
    return unsubscribe;
  }, [user]);

  const loadData = async () => {
    try {
      const me = await appApi.auth.me();
      setUser(me);

      // Los partes salen en el calendario con la misma visibilidad que en
      // "Partes de trabajo": la oficina ve todos y el personal de campo, los suyos.
      const isFieldRole = ["user", "tecnico", "ayudante"].includes(me.role);
      const [userList, eventList, partes] = await Promise.all([
        appApi.entities.User.list("full_name", 200),
        appApi.entities.CalendarEvent.list("-start_date", 500),
        (isFieldRole
          ? appApi.entities.Intervention.filter({ technician_email: me.email }, "-created_date", 300)
          : appApi.entities.Intervention.list("-created_date", 300)
        ).catch(() => []),
      ]);

      setUsers(userList || []);
      setEvents(eventList || []);
      setInterventions((partes || []).filter((i) => i.status !== "anulado"));
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const eventList = await appApi.entities.CalendarEvent.list("-start_date", 500);
      setEvents(eventList || []);
    } catch (error) {
      console.error("Error loading events:", error);
    }
  };

  // Filtrar eventos según rol
  const getVisibleEvents = () => {
    if (!user) return [];
    
    if (["encargado", "admin", "superadmin"].includes(user.role)) {
      // Encargado ve todos los eventos
      return events;
    } else if (["user", "tecnico", "ayudante"].includes(user.role)) {
      // Técnico solo ve sus propios eventos asignados
      return events.filter(e => e.asignado_a === user.email);
    }
    
    return [];
  };

  const visibleEvents = getVisibleEvents();

  // Eventos del mes actual
  const monthStart = currentMonth.clone().startOf("month");
  const monthEnd = currentMonth.clone().endOf("month");
  const monthEvents = visibleEvents.filter(e => {
    const eventDate = moment(e.start_date);
    return eventDate.isBetween(monthStart, monthEnd, null, "[]");
  });

  // Rejilla del mes (semanas de lunes a domingo).
  const gridStart = monthStart.clone().startOf("isoWeek");
  const gridEnd = monthEnd.clone().endOf("isoWeek");
  const gridDays = [];
  for (let d = gridStart.clone(); d.isSameOrBefore(gridEnd, "day"); d.add(1, "day")) {
    gridDays.push(d.clone());
  }
  const eventsOn = (day) => visibleEvents.filter((e) => moment(e.start_date).isSame(day, "day"));
  const partesOn = (day) => interventions.filter((i) => i.date && moment(i.date).isSame(day, "day"));
  const listedEvents = selectedDay ? eventsOn(selectedDay) : monthEvents;
  const listedPartes = selectedDay ? partesOn(selectedDay) : [];

  const handleSave = async () => {
    if (!form.asignado_a || !form.title || !form.start_date) return;

    setSaving(true);
    try {
      const data = {
        asignado_a: form.asignado_a,
        asignado_a_name: form.asignado_a_name,
        creado_por: user.email,
        creado_por_name: user.full_name,
        title: form.title,
        description: form.description || "",
        start_date: moment(form.start_date).toISOString(),
        end_date: form.end_date ? moment(form.end_date).toISOString() : moment(form.start_date).add(1, "hour").toISOString(),
        event_type: form.event_type,
        priority: form.priority,
        location: form.location || "",
        color: form.color,
        completed: form.completed
      };

      await appApi.entities.CalendarEvent.create(data);
      await loadEvents();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving event:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (event) => {
    setEventToDelete(event);
  };

  const confirmDeleteEvent = async () => {
    if (!eventToDelete) return;

    try {
      await appApi.entities.CalendarEvent.delete(eventToDelete.id);
      await loadEvents();
    } catch (error) {
      console.error("Error deleting event:", error);
    }

    setEventToDelete(null);
  };

  const handleToggleComplete = async (event) => {
    try {
      await appApi.entities.CalendarEvent.update(event.id, { completed: !event.completed });
      await loadEvents();
    } catch (error) {
      console.error("Error updating event:", error);
    }
  };

  const resetForm = () => {
    setForm({
      asignado_a: "",
      asignado_a_name: "",
      title: "",
      description: "",
      start_date: "",
      end_date: "",
      event_type: "tarea",
      priority: "normal",
      location: "",
      color: "#3b82f6",
      completed: false
    });
  };

  const isEncargado = ["encargado", "admin", "superadmin"].includes(user?.role);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><CalendarIcon className="h-6 w-6 text-accent" /> Calendario</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isEncargado ? "Vista maestra - Todos los técnicos" : `Mi calendario - ${user?.full_name}`}
          </p>
        </div>
        <div className="flex gap-2">
          {isEncargado && (
            <Link to="/absences">
              <Button variant="outline" className="rounded-xl gap-2">
                <UserX className="h-4 w-4" /> Ausencias
              </Button>
            </Link>
          )}
          <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2 bg-accent hover:bg-accent/90">
            <Plus className="h-4 w-4" /> Nuevo evento
          </Button>
        </div>
      </div>

      {/* Controles de mes */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={() => { setSelectedDay(null); setCurrentMonth(currentMonth.clone().subtract(1, "month")); }} className="rounded-xl">
          ← Anterior
        </Button>
        <h2 className="text-lg font-semibold first-letter:uppercase">{currentMonth.format("MMMM YYYY")}</h2>
        <Button variant="outline" onClick={() => { setSelectedDay(null); setCurrentMonth(currentMonth.clone().add(1, "month")); }} className="rounded-xl">
          Siguiente →
        </Button>
      </div>

      {/* Rejilla del mes: eventos y partes de cada día */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const inMonth = day.isSame(currentMonth, "month");
            const isToday = day.isSame(moment(), "day");
            const isSelected = selectedDay && day.isSame(selectedDay, "day");
            const dayEvents = eventsOn(day);
            const dayPartes = partesOn(day);
            return (
              <button
                key={day.format("YYYY-MM-DD")}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day.clone())}
                aria-pressed={Boolean(isSelected)}
                aria-label={`${day.format("dddd D [de] MMMM")}: ${dayEvents.length} eventos, ${dayPartes.length} partes`}
                className={`min-h-[64px] lg:min-h-[92px] border-b border-r border-border p-1.5 text-left align-top transition-colors hover:bg-muted/40 ${inMonth ? "" : "bg-muted/20 text-muted-foreground/60"} ${isSelected ? "ring-2 ring-inset ring-accent" : ""}`}
              >
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? "bg-accent text-accent-foreground" : ""}`}>
                  {day.date()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 2).map((e) => (
                    <p key={e.id} className="hidden lg:block truncate text-[11px] leading-tight" style={{ color: e.color || TYPE_COLORS[e.event_type] }}>
                      {e.title}
                    </p>
                  ))}
                  {dayEvents.length > 0 && (
                    <p className="lg:hidden text-[10px] leading-tight text-accent">{dayEvents.length} ev.</p>
                  )}
                  {dayPartes.length > 0 && (
                    <p className="truncate text-[10px] lg:text-[11px] leading-tight text-muted-foreground">
                      {dayPartes.length === 1 ? "1 parte" : `${dayPartes.length} partes`}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold first-letter:uppercase">{selectedDay.format("dddd D [de] MMMM")}</h3>
          <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)} className="rounded-xl">
            Ver todo el mes
          </Button>
        </div>
      )}

      {/* Partes del día seleccionado */}
      {listedPartes.length > 0 && (
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {listedPartes.map((i) => (
            <Link key={i.id} to={`/interventions/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{i.client_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[moment(i.date).format("HH:mm"), i.number, i.technician_name].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-xs text-accent shrink-0">Ver parte</span>
            </Link>
          ))}
        </div>
      )}

      {/* Eventos del mes (o del día seleccionado) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {listedEvents.length === 0 ? (
          <div className="col-span-3 text-center py-8 space-y-3">
            <p className="text-muted-foreground">{selectedDay ? "Sin eventos este día." : "Sin eventos en este mes."}</p>
            {isEncargado && (
              <Button variant="outline" onClick={() => setDialogOpen(true)} className="rounded-xl">
                <Plus className="h-4 w-4 mr-2" /> Añadir evento
              </Button>
            )}
          </div>
        ) : (
          listedEvents.map(event => (
            <div key={event.id} className="bg-card rounded-xl border border-border p-4 space-y-3" style={{ borderLeftColor: event.color, borderLeftWidth: "4px" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleComplete(event)} className="text-muted-foreground hover:text-accent">
                      {event.completed ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5" />}
                    </button>
                    <h3 className={`font-semibold ${event.completed ? "line-through text-muted-foreground" : ""}`}>{event.title}</h3>
                  </div>
                  <Badge className={`mt-1 ${PRIORITY_COLORS[event.priority]}`}>{event.priority}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(event)} className="text-destructive hover:text-destructive rounded-lg">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">{moment(event.start_date).format("DD/MM/YYYY HH:mm")}</p>
              {event.description && <p className="text-sm">{event.description}</p>}
              {event.location && <p className="text-xs text-muted-foreground">{event.location}</p>}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <span>{EVENT_TYPES[event.event_type]}</span>
                {isEncargado && <span>{event.asignado_a_name}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dialog para crear evento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Evento</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Asignar a *</Label>
              <Select value={form.asignado_a} onValueChange={(v) => {
                const u = users.find(x => x.email === v);
                setForm(f => ({ ...f, asignado_a: v, asignado_a_name: u?.full_name || "" }));
              }}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Seleccionar usuario..." /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => ["user", "tecnico", "ayudante"].includes(u.role)).map(u => (
                    <SelectItem key={u.email} value={u.email}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título del evento" className="mt-1 rounded-xl" />
            </div>

            <div>
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción..." rows={2} className="mt-1 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha y Hora Inicio *</Label>
                <Input type="datetime-local" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Fecha y Hora Fin</Label>
                <Input type="datetime-local" value={form.end_date} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))} className="mt-1 rounded-xl" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Evento</Label>
                <Select value={form.event_type} onValueChange={(v) => setForm(f => ({ ...f, event_type: v, color: TYPE_COLORS[v] }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridad</Label>
                <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Ubicación</Label>
              <Input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Ubicación del evento" className="mt-1 rounded-xl" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.asignado_a || !form.title} className="flex-1 rounded-xl bg-accent hover:bg-accent/90">
                {saving ? "Guardando..." : "Crear Evento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        icon={null}
        open={!!eventToDelete}
        onOpenChange={(open) => {
          if (!open) setEventToDelete(null);
        }}
        title="Eliminar evento"
        description={
          <>
            Vas a eliminar{" "}
            <strong>{eventToDelete?.title || eventToDelete?.name || "este evento"}</strong>.
          </>
        }
        note="Esta acción elimina el evento del calendario."
        confirmText="Eliminar evento"
        variant="danger"
        onConfirm={confirmDeleteEvent}
      />
    </div>
  );
}

