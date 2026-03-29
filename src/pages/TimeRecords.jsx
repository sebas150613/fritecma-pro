import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Clock, LogIn, LogOut, Coffee, RefreshCw, Trash2 } from "lucide-react";
import moment from "moment";

const TYPE_ICONS = {
  entrada: LogIn,
  pausa: Coffee,
  reanudacion: RefreshCw,
  salida: LogOut,
};

const TYPE_LABELS = {
  entrada: "Entrada",
  pausa: "Pausa",
  reanudacion: "Reanudación",
  salida: "Salida",
};

export default function TimeRecords() {
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(moment().format("YYYY-MM"));
  const [selectedTech, setSelectedTech] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const allRecords = await base44.entities.TimeRecord.list("-timestamp", 2000);
    setRecords(allRecords);
    setLoading(false);
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const filteredRecords = records.filter((r) => {
    const matchMonth = r.work_date?.startsWith(selectedMonth);
    const matchTech = selectedTech === "all" || r.technician_email === selectedTech;
    const matchOwn = isAdmin || r.technician_email === user?.email;
    return matchMonth && matchTech && matchOwn;
  });

  const technicians = isAdmin
    ? [...new Set(records.map((r) => r.technician_email))].filter(Boolean)
    : [];

  // Group by technician + date and compute hours
  const computeSummary = () => {
    const byTechDay = {};
    filteredRecords.forEach((r) => {
      const key = `${r.technician_email}__${r.work_date}`;
      if (!byTechDay[key]) byTechDay[key] = { technician: r.technician_name || r.technician_email, date: r.work_date, records: [] };
      byTechDay[key].records.push(r);
    });

    return Object.values(byTechDay).map((entry) => {
      const sorted = [...entry.records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      let totalMinutes = 0;
      let activeStart = null;

      sorted.forEach((r) => {
        if ((r.type === "entrada" || r.type === "reanudacion") && !activeStart) {
          activeStart = new Date(r.timestamp);
        } else if ((r.type === "pausa" || r.type === "salida") && activeStart) {
          totalMinutes += (new Date(r.timestamp) - activeStart) / 60000;
          activeStart = null;
        }
      });

      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.round(totalMinutes % 60);

      return {
        ...entry,
        totalMinutes,
        hoursLabel: `${hours}h ${minutes.toString().padStart(2, "0")}m`,
        entradaTime: sorted.find((r) => r.type === "entrada")?.timestamp,
        salidaTime: sorted.slice().reverse().find((r) => r.type === "salida")?.timestamp,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  };

  const summary = computeSummary();

  const downloadCSV = () => {
    const rows = [
      ["Técnico", "Fecha", "Entrada", "Salida", "Horas Trabajadas", "Ubicación Entrada"],
    ];

    summary.forEach((s) => {
      rows.push([
        s.technician,
        moment(s.date).format("DD/MM/YYYY"),
        s.entradaTime ? moment(s.entradaTime).format("HH:mm") : "-",
        s.salidaTime ? moment(s.salidaTime).format("HH:mm") : "-",
        s.hoursLabel,
        s.records.find((r) => r.type === "entrada")?.location_address || "-",
      ]);
    });

    // Totals per tech
    const byTech = {};
    summary.forEach((s) => {
      if (!byTech[s.technician]) byTech[s.technician] = 0;
      byTech[s.technician] += s.totalMinutes;
    });

    rows.push([]);
    rows.push(["=== RESUMEN MENSUAL ===", "", "", "", "", ""]);
    rows.push(["Técnico", "Total Horas", "", "", "", ""]);
    Object.entries(byTech).forEach(([tech, mins]) => {
      const h = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      rows.push([tech, `${h}h ${m.toString().padStart(2, "0")}m`, "", "", "", ""]);
    });

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jornada_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const months = Array.from({ length: 6 }, (_, i) =>
    moment().subtract(i, "months").format("YYYY-MM")
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-accent" />
          <h1 className="text-2xl font-bold tracking-tight">Registro de Jornada</h1>
        </div>
        <Button onClick={downloadCSV} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl px-6 shadow-lg shadow-accent/25">
          <Download className="h-4 w-4 mr-2" /> Exportar Excel (.csv)
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-full sm:w-48 rounded-xl bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {moment(m).format("MMMM YYYY")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isAdmin && (
          <Select value={selectedTech} onValueChange={setSelectedTech}>
            <SelectTrigger className="w-full sm:w-56 rounded-xl bg-card">
              <SelectValue placeholder="Todos los técnicos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los técnicos</SelectItem>
              {technicians.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary Table */}
      {summary.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No hay registros para el período seleccionado</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Técnico</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Entrada</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Salida</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Horas</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Detalle</th>
                  {isAdmin && <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{s.technician}</td>
                    <td className="px-4 py-3">{moment(s.date).format("ddd DD/MM")}</td>
                    <td className="px-4 py-3 text-emerald-600 font-medium">
                      {s.entradaTime ? moment(s.entradaTime).format("HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-3 text-rose-600 font-medium">
                      {s.salidaTime ? moment(s.salidaTime).format("HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-3 font-bold">{s.hoursLabel}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.records.map((r) => {
                          const Icon = TYPE_ICONS[r.type];
                          return (
                            <span key={r.id} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted">
                              <Icon className="h-3 w-3" />
                              {moment(r.timestamp).format("HH:mm")}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 rounded-lg"
                          title={`Eliminar registros del ${s.date} de ${s.technician}`}
                          onClick={async () => {
                            if (!window.confirm(`¿Eliminar todos los fichajes del ${moment(s.date).format("DD/MM/YYYY")} de ${s.technician}? Esta acción no se puede deshacer.`)) return;
                            await Promise.all(s.records.map(r => base44.entities.TimeRecord.delete(r.id)));
                            setRecords(prev => prev.filter(r => !s.records.some(sr => sr.id === r.id)));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}