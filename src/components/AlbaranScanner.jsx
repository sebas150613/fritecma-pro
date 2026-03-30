import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera, Upload, Loader2, CheckCircle2, AlertTriangle, Plus,
  X, ScanLine, Package, ChevronRight, FileImage
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CATEGORIES = {
  gas_refrigerante: "Gas Refrigerante", repuesto: "Repuesto", consumible: "Consumible",
  herramienta: "Herramienta", mano_de_obra: "Mano de Obra", otro: "Otro",
};
const UNITS = { ud: "Unidad", kg: "Kg", m: "Metro", l: "Litro", h: "Hora" };

const STEPS = { UPLOAD: "upload", PROCESSING: "processing", REVIEW: "review", DONE: "done" };

export default function AlbaranScanner({ open, onClose, materials, user, onStockUpdated }) {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [extractedLines, setExtractedLines] = useState([]);
  const [albaranMeta, setAlbaranMeta] = useState({ supplier: "", date: "", reference: "" });
  const [processingMsg, setProcessingMsg] = useState("");
  const [applying, setApplying] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const reset = () => {
    setStep(STEPS.UPLOAD);
    setImagePreview(null);
    setImageFile(null);
    setExtractedLines([]);
    setAlbaranMeta({ supplier: "", date: "", reference: "" });
    setProcessingMsg("");
  };

  const handleFile = (file) => {
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const processImage = async () => {
    if (!imageFile) return;
    setStep(STEPS.PROCESSING);
    setProcessingMsg("Subiendo imagen...");

    // Upload image
    const { file_url } = await base44.integrations.Core.UploadFile({ file: imageFile });

    setProcessingMsg("Analizando albarán con IA...");

    // Call LLM with vision to extract structured data
    const prompt = `Analiza esta imagen de un albarán de compra/entrega y extrae los datos estructurados.

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "supplier": "nombre del proveedor",
  "date": "fecha en formato YYYY-MM-DD o cadena vacía si no se ve",
  "reference": "número de albarán/factura o cadena vacía",
  "lines": [
    {
      "code": "referencia/código del artículo o cadena vacía",
      "description": "descripción completa del artículo",
      "quantity": número,
      "unit": "ud|kg|m|l|h (infiere la unidad más probable)"
    }
  ]
}

Si no puedes leer algún campo, usa cadena vacía. Quantity siempre debe ser un número positivo. Extrae TODAS las líneas de productos que veas.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [file_url],
      model: "claude_sonnet_4_6",
      response_json_schema: {
        type: "object",
        properties: {
          supplier: { type: "string" },
          date: { type: "string" },
          reference: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                description: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
              }
            }
          }
        }
      }
    });

    setAlbaranMeta({ supplier: result.supplier || "", date: result.date || "", reference: result.reference || "" });

    // Match lines against existing materials
    const enriched = (result.lines || []).map(line => {
      // Try to match by code first, then by partial name
      const matchByCode = line.code ? materials.find(m =>
        m.code?.toLowerCase() === line.code.toLowerCase()
      ) : null;
      const matchByName = !matchByCode ? materials.find(m =>
        m.name?.toLowerCase().includes(line.description?.toLowerCase()?.slice(0, 10) || "") ||
        line.description?.toLowerCase().includes(m.name?.toLowerCase() || "")
      ) : null;
      const matched = matchByCode || matchByName;

      return {
        ...line,
        matched_id: matched?.id || null,
        matched_name: matched?.name || null,
        matched_stock: matched?.stock_quantity || 0,
        is_new: !matched,
        // For new materials
        new_category: "repuesto",
        new_cost_price: 0,
        new_sell_price: 0,
        include: true,
      };
    });

    setExtractedLines(enriched);
    setStep(STEPS.REVIEW);
  };

  const updateLine = (i, field, value) => {
    setExtractedLines(prev => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [field]: value };
      return copy;
    });
  };

  const applyStock = async () => {
    const linesToApply = extractedLines.filter(l => l.include);
    if (linesToApply.length === 0) return;
    setApplying(true);
    let count = 0;

    for (const line of linesToApply) {
      if (line.is_new) {
        // Create new material
        const newMat = await base44.entities.Material.create({
          code: line.code || "",
          name: line.description,
          category: line.new_category || "repuesto",
          unit: line.unit || "ud",
          cost_price: line.new_cost_price || 0,
          sell_price: line.new_sell_price || 0,
          stock_quantity: line.quantity || 0,
          min_stock: 0,
          iva_percent: 21,
          is_active: true,
        });
        await base44.entities.StockMovement.create({
          material_id: newMat.id,
          material_name: line.description,
          material_code: line.code || "",
          quantity: line.quantity || 0,
          stock_before: 0,
          stock_after: line.quantity || 0,
          movement_type: "ajuste_manual",
          technician_email: user.email,
          technician_name: user.full_name,
          notes: `Alta por albarán OCR: ${albaranMeta.supplier} ${albaranMeta.reference}`,
        });
      } else {
        // Update existing material stock
        const mat = materials.find(m => m.id === line.matched_id);
        if (!mat) continue;
        const newStock = (mat.stock_quantity || 0) + (line.quantity || 0);
        await base44.entities.Material.update(mat.id, { stock_quantity: newStock });
        await base44.entities.StockMovement.create({
          material_id: mat.id,
          material_name: mat.name,
          material_code: mat.code || "",
          quantity: line.quantity || 0,
          stock_before: mat.stock_quantity || 0,
          stock_after: newStock,
          movement_type: "ajuste_manual",
          technician_email: user.email,
          technician_name: user.full_name,
          notes: `Entrada albarán OCR: ${albaranMeta.supplier} ${albaranMeta.reference}`,
        });
      }
      count++;
    }

    setDoneCount(count);
    setApplying(false);
    setStep(STEPS.DONE);
    onStockUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-accent" />
            Escanear Albarán de Compra
          </DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === STEPS.UPLOAD && (
          <div className="space-y-5 mt-2">
            <p className="text-sm text-muted-foreground">
              Sube una foto o imagen del albarán. La IA extraerá automáticamente los artículos y cantidades.
            </p>

            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Albarán" className="w-full rounded-xl border border-border object-contain max-h-64" />
                <button onClick={() => { setImagePreview(null); setImageFile(null); }}
                  className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-border rounded-2xl hover:border-accent hover:bg-accent/5 transition-colors">
                  <Camera className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium">Usar Cámara</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-border rounded-2xl hover:border-accent hover:bg-accent/5 transition-colors">
                  <FileImage className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium">Subir Imagen</span>
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])} />

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { reset(); onClose(); }} className="flex-1 rounded-xl">Cancelar</Button>
              <Button onClick={processImage} disabled={!imageFile}
                className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
                <ScanLine className="h-4 w-4" /> Analizar con IA
              </Button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === STEPS.PROCESSING && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-accent animate-spin" />
            </div>
            <p className="font-medium">{processingMsg}</p>
            <p className="text-sm text-muted-foreground">Esto puede tardar unos segundos...</p>
          </div>
        )}

        {/* Step: Review */}
        {step === STEPS.REVIEW && (
          <div className="space-y-4 mt-2">
            {/* Meta */}
            <div className="bg-muted/50 rounded-xl p-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Proveedor</p>
                <Input value={albaranMeta.supplier} onChange={e => setAlbaranMeta(a => ({ ...a, supplier: e.target.value }))}
                  className="h-8 text-sm" placeholder="Proveedor..." />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fecha</p>
                <Input type="date" value={albaranMeta.date} onChange={e => setAlbaranMeta(a => ({ ...a, date: e.target.value }))}
                  className="h-8 text-sm" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Nº Albarán</p>
                <Input value={albaranMeta.reference} onChange={e => setAlbaranMeta(a => ({ ...a, reference: e.target.value }))}
                  className="h-8 text-sm" placeholder="Referencia..." />
              </div>
            </div>

            <p className="text-sm font-semibold">
              {extractedLines.length} línea{extractedLines.length !== 1 ? "s" : ""} extraída{extractedLines.length !== 1 ? "s" : ""}
              {" "}· {extractedLines.filter(l => l.is_new).length} nueva{extractedLines.filter(l => l.is_new).length !== 1 ? "s" : ""}
              {" "}· {extractedLines.filter(l => !l.is_new).length} coincidencia{extractedLines.filter(l => !l.is_new).length !== 1 ? "s" : ""}
            </p>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {extractedLines.map((line, i) => (
                <div key={i} className={cn("border rounded-xl p-4 space-y-3 transition-opacity",
                  !line.include && "opacity-40",
                  line.is_new ? "border-amber-300 bg-amber-50/50" : "border-emerald-300 bg-emerald-50/50"
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      {line.is_new
                        ? <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-xs shrink-0">🆕 Nuevo</Badge>
                        : <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs shrink-0">✓ Match</Badge>
                      }
                      <span className="text-sm font-medium truncate">
                        {line.is_new ? line.description : line.matched_name}
                      </span>
                    </div>
                    <button onClick={() => updateLine(i, "include", !line.include)}
                      className={cn("shrink-0 text-xs rounded-lg px-2 py-1 font-medium transition-colors",
                        line.include ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      )}>
                      {line.include ? "Incluir ✓" : "Excluir"}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Cantidad</p>
                      <Input type="number" min="0.01" step="0.01" value={line.quantity}
                        onChange={e => updateLine(i, "quantity", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Unidad</p>
                      <Select value={line.unit} onValueChange={v => updateLine(i, "unit", v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(UNITS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {line.is_new ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Categoría</p>
                        <Select value={line.new_category} onValueChange={v => updateLine(i, "new_category", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Stock actual</p>
                        <div className="h-8 flex items-center text-sm font-medium text-muted-foreground px-3 bg-muted/50 rounded-md">
                          {line.matched_stock} → {line.matched_stock + (line.quantity || 0)}
                        </div>
                      </div>
                    )}
                  </div>

                  {line.is_new && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Precio Coste (€)</p>
                        <Input type="number" step="0.01" value={line.new_cost_price || ""}
                          onChange={e => updateLine(i, "new_cost_price", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm" placeholder="0.00" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Precio Venta (€)</p>
                        <Input type="number" step="0.01" value={line.new_sell_price || ""}
                          onChange={e => updateLine(i, "new_sell_price", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm" placeholder="0.00" />
                      </div>
                    </div>
                  )}

                  {line.code && (
                    <p className="text-xs text-muted-foreground">Ref. albarán: {line.code}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-muted/50 rounded-xl p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Revisa los datos antes de confirmar. Los materiales <span className="text-amber-700 font-medium">nuevos</span> se crearán en el catálogo.
                Los <span className="text-emerald-700 font-medium">existentes</span> sumarán la cantidad al stock actual.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} className="rounded-xl">← Volver</Button>
              <Button onClick={applyStock} disabled={applying || extractedLines.filter(l => l.include).length === 0}
                className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
                {applying ? <><Loader2 className="h-4 w-4 animate-spin" /> Aplicando...</> : <><CheckCircle2 className="h-4 w-4" /> Confirmar y Actualizar Stock</>}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === STEPS.DONE && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold">¡Stock actualizado!</h3>
            <p className="text-muted-foreground text-sm text-center">
              Se han procesado <strong>{doneCount}</strong> línea{doneCount !== 1 ? "s" : ""} del albarán de <strong>{albaranMeta.supplier || "proveedor"}</strong>.
            </p>
            <Button onClick={() => { reset(); onClose(); }} className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground px-8">
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}