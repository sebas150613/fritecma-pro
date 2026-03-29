import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Search, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InterventionCard from "../components/InterventionCard";

export default function Interventions() {
  const [user, setUser] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const isAdmin = me.role === "admin" || me.role === "superadmin";

    let items;
    if (isAdmin) {
      items = await base44.entities.Intervention.list("-created_date", 200);
    } else {
      items = await base44.entities.Intervention.filter(
        { technician_email: me.email },
        "-created_date",
        200
      );
    }
    setInterventions(items);
    setLoading(false);
  };

  const matchesSearch = (i) => !search ||
    i.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.number?.toLowerCase().includes(search.toLowerCase()) ||
    i.technician_name?.toLowerCase().includes(search.toLowerCase());

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isOficina = user?.role === "oficina";
  const isTecnico = !isAdmin && !isOficina;

  // Pending: incident not finalizado
  const pending = interventions.filter(i =>
    (i.incident_status === "pendiente_operativa" || i.incident_status === "pendiente_parada") && matchesSearch(i)
  );

  // For validation (office): finalizado but not yet validado/completado/facturado
  const forValidation = interventions.filter(i =>
    i.incident_status === "finalizado" && i.status === "pendiente_revision" && matchesSearch(i)
  );

  // All filtered for tecnico
  const allFiltered = interventions.filter(matchesSearch);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Intervenciones</h1>
        <Link to="/interventions/new">
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-6 shadow-lg shadow-accent/25">
            <Plus className="h-4 w-4 mr-2" /> Nueva Incidencia
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por cliente, nº parte o técnico..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 rounded-xl bg-card" />
      </div>

      {(isAdmin || isOficina) ? (
        <Tabs defaultValue="pending">
          <TabsList className="rounded-xl">
            <TabsTrigger value="pending" className="rounded-xl gap-2">
              <AlertTriangle className="h-4 w-4" />
              Incidencias en Curso
              {pending.length > 0 && <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pending.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="validation" className="rounded-xl gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Para Validar
              {forValidation.length > 0 && <span className="ml-1 bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full">{forValidation.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="all" className="rounded-xl gap-2">
              <Clock className="h-4 w-4" /> Todas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {pending.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <p className="text-muted-foreground">No hay incidencias en curso</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pending.map(i => <InterventionCard key={i.id} intervention={i} isAdmin={isAdmin} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="validation" className="mt-4">
            {forValidation.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <p className="text-muted-foreground">No hay intervenciones pendientes de validar</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {forValidation.map(i => <InterventionCard key={i.id} intervention={i} isAdmin={isAdmin} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            {allFiltered.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <p className="text-muted-foreground">No se encontraron intervenciones</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allFiltered.map(i => <InterventionCard key={i.id} intervention={i} isAdmin={isAdmin} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList className="rounded-xl">
            <TabsTrigger value="pending" className="rounded-xl gap-2">
              <AlertTriangle className="h-4 w-4" /> Pendientes
              {pending.filter(i => i.technician_email === user?.email).length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {pending.filter(i => i.technician_email === user?.email).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="rounded-xl">Todas</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">
            {pending.filter(i => i.technician_email === user?.email).length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <p className="text-muted-foreground">No tienes tareas pendientes</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pending.filter(i => i.technician_email === user?.email).map(i => <InterventionCard key={i.id} intervention={i} isAdmin={false} />)}
              </div>
            )}
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allFiltered.map(i => <InterventionCard key={i.id} intervention={i} isAdmin={false} />)}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}