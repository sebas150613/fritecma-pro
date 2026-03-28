import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    const isAdmin = me.role === "admin";

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

  const filtered = interventions.filter(i => {
    const matchSearch = !search || 
      i.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.number?.toLowerCase().includes(search.toLowerCase()) ||
      i.technician_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    return matchSearch && matchStatus;
  });

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
            <Plus className="h-4 w-4 mr-2" /> Nuevo Parte
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, nº parte o técnico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-card"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 rounded-xl bg-card">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="en_curso">En Curso</SelectItem>
            <SelectItem value="pendiente_revision">Pendiente Revisión</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
            <SelectItem value="facturado">Facturado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <p className="text-muted-foreground">No se encontraron intervenciones</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(i => (
            <InterventionCard key={i.id} intervention={i} />
          ))}
        </div>
      )}
    </div>
  );
}