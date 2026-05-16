import { useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RotateCcw, Receipt } from "lucide-react";
import { toast } from "sonner";

export default function RectificativaForm({ invoice, intervention, onComplete, onCancel }) {
  const [formData, setFormData] = useState({
    subtotal: invoice.subtotal || 0,
    iva_total: invoice.iva_total || 0,
    total: invoice.total || 0,
    description: intervention.description || "",
    technician_notes: intervention.technician_notes || "",
    motivo: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await appApi.functions.invoke("processVerifactu", {
        intervention_id: intervention.id,
        mode: "rectificar_corregida",
        original_invoice_id: invoice.id,
        rectificativa_motivo: formData.motivo,
        subtotal_corregida: formData.subtotal,
        iva_corregida: formData.iva_total,
        total_corregida: formData.total,
        description_corregida: formData.description,
        technician_notes_corregida: formData.technician_notes,
      });

      if (res.data.success) {
        onComplete(res.data);
      } else {
        toast.error("Error: " + res.data.error);
      }
    } catch (e) {
      toast.error("Error al generar rectificativa: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
        <p className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" /> Editar datos para la rectificativa</p>
        <p className="mt-1">Los cambios aquí generarán una R1 vinculada al hash original.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium">Subtotal (€)</label>
          <Input
            type="number"
            step="0.01"
            value={formData.subtotal}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              const iva = val * 0.21;
              setFormData({
                ...formData,
                subtotal: val,
                iva_total: Math.round(iva * 100) / 100,
                total: Math.round((val + iva) * 100) / 100,
              });
            }}
            className="mt-1 rounded-xl"
          />
        </div>
        <div>
          <label className="text-xs font-medium">IVA 21% (€)</label>
          <Input
            type="number"
            step="0.01"
            value={formData.iva_total}
            disabled
            className="mt-1 rounded-xl bg-muted"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Total (€)</label>
          <Input
            type="number"
            step="0.01"
            value={formData.total}
            disabled
            className="mt-1 rounded-xl bg-muted"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium">Descripción del trabajo</label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="mt-1 rounded-xl"
          rows={2}
        />
      </div>

      <div>
        <label className="text-xs font-medium">Notas técnicas</label>
        <Textarea
          value={formData.technician_notes}
          onChange={(e) => setFormData({ ...formData, technician_notes: e.target.value })}
          className="mt-1 rounded-xl"
          rows={2}
        />
      </div>

      <div>
        <label className="text-xs font-medium">Motivo de rectificación *</label>
        <Textarea
          value={formData.motivo}
          onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
          placeholder="Ej: Error en importe, cambio de tipo IVA, datos del cliente incorrectos..."
          className="mt-1 rounded-xl"
          rows={2}
        />
      </div>

      <div className="flex gap-2 pt-2 border-t border-border">
        <Button variant="outline" onClick={onCancel} disabled={submitting} className="flex-1 rounded-xl">
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting || !formData.motivo.trim()}
          className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
          Generar Rectificativa
        </Button>
      </div>
    </form>
  );
}

