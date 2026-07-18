import { useRef, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera, FileImage, Loader2, Sparkles, AlertTriangle, X,
  CheckCircle2, Wrench, ClipboardCopy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STEPS = { UPLOAD: "upload", PROCESSING: "processing", RESULT: "result" };

// Resolución alta para no perder los dígitos de displays de 7 segmentos
// (el OCR de códigos como "HA2"/"5A2" es sensible al detalle).
const IMAGE_MAX_DIMENSION = 2048;
const IMAGE_JPEG_QUALITY = 0.85;

async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", IMAGE_JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "controlador";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reconocido: { type: "boolean" },
    marca: { type: "string" },
    modelo: { type: "string" },
    codigo_error: { type: "string" },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    significado: { type: "string" },
    causas: { type: "array", items: { type: "string" } },
    comprobaciones: { type: "array", items: { type: "string" } },
    advertencia: { type: "string" },
    info_adicional: { type: "string" },
  },
};

const CONFIANZA_STYLES = {
  alta: "bg-emerald-100 text-emerald-700 border-emerald-300",
  media: "bg-amber-100 text-amber-700 border-amber-300",
  baja: "bg-red-100 text-red-700 border-red-300",
};

function buildPrompt({ manualCode, comment, context }) {
  const contextLines = [];
  if (context?.clientName) contextLines.push(`Cliente: ${context.clientName}`);
  if (context?.machineName) contextLines.push(`Máquina/equipo: ${context.machineName}`);
  if (context?.description) contextLines.push(`Descripción de la avería: ${context.description}`);
  if (manualCode.trim()) contextLines.push(`Código de error indicado por el técnico: ${manualCode.trim()}`);
  if (comment.trim()) contextLines.push(`Observaciones del técnico: ${comment.trim()}`);

  return `Eres un técnico frigorista experto en refrigeración industrial y comercial con 25 años de experiencia, especializado en controladores electrónicos de frío: Eliwell, Danfoss (ERC/EKC/AK), AKO, Carel, Dixell, Full Gauge, LAE, Pego, KLD y similares.

Analiza la foto del controlador y diagnostica el problema.

${contextLines.length > 0 ? `CONTEXTO:\n${contextLines.join("\n")}\n` : ""}
INSTRUCCIONES:
1. Identifica la MARCA y, si es posible, el MODELO del controlador por su aspecto (frontal, teclas, serigrafía).
2. Lee lo que muestra el display (código de error, temperatura, iconos como alarma/desescarche/compresor). Los displays de 7 segmentos confunden caracteres (5/S, 8/B, 0/O): si dudas entre dos lecturas, indícalo en "info_adicional".
3. Explica el SIGNIFICADO del código o del estado mostrado para ese controlador concreto.
4. Lista las CAUSAS más probables, ordenadas de más a menos probable, teniendo en cuenta el contexto.
5. Lista las COMPROBACIONES paso a paso que haría un frigorista, en orden lógico (de lo más rápido/barato a lo más costoso). Sé concreto: qué medir, dónde y qué valores esperar.
6. Si hay riesgo eléctrico, de fuga de gas o alimentario, indícalo en "advertencia" (si no, cadena vacía).
7. En "info_adicional" indica qué foto o dato extra afinaría el diagnóstico (etiqueta del equipo, parámetros, lectura de sondas...).

HONESTIDAD OBLIGATORIA: si NO reconoces el controlador o el display no se lee, devuelve "reconocido": false y explica en "info_adicional" qué necesitas (p. ej. foto de la etiqueta del modelo). NUNCA inventes un modelo o un significado del que no estés seguro; ajusta "confianza" con criterio.

Responde en español, dirigido a un técnico profesional. Devuelve SOLO el JSON pedido.`;
}

function buildSummaryText(result) {
  const lines = [];
  const equipo = [result.marca, result.modelo].filter(Boolean).join(" ");
  lines.push(`[Diagnóstico IA${equipo ? ` — ${equipo}` : ""}]`);
  if (result.codigo_error) lines.push(`Código: ${result.codigo_error} — ${result.significado}`);
  else if (result.significado) lines.push(result.significado);
  if (result.causas?.length) {
    lines.push(`Causas probables: ${result.causas.join("; ")}`);
  }
  if (result.comprobaciones?.length) {
    lines.push(`Comprobaciones: ${result.comprobaciones.map((c, i) => `${i + 1}) ${c}`).join(" ")}`);
  }
  return lines.join("\n");
}

/**
 * Diálogo de diagnóstico por foto de controladores de frío.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{clientName?: string, machineName?: string, description?: string}} [props.context]
 *   Contexto de la avería/parte que se añade al prompt para afinar el diagnóstico.
 * @param {(text: string) => void} [props.onInsert]  Si se pasa, muestra "Añadir a
 *   notas" y recibe el resumen en texto plano para insertarlo en el formulario.
 */
export default function AiDiagnosis({ open, onClose, context, onInsert }) {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [manualCode, setManualCode] = useState("");
  const [comment, setComment] = useState("");
  const [processingMsg, setProcessingMsg] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const reset = () => {
    setStep(STEPS.UPLOAD);
    setImageFile(null);
    setImagePreview(null);
    setManualCode("");
    setComment("");
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const diagnose = async () => {
    if (!imageFile) return;
    setStep(STEPS.PROCESSING);
    try {
      setProcessingMsg("Subiendo foto...");
      const compressed = await compressImage(imageFile);
      const { file_url } = await appApi.files.uploadPublic({ file: compressed });

      setProcessingMsg("Analizando el controlador con IA...");
      const data = await appApi.ai.invoke({
        prompt: buildPrompt({ manualCode, comment, context }),
        file_urls: [file_url],
        max_output_tokens: 3000,
        response_json_schema: RESPONSE_SCHEMA,
      });

      setResult(data);
      setStep(STEPS.RESULT);
    } catch (err) {
      console.error("[AiDiagnosis] Error en el diagnóstico:", err);
      const msg =
        err?.status === 503
          ? err.message
          : "No se pudo completar el diagnóstico: " + (err?.message || "error desconocido");
      toast.error(msg, { duration: 8000 });
      setStep(STEPS.UPLOAD);
    }
  };

  const handleInsert = () => {
    if (!result || !onInsert) return;
    onInsert(buildSummaryText(result));
    toast.success("Diagnóstico añadido a las notas.");
    close();
  };

  const equipo = result ? [result.marca, result.modelo].filter(Boolean).join(" ") : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Diagnóstico IA del controlador
          </DialogTitle>
        </DialogHeader>

        {step === STEPS.UPLOAD && (
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Haz una foto del controlador con el error en el display. La IA identificará
              el equipo, leerá el código y te propondrá causas y comprobaciones.
            </p>

            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Controlador"
                  className="w-full rounded-xl border border-border object-contain max-h-64"
                />
                <button
                  onClick={() => { setImagePreview(null); setImageFile(null); }}
                  className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-border rounded-2xl hover:border-accent hover:bg-accent/5 transition-colors"
                >
                  <Camera className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium">Usar Cámara</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-border rounded-2xl hover:border-accent hover:bg-accent/5 transition-colors"
                >
                  <FileImage className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium">Subir Imagen</span>
                </button>
              </div>
            )}

            <input
              ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <input
              ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Código de error (si lo ves tú)</p>
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="p. ej. HA, E1, dEF..."
                  className="rounded-xl"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Observaciones (opcional)</p>
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="p. ej. el compresor no arranca"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={close} className="flex-1 rounded-xl">
                Cancelar
              </Button>
              <Button
                onClick={diagnose}
                disabled={!imageFile}
                className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
              >
                <Sparkles className="h-4 w-4" /> Diagnosticar
              </Button>
            </div>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-accent animate-spin" />
            </div>
            <p className="font-medium">{processingMsg}</p>
            <p className="text-sm text-muted-foreground">Esto puede tardar unos segundos...</p>
          </div>
        )}

        {step === STEPS.RESULT && result && (
          <div className="space-y-4 mt-2">
            {!result.reconocido ? (
              <div className="border border-dashed border-amber-300 bg-amber-50/50 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <p className="font-semibold text-amber-800">No se ha podido identificar con seguridad</p>
                </div>
                {result.info_adicional && (
                  <p className="text-sm text-amber-800">{result.info_adicional}</p>
                )}
              </div>
            ) : (
              <>
                <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-lg">{equipo || "Controlador identificado"}</p>
                    <Badge variant="outline" className={cn("text-xs", CONFIANZA_STYLES[result.confianza] || "")}>
                      Confianza {result.confianza || "media"}
                    </Badge>
                  </div>
                  {result.codigo_error && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Código leído: </span>
                      <span className="font-mono font-bold text-base">{result.codigo_error}</span>
                    </p>
                  )}
                  {result.significado && (
                    <p className="text-sm leading-relaxed">{result.significado}</p>
                  )}
                </div>

                {result.advertencia && (
                  <div className="flex items-start gap-2 border border-red-200 bg-red-50/60 rounded-xl p-3">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{result.advertencia}</p>
                  </div>
                )}

                {result.causas?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                      Causas probables (por orden)
                    </h3>
                    <ol className="space-y-1.5">
                      {result.causas.map((causa, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span>{causa}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {result.comprobaciones?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5" /> Comprobaciones paso a paso
                    </h3>
                    <ol className="space-y-1.5">
                      {result.comprobaciones.map((paso, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{paso}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {result.info_adicional && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-3">
                    💡 {result.info_adicional}
                  </p>
                )}
              </>
            )}

            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              Diagnóstico orientativo generado por IA. Verifica el código leído y aplica
              siempre tu criterio profesional y las normas de seguridad.
            </p>

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={reset} className="rounded-xl">
                ← Nueva consulta
              </Button>
              {onInsert && result.reconocido && (
                <Button
                  onClick={handleInsert}
                  variant="outline"
                  className="rounded-xl gap-2 border-accent/40 text-accent hover:bg-accent/5"
                >
                  <ClipboardCopy className="h-4 w-4" /> Añadir a notas
                </Button>
              )}
              <Button
                onClick={close}
                className="flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
