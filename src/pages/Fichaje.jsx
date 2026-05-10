import { useState, useEffect } from "react";
import AnimatedPage from "../components/AnimatedPage";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogIn, LogOut, MapPin, Loader2, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";
import MapLink from "../components/MapLink";

const TYPE_CONFIG = {
  entrada: {
    label: "Registrar Entrada",
    icon: LogIn,
    color: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200",
    desc: "Inicio de jornada laboral",
  },
  salida: {
    label: "Registrar Salida",
    icon: LogOut,
    color: "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-200",
    desc: "Fin de jornada laboral",
  },
};

const STATUS_LABELS = {
  sin_fichar: { text: "Sin fichar hoy", color: "text-muted-foreground" },
  entrada: { text: "Jornada activa", color: "text-emerald-600" },
  salida: { text: "Jornada cerrada", color: "text-rose-600" },
};

export default function Fichaje() {
  const [user, setUser] = useState(null);
  const [todayRecords, setTodayRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("unknown"); // unknown | granted | denied | checking
  const [allRecords, setAllRecords] = useState([]); // admin: recent fichajes

  const today = moment().format("YYYY-MM-DD");
  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "oficina";

  useEffect(() => {
    init();
    checkGpsPermission();
  }, []);

  const init = async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const me = await appApi.auth.me();
      setUser(me);
      await loadTodayRecords(me.email);
      if (me.role === "admin" || me.role === "superadmin" || me.role === "oficina") {
        const recent = await appApi.entities.TimeRecord.filter(
          { work_date: today },
          "-timestamp",
          100
        );
        // Only entrada/salida fichajes
        setAllRecords(recent.filter(r => r.type === "entrada" || r.type === "salida"));
      }
    } catch (err) {
      console.error("[Fichaje] init failed:", err);
      setLoadError(err?.message || "No se pudo cargar el fichaje. Comprueba la conexión con la API.");
    } finally {
      setLoading(false);
    }
  };

  const loadTodayRecords = async (email) => {
    const records = await appApi.entities.TimeRecord.filter(
      { technician_email: email, work_date: today },
      "timestamp",
      50
    );
    setTodayRecords(records.filter(r => r.type === "entrada" || r.type === "salida"));
  };

  const checkGpsPermission = async () => {
    setGpsStatus("checking");
    if (!navigator.geolocation) {
      setGpsStatus("denied");
      return;
    }
    if (navigator.permissions) {
      const perm = await navigator.permissions.query({ name: "geolocation" });
      if (perm.state === "granted") {
        setGpsStatus("granted");
      } else if (perm.state === "denied") {
        setGpsStatus("denied");
      } else {
        // prompt — try getting location to trigger permission dialog
        setGpsStatus("unknown");
      }
      perm.onchange = () => {
        if (perm.state === "granted") setGpsStatus("granted");
        else if (perm.state === "denied") setGpsStatus("denied");
      };
    } else {
      setGpsStatus("unknown");
    }
  };

  const getLocationRequired = () =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus("granted");
          resolve({
            location_lat: pos.coords.latitude,
            location_lng: pos.coords.longitude,
            location_address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
          });
        },
        () => {
          setGpsStatus("denied");
          reject(new Error("GPS denegado"));
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const handleFichaje = async (type) => {
    setRegistering(true);
    // Optimistic update — show new status immediately
    const optimisticRecord = {
      id: `optimistic-${Date.now()}`,
      type,
      timestamp: new Date().toISOString(),
      work_date: today,
      technician_email: user.email,
    };
    setTodayRecords(prev => [...prev, optimisticRecord]);

    let location;
    try {
      location = await getLocationRequired();
    } catch {
      // Revert optimistic update on GPS failure
      setTodayRecords(prev => prev.filter(r => r.id !== optimisticRecord.id));
      setRegistering(false);
      return;
    }
    const now = new Date().toISOString();
    await appApi.entities.TimeRecord.create({
      technician_email: user.email,
      technician_name: user.full_name,
      type,
      timestamp: now,
      work_date: today,
      ...location,
    });
    // Replace optimistic with real data
    await loadTodayRecords(user.email);
    if (isAdmin) {
      const recent = await appApi.entities.TimeRecord.filter(
        { work_date: today },
        "-timestamp",
        100
      );
      setAllRecords(recent.filter(r => r.type === "entrada" || r.type === "salida"));
    }
    setRegistering(false);
  };

  const getStatus = () => {
    if (todayRecords.length === 0) return "sin_fichar";
    return todayRecords[todayRecords.length - 1].type;
  };

  const getAvailableActions = () => {
    const s = getStatus();
    if (s === "sin_fichar") return ["entrada"];
    if (s === "entrada") return ["salida"];
    return [];
  };

  const status = getStatus();
  const actions = getAvailableActions();
  const gpsBlocked = gpsStatus === "denied";

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
        <Button type="button" variant="outline" onClick={() => void init()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <AnimatedPage>
      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fichaje de Presencia</h1>
        <p className="text-sm text-muted-foreground">Registro oficial de inicio y fin de jornada · geolocalizado</p>
      </div>

      {gpsBlocked && (
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
          <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-destructive text-sm">GPS desactivado o denegado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Es necesario activar la ubicación para cumplir con el registro legal. Actívala en los ajustes de tu dispositivo y recarga la página.
            </p>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Estado hoy · {moment().format("dddd D MMMM")}</p>
            <p className={cn("text-xl font-bold", STATUS_LABELS[status]?.color)}>
              {STATUS_LABELS[status]?.text}
            </p>
          </div>
          {status === "salida" && <CheckCircle2 className="h-8 w-8 text-emerald-500" />}
          {status === "entrada" && (
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </div>

        {todayRecords.length > 0 && (
          <div className="space-y-2">
            {todayRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm bg-muted/40 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {r.type === "entrada"
                    ? <LogIn className="h-4 w-4 text-emerald-600" />
                    : <LogOut className="h-4 w-4 text-rose-500" />
                  }
                  <span className="font-medium capitalize">{r.type}</span>
                  <span className="text-muted-foreground">· {moment(r.timestamp).format("HH:mm:ss")}</span>
                </div>
                {r.location_lat && r.location_lng && (
                  <MapLink lat={r.location_lat} lng={r.location_lng} address="Ver ubicación" className="text-xs" />
                )}
              </div>
            ))}
          </div>
        )}

        {actions.length > 0 && !gpsBlocked && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {actions.map((action) => {
              const cfg = TYPE_CONFIG[action];
              return (
                <Button
                  key={action}
                  onClick={() => handleFichaje(action)}
                  disabled={registering}
                  className={cn("rounded-xl h-14 text-base font-semibold flex-1 gap-3", cfg.color)}
                >
                  {registering ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Obteniendo GPS...</>
                  ) : (
                    <><cfg.icon className="h-5 w-5" /> {cfg.label}</>
                  )}
                </Button>
              );
            })}
          </div>
        )}

        {gpsBlocked && actions.length > 0 && (
          <Button disabled className="w-full h-14 rounded-xl text-base opacity-50 cursor-not-allowed">
            <MapPin className="h-5 w-5 mr-2" /> Activa la ubicación para fichar
          </Button>
        )}

        {actions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            ✅ Jornada cerrada. Hasta mañana.
          </p>
        )}

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />
          El fichaje registra coordenadas GPS y marca de tiempo oficial del servidor.
        </p>
      </div>

      {isAdmin && allRecords.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Fichajes del equipo hoy · {moment().format("D MMM")}
          </h2>
          <div className="space-y-2">
            {allRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm border border-border rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-3">
                  {r.type === "entrada"
                    ? <Badge className="bg-emerald-100 text-emerald-700 text-xs">Entrada</Badge>
                    : <Badge className="bg-rose-100 text-rose-700 text-xs">Salida</Badge>
                  }
                  <span className="font-medium">{r.technician_name}</span>
                  <span className="text-muted-foreground">{moment(r.timestamp).format("HH:mm:ss")}</span>
                </div>
                {r.location_lat && r.location_lng ? (
                  <MapLink lat={r.location_lat} lng={r.location_lng} address="📍 Ver mapa" className="text-xs" />
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" /> Sin GPS
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </AnimatedPage>
  );
}

