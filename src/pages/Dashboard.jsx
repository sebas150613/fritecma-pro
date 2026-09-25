import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import PullToRefresh from "../components/PullToRefresh";
import { ClipboardList, AlertTriangle, Plus, Wrench, UserX, Receipt, ChevronRight } from "lucide-react";
import LowStockPanel from "../components/LowStockPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import InterventionCard from "../components/InterventionCard";
import FichajeWidget from "../components/FichajeWidget";
import PendingRequestsPanel from "../components/PendingRequestsPanel";
import PendingStockPanel from "../components/PendingStockPanel";
import moment from "moment";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatEUR } from "@/lib/format";
import { canViewInvoices, paymentInfo } from "@/lib/invoicePayment";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/status-constants";

const OPEN_BREAKDOWN = (b) => b.status === "abierta" || b.status === "pendiente";

/** Tarjeta de "lo que necesita atención": un número y a dónde ir a resolverlo. */
function AttentionCard({ to, icon: Icon, label, value, hint = "", alert = false }) {
  return (
    <Link
      to={to}
      className="group bg-card rounded-2xl border border-border p-4 hover:border-accent/40 transition-colors flex flex-col justify-between min-h-[112px]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <Icon className={cn("h-4 w-4 shrink-0", alert ? "text-red-600" : "text-muted-foreground")} />
      </div>
      <div className="flex items-end justify-between gap-2 mt-2">
        <div className="min-w-0">
          <p className={cn("text-2xl font-bold tracking-tight", alert && "text-red-600")}>{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</p>}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent shrink-0" />
      </div>
    </Link>
  );
}

function BreakdownRow({ breakdown }) {
  return (
    <Link
      to={`/breakdowns/${breakdown.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {breakdown.client_name}
          {breakdown.work_center_name && (
            <span className="text-muted-foreground font-normal"> · {breakdown.work_center_name}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">{breakdown.description}</p>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <Badge className={cn("text-[11px]", PRIORITY_COLORS[breakdown.priority] || "bg-muted text-muted-foreground")}>
          {PRIORITY_LABELS[breakdown.priority] || breakdown.priority}
        </Badge>
        <p className="text-[11px] text-muted-foreground">
          {breakdown.created_at ? moment(breakdown.created_at).fromNow() : ""}
        </p>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [breakdowns, setBreakdowns] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [fichajeStatus, setFichajeStatus] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      setLoading(true);
      const me = await appApi.auth.me();
      setUser(me);
      const isAdmin = me.role === "admin" || me.role === "superadmin" || me.role === "encargado";
      const isOficina = me.role === "oficina";
      const isOffice = isAdmin || isOficina;

      // Todo sale de las mismas consultas que las páginas de cada módulo: el
      // servidor ya limita por empresa y por rol (el técnico solo ve lo suyo).
      const [allInterventions, bds, mats, invs] = await Promise.all([
        isOffice
          ? appApi.entities.Intervention.list("-created_date", 100)
          : appApi.entities.Intervention.filter({ technician_email: me.email }, "-created_date", 50),
        appApi.breakdowns.list({ sort: "-created_at", limit: 200 }).catch(() => []),
        isOffice ? appApi.entities.Material.list("name", 500) : Promise.resolve([]),
        canViewInvoices(me) ? appApi.entities.Invoice.list("-issue_date", 1000).catch(() => []) : Promise.resolve([]),
      ]);

      setInterventions(allInterventions || []);
      setBreakdowns(bds || []);
      setMaterials(mats || []);
      setInvoices(invs || []);
    } catch (err) {
      console.error("[Dashboard] loadData failed:", err);
      setLoadError(err?.message || "No se pudo cargar el panel. Comprueba la conexión con la API.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFichajeStatus = useCallback(async () => {
    if (!user) return;
    const today = moment().format("YYYY-MM-DD");
    const records = await appApi.entities.TimeRecord.filter(
      { technician_email: user.email, work_date: today },
      "-timestamp",
      1
    );
    setFichajeStatus(records[0]?.type || "sin_fichar");
  }, [user]);

  useEffect(() => {
    if (user) loadFichajeStatus();
  }, [user, loadFichajeStatus]);

  const isAdmin =
    user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const isOffice = isAdmin || isOficina;
  const hasCheckedIn = isAdmin || fichajeStatus === "entrada" || fichajeStatus === "reanudacion";

  const openBreakdowns = breakdowns.filter(OPEN_BREAKDOWN);
  const unassigned = openBreakdowns.filter((b) => !b.assigned_user_email);
  const urgent = openBreakdowns.filter((b) => b.priority === "alta");
  const myBreakdowns = openBreakdowns.filter((b) => b.assigned_user_email && b.assigned_user_email === user?.email);
  const toValidate = interventions.filter(
    (i) => i.incident_status === "finalizado" && i.status === "pendiente_revision"
  );
  const inProgress = interventions.filter(
    (i) =>
      (i.incident_status === "pendiente_operativa" || i.incident_status === "pendiente_parada") &&
      i.status !== "anulado"
  );
  const overdue = invoices.filter(
    (inv) => inv.record_type !== "anulacion" && paymentInfo(inv).key === "vencida"
  );
  const overdueTotal = overdue.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const recentInterventions = interventions.filter((i) => i.status !== "anulado").slice(0, 6);
  const firstName = (user?.full_name || "").split(" ")[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6 text-center max-w-md mx-auto">
        <p className="text-muted-foreground text-sm">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => loadData()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const newPartButton = hasCheckedIn ? (
    <Link to="/interventions/new">
      <Button className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-6">
        <Plus className="h-4 w-4 mr-2" />
        Nuevo parte
      </Button>
    </Link>
  ) : (
    <Button disabled className="rounded-xl px-6" title="Debes fichar entrada primero">
      <Plus className="h-4 w-4 mr-2" />
      Nuevo parte
    </Button>
  );

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            {isOffice ? "Panel" : firstName ? `Hola, ${firstName}` : "Inicio"}
          </h1>
          <p className="text-muted-foreground mt-1 first-letter:uppercase">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        {newPartButton}
      </div>

      {/* Fichaje (personal de campo) */}
      {!isOffice && (
        <FichajeWidget user={user} onStatusChange={loadFichajeStatus} />
      )}

      {/* Lo que necesita atención */}
      {isOffice ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AttentionCard
            to="/breakdowns"
            icon={UserX}
            label="Averías sin asignar"
            value={unassigned.length}
            hint={`${openBreakdowns.length} abiertas en total`}
            alert={unassigned.length > 0}
          />
          <AttentionCard
            to="/breakdowns"
            icon={AlertTriangle}
            label="Averías urgentes"
            value={urgent.length}
            hint="Prioridad alta, sin cerrar"
            alert={urgent.length > 0}
          />
          <AttentionCard
            to="/interventions"
            icon={ClipboardList}
            label="Partes por validar"
            value={toValidate.length}
            hint={`${inProgress.length} en curso`}
          />
          {canViewInvoices(user) ? (
            <AttentionCard
              to="/invoices"
              icon={Receipt}
              label="Cobros vencidos"
              value={formatEUR(overdueTotal)}
              hint={overdue.length === 1 ? "1 factura" : `${overdue.length} facturas`}
              alert={overdue.length > 0}
            />
          ) : (
            <AttentionCard
              to="/interventions"
              icon={Wrench}
              label="Partes en curso"
              value={inProgress.length}
            />
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold">Mis averías</h2>
            <Link to="/breakdowns" className="text-sm text-accent hover:underline font-medium">
              Ver todas
            </Link>
          </div>
          {myBreakdowns.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No tienes averías asignadas{unassigned.length > 0 ? ` · hay ${unassigned.length} sin asignar` : ""}.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {myBreakdowns.slice(0, 5).map((b) => <BreakdownRow key={b.id} breakdown={b} />)}
            </div>
          )}
        </div>
      )}

      {/* Averías urgentes a la vista de la oficina */}
      {isOffice && urgent.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold">Averías urgentes</h2>
            <Link to="/breakdowns" className="text-sm text-accent hover:underline font-medium">
              Ver todas
            </Link>
          </div>
          <div className="divide-y divide-border">
            {urgent.slice(0, 5).map((b) => <BreakdownRow key={b.id} breakdown={b} />)}
          </div>
        </div>
      )}

      {/* Avisos de almacén */}
      {isOffice && <LowStockPanel materials={materials} />}
      {isAdmin && <PendingRequestsPanel />}
      {isOffice && <PendingStockPanel />}

      {/* Últimos partes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{isOffice ? "Últimos partes" : "Mis últimos partes"}</h2>
          <Link to="/interventions" className="text-sm text-accent hover:underline font-medium">
            Ver todos
          </Link>
        </div>
        {recentInterventions.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Todavía no hay partes</p>
            {hasCheckedIn && (
              <Link to="/interventions/new">
                <Button variant="outline" className="mt-4 rounded-xl">
                  Crear el primer parte
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentInterventions.map(i => (
              <InterventionCard key={i.id} intervention={i} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
