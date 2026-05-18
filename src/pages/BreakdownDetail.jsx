import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Phone, ClipboardList, User, Calendar, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import BackButton from "../components/BackButton";
import { PRIORITY_COLORS, PRIORITY_LABELS, BREAKDOWN_STATUS_COLORS, BREAKDOWN_STATUS_LABELS } from "@/lib/status-constants";

const STATUS_COLORS = BREAKDOWN_STATUS_COLORS;
const STATUS_LABELS = BREAKDOWN_STATUS_LABELS;

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function BreakdownDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [me, data] = await Promise.all([
        appApi.auth.me(),
        appApi.breakdowns.get(id),
      ]);
      setUser(me);
      const { interventions: iList = [], ...bd } = data;
      setBreakdown(bd);
      setInterventions(iList);
    } catch (err) {
      toast.error(err?.message || "No se pudo cargar la avería");
      navigate("/breakdowns");
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const isAdminOrOficina = isAdmin || isOficina;

  const handleChooseResult = async (result) => {
    setActionLoading(true);
    try {
      const params = new URLSearchParams({
        breakdownId: breakdown.id,
        breakdownResult: result,
      });
      setShowActionDialog(false);
      navigate(`/interventions/new?${params.toString()}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!breakdown) return null;

  const isTerminada = breakdown.status === "terminada";

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32">
      {/* Header */}
      <div className="flex items-start gap-3">
        <BackButton label="Averías" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">Avería</h1>
            <span className="font-mono text-muted-foreground text-lg">{breakdown.number}</span>
            <Badge className={cn("text-xs", STATUS_COLORS[breakdown.status] || "bg-muted text-muted-foreground")}>
              {STATUS_LABELS[breakdown.status] || breakdown.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Datos principales */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-lg">{breakdown.client_name}</p>
            {breakdown.work_center_name && (
              <p className="text-sm text-muted-foreground">{breakdown.work_center_name}</p>
            )}
          </div>
          <Badge className={cn("text-xs shrink-0", PRIORITY_COLORS[breakdown.priority] || "bg-muted")}>
            {PRIORITY_LABELS[breakdown.priority] || breakdown.priority}
          </Badge>
        </div>

        {breakdown.contact_phone_snapshot && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${breakdown.contact_phone_snapshot}`} className="text-accent hover:underline">
              {breakdown.contact_phone_snapshot}
            </a>
          </div>
        )}

        {breakdown.client_fault_id && (
          <div className="text-sm">
            <span className="text-muted-foreground">Ref. cliente: </span>
            <span className="font-medium">{breakdown.client_fault_id}</span>
          </div>
        )}

        <div className="bg-muted/40 rounded-xl p-3">
          <p className="text-sm leading-relaxed">{breakdown.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Asignado:</span>
            <span className="font-medium truncate">
              {breakdown.assigned_user_name || <em className="text-muted-foreground font-normal">Sin asignar</em>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Creada:</span>
            <span className="font-medium">{formatDate(breakdown.created_at)}</span>
          </div>
        </div>

        {breakdown.closed_at && (
          <div className="flex items-center gap-2 text-sm pt-2 border-t border-border">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-muted-foreground">Cerrada:</span>
            <span className="font-medium">{formatDate(breakdown.closed_at)}</span>
            {breakdown.closed_by_email && (
              <span className="text-muted-foreground">por {breakdown.closed_by_email}</span>
            )}
          </div>
        )}

        {breakdown.last_intervention_number && (
          <div className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Último parte:</span>
            {breakdown.last_intervention_id ? (
              <Link
                to={`/interventions/${breakdown.last_intervention_id}`}
                className="font-medium text-accent hover:underline"
              >
                {breakdown.last_intervention_number}
              </Link>
            ) : (
              <span className="font-medium">{breakdown.last_intervention_number}</span>
            )}
          </div>
        )}
      </div>

      {/* Partes vinculados */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Partes Vinculados ({interventions.length})
        </h2>

        {interventions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay partes vinculados todavía.
          </p>
        ) : (
          <div className="space-y-2">
            {interventions.map(i => (
              <Link key={i.id} to={`/interventions/${i.id}`}>
                <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border hover:border-accent/40 hover:bg-accent/5 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium font-mono">{i.number}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.technician_name} · {i.date ? new Date(i.date).toLocaleDateString("es-ES") : "—"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {i.breakdown_status_result === "terminado" ? (
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Terminado
                      </span>
                    ) : i.breakdown_status_result === "pendiente" ? (
                      <span className="text-amber-600 font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Pendiente
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Action button */}
      {!isTerminada && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/80 backdrop-blur-xl border-t border-border p-4 pb-20 lg:pb-4">
          <div className="max-w-3xl mx-auto flex justify-end">
            <Button
              onClick={() => setShowActionDialog(true)}
              className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-8 h-12 text-base shadow-lg shadow-accent/25"
            >
              <ClipboardList className="h-5 w-5 mr-2" />
              Crear parte / Cambiar estado
            </Button>
          </div>
        </div>
      )}

      {/* Dialog: elegir resultado */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Cuál es el resultado de la intervención?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecciona el estado que dejará la avería al guardar el parte de trabajo.
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={() => handleChooseResult("terminado")}
              disabled={actionLoading}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white h-12"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Terminado — avería resuelta
            </Button>
            <Button
              onClick={() => handleChooseResult("pendiente")}
              disabled={actionLoading}
              variant="outline"
              className="w-full rounded-xl border-amber-400 text-amber-700 hover:bg-amber-50 h-12"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
              Pendiente — avería continúa abierta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
