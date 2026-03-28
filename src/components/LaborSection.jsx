import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Users } from "lucide-react";

const OPERATOR_MODES = [
  { value: "1_oficial", label: "1 Oficial" },
  { value: "2_oficiales", label: "2 Oficiales (misma tarifa)" },
  { value: "oficial_ayudante", label: "Oficial + Ayudante (tarifas distintas)" },
  { value: "custom", label: "Nº personalizado de operarios" },
];

function calcHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

export default function LaborSection({ materials, isAdmin, onLaborLines }) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [mode, setMode] = useState("1_oficial");
  const [customCount, setCustomCount] = useState(2);

  // Prices from catalog (mano_de_obra category), fallback to 45
  const moMaterials = materials.filter(m => m.category === "mano_de_obra");
  const defaultPrice = moMaterials[0]?.sell_price || 45;
  const defaultId = moMaterials[0]?.id || "";
  const defaultName = moMaterials[0]?.name || "Mano de Obra";
  const defaultUnit = moMaterials[0]?.unit || "h";
  const defaultIva = moMaterials[0]?.iva_percent || 21;

  // Ayudante price — second MO material or 80% of default
  const ayudantePrice = moMaterials[1]?.sell_price || Math.round(defaultPrice * 0.8 * 100) / 100;
  const ayudanteName = moMaterials[1]?.name || "Mano de Obra - Ayudante";
  const ayudanteId = moMaterials[1]?.id || "";

  const [oficialPrice, setOficialPrice] = useState(defaultPrice);
  const [ayudanteCustomPrice, setAyudanteCustomPrice] = useState(ayudantePrice);

  useEffect(() => {
    setOficialPrice(defaultPrice);
    setAyudanteCustomPrice(ayudantePrice);
  }, [materials.length]);

  const hours = calcHours(startTime, endTime);

  useEffect(() => {
    if (hours <= 0) {
      onLaborLines([]);
      return;
    }

    let lines = [];

    if (mode === "1_oficial") {
      lines = [{
        material_id: defaultId,
        material_name: defaultName,
        unit: defaultUnit,
        iva_percent: defaultIva,
        quantity: hours,
        unit_price: oficialPrice,
        total: hours * oficialPrice,
        observation: `Jornada: ${startTime} - ${endTime}`,
        _isLabor: true,
      }];
    } else if (mode === "2_oficiales") {
      lines = [{
        material_id: defaultId,
        material_name: defaultName,
        unit: defaultUnit,
        iva_percent: defaultIva,
        quantity: hours * 2,
        unit_price: oficialPrice,
        total: hours * 2 * oficialPrice,
        observation: `2 Oficiales · Jornada: ${startTime} - ${endTime}`,
        _isLabor: true,
      }];
    } else if (mode === "oficial_ayudante") {
      lines = [
        {
          material_id: defaultId,
          material_name: defaultName,
          unit: defaultUnit,
          iva_percent: defaultIva,
          quantity: hours,
          unit_price: oficialPrice,
          total: hours * oficialPrice,
          observation: `Oficial · ${startTime} - ${endTime}`,
          _isLabor: true,
        },
        {
          material_id: ayudanteId,
          material_name: ayudanteName,
          unit: defaultUnit,
          iva_percent: defaultIva,
          quantity: hours,
          unit_price: ayudanteCustomPrice,
          total: hours * ayudanteCustomPrice,
          observation: `Ayudante · ${startTime} - ${endTime}`,
          _isLabor: true,
        },
      ];
    } else if (mode === "custom") {
      const n = Math.max(1, customCount);
      lines = [{
        material_id: defaultId,
        material_name: defaultName,
        unit: defaultUnit,
        iva_percent: defaultIva,
        quantity: hours * n,
        unit_price: oficialPrice,
        total: hours * n * oficialPrice,
        observation: `${n} operarios · ${startTime} - ${endTime}`,
        _isLabor: true,
      }];
    }

    onLaborLines(lines);
  }, [startTime, endTime, mode, oficialPrice, ayudanteCustomPrice, customCount]);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Clock className="h-4 w-4" /> Mano de Obra
      </h2>

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

      {/* Operator mode */}
      <div>
        <Label className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Tipo de Operarios</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="mt-1 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATOR_MODES.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Custom count */}
      {mode === "custom" && (
        <div>
          <Label>Nº de Operarios</Label>
          <Input
            type="number"
            min="1"
            value={customCount}
            onChange={e => setCustomCount(parseInt(e.target.value) || 1)}
            className="mt-1 rounded-xl w-32"
          />
        </div>
      )}

      {/* Prices — only admin */}
      {isAdmin && hours > 0 && (
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground font-medium">Tarifas (€/h)</p>
          <div className="flex flex-wrap gap-3">
            <div>
              <Label className="text-xs">{mode === "oficial_ayudante" ? "Oficial" : "Operario"}</Label>
              <Input
                type="number"
                step="0.5"
                value={oficialPrice}
                onChange={e => setOficialPrice(parseFloat(e.target.value) || 0)}
                className="mt-1 rounded-xl w-28"
              />
            </div>
            {mode === "oficial_ayudante" && (
              <div>
                <Label className="text-xs">Ayudante</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={ayudanteCustomPrice}
                  onChange={e => setAyudanteCustomPrice(parseFloat(e.target.value) || 0)}
                  className="mt-1 rounded-xl w-28"
                />
              </div>
            )}
          </div>
          {hours > 0 && (
            <div className="bg-primary/5 rounded-xl px-4 py-2.5 text-sm font-medium">
              {mode === "oficial_ayudante"
                ? `Total MO: ${(hours * oficialPrice + hours * ayudanteCustomPrice).toFixed(2)} €`
                : mode === "2_oficiales"
                  ? `Total MO (2 × ${hours}h): ${(hours * 2 * oficialPrice).toFixed(2)} €`
                  : mode === "custom"
                    ? `Total MO (${customCount} × ${hours}h): ${(hours * customCount * oficialPrice).toFixed(2)} €`
                    : `Total MO: ${(hours * oficialPrice).toFixed(2)} €`
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}