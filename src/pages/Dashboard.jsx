import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Package, Users, AlertTriangle, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatsCard from "../components/StatsCard";
import InterventionCard from "../components/InterventionCard";
import moment from "moment";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, today: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const isAdmin = me.role === "admin";

    let allInterventions;
    if (isAdmin) {
      allInterventions = await base44.entities.Intervention.list("-created_date", 50);
    } else {
      allInterventions = await base44.entities.Intervention.filter(
        { technician_email: me.email },
        "-created_date",
        50
      );
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
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const recentInterventions = interventions.slice(0, 6);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            {isAdmin ? "Panel de Administración" : "Mis Partes de Hoy"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {moment().format("dddd, D [de] MMMM YYYY")}
          </p>
        </div>
        <Link to="/interventions/new">
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/25 rounded-xl px-6">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Parte
          </Button>
        </Link>
      </div>

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
              <InterventionCard key={i.id} intervention={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}