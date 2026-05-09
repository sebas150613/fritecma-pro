import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { History, ExternalLink } from "lucide-react";
import moment from "moment";

const STATUS_LABELS = {
  en_curso: { label: "En curso", color: "bg-blue-100 text-blue-700" },
  pendiente_revision: { label: "Pte. Revisión", color: "bg-amber-100 text-amber-700" },
  validado: { label: "Validado", color: "bg-emerald-100 text-emerald-700" },
  completado: { label: "Completado", color: "bg-slate-100 text-slate-700" },
  facturado: { label: "Facturado", color: "bg-purple-100 text-purple-700" },
};

export default function WorkCenterHistory({ center, open, onClose }) {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && center?.id) {
      setLoading(true);
      appApi.entities.Intervention.filter({ work_center_id: center.id }, "-date", 100)
        .then(items => { setInterventions(items); setLoading(false); });
    }
  }, [open, center?.id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            Historial — {center?.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-muted border-t-accent rounded-full animate-spin" />
          </div>
        ) : interventions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No hay partes registrados en este centro.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {interventions.map(inv => {
              const st = STATUS_LABELS[inv.status] || { label: inv.status, color: "bg-muted text-muted-foreground" };
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
                      {inv.total > 0 && ` · ${inv.total.toFixed(2)} €`}
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
      </DialogContent>
    </Dialog>
  );
}

