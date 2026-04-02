import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Users, AlertCircle } from "lucide-react";

const SCHEDULE_TYPES = [
  { value: "normal",   label: "Normal (horario laboral)" },
  { value: "extra",    label: "Extra (horas extra)" },
  { value: "nocturno", label: "Nocturno" },
  { value: "festivo",  label: "Festivo / Fin de semana" },
];

const OPERATOR_MODES = [
  { value: "1_oficial",        label: "1 Oficial (solo técnico principal)" },
  { value: "oficial_ayudante", label: "Oficial + Ayudante" },
  { value: "custom",           label: "Nº personalizado de operarios" },
];

function calcHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

function getTarifa(clientTarifas, tipoHorario) {
  const map = {
    normal:   clientTarifas?.tarifa_normal   ?? 45,
    extra:    clientTarifas?.tarifa_extra    ?? 60,
    nocturno: clientTarifas?.tarifa_nocturna ?? 70,
    festivo:  clientTarifas?.tarifa_festiva  ?? 80,
  };
  return map[tipoHorario] ?? 45;
}

export default function LaborSection({ materials, isAdmin, onLaborLines, currentUser, allUsers = [], clientTarifas = null }) {
  const [startTime, setStartTime]   = useState("");
  const [endTime, setEndTime]       = useState("");
  const [tipoHorario, setTipoHorario] = useState("normal");
  const [mode, setMode]             = useState("1_oficial");
  const [customCount, setCustomCount] = useState(2);
  const [helperEmail, setHelperEmail] = useState("");
  const [extraOperators, setExtraOperators] = useState([]);
  const [adminPriceOverride, setAdminPriceOverride] = useState(null); // null = use client tarifa

  // Derived values
  const operatorCount = mode === "1_oficial" ? 1 : mode === "oficial_ayudante" ? 2 : customCount;
  const baseRate = adminPriceOverride !== null ? adminPriceOverride : getTarifa(clientTarifas, tipoHorario);

  const moMaterials = materials.filter(m => m.category === "mano_de_obra");
  const defaultMO   = moMaterials[0] || {};
  const ayudanteMO  = moMaterials[1] || moMaterials[0] || {};
  const ayudanteRate = isAdmin && adminPriceOverride !== null
    ? adminPriceOverride * 0.8
    : getTarifa(clientTarifas, tipoHorario) * 0.8;

  const handleModeChange = (newMode) => {
    setMode(newMode);
    if (newMode === "1_oficial")        setCustomCount(1);
    else if (newMode === "oficial_ayudante") setCustomCount(2);
  };

  useEffect(() => {
    // Reset admin override when tarifa type changes
    setAdminPriceOverride(null);
  }, [tipoHorario]);

  // Sync extra operators array size
  useEffect(() => {
    const additional = Math.max(0, customCount - 1);
    setExtraOperators(prev => {
      const next = [...prev];
      while (next.length < additional) next.push("");
      return next.slice(0, additional);
    });
  }, [customCount]);

  const hours = calcHours(startTime, endTime);
  const principalName = currentUser?.full_name || "Técnico Principal";
  const otherUsers = allUsers.filter(u => u.email !== currentUser?.email);
  const getUserName = (email) => allUsers.find(u => u.email === email)?.full_name || email;

  useEffect(() => {
    if (hours <= 0) { onLaborLines([]); return; }

    const rate = baseRate;
    const ayRate = mode === "oficial_ayudante" ? ayudanteRate : rate;

    let lines = [];
    if (mode === "1_oficial") {
      lines = [{
        material_id: defaultMO.id || "", material_name: defaultMO.name || "Mano de Obra",
        unit: defaultMO.unit || "h", iva_percent: defaultMO.iva_percent || 21,
        quantity: hours, unit_price: rate, total: hours * rate,
        observation: `${principalName} · ${startTime}–${endTime} · ${SCHEDULE_TYPES.find(s=>s.value===tipoHorario)?.label}`,
        _isLabor: true, _tipoHorario: tipoHorario,
      }];
    } else if (mode === "oficial_ayudante") {
      const helperName = helperEmail ? getUserName(helperEmail) : "Ayudante";
      lines = [
        {
          material_id: defaultMO.id || "", material_name: defaultMO.name || "Mano de Obra",
          unit: defaultMO.unit || "h", iva_percent: defaultMO.iva_percent || 21,
          quantity: hours, unit_price: rate, total: hours * rate,
          observation: `${principalName} · ${startTime}–${endTime} · ${SCHEDULE_TYPES.find(s=>s.value===tipoHorario)?.label}`,
          _isLabor: true, _tipoHorario: tipoHorario,
        },
        {
          material_id: ayudanteMO.id || "", material_name: ayudanteMO.name || "Mano de Obra – Ayudante",
          unit: ayudanteMO.unit || "h", iva_percent: ayudanteMO.iva_percent || 21,
          quantity: hours, unit_price: ayRate, total: hours * ayRate,
          observation: `${helperName} · ${startTime}–${endTime} · ${SCHEDULE_TYPES.find(s=>s.value===tipoHorario)?.label}`,
          _isLabor: true, _tipoHorario: tipoHorario,
        },
      ];
    } else {
      lines = [{
        material_id: defaultMO.id || "", material_name: defaultMO.name || "Mano de Obra",
        unit: defaultMO.unit || "h", iva_percent: defaultMO.iva_percent || 21,
        quantity: hours, unit_price: rate, total: hours * rate,
        observation: `${principalName} · ${startTime}–${endTime} · ${SCHEDULE_TYPES.find(s=>s.value===tipoHorario)?.label}`,
        _isLabor: true, _tipoHorario: tipoHorario,
      }];
      extraOperators.forEach((email, i) => {
        const name = email ? getUserName(email) : `Operario ${i + 2}`;
        lines.push({
          material_id: defaultMO.id || "", material_name: defaultMO.name || "Mano de Obra",
          unit: defaultMO.unit || "h", iva_percent: defaultMO.iva_percent || 21,
          quantity: hours, unit_price: rate, total: hours * rate,
          observation: `${name} · ${startTime}–${endTime} · ${SCHEDULE_TYPES.find(s=>s.value===tipoHorario)?.label}`,
          _isLabor: true, _tipoHorario: tipoHorario,
        });
      });
    }

    onLaborLines(lines);
  }, [startTime, endTime, tipoHorario, mode, baseRate, ayudanteRate, customCount, helperEmail, extraOperators.join(","), hours]);

  const tarifaCargada = clientTarifas !== null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Clock className="h-4 w-4" /> Mano de Obra
      </h2>

      {/* Técnico principal (readonly) */}
      <div>
        <Label>Técnico Principal</Label>
        <Input value={principalName} disabled className="mt-1 rounded-xl bg-muted/50" />
      </div>

      {/* Time range */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
        <div>
          <Label>Hora Inicio</Label>
          <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1 rounded-xl" />
        </div>
        <div>
          <Label>Hora Fin</Label>
          <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1 rounded-xl" />
        </div>
        <div className="flex items-end pb-0.5">
          {hours > 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 w-full text-center">
              <p className="text-xs text-emerald-600 font-medium">Tiempo</p>
              <p className="text-lg font-bold text-emerald-700">{hours.toFixed(2)} h</p>
            </div>
          ) : (
            <div className="bg-muted rounded-xl px-4 py-2 w-full text-center">
              <p className="text-xs text-muted-foreground">Introduce horas</p>
            </div>
          )}
        </div>
      </div>

      {/* Tipo de Horario — OBLIGATORIO */}
      <div>
        <Label className="flex items-center gap-1">
          Tipo de Horario <span className="text-destructive">*</span>
        </Label>
        <Select value={tipoHorario} onValueChange={setTipoHorario}>
          <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SCHEDULE_TYPES.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!tarifaCargada && (
          <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3" /> Sin tarifas configuradas en el cliente — se usarán valores por defecto
          </p>
        )}
      </div>

      {/* Operator mode */}
      <div>
        <Label className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Tipo de Operarios</Label>
        <Select value={mode} onValueChange={handleModeChange}>
          <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPERATOR_MODES.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Nº Operarios — solo lectura excepto en custom */}
      <div>
        <Label>Nº de Operarios</Label>
        <Input
          type="number" min="1"
          value={operatorCount}
          disabled={mode !== "custom"}
          onChange={e => mode === "custom" && setCustomCount(Math.max(1, parseInt(e.target.value) || 1))}
          className={`mt-1 rounded-xl w-32 ${mode !== "custom" ? "bg-muted/50 cursor-not-allowed" : ""}`}
        />
      </div>

      {/* Oficial + Ayudante: selector */}
      {mode === "oficial_ayudante" && (
        <div>
          <Label>Ayudante / Segundo Técnico</Label>
          <Select value={helperEmail} onValueChange={setHelperEmail}>
            <SelectTrigger className="mt-1 rounded-xl">
              <SelectValue placeholder="Seleccionar ayudante..." />
            </SelectTrigger>
            <SelectContent>
              {otherUsers.map(u => (
                <SelectItem key={u.email} value={u.email}>{u.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Custom: selectores adicionales */}
      {mode === "custom" && (
        <div className="space-y-3">
          {extraOperators.map((email, i) => (
            <div key={i}>
              <Label>Operario {i + 2}</Label>
              <Select value={email} onValueChange={(v) => {
                const next = [...extraOperators]; next[i] = v; setExtraOperators(next);
              }}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue placeholder="Seleccionar operario..." />
                </SelectTrigger>
                <SelectContent>
                  {otherUsers.map(u => (
                    <SelectItem key={u.email} value={u.email}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {/* Total MO */}
      {hours > 0 && (
        <div className="bg-primary/5 rounded-xl px-4 py-2.5 text-sm font-medium">
          {isAdmin
            ? (mode === "oficial_ayudante"
                ? `Total MO: ${(hours * baseRate + hours * ayudanteRate).toFixed(2)} € (Tarifa ${tipoHorario}: ${baseRate}€/h + Ay. ${ayudanteRate.toFixed(2)}€/h)`
                : `Total MO: ${(hours * operatorCount * baseRate).toFixed(2)} € (${operatorCount} op. × ${hours}h × ${baseRate}€/h · ${tipoHorario})`)
            : `${hours.toFixed(2)} h × ${operatorCount} operario${operatorCount !== 1 ? "s" : ""} = ${(hours * operatorCount).toFixed(2)} unidades de trabajo`
          }
        </div>
      )}

      {/* Admin: override tarifa */}
      {isAdmin && hours > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground font-medium">
            Tarifa aplicada: {getTarifa(clientTarifas, tipoHorario)} €/h (cliente)
            {adminPriceOverride !== null && " — override activo"}
          </p>
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs">Override tarifa (€/h)</Label>
              <Input
                type="number" step="0.5"
                placeholder={String(getTarifa(clientTarifas, tipoHorario))}
                value={adminPriceOverride ?? ""}
                onChange={e => setAdminPriceOverride(e.target.value === "" ? null : parseFloat(e.target.value) || 0)}
                className="mt-1 rounded-xl w-32"
              />
            </div>
            {adminPriceOverride !== null && (
              <button
                onClick={() => setAdminPriceOverride(null)}
                className="text-xs text-muted-foreground underline mt-5"
              >
                Restablecer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}