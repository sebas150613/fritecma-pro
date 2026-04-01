import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { ClipboardList, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import moment from "moment";

const URGENCY_COLOR = {
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  urgente: "bg-amber-100 text-amber-700 border-amber-200",
  muy_urgente: "bg-red-100 text-red-700 border-red-200",
};
const URGENCY_LABEL = { normal: "Normal", urgente: "Urgente", muy_urgente: "Muy Urgente" };

export default function PendingRequestsPanel() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    base44.entities.MaterialRequest.filter({ status: "pendiente" }, "-created_date", 10)
      .then(setRequests).catch(() => {});
  }, []);

  if (requests.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <ClipboardList className="h-4 w-4 text-accent" />
          Solicitudes Pendientes
          <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200 text-xs font-semibold">{requests.length}</Badge>
        </h3>
        <Link to="/material-requests" className="text-xs text-accent hover:underline flex items-center gap-1">
          Ver todas <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {requests.map(r => (
          <div key={r.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted/40">
            <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.description}</p>
              <p className="text-xs text-muted-foreground">{r.technician_name} · {moment(r.created_date).fromNow()}</p>
            </div>
            <Badge variant="outline" className={`text-xs border shrink-0 ${URGENCY_COLOR[r.urgency] || URGENCY_COLOR.normal}`}>
              {URGENCY_LABEL[r.urgency] || r.urgency}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}