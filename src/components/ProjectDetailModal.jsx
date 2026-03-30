import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { Download, Package, Clock, Users } from "lucide-react";
import moment from "moment";

const STATUS_COLORS = {
  en_curso: "bg-blue-100 text-blue-700",
  pausada: "bg-amber-100 text-amber-700",
  finalizada: "bg-emerald-100 text-emerald-700",
  facturada: "bg-purple-100 text-purple-700",
};

function calcMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function exportXLSX(project, materials, hoursRows) {
  // Build CSV (tab-separated for Excel compatibility)
  const lines = [];
  lines.push(`OBRA: ${project.name}\tRef: ${project.reference || "—"}\tCliente: ${project.client_name}`);
  lines.push("");

  // Materials
  lines.push("=== MATERIALES CONSUMIDOS ===");
  lines.push("Material\tCódigo\tUnidad\tCantidad Neta\tPrecio Ud.\tTotal €");
  materials.forEach(m => {
    lines.push(`${m.material_name}\t${m.material_code || ""}\t${m.unit || "ud"}\t${m.net}\t${(m.unit_price || 0).toFixed(2)}\t${(m.net * (m.unit_price || 0)).toFixed(2)}`);
  });
  const matTotal = materials.reduce((s, m) => s + m.net * (m.unit_price || 0), 0);
  lines.push(`\t\t\t\tTOTAL MATERIALES\t${matTotal.toFixed(2)} €`);
  lines.push("");

  // Hours
  lines.push("=== HORAS DE PERSONAL ===");
  lines.push("Técnico\tFecha\tInicio\tFin\tHoras\tNotas");
  hoursRows.forEach(r => {
    lines.push(`${r.techName}\t${r.date}\t${r.start}\t${r.end}\t${(r.minutes / 60).toFixed(2)}\t${r.other_data || ""}`);
  });
  const totalH = hoursRows.reduce((s, r) => s + r.minutes, 0) / 60;
  lines.push(`\t\t\t\tTOTAL HORAS\t${totalH.toFixed(2)} h`);

  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `obra_${project.reference || project.id?.slice(0, 6)}_${moment().format("YYYY-MM-DD")}.csv`;
  a.click();
}

export default function ProjectDetailModal({ project, projectMaterials, onClose }) {
  const [workDays, setWorkDays] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setLoading(true);
    base44.entities.WorkDay.list("-work_date", 1000).then(all => {
      // Filter days that have segments linked to this project
      const relevant = all.filter(wd => {
        if (!wd.segments_json) return false;
        const segs = JSON.parse(wd.segments_json);
        return segs.some(s => s.location === "Obra" && s.entity === project.id);
      });
      setWorkDays(relevant);
      setLoading(false);
    });
  }, [project?.id]);

  if (!project) return null;

  // Materials inventory (net)
  const byMaterial = {};
  projectMaterials.filter(pm => pm.project_id === project.id).forEach(l => {
    if (!byMaterial[l.material_id]) byMaterial[l.material_id] = { ...l, net: 0 };
    byMaterial[l.material_id].net += l.movement_type === "salida" ? (l.quantity_out || 0) : -(l.quantity_out || 0);
  });
  const matRows = Object.values(byMaterial).filter(x => x.net > 0);
  const matTotal = matRows.reduce((s, m) => s + m.net * (m.unit_price || 0), 0);

  // Hours rows extracted from segments
  const hoursRows = [];
  workDays.forEach(wd => {
    const segs = wd.segments_json ? JSON.parse(wd.segments_json) : [];
    segs.filter(s => s.location === "Obra" && s.entity === project.id).forEach(s => {
      hoursRows.push({
        techName: wd.technician_name,
        techEmail: wd.technician_email,
        date: wd.work_date,
        start: s.start,
        end: s.end,
        minutes: calcMinutes(s.start, s.end),
        other_data: s.other_data,
      });
    });
  });

  const totalMinutes = hoursRows.reduce((s, r) => s + r.minutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(2);

  // Group hours by technician
  const byTech = {};
  hoursRows.forEach(r => {
    if (!byTech[r.techEmail]) byTech[r.techEmail] = { name: r.techName, minutes: 0 };
    byTech[r.techEmail].minutes += r.minutes;
  });

  return (
    <Dialog open={!!project} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{project.name}</span>
            <Badge className={STATUS_COLORS[project.status] || ""}>{project.status}</Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{project.client_name} {project.reference && `· Ref: ${project.reference}`}</p>
        </DialogHeader>

        {/* Summary totals */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Materiales</p>
            <p className="font-bold text-lg">{matTotal.toFixed(2)} €</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Horas</p>
            <p className="font-bold text-lg text-primary">{totalHours} h</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">Técnicos</p>
            <p className="font-bold text-lg">{Object.keys(byTech).length}</p>
          </div>
        </div>

        {/* Materials */}
        <div>
          <p className="font-semibold text-sm flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-muted-foreground" /> Materiales Consumidos
          </p>
          {matRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Sin materiales asignados</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Material</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cantidad</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Precio Ud.</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matRows.map(m => (
                    <tr key={m.material_id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">{m.material_name}</td>
                      <td className="px-3 py-2 text-right">{m.net} {m.unit}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{(m.unit_price || 0).toFixed(2)} €</td>
                      <td className="px-3 py-2 text-right font-medium">{(m.net * (m.unit_price || 0)).toFixed(2)} €</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-bold">
                    <td colSpan={3} className="px-3 py-2 text-right">Total Materiales</td>
                    <td className="px-3 py-2 text-right">{matTotal.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hours */}
        <div>
          <p className="font-semibold text-sm flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> Horas de Personal
          </p>

          {/* Summary per tech */}
          {Object.keys(byTech).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.values(byTech).map(t => (
                <span key={t.name} className="bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1">
                  <Users className="h-3 w-3" />{t.name}: {(t.minutes / 60).toFixed(2)}h
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-4 border-muted border-t-accent rounded-full animate-spin" />
            </div>
          ) : hoursRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Sin horas registradas en esta obra</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Técnico</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Inicio</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fin</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Horas</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hoursRows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{r.techName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{moment(r.date).format("DD/MM/YY")}</td>
                      <td className="px-3 py-2 font-mono">{r.start || "—"}</td>
                      <td className="px-3 py-2 font-mono">{r.end || "—"}</td>
                      <td className="px-3 py-2 text-right font-medium">{(r.minutes / 60).toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.other_data || "—"}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-bold">
                    <td colSpan={4} className="px-3 py-2 text-right">Total Horas</td>
                    <td className="px-3 py-2 text-right">{totalHours}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cerrar</Button>
          <Button
            onClick={() => exportXLSX(project, matRows, hoursRows)}
            className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}