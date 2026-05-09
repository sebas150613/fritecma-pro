import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  GAS_TYPE_OTHER_LABEL,
  REFRIGERANT_GAS_CANONICAL_LIST,
  normalizeGasCompareKey,
  resolveCanonicalGasLabel,
} from "@/lib/refrigerantGases";

/**
 * Buscador / autocompletado de tipo de gas.
 * @param {object} props
 * @param {string} props.value - Valor guardado (tipo de gas final).
 * @param {(v: string) => void} props.onChange
 * @param {boolean} [props.otherUi] - Si true, modo "Otro" con campo obligatorio.
 * @param {(b: boolean) => void} props.onOtherUiChange
 * @param {string} props.otherDraft - Texto del gas personalizado.
 * @param {(v: string) => void} props.onOtherDraftChange
 * @param {string[]} [props.legacyGasTypes] - Gases ya existentes en botellas (compatibilidad).
 * @param {string[]} [props.priorityGasTypes] - Orden de prioridad visual (p.ej. con stock).
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 */
export default function GasTypeCombobox({
  value,
  onChange,
  otherUi,
  onOtherUiChange,
  otherDraft,
  onOtherDraftChange,
  legacyGasTypes = [],
  priorityGasTypes = [],
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false);

  const officialOptions = useMemo(() => {
    const base = REFRIGERANT_GAS_CANONICAL_LIST.filter((g) => g !== GAS_TYPE_OTHER_LABEL);
    return [...base, GAS_TYPE_OTHER_LABEL];
  }, []);

  const allSelectable = useMemo(() => {
    const extra = (legacyGasTypes || []).filter(Boolean);
    const merged = new Map();
    const add = (label) => {
      const canon = resolveCanonicalGasLabel(label, extra);
      const k = normalizeGasCompareKey(canon);
      if (!k || k === normalizeGasCompareKey(GAS_TYPE_OTHER_LABEL)) return;
      if (!merged.has(k)) merged.set(k, canon);
    };
    priorityGasTypes.forEach(add);
    officialOptions.forEach(add);
    extra.forEach(add);
    const priorityKeys = new Set(priorityGasTypes.map((g) => normalizeGasCompareKey(g)));
    const list = [...merged.values()];
    list.sort((a, b) => {
      const pa = priorityKeys.has(normalizeGasCompareKey(a)) ? 0 : 1;
      const pb = priorityKeys.has(normalizeGasCompareKey(b)) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (a === GAS_TYPE_OTHER_LABEL) return 1;
      if (b === GAS_TYPE_OTHER_LABEL) return -1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    });
    return list;
  }, [legacyGasTypes, officialOptions, priorityGasTypes]);

  const displayLabel = useMemo(() => {
    if (otherUi) return otherDraft?.trim() ? resolveCanonicalGasLabel(otherDraft, legacyGasTypes) : GAS_TYPE_OTHER_LABEL;
    return value || "";
  }, [otherUi, otherDraft, value, legacyGasTypes]);

  const handlePick = (label) => {
    if (normalizeGasCompareKey(label) === normalizeGasCompareKey(GAS_TYPE_OTHER_LABEL)) {
      onOtherUiChange(true);
      onChange("");
      onOtherDraftChange("");
      setOpen(false);
      return;
    }
    onOtherUiChange(false);
    onOtherDraftChange("");
    onChange(resolveCanonicalGasLabel(label, legacyGasTypes));
    setOpen(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between rounded-xl font-normal text-left h-auto min-h-10 py-2")}
          >
            <span className={cn(!displayLabel && "text-muted-foreground")}>
              {displayLabel || "Buscar tipo de gas…"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100%,380px)] min-w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Ej: 449, R410, 1234yf…" className="h-10" />
            <CommandList>
              <CommandEmpty>No hay coincidencias.</CommandEmpty>
              <CommandGroup heading="Gases">
                {allSelectable.map((g) => (
                  <CommandItem key={g} value={g} onSelect={() => handlePick(g)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        normalizeGasCompareKey(value) === normalizeGasCompareKey(g) ||
                          (otherUi && normalizeGasCompareKey(g) === normalizeGasCompareKey(GAS_TYPE_OTHER_LABEL))
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    {g}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {otherUi && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <Label htmlFor="gas-custom-type" className="text-sm font-medium">
            Tipo de gas personalizado *
          </Label>
          <Input
            id="gas-custom-type"
            value={otherDraft}
            onChange={(e) => {
              const raw = e.target.value;
              onOtherDraftChange(raw);
              const resolved = resolveCanonicalGasLabel(raw, legacyGasTypes);
              if (resolved && raw.trim()) onChange(resolved);
            }}
            placeholder="Ejemplo: R123, R407F, mezcla especial..."
            className="rounded-xl"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Obligatorio si eliges «{GAS_TYPE_OTHER_LABEL}». Podrá coincidir con un gas ya listado al guardar.
          </p>
        </div>
      )}
    </div>
  );
}
