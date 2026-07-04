import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { History, ExternalLink, Wrench } from "lucide-react";
import moment from "moment";
import { cn } from "@/lib/utils";
import { PRIORITY_COLORS, BREAKDOWN_STATUS_LABELS } from "@/lib/status-constants";

const INTERVENTION_STATUS_LABELS = {
  en_curso: { label: "En curso", color: "bg-blue-100 text-blue-700" },
  pendiente_revision: { label: "Pte. Revisión", color: "bg-amber-100 text-amber-700" },
  validado: { label: "Validado", color: "bg-emerald-100 text-emerald-700" },
  completado: { label: "Completado", color: "bg-slate-100 text-slate-700" },
  facturado: { label: "Facturado", color: "bg-purple-100 text-purple-700" },
};

const BD_STATUS_COLORS = {
  abierta: "bg-blue-100 text-blue-700",
  pendiente: "bg-amber-100 text-amber-700",
  terminada: "bg-emerald-100 text-emerald-700",
};

export default function MachineHistory({ machine, open, onClose }) {
  const [interventions, setInterventions] = useState([]);
  const [breakdowns, setBreakdowns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && machine?.id) {
      setLoading(true);
      Promise.all([
        appApi.entities.Intervention.filter({ machine_id: machine.id }, "-date", 100).catch(() => []),
        appApi.entities.Breakdown.filter({ machine_id: machine.id }, "-created_at", 100).catch(() => []),
      ]).then(([invs, bds]) => {
        setInterventions(invs || []);
        setBreakdowns(bds || []);
        setLoading(false);
      });
    }
  }, [open, machine?.id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            Historial — {machine?.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-muted border-t-accent rounded-full animate-spin" />
          </div>
        ) : breakdowns.length === 0 && interventions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            No hay averías ni partes registrados para esta máquina.
          </p>
        ) : (
          <div className="space-y-4 mt-2">
            {breakdowns.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Averías ({breakdowns.length})
                </h4>
                {breakdowns.map(bd => (
                  <div key={bd.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{bd.number}</span>
                        <Badge className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[bd.priority] || "")}>{bd.priority}</Badge>
                        <Badge className={cn("text-[10px] px-1.5 py-0", BD_STATUS_COLORS[bd.status] || "")}>
                          {BREAKDOWN_STATUS_LABELS[bd.status] || bd.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5">{bd.description || "Sin descripción"}</p>
                      <p className="text-xs text-muted-foreground">{moment(bd.created_at).format("DD/MM/YYYY")}</p>
                    </div>
                    <Link to={`/breakdowns/${bd.id}`} onClick={onClose}>
                      <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-accent" />
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {interventions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Partes ({interventions.length})
                </h4>
                {interventions.map(inv => {
                  const st = INTERVENTION_STATUS_LABELS[inv.status] || { label: inv.status, color: "bg-muted text-muted-foreground" };
                  return (
                    <div key={inv.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{inv.number}</span>
                          <Badge variant="outline" className={`text-xs border-0 ${st.color}`}>{st.label}</Badge>
                        </div>
                        <p className="text-sm font-medium truncate mt-0.5">{inv.description || "Sin descripción"}</p>
                        <p className="text-xs text-muted-foreground">
                          {moment(inv.date).format("DD/MM/YYYY HH:mm")} · {inv.technician_name}
                        </p>
                      </div>
                      <Link to={`/interventions/${inv.id}`} onClick={onClose}>
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-accent" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
