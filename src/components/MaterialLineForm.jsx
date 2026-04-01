import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Trash2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

function MaterialCommandContent({ line, index, gasItems, otherItems, isFreeText, isAdmin, onUpdate, onSelect, onClose }) {
  return (
    <Command>
      <CommandInput placeholder="Escribe para buscar..." className="h-10" />
      <CommandList className="max-h-64">
        <CommandEmpty>No se encontró ningún material.</CommandEmpty>
        <CommandGroup heading="">
          <CommandItem
            value="__free_text__ material no registrado"
            onSelect={() => {
              onUpdate(index, {
                ...line,
                material_id: "__free_text__",
                material_name: "",
                material_code: "",
                unit: "ud",
                unit_price: 0,
                iva_percent: 21,
                total: 0,
              });
              onClose();
            }}
            className="flex items-center gap-2 text-amber-700 font-medium"
          >
            <Check className={cn("h-3.5 w-3.5 shrink-0", isFreeText ? "opacity-100" : "opacity-0")} />
            ⚠️ MATERIAL NO REGISTRADO
          </CommandItem>
        </CommandGroup>
        {gasItems.length > 0 && (
          <CommandGroup heading="⬆ Gas Refrigerante">
            {gasItems.map(m => (
              <CommandItem
                key={m.id}
                value={`${m.code || ""} ${m.name}`}
                onSelect={() => onSelect(m)}
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
                onSelect={() => onSelect(m)}
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
  );
}

const GAS_CATEGORY = "gas_refrigerante";

export default function MaterialLineForm({ line, index, materials, onUpdate, onRemove, isAdmin }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  // Gas first, then the rest alphabetically
  const sortedMaterials = [
    ...materials.filter(m => m.category === GAS_CATEGORY),
    ...materials.filter(m => m.category !== GAS_CATEGORY),
  ];

  const isFreeText = line.material_id === "__free_text__";
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

      {/* Combobox — Drawer on mobile, Popover on desktop */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm hover:bg-accent/10 transition-colors"
      >
        <span className="truncate text-left">
          {isFreeText
            ? "⚠️ Material no registrado"
            : selectedMaterial
              ? `${selectedMaterial.code ? `[${selectedMaterial.code}] ` : ""}${selectedMaterial.name}`
              : <span className="text-muted-foreground">Buscar material...</span>}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Seleccionar Material</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6">
              <MaterialCommandContent
                line={line}
                index={index}
                gasItems={gasItems}
                otherItems={otherItems}
                isFreeText={isFreeText}
                isAdmin={isAdmin}
                onUpdate={onUpdate}
                onSelect={(mat) => { handleMaterialSelect(mat); setOpen(false); }}
                onClose={() => setOpen(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="hidden" />
          <PopoverContent className="w-[340px] p-0" align="start" onOpenAutoFocus={e => e.preventDefault()}>
            <MaterialCommandContent
              line={line}
              index={index}
              gasItems={gasItems}
              otherItems={otherItems}
              isFreeText={isFreeText}
              isAdmin={isAdmin}
              onUpdate={onUpdate}
              onSelect={(mat) => { handleMaterialSelect(mat); setOpen(false); }}
              onClose={() => setOpen(false)}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Free text description */}
      {isFreeText && (
        <Input
          placeholder="Descripción del material (obligatorio) *"
          value={line.material_name || ""}
          onChange={(e) => onUpdate(index, { ...line, material_name: e.target.value })}
          className="bg-amber-50 border-amber-300 text-sm font-medium"
        />
      )}

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