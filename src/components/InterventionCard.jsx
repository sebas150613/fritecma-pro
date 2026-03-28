import { Link } from "react-router-dom";
import { Clock, MapPin, User, ChevronRight, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import moment from "moment";

const statusColors = {
  en_curso: "bg-blue-100 text-blue-700 border-blue-200",
  pendiente_revision: "bg-amber-100 text-amber-700 border-amber-200",
  completado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  facturado: "bg-purple-100 text-purple-700 border-purple-200",
};

const statusLabels = {
  en_curso: "En Curso",
  pendiente_revision: "Pendiente Revisión",
  completado: "Completado",
  facturado: "Facturado",
};

export default function InterventionCard({ intervention }) {
  const i = intervention;
  return (
    <Link
      to={`/interventions/${i.id}`}
      className="block bg-card rounded-2xl border border-border p-5 hover:shadow-lg hover:border-accent/30 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground font-medium">
            {i.number || `#${i.id?.slice(0, 6)}`}
          </p>
          <h3 className="font-semibold text-base mt-0.5 group-hover:text-accent transition-colors">
            {i.client_name}
          </h3>
        </div>
        <Badge variant="outline" className={cn("text-xs border", statusColors[i.status])}>
          {statusLabels[i.status] || i.status}
        </Badge>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          <span>{moment(i.date).format("DD MMM YYYY · HH:mm")}</span>
        </div>
        {i.location_address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{i.location_address}</span>
          </div>
        )}
        {i.gas_type && (
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5" />
            <span>{i.gas_type} · {i.gas_loaded_kg || 0}kg cargados · {i.gas_recovered_kg || 0}kg recuperados</span>
          </div>
        )}
        {i.technician_name && (
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5" />
            <span>{i.technician_name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <p className="text-lg font-bold">{(i.total || 0).toFixed(2)} €</p>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
      </div>
    </Link>
  );
}