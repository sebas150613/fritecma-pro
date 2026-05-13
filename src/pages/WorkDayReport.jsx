import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Calendar, Trash2, Eye, AlertTriangle, CheckCircle2 } from "lucide-react";
import WorkDayDetailModal from "../components/WorkDayDetailModal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { cn } from "@/lib/utils";
import moment from "moment";

const STATUS_COLORS = {
  borrador: "bg-slate-100 text-slate-600",
  enviado: "bg-amber-100 text-amber-700",
  validado: "bg-emerald-100 text-emerald-700",
};

function generateCSV(records) {
  const headers = ["Fecha", "Técnico", "Email", "Total Horas", "Horas Extra", "Horas Nocturnas", "Horas Sábado", "Horas Domingo", "Comida", "Estado", "Observaciones"];
  const rows = records.map(r => [
    r.work_date, r.technician_name, r.technician_email,
    r.total_hours || 0, r.hours_extra || 0, r.hours_nocturnas || 0,
    r.hours_sabado || 0, r.hours_domingo || 0,
    r.has_lunch_break ? "Sí" : "No", r.status, r.notes || "",
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
  const [timeRecords, setTimeRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(moment().format("YYYY-MM"));
  const [selectedUser, setSelectedUser] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailRecord, setDetailRecord] = useState(null);
  const [workDayToDelete, setWorkDayToDelete] = useState(null);

  useEffect(() => {
    appApi.auth.me().then(me => { setUser(me); loadData(me); });
  }, []);

  useEffect(() => {
    if (user) loadData(user);
  }, [selectedMonth, selectedUser]);

  const loadData = async (me) => {
    setLoading(true);
    const [allRecords, userList, clientList, trList] = await Promise.all([
      appApi.entities.WorkDay.list("-work_date", 500),
      appApi.entities.User.list("full_name", 100),
      appApi.entities.Client.list("name", 500),
      appApi.entities.TimeRecord.list("-timestamp", 1000),
    ]);
    setUsers(userList);
    setRecords(allRecords);
    setClients(clientList);
    setTimeRecords(trList.filter(r => r.type === "entrada" || r.type === "salida"));
    setLoading(false);
  };

  const handleValidate = async (id) => {
    await appApi.entities.WorkDay.update(id, { status: "validado" });
    setRecords(prev => prev.map(x => x.id === id ? { ...x, status: "validado" } : x));
    setDetailRecord(prev => prev && prev.id === id ? { ...prev, status: "validado" } : prev);
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado" || user?.role === "oficina";

  const deleteWorkDay = async () => {
    if (!workDayToDelete) return;
    await appApi.entities.WorkDay.delete(workDayToDelete.id);
    setRecords((prev) => prev.filter((x) => x.id !== workDayToDelete.id));
    setWorkDayToDelete(null);
  };

  const filtered = records.filter(r => {
    const matchMonth = !dateFrom && !dateTo ? r.work_date?.startsWith(selectedMonth) : true;
    const matchFrom = !dateFrom || r.work_date >= dateFrom;
    const matchTo = !dateTo || r.work_date <= dateTo;
    const matchUser = selectedUser === "all" || r.technician_email === selectedUser;
    const matchOwn = isAdmin || r.technician_email === user?.email;
    return matchMonth && matchFrom && matchTo && matchUser && matchOwn;
  });

  // Summary per technician
  const summary = {};
  filtered.forEach(r => {
    if (!summary[r.technician_email]) {
      summary[r.technician_email] = { name: r.technician_name, email: r.technician_email, total_hours: 0, hours_extra: 0, hours_nocturnas: 0, hours_sabado: 0, hours_domingo: 0, days: 0 };
    }
    const s = summary[r.technician_email];
    s.total_hours += r.total_hours || 0;
    s.hours_extra += r.hours_extra || 0;
    s.hours_nocturnas += r.hours_nocturnas || 0;
    s.hours_sabado += r.hours_sabado || 0;
    s.hours_domingo += r.hours_domingo || 0;
    s.days += 1;
  });

  // Cross-validation: fichaje hours vs tramos hours per technician/day
  const buildCrossValidation = () => {
    const byKey = {};
    const filteredTR = timeRecords.filter(r => {
      const matchUser = selectedUser === "all" || r.technician_email === selectedUser;
      const matchMonth = r.work_date?.startsWith(selectedMonth);
      return matchUser && matchMonth;
    });
    filteredTR.forEach(r => {
      const key = `${r.technician_email}::${r.work_date}`;
      if (!byKey[key]) byKey[key] = { name: r.technician_name, email: r.technician_email, date: r.work_date, entradas: [], salidas: [], tramos_hours: null };
      if (r.type === "entrada") byKey[key].entradas.push(r.timestamp);
      if (r.type === "salida") byKey[key].salidas.push(r.timestamp);
    });
    filtered.forEach(r => {
      const key = `${r.technician_email}::${r.work_date}`;
      if (!byKey[key]) byKey[key] = { name: r.technician_name, email: r.technician_email, date: r.work_date, entradas: [], salidas: [], tramos_hours: null };
      byKey[key].tramos_hours = r.total_hours || 0;
    });
    return Object.values(byKey).map(d => {
      const fichaje_hours = (d.entradas.length > 0 && d.salidas.length > 0)
        ? Math.round(
            (
              new Date(d.salidas[d.salidas.length - 1]).getTime() -
              new Date(d.entradas[0]).getTime()
            ) / 36000
          ) / 100
        : null;
      const diff = fichaje_hours != null && d.tramos_hours != null ? Math.abs(fichaje_hours - d.tramos_hours) : null;
      return { ...d, fichaje_hours, diff };
    }).sort((a, b) => b.date.localeCompare(a.date));
  };

  const months = Array.from({ length: 12 }, (_, i) => moment().subtract(i, "months").format("YYYY-MM"));

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
    </div>
  );

  return (
    <PullToRefresh onRefresh={() => loadData(user)}>
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
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <Select value={selectedMonth} onValueChange={v => { setSelectedMonth(v); setDateFrom(""); setDateTo(""); }}>
          <SelectTrigger className="w-full sm:w-48 rounded-xl bg-card">
            <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m} value={m}>{moment(m).format("MMMM YYYY")}</SelectItem>)}
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
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-xl bg-card w-40" />
          <span className="text-muted-foreground text-sm">—</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-xl bg-card w-40" />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} className="rounded-xl text-xs">Limpiar</Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="tramos">
        <TabsList className="rounded-xl">
          <TabsTrigger value="tramos" className="rounded-lg">Registro de Actividad</TabsTrigger>
          {isAdmin && <TabsTrigger value="validacion" className="rounded-lg">Validación Cruzada</TabsTrigger>}
        </TabsList>

        {/* Validación Cruzada */}
        {isAdmin && (
          <TabsContent value="validacion" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Compara las horas del <strong>Fichaje</strong> (entrada → salida) con las horas registradas en los <strong>Tramos de actividad</strong>.
              Una diferencia &gt; 0.5h aparece marcada en amarillo.
            </p>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-border">
                {buildCrossValidation().length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sin datos para este período</p>
                ) : buildCrossValidation().map((d, i) => {
                  const ok = d.diff != null && d.diff <= 0.5;
                  const warn = d.diff != null && d.diff > 0.5;
                  const missing = d.fichaje_hours == null || d.tramos_hours == null;
                  return (
                    <div key={i} className={cn("p-4 space-y-2", warn && "bg-amber-50", missing && "bg-slate-50")}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{moment(d.date).format("DD/MM/YY ddd")}</span>
                        {missing ? <span className="text-xs text-muted-foreground">Incompleto</span>
                          : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      </div>
                      <p className="text-sm text-muted-foreground">{d.name}</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><p className="text-muted-foreground">Fichaje</p><p className="font-semibold">{d.fichaje_hours != null ? d.fichaje_hours.toFixed(2) + "h" : "—"}</p></div>
                        <div><p className="text-muted-foreground">Tramos</p><p className="font-semibold">{d.tramos_hours != null ? d.tramos_hours.toFixed(2) + "h" : "—"}</p></div>
                        <div><p className="text-muted-foreground">Diferencia</p><p className={cn("font-semibold", warn ? "text-amber-600" : ok ? "text-emerald-600" : "text-muted-foreground")}>{d.diff != null ? d.diff.toFixed(2) + "h" : "—"}</p></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Técnico</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Fichaje (h)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tramos (h)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Diferencia</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {buildCrossValidation().length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Sin datos para este período</td></tr>
                    ) : buildCrossValidation().map((d, i) => {
                      const ok = d.diff != null && d.diff <= 0.5;
                      const warn = d.diff != null && d.diff > 0.5;
                      const missing = d.fichaje_hours == null || d.tramos_hours == null;
                      return (
                        <tr key={i} className={cn("hover:bg-muted/20", warn && "bg-amber-50", missing && "bg-slate-50")}>
                          <td className="px-4 py-3 font-medium">{moment(d.date).format("DD/MM/YY ddd")}</td>
                          <td className="px-4 py-3 text-muted-foreground">{d.name}</td>
                          <td className="px-4 py-3 text-right font-semibold">{d.fichaje_hours != null ? d.fichaje_hours.toFixed(2) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-3 text-right">{d.tramos_hours != null ? d.tramos_hours.toFixed(2) : <span className="text-muted-foreground">—</span>}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${warn ? "text-amber-600" : ok ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {d.diff != null ? `${d.diff.toFixed(2)}h` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {missing ? <span className="text-xs text-muted-foreground">Incompleto</span>
                              : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                              : <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        )}

        {/* Tramos / Actividad */}
        <TabsContent value="tramos" className="mt-4 space-y-4">
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
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-border">
              {filtered.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">No hay registros para este período</p>
              ) : filtered.map(r => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{moment(r.work_date).format("DD/MM/YY ddd")}</span>
                    <Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge>
                  </div>
                  {isAdmin && <p className="text-sm text-muted-foreground">{r.technician_name}</p>}
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span>Total: <strong>{(r.total_hours || 0).toFixed(2)}h</strong></span>
                    {(r.hours_extra || 0) > 0 && <span className="text-amber-600">Extra: {r.hours_extra}h</span>}
                    {(r.hours_nocturnas || 0) > 0 && <span className="text-indigo-600">Noc: {r.hours_nocturnas}h</span>}
                    {((r.hours_sabado || 0) + (r.hours_domingo || 0)) > 0 && <span className="text-rose-600">S/D: {((r.hours_sabado||0)+(r.hours_domingo||0)).toFixed(1)}h</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 rounded-lg gap-1 text-xs flex-1" onClick={() => setDetailRecord(r)}>
                      <Eye className="h-3.5 w-3.5" /> Ver detalle
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => setWorkDayToDelete(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
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
                    {isAdmin && <th className="text-center px-4 py-3 font-medium text-muted-foreground">Acciones</th>}
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Detalle</th>
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
                          <Button size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 rounded-lg"
                            onClick={() => setWorkDayToDelete(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <Button size="sm" variant="outline" className="h-7 rounded-lg gap-1 text-xs"
                          onClick={() => setDetailRecord(r)}>
                          <Eye className="h-3.5 w-3.5" /> Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmModal
        icon={null}
        open={!!workDayToDelete}
        onOpenChange={(open) => {
          if (!open) setWorkDayToDelete(null);
        }}
        title="Eliminar jornada"
        description={
          <>
            Vas a eliminar el registro del{" "}
            <strong>{workDayToDelete?.work_date}</strong>
            {workDayToDelete?.technician_name ? (
              <>
                {" "}de <strong>{workDayToDelete.technician_name}</strong>
              </>
            ) : null}
            .
          </>
        }
        note="Esta acción elimina el registro de jornada del listado actual."
        confirmText="Eliminar jornada"
        variant="danger"
        onConfirm={deleteWorkDay}
      />

      <WorkDayDetailModal
        record={detailRecord}
        clients={clients}
        onClose={() => setDetailRecord(null)}
        onValidate={isAdmin ? handleValidate : null}
      />
    </div>
    </PullToRefresh>
  );
}

