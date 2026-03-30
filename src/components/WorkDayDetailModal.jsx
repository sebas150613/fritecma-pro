import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock } from "lucide-react";
import moment from "moment";

const STATUS_COLORS = {
  borrador: "bg-slate-100 text-slate-600",
  enviado: "bg-amber-100 text-amber-700",
  validado: "bg-emerald-100 text-emerald-700",
};

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

export default function WorkDayDetailModal({ record, clients, onClose, onValidate }) {
  if (!record) return null;

  const segments = record.segments_json ? JSON.parse(record.segments_json) : [];
  const rawMinutes = segments.reduce((sum, s) => sum + calcMinutes(s.start, s.end), 0);
  const hasLunch = segments.some(s => s.location === "Comida");
  const lunchMinutes = hasLunch ? 60 : 0;
  const totalMinutes = Math.max(0, rawMinutes - lunchMinutes);

  const getClientName = (entity) => {
    if (!entity || entity === "__nuevo__") return "Cliente no registrado";
    const found = clients.find(c => c.id === entity);
    return found ? found.name : entity;
  };

  return (
    <Dialog open={!!record} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>
              Jornada — {record.technician_name} —{" "}
              {moment(record.work_date).format("dddd DD/MM/YYYY")}
            </span>
            <Badge className={STATUS_COLORS[record.status] || ""}>{record.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Segments Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Inicio</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fin</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duración</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Actividad</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cliente / Detalle</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Otros Datos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {segments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Sin tramos registrados</td></tr>
              ) : segments.map((seg, i) => {
                const mins = calcMinutes(seg.start, seg.end);
                const isLunch = seg.location === "Comida";
                return (
                  <tr key={i} className={isLunch ? "bg-amber-50/50" : "hover:bg-muted/20"}>
                    <td className="px-3 py-2 font-mono font-medium">{seg.start || "—"}</td>
                    <td className="px-3 py-2 font-mono font-medium">{seg.end || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{minutesToHHMM(mins)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isLunch ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                        {seg.location}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {seg.location === "Cliente" ? getClientName(seg.entity) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{seg.other_data || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Calculation Breakdown */}
        <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm">
          <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider mb-3">Cálculo de Horas</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Bruto</span>
            <span className="font-medium">{minutesToHHMM(rawMinutes)}</span>
          </div>
          {hasLunch && (
            <div className="flex justify-between text-amber-600">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Descuento Comida</span>
              <span>— 1h 00m</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-bold text-base">
            <span>Total Netas</span>
            <span className="text-primary">{minutesToHHMM(totalMinutes)} ({(totalMinutes / 60).toFixed(2)}h)</span>
          </div>
        </div>

        {/* Extra Hours */}
        {(record.hours_extra > 0 || record.hours_nocturnas > 0 || record.hours_sabado > 0 || record.hours_domingo > 0) && (
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            {[
              { label: "Extra", value: record.hours_extra, color: "text-amber-600" },
              { label: "Nocturnas", value: record.hours_nocturnas, color: "text-indigo-600" },
              { label: "Sábado", value: record.hours_sabado, color: "text-rose-500" },
              { label: "Domingo", value: record.hours_domingo, color: "text-rose-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted/50 rounded-xl p-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`font-bold ${color}`}>{value || 0}h</p>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {record.notes && (
          <div className="bg-muted/30 rounded-xl p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">Observaciones</p>
            <p>{record.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cerrar</Button>
          {record.status === "enviado" && onValidate && (
            <Button
              onClick={() => onValidate(record.id)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> Validar Jornada
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}