import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

export default function MaterialLineForm({ line, index, materials, onUpdate, onRemove }) {
  const selectedMaterial = materials.find(m => m.id === line.material_id);

  const handleMaterialChange = (materialId) => {
    const mat = materials.find(m => m.id === materialId);
    if (mat) {
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
    }
  };

  const handleQuantityChange = (qty) => {
    const q = parseFloat(qty) || 0;
    onUpdate(index, {
      ...line,
      quantity: q,
      total: q * (line.unit_price || 0),
    });
  };

  return (
    <div className="bg-muted/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Línea {index + 1}</span>
        <Button variant="ghost" size="icon" onClick={() => onRemove(index)} className="h-7 w-7 text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Select value={line.material_id || ""} onValueChange={handleMaterialChange}>
        <SelectTrigger className="bg-card">
          <SelectValue placeholder="Seleccionar material..." />
        </SelectTrigger>
        <SelectContent>
          {materials.map(m => (
            <SelectItem key={m.id} value={m.id}>
              {m.code ? `[${m.code}] ` : ""}{m.name} — {m.sell_price?.toFixed(2)}€/{m.unit || "ud"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid grid-cols-3 gap-2">
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
        <div>
          <label className="text-xs text-muted-foreground">Total</label>
          <Input value={`${(line.total || 0).toFixed(2)} €`} readOnly className="bg-muted font-semibold" />
        </div>
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