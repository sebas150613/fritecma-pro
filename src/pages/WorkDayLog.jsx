import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Clock, CheckCircle2 } from "lucide-react";
import moment from "moment";

const LOCATION_OPTIONS = [
  "Taller",
  "Comida",
  "Desplazamiento",
  "Cliente",
  "Guardia",
  "Formación",
  "Otro",
];

const emptySegment = () => ({ start: "", end: "", location: "Cliente", incident_number: "" });

function calcMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function minutesToHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default function WorkDayLog() {
  const [user, setUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(moment().format("YYYY-MM-DD"));
  const [segments, setSegments] = useState([emptySegment()]);
  const [liquidacion, setLiquidacion] = useState({ hours_extra: 0, hours_nocturnas: 0, hours_sabado: 0, hours_domingo: 0 });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existingId, setExistingId] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  useEffect(() => {
    if (user && selectedDate) loadExisting();
  }, [user, selectedDate]);

  const loadExisting = async () => {
    const records = await base44.entities.WorkDay.filter(
      { technician_email: user.email, work_date: selectedDate },
      "-created_date", 1
    );
    if (records[0]) {
      const r = records[0];
      setExistingId(r.id);
      setSegments(r.segments_json ? JSON.parse(r.segments_json) : [emptySegment()]);
      setLiquidacion({
        hours_extra: r.hours_extra || 0,
        hours_nocturnas: r.hours_nocturnas || 0,
        hours_sabado: r.hours_sabado || 0,
        hours_domingo: r.hours_domingo || 0,
      });
      setNotes(r.notes || "");
      setSaved(r.status === "enviado" || r.status === "validado");
    } else {
      setExistingId(null);
      setSegments([emptySegment()]);
      setLiquidacion({ hours_extra: 0, hours_nocturnas: 0, hours_sabado: 0, hours_domingo: 0 });
      setNotes("");
      setSaved(false);
    }
  };

  const hasLunch = segments.some(s => s.location === "Comida");
  const rawMinutes = segments.reduce((sum, s) => sum + calcMinutes(s.start, s.end), 0);
  const totalMinutes = hasLunch ? Math.max(0, rawMinutes - 60) : rawMinutes;
  const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

  const updateSegment = (i, field, val) => {
    const next = [...segments];
    next[i] = { ...next[i], [field]: val };
    setSegments(next);
  };

  const handleSave = async (status = "borrador") => {
    if (!user) return;
    setSaving(true);
    const data = {
      technician_email: user.email,
      technician_name: user.full_name,
      work_date: selectedDate,
      segments_json: JSON.stringify(segments),
      total_minutes: totalMinutes,
      total_hours: totalHours,
      has_lunch_break: hasLunch,
      ...liquidacion,
      notes,
      status,
    };
    if (existingId) {
      await base44.entities.WorkDay.update(existingId, data);
    } else {
      const created = await base44.entities.WorkDay.create(data);
      setExistingId(created.id);
    }
    setSaving(false);
    if (status === "enviado") setSaved(true);
  };

  if (!user) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registro de Jornada</h1>
          <p className="text-sm text-muted-foreground">{user.full_name}</p>
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="w-44 rounded-xl bg-card"
        />
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <CheckCircle2 className="h-4 w-4" /> Jornada enviada. Contacta con administración para modificarla.
        </div>
      )}

      {/* Tramos */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Tramos de Actividad</h2>
          {!saved && (
            <Button variant="outline" size="sm" onClick={() => setSegments([...segments, emptySegment()])} className="rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> Añadir
            </Button>
          )}
        </div>

        {segments.map((seg, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-2">
              <Label className="text-xs">Inicio</Label>
              <Input type="time" value={seg.start} onChange={e => updateSegment(i, "start", e.target.value)}
                className="mt-1 rounded-xl" disabled={saved} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Fin</Label>
              <Input type="time" value={seg.end} onChange={e => updateSegment(i, "end", e.target.value)}
                className="mt-1 rounded-xl" disabled={saved} />
            </div>
            <div className="col-span-3">
              <Label className="text-xs">Actividad</Label>
              <Select value={seg.location} onValueChange={v => updateSegment(i, "location", v)} disabled={saved}>
                <SelectTrigger className="mt-1 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              <Label className="text-xs">Nº Incidencia</Label>
              <Input value={seg.incident_number} onChange={e => updateSegment(i, "incident_number", e.target.value)}
                placeholder="FRI-..." className="mt-1 rounded-xl text-xs" disabled={saved} />
            </div>
            <div className="col-span-1">
              <p className="text-xs text-muted-foreground text-center">{minutesToHHMM(calcMinutes(seg.start, seg.end))}</p>
            </div>
            {!saved && segments.length > 1 && (
              <div className="col-span-1 flex justify-center">
                <Button variant="ghost" size="icon" onClick={() => setSegments(segments.filter((_, j) => j !== i))} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Totals */}
        <div className="border-t border-border pt-3 space-y-1">
          {hasLunch && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Se descuentan 60 min por tramo de Comida
            </p>
          )}
          <div className="flex justify-between text-sm font-semibold">
            <span>Total Jornada</span>
            <span className="text-primary">{minutesToHHMM(totalMinutes)} ({totalHours}h)</span>
          </div>
        </div>
      </div>

      {/* Liquidación */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Horas de Liquidación</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { key: "hours_extra", label: "Horas Extra" },
            { key: "hours_nocturnas", label: "Horas Nocturnas" },
            { key: "hours_sabado", label: "Horas Sábado" },
            { key: "hours_domingo", label: "Horas Domingo" },
          ].map(({ key, label }) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input
                type="number" min="0" step="0.5"
                value={liquidacion[key] || ""}
                onChange={e => setLiquidacion(l => ({ ...l, [key]: parseFloat(e.target.value) || 0 }))}
                className="mt-1 rounded-xl"
                disabled={saved}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Observaciones */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-2">
        <Label>Observaciones</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas de la jornada..." className="rounded-xl" disabled={saved} />
      </div>

      {/* Footer */}
      {!saved && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4">
          <div className="max-w-2xl mx-auto flex gap-3 justify-end">
            <Button variant="outline" onClick={() => handleSave("borrador")} disabled={saving} className="rounded-xl">
              Guardar Borrador
            </Button>
            <Button onClick={() => handleSave("enviado")} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-6 shadow-lg shadow-accent/25">
              <Save className="h-4 w-4 mr-2" /> Enviar Jornada
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}