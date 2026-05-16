import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import moment from "moment";

const LOCATION_OPTIONS = [
  "Cliente",
  "Obra",
  "Taller",
  "Comida",
  "Desplazamiento",
  "Guardia",
  "Formación",
  "Otro",
];

const CLIENTE_NO_REGISTRADO = "__nuevo__";

const emptySegment = () => ({
  start: "",
  end: "",
  location: "Cliente",
  entity: "",
  other_data: "",
});

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

function validateSegments(segments) {
  for (const seg of segments) {
    if (seg.location === "Cliente" && !seg.entity) {
      return "Debes seleccionar la entidad para todos los tramos de tipo 'Cliente'.";
    }
    if (seg.location === "Obra" && !seg.entity) {
      return "Debes seleccionar la obra para todos los tramos de tipo 'Obra'.";
    }
  }
  return null;
}

export default function WorkDayLog() {
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedDate, setSelectedDate] = useState(moment().format("YYYY-MM-DD"));
  const [segments, setSegments] = useState([emptySegment()]);
  const [liquidacion, setLiquidacion] = useState({ hours_extra: 0, hours_nocturnas: 0, hours_sabado: 0, hours_domingo: 0 });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existingId, setExistingId] = useState(null);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    Promise.all([
      appApi.auth.me(),
      appApi.entities.Client.list("name", 500),
      appApi.entities.Project.filter({ status: "en_curso" }, "name", 200),
    ]).then(([me, cl, pr]) => {
      setUser(me);
      setClients(cl);
      setProjects(pr);
    });
  }, []);

  useEffect(() => {
    if (user && selectedDate) loadExisting();
  }, [user, selectedDate]);

  const loadExisting = async () => {
    const records = await appApi.entities.WorkDay.filter(
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
    setValidationError("");
  };

  const hasLunch = segments.some(s => s.location === "Comida");
  const rawMinutes = segments.reduce((sum, s) => sum + calcMinutes(s.start, s.end), 0);
  const totalMinutes = hasLunch ? Math.max(0, rawMinutes - 60) : rawMinutes;
  const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

  const updateSegment = (i, field, val) => {
    const next = [...segments];
    next[i] = { ...next[i], [field]: val };
    // Clear entity when location changes away from Cliente
    if (field === "location" && val !== "Cliente") next[i].entity = "";
    setSegments(next);
    setValidationError("");
  };

  const handleSave = async (status = "borrador") => {
    if (!user) return;
    const error = validateSegments(segments);
    if (error) { setValidationError(error); return; }

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
      await appApi.entities.WorkDay.update(existingId, data);
    } else {
      const created = await appApi.entities.WorkDay.create(data);
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registro de Jornada</h1>
          <p className="text-sm text-muted-foreground">{user.full_name}</p>
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="w-44 rounded-xl bg-card text-base"
        />
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-base">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> Jornada enviada. Contacta con administración para modificarla.
        </div>
      )}

      {/* Tramos */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Tramos de Actividad</h2>
          {!saved && (
            <Button variant="outline" size="sm" onClick={() => setSegments([...segments, emptySegment()])} className="rounded-xl text-base h-10 px-4">
              <Plus className="h-4 w-4 mr-1" /> Añadir
            </Button>
          )}
        </div>

        {segments.map((seg, i) => (
          <div key={i} className="border border-border rounded-xl p-4 space-y-4">
            {/* Row 1: times + duration */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-base font-medium">Inicio</Label>
                <Input type="time" value={seg.start}
                  onChange={e => updateSegment(i, "start", e.target.value)}
                  className="mt-1 rounded-xl text-[16px] h-12" disabled={saved} />
              </div>
              <div className="flex-1">
                <Label className="text-base font-medium">Fin</Label>
                <Input type="time" value={seg.end}
                  onChange={e => updateSegment(i, "end", e.target.value)}
                  className="mt-1 rounded-xl text-[16px] h-12" disabled={saved} />
              </div>
              <div className="text-right pb-1">
                <p className="text-xs text-muted-foreground">Duración</p>
                <p className="text-base font-semibold text-primary">{minutesToHHMM(calcMinutes(seg.start, seg.end))}</p>
              </div>
              {!saved && segments.length > 1 && (
                <Button variant="ghost" size="icon" aria-label="Eliminar segmento" onClick={() => setSegments(segments.filter((_, j) => j !== i))}
                  className="h-10 w-10 text-muted-foreground hover:text-destructive mb-1">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Row 2: activity selector */}
            <div>
              <Label className="text-base font-medium">Actividad / Tipo</Label>
              <Select value={seg.location} onValueChange={v => updateSegment(i, "location", v)} disabled={saved}>
                <SelectTrigger className="mt-1 rounded-xl text-[16px] h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map(l => <SelectItem key={l} value={l} className="text-[16px] py-3">{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Row 3a: entity selector (only if Cliente) */}
            {seg.location === "Cliente" && (
              <div>
                <Label className="text-base font-medium">
                  Seleccionar Entidad <span className="text-destructive">*</span>
                </Label>
                <Select value={seg.entity} onValueChange={v => updateSegment(i, "entity", v)} disabled={saved}>
                  <SelectTrigger className={`mt-1 rounded-xl text-[16px] h-12 ${!seg.entity ? "border-amber-400" : ""}`}>
                    <SelectValue placeholder="Selecciona el cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CLIENTE_NO_REGISTRADO} className="text-[16px] py-3 font-medium text-muted-foreground">
                      — CLIENTE NO REGISTRADO —
                    </SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-[16px] py-3">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!seg.entity && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Obligatorio cuando la actividad es "Cliente"
                  </p>
                )}
              </div>
            )}

            {/* Row 3b: obra selector (only if Obra) */}
            {seg.location === "Obra" && (
              <div>
                <Label className="text-base font-medium">
                  Seleccionar Obra <span className="text-destructive">*</span>
                </Label>
                <Select value={seg.entity} onValueChange={v => updateSegment(i, "entity", v)} disabled={saved}>
                  <SelectTrigger className={`mt-1 rounded-xl text-[16px] h-12 ${!seg.entity ? "border-amber-400" : ""}`}>
                    <SelectValue placeholder="Selecciona la obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-[16px] py-3">
                        {p.reference ? `[${p.reference}] ` : ""}{p.name}
                      </SelectItem>
                    ))}
                    {projects.length === 0 && (
                      <SelectItem value="__sin_obra__" className="text-[16px] py-3 text-muted-foreground">Sin obras abiertas</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Row 4: Otros Datos */}
            <div>
              <Label className="text-base font-medium">Otros Datos</Label>
              <Input value={seg.other_data}
                onChange={e => updateSegment(i, "other_data", e.target.value)}
                placeholder="Nº parte, notas..."
                className="mt-1 rounded-xl text-[16px] h-12" disabled={saved} />
            </div>
          </div>
        ))}

        {/* Totals */}
        <div className="border-t border-border pt-3 space-y-2">
          {hasLunch && (
            <p className="text-sm text-amber-600 flex items-center gap-1">
              <Clock className="h-4 w-4" /> Se descuentan 60 min por tramo de Comida
            </p>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>Total Jornada</span>
            <span className="text-primary">{minutesToHHMM(totalMinutes)} ({totalHours}h)</span>
          </div>
        </div>
      </div>

      {/* Liquidación */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Horas de Liquidación</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: "hours_extra", label: "Horas Extra" },
            { key: "hours_nocturnas", label: "Horas Nocturnas" },
            { key: "hours_sabado", label: "Horas Sábado" },
            { key: "hours_domingo", label: "Horas Domingo" },
          ].map(({ key, label }) => (
            <div key={key}>
              <Label className="text-base font-medium">{label}</Label>
              <Input
                type="number" min="0" step="0.5"
                value={liquidacion[key] || ""}
                onChange={e => setLiquidacion(l => ({ ...l, [key]: parseFloat(e.target.value) || 0 }))}
                className="mt-1 rounded-xl text-[16px] h-12"
                disabled={saved}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Observaciones */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-2">
        <Label className="text-base font-medium">Observaciones</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Notas de la jornada..."
          className="rounded-xl text-[16px] h-12" disabled={saved} />
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {validationError}
        </div>
      )}

      {/* Footer */}
      {!saved && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4">
          <div className="max-w-2xl mx-auto flex gap-3 justify-end">
            <Button variant="outline" onClick={() => handleSave("borrador")} disabled={saving} className="rounded-xl text-base h-12 px-5">
              Guardar Borrador
            </Button>
            <Button onClick={() => handleSave("enviado")} disabled={saving}
              className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl text-base h-12 px-6 shadow-lg shadow-accent/25">
              <Save className="h-4 w-4 mr-2" /> Enviar Jornada
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

