import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import PullToRefresh from "../components/PullToRefresh";
import { ClipboardList, Package, AlertTriangle, Plus, TrendingUp } from "lucide-react";
import LowStockPanel from "../components/LowStockPanel";
import { Button } from "@/components/ui/button";
import StatsCard from "../components/StatsCard";
import InterventionCard from "../components/InterventionCard";
import FichajeWidget from "../components/FichajeWidget";
import PendingRequestsPanel from "../components/PendingRequestsPanel";
import PendingStockPanel from "../components/PendingStockPanel";
import moment from "moment";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, today: 0, revenue: 0 });
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

      let allInterventions;
      if (isAdmin || isOficina) {
        allInterventions = await appApi.entities.Intervention.list("-created_date", 50);
      } else {
        allInterventions = await appApi.entities.Intervention.filter(
          { technician_email: me.email },
          "-created_date",
          50
        );
      }

      if (isAdmin || isOficina) {
        const mats = await appApi.entities.Material.list("name", 500);
        setMaterials(mats);
      }

      setInterventions(allInterventions);

      const todayStart = moment().startOf("day").toISOString();
      const todayItems = allInterventions.filter(i => moment(i.date).isSameOrAfter(todayStart));
      const pending = allInterventions.filter(i => i.status === "pendiente_revision");
      const totalRevenue = allInterventions.reduce((sum, i) => sum + (i.total || 0), 0);

      setStats({
        total: allInterventions.length,
        pending: pending.length,
        today: todayItems.length,
        revenue: totalRevenue,
      });
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
  const showAlerts = isAdmin || isOficina;
  const hasCheckedIn = isAdmin || fichajeStatus === "entrada" || fichajeStatus === "reanudacion";
  const recentInterventions = interventions.slice(0, 6);

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

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            {isAdmin ? "Panel de Administración" : "Mis Partes de Hoy"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        {hasCheckedIn ? (
          <Link to="/interventions/new">
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/25 rounded-xl px-6">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Parte
            </Button>
          </Link>
        ) : (
          <Button disabled className="rounded-xl px-6" title="Debes fichar entrada primero">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Parte
          </Button>
        )}
      </div>

      {/* Low Stock Alerts */}
      {showAlerts && <LowStockPanel materials={materials} />}

      {/* Pending Material Requests (encargado/admin only) */}
      {isAdmin && <PendingRequestsPanel />}

      {/* Pending Stock Entries (encargado/admin/oficina) */}
      {(isAdmin || isOficina) && <PendingStockPanel />}

      {/* Fichaje */}
      {!isAdmin && !isOficina && (
        <FichajeWidget user={user} onStatusChange={loadFichajeStatus} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard icon={ClipboardList} label="Partes Hoy" value={stats.today} />
        <StatsCard icon={AlertTriangle} label="Pendientes" value={stats.pending} />
        <StatsCard icon={Package} label="Total Partes" value={stats.total} />
        {isAdmin && (
          <StatsCard
            icon={TrendingUp}
            label="Facturación"
            value={`${stats.revenue.toFixed(0)}€`}
            subtitle="Acumulado"
          />
        )}
      </div>

      {/* Recent Interventions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Intervenciones Recientes</h2>
          <Link to="/interventions" className="text-sm text-accent hover:underline font-medium">
            Ver todas →
          </Link>
        </div>
        {recentInterventions.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No hay intervenciones aún</p>
            <Link to="/interventions/new">
              <Button variant="outline" className="mt-4 rounded-xl">
                Crear primer parte
              </Button>
            </Link>
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

