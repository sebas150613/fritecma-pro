import React from "react";
import { Link } from "react-router-dom";
import { Clock, MapPin, User, ChevronRight, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import moment from "moment";

const statusColors = {
  en_curso: "bg-blue-100 text-blue-700 border-blue-200",
  pendiente_revision: "bg-amber-100 text-amber-700 border-amber-200",
  validado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completado: "bg-teal-100 text-teal-700 border-teal-200",
  facturado: "bg-purple-100 text-purple-700 border-purple-200",
  anulado: "bg-red-100 text-red-700 border-red-200",
};

const statusLabels = {
  en_curso: "En Curso",
  pendiente_revision: "Pendiente Revisión",
  validado: "Validado",
  completado: "Completado",
  facturado: "Facturado",
  anulado: "Anulado",
};

/**
 * @typedef {Object} InterventionCardProps
 * @property {Object} intervention
 * @property {string|number} intervention.id
 * @property {string=} intervention.number
 * @property {string=} intervention.client_name
 * @property {string=} intervention.status
 * @property {string=} intervention.date
 * @property {string=} intervention.location_address
 * @property {string=} intervention.gas_type
 * @property {number=} intervention.gas_loaded_kg
 * @property {number=} intervention.gas_recovered_kg
 * @property {string=} intervention.technician_name
 * @property {number=} intervention.total
 * @property {boolean} isAdmin
 */

/** @param {InterventionCardProps} props */
function InterventionCard({ intervention, isAdmin }) {
  // Usar constantes para evitar accesos repetitivos a propiedades
  const {
    id,
    number,
    client_name,
    status,
    date,
    location_address,
    gas_type,
    gas_loaded_kg = 0,
    gas_recovered_kg = 0,
    technician_name,
    total = 0
  } = intervention;
  return (
    <Link
      to={`/interventions/${id}`}
      className="block bg-card rounded-2xl border border-border p-5 hover:shadow-lg hover:border-accent/30 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground font-medium">
            {number || `#${String(id).slice(0, 6)}`}
          </p>
          <h3 className="font-semibold text-base mt-0.5 group-hover:text-accent transition-colors">
            {client_name}
          </h3>
        </div>
        <Badge variant="outline" className={cn("text-xs border", statusColors[status] || "bg-gray-100 text-gray-700 border-gray-200")}>
          {statusLabels[status] || status}
        </Badge>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          <span>{moment(date).format("DD MMM YYYY · HH:mm")}</span>
        </div>
        {location_address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{location_address}</span>
          </div>
        )}
        {gas_type && (
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5" />
            <span>{gas_type} · {gas_loaded_kg}kg cargados · {gas_recovered_kg}kg recuperados</span>
          </div>
        )}
        {technician_name && (
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5" />
            <span>{technician_name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        {isAdmin ? (
          <p className="text-lg font-bold">{total.toFixed(2)} €</p>
        ) : (
          <p className="text-sm text-muted-foreground">Ver detalle</p>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
      </div>
    </Link>
    );
}

export default React.memo(
  InterventionCard,
  (prevProps, nextProps) =>
    prevProps.intervention.id === nextProps.intervention.id &&
    prevProps.intervention.status === nextProps.intervention.status
);
