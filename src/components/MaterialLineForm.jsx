import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Trash2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const GAS_CATEGORY = "gas_refrigerante";

export default function MaterialLineForm({ line, index, materials, onUpdate, onRemove, isAdmin }) {
  const [open, setOpen] = useState(false);

  // Gas first, then the rest alphabetically
  const sortedMaterials = [
    ...materials.filter(m => m.category === GAS_CATEGORY),
    ...materials.filter(m => m.category !== GAS_CATEGORY),
  ];

  const selectedMaterial = materials.find(m => m.id === line.material_id);

  const handleMaterialSelect = (mat) => {
    onUpdate(index, {
      ...line,
      material_id: mat.id,
      material_name: mat.name,
      material_code: mat.code || "",
      unit: mat.unit || "ud",
      unit_price: mat.sell_price || 0,
      iva_percent: mat.iva_percent || 21,
      total: (line.quantity || 1) * (mat.sell_price || 0),
    });
    setOpen(false);
  };

  const handleQuantityChange = (qty) => {
    const q = parseFloat(qty) || 0;
    onUpdate(index, { ...line, quantity: q, total: q * (line.unit_price || 0) });
  };

  const gasItems = sortedMaterials.filter(m => m.category === GAS_CATEGORY);
  const otherItems = sortedMaterials.filter(m => m.category !== GAS_CATEGORY);

  return (
    <div className="bg-muted/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Línea {index + 1}</span>
        <Button variant="ghost" size="icon" onClick={() => onRemove(index)} className="h-7 w-7 text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-card font-normal"
          >
            <span className="truncate">
              {selectedMaterial
                ? `${selectedMaterial.code ? `[${selectedMaterial.code}] ` : ""}${selectedMaterial.name}`
                : "Buscar material..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Escribe para buscar..." className="h-10" />
            <CommandList className="max-h-64">
              <CommandEmpty>No se encontró ningún material.</CommandEmpty>
              {gasItems.length > 0 && (
                <CommandGroup heading="⬆ Gas Refrigerante">
                  {gasItems.map(m => (
                    <CommandItem
                      key={m.id}
                      value={`${m.code || ""} ${m.name}`}
                      onSelect={() => handleMaterialSelect(m)}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <Check className={cn("h-3.5 w-3.5 shrink-0", line.material_id === m.id ? "opacity-100" : "opacity-0")} />
                        <span>
                          {m.code && <span className="text-muted-foreground text-xs mr-1">[{m.code}]</span>}
                          {m.name}
                        </span>
                      </span>
                      {isAdmin && <span className="text-xs text-muted-foreground shrink-0">{m.sell_price?.toFixed(2)}€/{m.unit}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {otherItems.length > 0 && (
                <CommandGroup heading="Materiales">
                  {otherItems.map(m => (
                    <CommandItem
                      key={m.id}
                      value={`${m.code || ""} ${m.name}`}
                      onSelect={() => handleMaterialSelect(m)}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <Check className={cn("h-3.5 w-3.5 shrink-0", line.material_id === m.id ? "opacity-100" : "opacity-0")} />
                        <span>
                          {m.code && <span className="text-muted-foreground text-xs mr-1">[{m.code}]</span>}
                          {m.name}
                        </span>
                      </span>
                      {isAdmin && <span className="text-xs text-muted-foreground shrink-0">{m.sell_price?.toFixed(2)}€/{m.unit}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Quantity / Price / Total */}
      <div className={`grid gap-2 ${isAdmin ? "grid-cols-3" : "grid-cols-1"}`}>
        <div>
          <label className="text-xs text-muted-foreground">Cantidad</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={line.quantity || ""}
            onChange={(e) => handleQuantityChange(e.target.value)}
            className="bg-card"
          />
        </div>
        {isAdmin && (
          <div>
            <label className="text-xs text-muted-foreground">Precio Ud.</label>
            <Input
              type="number"
              value={line.unit_price || ""}
              onChange={(e) => {
                const p = parseFloat(e.target.value) || 0;
                onUpdate(index, { ...line, unit_price: p, total: (line.quantity || 0) * p });
              }}
              className="bg-card"
            />
          </div>
        )}
        {isAdmin && (
          <div>
            <label className="text-xs text-muted-foreground">Total</label>
            <Input value={`${(line.total || 0).toFixed(2)} €`} readOnly className="bg-muted font-semibold" />
          </div>
        )}
      </div>

      <Input
        placeholder="Observación técnica..."
        value={line.observation || ""}
        onChange={(e) => onUpdate(index, { ...line, observation: e.target.value })}
        className="bg-card text-sm"
      />
    </div>
  );
}