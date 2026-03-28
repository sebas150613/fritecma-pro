import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { LogIn, Coffee, LogOut, RefreshCw, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";

const TYPE_CONFIG = {
  entrada: { label: "Entrada", icon: LogIn, color: "bg-emerald-500 hover:bg-emerald-600 text-white", desc: "Inicio de jornada" },
  pausa: { label: "Pausa", icon: Coffee, color: "bg-amber-500 hover:bg-amber-600 text-white", desc: "Pausa / descanso" },
  reanudacion: { label: "Reanudar", icon: RefreshCw, color: "bg-blue-500 hover:bg-blue-600 text-white", desc: "Continuar jornada" },
  salida: { label: "Salida", icon: LogOut, color: "bg-rose-500 hover:bg-rose-600 text-white", desc: "Fin de jornada" },
};

export default function FichajeWidget({ user, onStatusChange }) {
  const [todayRecords, setTodayRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const today = moment().format("YYYY-MM-DD");

  useEffect(() => {
    if (user) loadTodayRecords();
  }, [user]);

  const loadTodayRecords = async () => {
    const records = await base44.entities.TimeRecord.filter(
      { technician_email: user.email, work_date: today },
      "timestamp",
      50
    );
    setTodayRecords(records);
    setLoading(false);
  };

  const getStatus = () => {
    if (todayRecords.length === 0) return "sin_fichar";
    const last = todayRecords[todayRecords.length - 1];
    return last.type; // entrada, pausa, reanudacion, salida
  };

  const getAvailableActions = () => {
    const status = getStatus();
    if (status === "sin_fichar") return ["entrada"];
    if (status === "entrada" || status === "reanudacion") return ["pausa", "salida"];
    if (status === "pausa") return ["reanudacion", "salida"];
    if (status === "salida") return [];
    return [];
  };

  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          location_lat: pos.coords.latitude,
          location_lng: pos.coords.longitude,
          location_address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });

  const handleFichaje = async (type) => {
    setRegistering(true);
    const location = await getLocation();
    const now = new Date().toISOString();
    await base44.entities.TimeRecord.create({
      technician_email: user.email,
      technician_name: user.full_name,
      type,
      timestamp: now,
      work_date: today,
      ...location,
    });
    await loadTodayRecords();
    onStatusChange?.();
    setRegistering(false);
  };

  const status = getStatus();
  const availableActions = getAvailableActions();

  const statusLabels = {
    sin_fichar: { text: "Sin fichar", color: "text-muted-foreground" },
    entrada: { text: "Jornada activa", color: "text-emerald-600" },
    reanudacion: { text: "Jornada activa", color: "text-emerald-600" },
    pausa: { text: "En pausa", color: "text-amber-600" },
    salida: { text: "Jornada finalizada", color: "text-rose-600" },
  };

  const lastRecord = todayRecords[todayRecords.length - 1];

  if (loading) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-base">Fichaje de Jornada</h2>
          <p className={cn("text-sm font-medium mt-0.5", statusLabels[status]?.color)}>
            {statusLabels[status]?.text}
            {lastRecord && (
              <span className="text-muted-foreground font-normal ml-2">
                · último a las {moment(lastRecord.timestamp).format("HH:mm")}
              </span>
            )}
          </p>
        </div>
        {status === "salida" && (
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        )}
      </div>

      {availableActions.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {availableActions.map((action) => {
            const cfg = TYPE_CONFIG[action];
            return (
              <Button
                key={action}
                onClick={() => handleFichaje(action)}
                disabled={registering}
                className={cn("rounded-xl flex-1 sm:flex-none gap-2 h-11", cfg.color)}
              >
                {registering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <cfg.icon className="h-4 w-4" />
                )}
                {cfg.label}
              </Button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Jornada cerrada. Nos vemos mañana 👋
        </p>
      )}

      {/* Today's log */}
      {todayRecords.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground font-medium mb-2">Registro de hoy</p>
          <div className="flex flex-wrap gap-2">
            {todayRecords.map((r) => {
              const cfg = TYPE_CONFIG[r.type];
              return (
                <span key={r.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-muted">
                  <cfg.icon className="h-3 w-3" />
                  {cfg.label} {moment(r.timestamp).format("HH:mm")}
                  {r.location_address && (
                    <MapPin className="h-2.5 w-2.5 text-muted-foreground ml-0.5" />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}