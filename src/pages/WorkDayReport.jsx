import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Calendar } from "lucide-react";
import moment from "moment";

const STATUS_COLORS = {
  borrador: "bg-slate-100 text-slate-600",
  enviado: "bg-amber-100 text-amber-700",
  validado: "bg-emerald-100 text-emerald-700",
};

function generateCSV(records) {
  const headers = ["Fecha", "Técnico", "Email", "Total Horas", "Horas Extra", "Horas Nocturnas", "Horas Sábado", "Horas Domingo", "Comida", "Estado", "Observaciones"];
  const rows = records.map(r => [
    r.work_date,
    r.technician_name,
    r.technician_email,
    r.total_hours || 0,
    r.hours_extra || 0,
    r.hours_nocturnas || 0,
    r.hours_sabado || 0,
    r.hours_domingo || 0,
    r.has_lunch_break ? "Sí" : "No",
    r.status,
    r.notes || "",
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jornadas_${moment().format("YYYY-MM")}.csv`;
  a.click();
}

export default function WorkDayReport() {
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(moment().format("YYYY-MM"));
  const [selectedUser, setSelectedUser] = useState("all");

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      loadData(me);
    });
  }, []);

  useEffect(() => {
    if (user) loadData(user);
  }, [selectedMonth, selectedUser]);

  const loadData = async (me) => {
    setLoading(true);
    const [allRecords, userList] = await Promise.all([
      base44.entities.WorkDay.list("-work_date", 500),
      base44.entities.User.list("full_name", 100),
    ]);
    setUsers(userList);
    setRecords(allRecords);
    setLoading(false);
  };

  const isAdmin = user?.role === "admin" || user?.role === "oficina";

  const filtered = records.filter(r => {
    const matchMonth = r.work_date?.startsWith(selectedMonth);
    const matchUser = selectedUser === "all" || r.technician_email === selectedUser;
    const matchOwn = isAdmin || r.technician_email === user?.email;
    return matchMonth && matchUser && matchOwn;
  });

  // Summary per technician
  const summary = {};
  filtered.forEach(r => {
    if (!summary[r.technician_email]) {
      summary[r.technician_email] = {
        name: r.technician_name,
        email: r.technician_email,
        total_hours: 0,
        hours_extra: 0,
        hours_nocturnas: 0,
        hours_sabado: 0,
        hours_domingo: 0,
        days: 0,
      };
    }
    const s = summary[r.technician_email];
    s.total_hours += r.total_hours || 0;
    s.hours_extra += r.hours_extra || 0;
    s.hours_nocturnas += r.hours_nocturnas || 0;
    s.hours_sabado += r.hours_sabado || 0;
    s.hours_domingo += r.hours_domingo || 0;
    s.days += 1;
  });

  const months = Array.from({ length: 12 }, (_, i) =>
    moment().subtract(i, "months").format("YYYY-MM")
  );

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jornadas</h1>
          <p className="text-sm text-muted-foreground">Registro de actividad y liquidación</p>
        </div>
        <Button variant="outline" onClick={() => generateCSV(filtered)} className="rounded-xl gap-2">
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-full sm:w-48 rounded-xl bg-card">
            <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>{moment(m).format("MMMM YYYY")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-full sm:w-56 rounded-xl bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los técnicos</SelectItem>
              {users.map(u => <SelectItem key={u.email} value={u.email}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary Cards */}
      {isAdmin && Object.values(summary).length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.values(summary).map(s => (
            <div key={s.email} className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.days} días registrados</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold">{s.total_hours.toFixed(1)}h</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Extra</p>
                  <p className="font-bold text-amber-600">{s.hours_extra.toFixed(1)}h</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Nocturnas</p>
                  <p className="font-bold text-indigo-600">{s.hours_nocturnas.toFixed(1)}h</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Sáb/Dom</p>
                  <p className="font-bold text-rose-600">{(s.hours_sabado + s.hours_domingo).toFixed(1)}h</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                {isAdmin && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Técnico</th>}
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total h</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Extra</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Nocturnas</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sábado</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Domingo</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Estado</th>
                {isAdmin && <th className="text-center px-4 py-3 font-medium text-muted-foreground">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No hay registros para este período</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{moment(r.work_date).format("DD/MM/YY ddd")}</td>
                  {isAdmin && <td className="px-4 py-3 text-muted-foreground">{r.technician_name}</td>}
                  <td className="px-4 py-3 text-right font-semibold">{(r.total_hours || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{r.hours_extra || 0}</td>
                  <td className="px-4 py-3 text-right text-indigo-600">{r.hours_nocturnas || 0}</td>
                  <td className="px-4 py-3 text-right text-rose-500">{r.hours_sabado || 0}</td>
                  <td className="px-4 py-3 text-right text-rose-600">{r.hours_domingo || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {r.status === "enviado" && (
                          <Button size="sm" variant="outline" className="rounded-lg text-xs h-7"
                            onClick={async () => {
                              await base44.entities.WorkDay.update(r.id, { status: "validado" });
                              setRecords(prev => prev.map(x => x.id === r.id ? { ...x, status: "validado" } : x));
                            }}>
                            Validar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="rounded-lg text-xs h-7 text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            if (!window.confirm(`¿Eliminar el registro de jornada del ${r.work_date} de ${r.technician_name}?`)) return;
                            await base44.entities.WorkDay.delete(r.id);
                            setRecords(prev => prev.filter(x => x.id !== r.id));
                          }}>
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}