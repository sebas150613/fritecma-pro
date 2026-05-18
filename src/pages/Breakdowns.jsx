import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { Plus, Search, AlertTriangle, CheckCircle2, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import AnimatedPage from "../components/AnimatedPage";
import PullToRefresh from "../components/PullToRefresh";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/status-constants";

const STATUS_COLORS = {
  abierta:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  terminada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const STATUS_LABELS = { abierta: "Abierta", pendiente: "Pendiente", terminada: "Terminada" };

function BreakdownCard({ breakdown }) {
  const createdDate = breakdown.created_at
    ? new Date(breakdown.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : "—";

  return (
    <Link to={`/breakdowns/${breakdown.id}`}>
      <div className="bg-card rounded-2xl border border-border p-4 hover:shadow-md hover:border-accent/30 transition-all duration-200 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-mono">{breakdown.number}</p>
            <p className="font-semibold text-sm truncate mt-0.5">{breakdown.client_name}</p>
            {breakdown.work_center_name && (
              <p className="text-xs text-muted-foreground truncate">{breakdown.work_center_name}</p>
            )}
          </div>
          <Badge className={cn("text-[11px] shrink-0", STATUS_COLORS[breakdown.status] || "bg-muted text-muted-foreground")}>
            {STATUS_LABELS[breakdown.status] || breakdown.status}
          </Badge>
        </div>

        {breakdown.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{breakdown.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <Badge className={cn("text-[11px]", PRIORITY_COLORS[breakdown.priority] || "bg-muted text-muted-foreground")}>
            {PRIORITY_LABELS[breakdown.priority] || breakdown.priority}
          </Badge>
          <div className="text-right">
            {breakdown.assigned_user_name ? (
              <p className="text-xs text-muted-foreground truncate max-w-[120px]">{breakdown.assigned_user_name}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">Sin asignar</p>
            )}
            <p className="text-[10px] text-muted-foreground/60">{createdDate}</p>
          </div>
        </div>

        {breakdown.client_fault_id && (
          <p className="text-[10px] text-muted-foreground">Ref. cliente: {breakdown.client_fault_id}</p>
        )}
      </div>
    </Link>
  );
}

const EmptyState = ({ message, canCreate }) => (
  <div className="bg-card rounded-2xl border border-border p-12 text-center space-y-3">
    <p className="text-muted-foreground">{message}</p>
    {canCreate && (
      <Link to="/breakdowns/new">
        <Button variant="outline" className="rounded-xl">
          <Plus className="h-4 w-4 mr-2" /> Nueva avería
        </Button>
      </Link>
    )}
  </div>
);

export default function Breakdowns() {
  const [user, setUser] = useState(null);
  const [breakdowns, setBreakdowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const me = await appApi.auth.me();
      setUser(me);
      const items = await appApi.breakdowns.list({ sort: "-created_at", limit: 200 });
      setBreakdowns(items || []);
    } catch (err) {
      console.error("Error loading breakdowns:", err);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const canCreate = isAdmin || isOficina;

  const matchesSearch = (b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.client_name?.toLowerCase().includes(q) ||
      b.number?.toLowerCase().includes(q) ||
      b.client_fault_id?.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q) ||
      b.assigned_user_name?.toLowerCase().includes(q)
    );
  };

  const abiertas   = breakdowns.filter(b => b.status === "abierta"   && matchesSearch(b));
  const pendientes = breakdowns.filter(b => b.status === "pendiente"  && matchesSearch(b));
  const terminadas = breakdowns.filter(b => b.status === "terminada"  && matchesSearch(b));
  const all        = breakdowns.filter(matchesSearch);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AnimatedPage>
      <PullToRefresh onRefresh={loadData}>
        <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight">Averías</h1>
            {canCreate && (
              <Link to="/breakdowns/new">
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-6 shadow-lg shadow-accent/25">
                  <Plus className="h-4 w-4 mr-2" /> Nueva Avería
                </Button>
              </Link>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, nº avería, referencia o técnico..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl bg-card"
            />
          </div>

          <Tabs defaultValue="abiertas">
            <TabsList className="rounded-xl">
              <TabsTrigger value="abiertas" className="rounded-xl gap-2">
                <AlertTriangle className="h-4 w-4" />
                Abiertas
                {abiertas.length > 0 && (
                  <span className="ml-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {abiertas.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pendientes" className="rounded-xl gap-2">
                <Clock className="h-4 w-4" />
                Pendientes
                {pendientes.length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {pendientes.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="terminadas" className="rounded-xl gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Terminadas
              </TabsTrigger>
              <TabsTrigger value="todas" className="rounded-xl gap-2">
                <Zap className="h-4 w-4" />
                Todas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="abiertas" className="mt-4">
              {abiertas.length === 0
                ? <EmptyState message="No hay averías abiertas" canCreate={canCreate} />
                : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{abiertas.map(b => <BreakdownCard key={b.id} breakdown={b} />)}</div>
              }
            </TabsContent>

            <TabsContent value="pendientes" className="mt-4">
              {pendientes.length === 0
                ? <EmptyState message="No hay averías pendientes" canCreate={false} />
                : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{pendientes.map(b => <BreakdownCard key={b.id} breakdown={b} />)}</div>
              }
            </TabsContent>

            <TabsContent value="terminadas" className="mt-4">
              {terminadas.length === 0
                ? <EmptyState message="No hay averías terminadas" canCreate={false} />
                : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{terminadas.map(b => <BreakdownCard key={b.id} breakdown={b} />)}</div>
              }
            </TabsContent>

            <TabsContent value="todas" className="mt-4">
              {all.length === 0
                ? <EmptyState message="No se encontraron averías" canCreate={canCreate} />
                : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{all.map(b => <BreakdownCard key={b.id} breakdown={b} />)}</div>
              }
            </TabsContent>
          </Tabs>
        </div>
      </PullToRefresh>
    </AnimatedPage>
  );
}
