import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { INTERVENTION_STATUS_COLORS, INTERVENTION_STATUS_LABELS } from "@/lib/status-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BackButton from "../components/BackButton";
import RectificativaForm from "../components/RectificativaForm";
import { FileText, Mail, Clock, Flame, User, Loader2, Package, CheckCircle2, Check, Pencil, Trash2, Plus, AlertTriangle, Wrench, Lock, Receipt, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import MapLink from "../components/MapLink";
import { GasMediaGallery } from "@/components/GasMediaSection";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { cn } from "@/lib/utils";
import moment from "moment";
import { generateInvoicePdf } from "../utils/generateInvoicePdf";
import {
  parseTramosJson,
  ensureTramoIds,
  findTramoById,
  upsertDisplacementMaterialLine,
  stripDisplacementLines,
  computeTotalsFromLines,
} from "@/lib/displacementBilling";
	const statusColors = INTERVENTION_STATUS_COLORS;
	const statusLabels = INTERVENTION_STATUS_LABELS;

export default function InterventionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [intervention, setIntervention] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [visits, setVisits] = useState([]);
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState(null);
  const [invoice, setInvoice] = useState(null);

  const getVerifactuLabel = (status) => ({
    aceptado:         { label: 'Aceptado por AEAT', color: 'text-emerald-700' },
    validado_sandbox: { label: 'Validado en entorno de pruebas (AEAT sandbox)', color: 'text-blue-600' },
    sandbox_ok:       { label: 'Sandbox OK (sin acuse definitivo)', color: 'text-blue-600' },
    pendiente:        { label: 'Pendiente de envío', color: 'text-amber-600' },
    sin_envio:        { label: 'No enviado (error conexión/certificado)', color: 'text-red-600' },
    rechazado:        { label: 'Rechazado por AEAT', color: 'text-red-700' },
    error:            { label: 'Error en respuesta AEAT', color: 'text-red-700' },
    duplicado:        { label: 'Duplicado (ya registrado)', color: 'text-amber-600' },
  }[status] || { label: status, color: 'text-muted-foreground' });
  const [showRectModal, setShowRectModal] = useState(false);
  const [rectMode, setRectMode] = useState(null); // null | 'anular' | 'corregir' | 'reabrir'
  const [rectificando, setRectificando] = useState(false);
  const [rectResult, setRectResult] = useState(null);
  const [rectMotivoAnular, setRectMotivoAnular] = useState("");
  const [confirmingFacturar, setConfirmingFacturar] = useState(false);
  const [adminTipoHorario, setAdminTipoHorario] = useState('');
  const [adminTarifaOverride, setAdminTarifaOverride] = useState('');
  const [depCantidad, setDepCantidad] = useState(0);
  const [depTramoId, setDepTramoId] = useState("");
  const [depSaving, setDepSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
    const [me, items, visitList, invoiceList] = await Promise.all([
      appApi.auth.me(),
      appApi.entities.Intervention.filter({ id }, "-created_date", 1),
      appApi.entities.Visit.filter({ intervention_id: id }, "date", 50),
      appApi.entities.Invoice.filter({ intervention_id: id }, "-created_date", 1),
    ]);
    setUser(me);
    if (items.length > 0) setIntervention(items[0]);
    setVisits(visitList);
    if (invoiceList.length > 0) {
      setInvoice(invoiceList[0]);
    } else if (items[0]?.invoice_id) {
      // Factura agrupada: el parte guarda la referencia porque la factura no
      // apunta a un único intervention_id.
      const groupedList = await appApi.entities.Invoice.filter(
        { id: items[0].invoice_id },
        "-created_date",
        1
      ).catch(() => []);
      if (groupedList.length > 0) setInvoice(groupedList[0]);
    }
    } catch (err) {
      console.error("[InterventionDetail] Error loading data:", err);
      toast.error("Error al cargar el parte.");
    } finally {
    setLoading(false);
    }
  };

  useEffect(() => {
    if (!intervention) return;
    setDepCantidad(intervention.desplazamientos_cantidad ?? 0);
    setDepTramoId(intervention.desplazamiento_tramo_id || "");
  }, [intervention?.id, intervention?.desplazamientos_cantidad, intervention?.desplazamiento_tramo_id]);

  const updateStatus = async (status) => {
    await appApi.entities.Intervention.update(id, { status });
    setIntervention(prev => ({ ...prev, status }));
  };

  const sendEmail = async () => {
    if (!intervention) return;
    setSendingEmail(true);
    try {
      await appApi.business.sendInterventionClientEmail(id);
      await appApi.entities.Intervention.update(id, { email_sent: true });
      setIntervention(prev => ({ ...prev, email_sent: true }));
    } catch (e) {
      toast.error(`No se pudo enviar el email: ${e.message || "Error desconocido."}`);
    }
    setSendingEmail(false);
  };

  const generatePDF = async () => {
    setGeneratingPdf(true);
    try {
      await generateInvoicePdf(invoice, intervention);
    } catch (e) {
      toast.error("No se pudo generar el PDF. Inténtalo de nuevo.");
    }
    setGeneratingPdf(false);
  };

  const handleDelete = async () => {
    if (!intervention || !user) return;
    setDeleting(true);
    try {
      // Restore stock before deleting
      try {
        const lines = intervention.materials_json ? JSON.parse(intervention.materials_json) : [];
        for (const line of lines) {
          if (line.material_id && line.material_id !== "__free_text__") {
            const mat = await appApi.entities.Material.get(line.material_id).catch(() => null);
            if (mat && mat.stock !== undefined) {
              const restoreQty = line.quantity || 0;
              await appApi.entities.Material.update(line.material_id, {
                stock: (mat.stock || 0) + restoreQty,
              });
              await appApi.entities.StockMovement.create({
                material_id: line.material_id,
                material_name: line.material_name || mat.name,
                movement_type: "entrada_ajuste",
                quantity: restoreQty,
                stock_before: mat.stock || 0,
                stock_after: (mat.stock || 0) + restoreQty,
                intervention_number: intervention.number,
                notes: `Reposición por eliminación de parte ${intervention.number}`,
                timestamp: new Date().toISOString(),
              }).catch(() => {});
            }
          }
        }
        // Restore gas bottle
        if (intervention.gas_bottle_id && intervention.gas_loaded_kg > 0) {
          const bottle = await appApi.entities.GasBottle.get(intervention.gas_bottle_id).catch(() => null);
          if (bottle) {
            const newKg = (bottle.carga_actual || 0) + intervention.gas_loaded_kg;
            await appApi.entities.GasBottle.update(intervention.gas_bottle_id, {
              carga_actual: newKg,
              status: newKg > 0 ? "activa" : "vacia",
            });
          }
        }
      } catch (restoreErr) {
        console.error("[InterventionDetail] Error restoring stock on delete:", restoreErr);
        toast.error("Parte eliminado pero hubo un error al reponer el stock. Revisa el inventario.", { duration: 8000 });
      }

      await appApi.entities.AuditLog.create({
        action: "eliminacion",
        entity_type: "Intervention",
        entity_id: id,
        entity_reference: intervention.number,
        user_email: user.email,
        user_name: user.full_name,
        changes_summary: `Parte eliminado: ${intervention.client_name} - ${intervention.number}`,
        timestamp: new Date().toISOString(),
      });
      await appApi.entities.Intervention.delete(id);

      // Update linked breakdown if this intervention was connected to one
      if (intervention.breakdown_id) {
        try {
          const remaining = await appApi.entities.Intervention.filter(
            { breakdown_id: intervention.breakdown_id }, "-created_date", 1
          );
          const bdPatch = {
            last_intervention_id: remaining.length > 0 ? remaining[0].id : null,
            last_intervention_number: remaining.length > 0 ? remaining[0].number : null,
          };
          if (remaining.length === 0) {
            bdPatch.status = "pendiente";
          }
          await appApi.breakdowns.update(intervention.breakdown_id, bdPatch);
        } catch (e) {
          console.error("[InterventionDetail] Error updating breakdown after delete:", e);
        }
      }

      navigate("/interventions");
    } finally {
      setDeleting(false);
    }
  };

  const handleValidateOption = (mode) => {
    if (mode === "facturar" && intervention?.desplazamiento_pendiente_tarifa) {
      toast.error("Asigna el tramo de desplazamiento antes de facturar.");
      return;
    }
    if (mode === "facturar") {
      setConfirmingFacturar(true);
      return;
    }
    executeValidation(mode);
  };

  const executeValidation = async (mode) => {
    setConfirmingFacturar(false);
    setValidating(true);
    try {
      const payload = { intervention_id: id, mode };
      if (mode === 'facturar') {
        if (adminTipoHorario) payload.tipo_horario_override = adminTipoHorario;
        if (adminTarifaOverride) payload.tarifa_override = parseFloat(adminTarifaOverride);
      }
      const res = await appApi.functions.invoke('processVerifactu', payload);
      const data = res.data;
      setValidateResult(data);
      await loadData();
      if (mode === 'guardar') {
        await generateInvoicePdf(null, intervention).catch((pdfErr) =>
          console.error("[generatePartePdf]", pdfErr)
        );
      }
    } catch (e) {
      console.error("[processVerifactu]", e);
      toast.error(e?.message || "No se pudo procesar la operación. Inténtalo de nuevo.");
    } finally {
      setValidating(false);
    }
  };

  const handleRectificativaAnular = async () => {
    if (!rectMotivoAnular.trim()) return;
    setRectificando(true);
    try {
      const res = await appApi.functions.invoke('processVerifactu', {
        intervention_id: id,
        mode: 'rectificar',
        original_invoice_id: invoice.id,
        rectificativa_motivo: rectMotivoAnular,
      });
      setRectResult(res.data);
      await appApi.entities.Intervention.update(id, { status: 'anulado' });
      await appApi.entities.AuditLog.create({
        action: 'modificacion',
        entity_type: 'Intervention',
        entity_id: id,
        entity_reference: intervention.number,
        user_email: user.email,
        user_name: user.full_name,
        changes_summary: 'Parte anulado - Rectificativa generada: ' + res.data.invoice_number,
        timestamp: new Date().toISOString(),
      });
      await loadData();
    } catch (e) {
      toast.error("No se pudo anular la factura. Inténtalo de nuevo.");
    }
    setRectificando(false);
  };

  const handleReopenParte = async () => {
    if (!rectMotivoAnular.trim()) return;
    setRectificando(true);
    try {
      await appApi.entities.Intervention.update(id, {
        status: 'pendiente_revision',
        is_locked: false,
        rectified_by_info: `${user?.full_name || user?.email || "Sistema"} · ${rectMotivoAnular} · Reapertura sin rectificativa fiscal`,
      });
      await appApi.entities.AuditLog.create({
        action: 'modificacion',
        entity_type: 'Intervention',
        entity_id: id,
        entity_reference: intervention.number,
        user_email: user.email,
        user_name: user.full_name,
        changes_summary: `Parte reabierto sin rectificativa fiscal: ${rectMotivoAnular}`,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      setRectResult({ reopen: true });
      await loadData();
    } catch (e) {
      console.error("[handleReopenParte]", e);
      toast.error(e?.message || "No se pudo reabrir el parte.");
    } finally {
      setRectificando(false);
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const canEdit = isAdmin || isOficina;
  const isFieldStaff = ["tecnico", "ayudante", "user"].includes(user?.role);
  const tramosOrg = ensureTramoIds(parseTramosJson(user?.desplazamiento_tramos_json));

  const applyDisplacementReview = async () => {
    if (!intervention || isLocked) return;
    const cant = Math.max(0, parseInt(String(depCantidad), 10) || 0);
    const linesRaw = intervention.materials_json ? JSON.parse(intervention.materials_json) : [];
    let nextLines = Array.isArray(linesRaw) ? linesRaw : [];
    const tramo = depTramoId ? findTramoById(tramosOrg, depTramoId) : null;

    if (cant === 0) {
      nextLines = stripDisplacementLines(nextLines);
      const totals = computeTotalsFromLines(nextLines, intervention.discount_percent || 0);
      setDepSaving(true);
      await appApi.entities.Intervention.update(intervention.id, {
        materials_json: JSON.stringify(nextLines),
        subtotal: totals.subtotal,
        iva_total: totals.ivaTotal,
        total: totals.total,
        desplazamientos_cantidad: 0,
        desplazamiento_tramo_id: undefined,
        desplazamiento_tramo_nombre: undefined,
        desplazamiento_precio_unitario: undefined,
        desplazamiento_total: undefined,
        desplazamiento_pendiente_tarifa: false,
      });
      setDepSaving(false);
      await loadData();
      return;
    }

    if (!tramo) {
      toast.error("Selecciona un tramo de desplazamiento.");
      return;
    }

    nextLines = upsertDisplacementMaterialLine(nextLines, { cantidad: cant, tramo });
    const totals = computeTotalsFromLines(nextLines, intervention.discount_percent || 0);
    setDepSaving(true);
    await appApi.entities.Intervention.update(intervention.id, {
      materials_json: JSON.stringify(nextLines),
      subtotal: totals.subtotal,
      iva_total: totals.ivaTotal,
      total: totals.total,
      desplazamientos_cantidad: cant,
      desplazamiento_tramo_id: tramo.id,
      desplazamiento_tramo_nombre: tramo.nombre,
      desplazamiento_precio_unitario: tramo.precio,
      desplazamiento_total: cant * tramo.precio,
      desplazamiento_pendiente_tarifa: false,
    });
    setDepSaving(false);
    await loadData();
  };
  const invoiceAceptada = invoice?.verifactu_status === 'aceptado';
  const isAnulado = intervention?.status === 'anulado';
  const isLocked = intervention?.status === "facturado" || intervention?.status === "completado" || invoiceAceptada || isAnulado;

  if (loading || !intervention) {
    return (
      <div className="p-4 lg:p-8 max-w-3xl mx-auto flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  const materials = intervention.materials_json ? JSON.parse(intervention.materials_json) : [];

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">

      {/* Modal Factura Rectificativa */}
      <Dialog open={showRectModal} onOpenChange={v => { if (!rectificando) { setShowRectModal(v); if (!v) { setRectMode(null); setRectResult(null); } } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-amber-600" /> Factura Rectificativa</DialogTitle>
          </DialogHeader>
          {rectResult ? (
            <div className="space-y-4">
              {rectResult.reopen ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="font-semibold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Parte reabierto</p>
                  <p className="text-xs text-emerald-600 mt-1">El parte vuelve a estado "Pendiente Revisión" y puede editarse y validarse de nuevo.</p>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="font-semibold text-emerald-700 flex items-center gap-2"><Receipt className="h-4 w-4" /> Rectificativa generada</p>
                    <p className="text-sm text-emerald-700 mt-1">Nº {rectResult.invoice_number}</p>
                    <p className="text-xs text-emerald-600 mt-1">Rectifica: {invoice?.invoice_number}</p>
                  </div>
                  <div className="text-xs font-mono bg-muted/50 p-3 rounded-xl space-y-1">
                    <p className="text-muted-foreground">Hash SHA-256:</p>
                    <p className="break-all">{rectResult.hash?.slice(0, 32)}...</p>
                    <p className="text-muted-foreground mt-2">Estado Veri*factu: <span className="font-semibold">{rectResult.verifactu_status}</span></p>
                  </div>
                </>
              )}
              <Button onClick={() => { setShowRectModal(false); setRectResult(null); setRectMode(null); setRectMotivoAnular(""); }} className="w-full rounded-xl">Cerrar</Button>
            </div>
          ) : rectMode === 'reabrir' ? (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
                <p className="text-xs font-semibold text-teal-800">Parte validado sin factura: {intervention.number}</p>
                <p className="text-xs text-teal-700 mt-1">El parte se reabrirá a "Pendiente Revisión" sin generar ningún registro fiscal en AEAT.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Motivo de reapertura *</label>
                <textarea
                  value={rectMotivoAnular}
                  onChange={e => setRectMotivoAnular(e.target.value)}
                  placeholder="Ej: Error en datos del cliente, importe incorrecto..."
                  rows={2}
                  className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <Button
                onClick={handleReopenParte}
                disabled={rectificando || !rectMotivoAnular.trim()}
                className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white gap-2"
              >
                {rectificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reabrir Parte
              </Button>
              <Button variant="outline" onClick={() => setRectMode(null)} disabled={rectificando} className="w-full rounded-xl">Volver</Button>
            </div>
          ) : rectMode === 'corregir' ? (
            <RectificativaForm
              invoice={invoice}
              intervention={intervention}
              onComplete={(result) => {
                setRectResult(result);
                loadData();
              }}
              onCancel={() => setRectMode(null)}
            />
          ) : !invoice ? (
            // Parte completado sin factura → solo reapertura
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
                <p className="text-xs font-semibold text-teal-800">Parte archivado sin factura</p>
                <p className="text-xs text-teal-700 mt-1">No existe registro fiscal que rectificar. Se reabrirá el parte para que puedas editarlo y validarlo de nuevo.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Motivo de reapertura *</label>
                <textarea
                  value={rectMotivoAnular}
                  onChange={e => setRectMotivoAnular(e.target.value)}
                  placeholder="Ej: Error en datos del cliente, importe incorrecto..."
                  rows={2}
                  className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <Button
                onClick={handleReopenParte}
                disabled={rectificando || !rectMotivoAnular.trim()}
                className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white gap-2"
              >
                {rectificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reabrir Parte
              </Button>
              <Button variant="outline" onClick={() => setShowRectModal(false)} disabled={rectificando} className="w-full rounded-xl">Cancelar</Button>
            </div>
          ) : (
            // Parte facturado con Verifactu → anular o corregir
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-semibold text-amber-800">Factura original: {invoice?.invoice_number}</p>
                <p className="text-xs text-amber-700 mt-1">Elige cómo deseas proceder con esta factura.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Motivo de anulación *</label>
                  <textarea
                    value={rectMotivoAnular}
                    onChange={e => setRectMotivoAnular(e.target.value)}
                    placeholder="Ej: Error en facturación, duplicado, datos incorrectos..."
                    rows={2}
                    className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <button
                  onClick={handleRectificativaAnular}
                  disabled={rectificando || !rectMotivoAnular.trim()}
                  className="p-4 border-2 border-red-200 hover:border-red-400 rounded-xl text-left transition-all hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <p className="font-semibold flex items-center gap-2 text-red-700"><RotateCcw className="h-5 w-5" /> Anular esta factura</p>
                  <p className="text-xs text-red-600 mt-1">Genera una factura rectificativa R1 en negativo con todos los valores invertidos y la envía automáticamente a AEAT.</p>
                </button>
                <button
                  onClick={() => setRectMode('corregir')}
                  disabled={rectificando}
                  className="p-4 border-2 border-blue-200 hover:border-blue-400 rounded-xl text-left transition-all hover:bg-blue-50"
                >
                  <p className="font-semibold flex items-center gap-2 text-blue-700"><Receipt className="h-5 w-5" /> Corregir y refacturar</p>
                  <p className="text-xs text-blue-600 mt-1">Abre un formulario para editar los datos (importe, descripción, etc) y genera la R1 con los valores corregidos.</p>
                </button>
              </div>
              {rectificando && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-red-600" />
                  <span className="text-sm text-muted-foreground">Anulando...</span>
                </div>
              )}
              <Button variant="outline" onClick={() => setShowRectModal(false)} disabled={rectificando} className="w-full rounded-xl">Cancelar</Button>
            </div>
          )
              }
              </DialogContent>
              </Dialog>

      {/* Validate Modal */}
      <Dialog open={showValidateModal} onOpenChange={v => { if (!validating) { setShowValidateModal(v); setValidateResult(null); setConfirmingFacturar(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Validar Parte</DialogTitle>
          </DialogHeader>
          {confirmingFacturar ? (
            <div className="space-y-4 mt-2">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <p className="font-semibold text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" /> Confirmar facturación fiscal
                </p>
                <p className="text-sm text-amber-700">
                  Esta acción es <strong>fiscalmente vinculante</strong>. Se generará un registro en la AEAT mediante Veri*Factu y el parte quedará <strong>bloqueado permanentemente</strong>.
                </p>
                <p className="text-xs text-amber-600">Cliente: {intervention.client_name} · Total: {(intervention.total || 0).toFixed(2)} €</p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => executeValidation('facturar')}
                  disabled={validating}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                  Confirmar y Facturar
                </Button>
                <Button variant="outline" onClick={() => setConfirmingFacturar(false)} disabled={validating} className="flex-1 rounded-xl">
                  Volver
                </Button>
              </div>
            </div>
          ) : !validateResult ? (
            <div className="space-y-4 mt-2">
              {/* Revisión de tarifa MO antes de facturar */}
              {intervention.tipo_horario && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-blue-800">Revisar Mano de Obra</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Tipo de Horario</label>
                      <select
                        value={adminTipoHorario || intervention.tipo_horario || 'normal'}
                        onChange={e => setAdminTipoHorario(e.target.value)}
                        className="mt-1 w-full flex h-9 rounded-xl border border-input bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="normal">Normal</option>
                        <option value="extra">Extra</option>
                        <option value="nocturno">Nocturno</option>
                        <option value="festivo">Festivo</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tarifa €/h (editable)</label>
                      <input
                        type="number" step="0.5"
                        placeholder={String(intervention.tarifa_aplicada || '')}
                        value={adminTarifaOverride}
                        onChange={e => setAdminTarifaOverride(e.target.value)}
                        className="mt-1 w-full flex h-9 rounded-xl border border-input bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                </div>
              )}

              {intervention?.desplazamiento_pendiente_tarifa && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-xs leading-snug">
                    <strong>Tramo de desplazamiento sin tarifa.</strong> Asigna el tramo en la sección de desplazamiento antes de poder facturar.
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">Selecciona cómo deseas cerrar este parte:</p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => handleValidateOption('facturar')}
                  disabled={validating || !!intervention?.desplazamiento_pendiente_tarifa}
                  className="p-4 border-2 border-accent bg-accent/5 hover:bg-accent/10 rounded-xl text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent/5"
                >
                  <p className="font-semibold flex items-center gap-2"><Receipt className="h-5 w-5 text-accent" /> Facturar con Veri*factu</p>
                  <p className="text-xs text-muted-foreground mt-1">Genera factura con hash encadenado, envía a la AEAT y bloquea el parte. Cumple Ley Antifraude.</p>
                </button>
                <button
                  onClick={() => handleValidateOption('guardar')}
                  disabled={validating}
                  className="p-4 border-2 border-border hover:border-muted-foreground rounded-xl text-left transition-all hover:bg-muted/50"
                >
                  <p className="font-semibold flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-5 w-5" /> Validar sin factura</p>
                  <p className="text-xs text-muted-foreground mt-1">Para garantías, mantenimientos incluidos en cuota o partes internos. Se archiva sin registro fiscal y genera un albarán PDF.</p>
                </button>
              </div>
              {validating && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                  <span className="text-sm text-muted-foreground">Procesando...</span>
                </div>
              )}
              <Button variant="outline" onClick={() => { setShowValidateModal(false); setValidateResult(null); }} disabled={validating} className="w-full rounded-xl">Cancelar</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {validateResult.mode === 'facturar' ? (
                <div className="space-y-3">
                  {(() => {
                    const vs = validateResult.verifactu_status;
                    const isOk = vs === 'aceptado' || vs === 'sandbox_ok' || vs === 'validado_sandbox';
                    const vInfo = getVerifactuLabel(vs);
                    return (
                      <>
                        <div className={`p-4 border rounded-xl ${isOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                          <p className={`font-semibold flex items-center gap-2 ${isOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                            <Receipt className="h-4 w-4" />
                            {isOk ? 'Factura generada y remitida correctamente a AEAT' : 'Factura generada, pendiente de aceptación AEAT'}
                          </p>
                          <p className="text-sm mt-1 font-medium">Nº {validateResult.invoice_number}</p>
                        </div>
                        <div className="text-xs space-y-1.5 bg-muted/50 p-3 rounded-xl">
                          <p><span className="text-muted-foreground">Hash SHA-256: </span><span className="font-mono">{validateResult.hash?.slice(0, 32)}...</span></p>
                          <p><span className="text-muted-foreground">Estado Veri*factu: </span><span className={`font-semibold ${vInfo.color}`}>{vInfo.label}</span></p>
                          {validateResult.verifactu_csv && <p><span className="text-muted-foreground">CSV AEAT: </span><span className="font-mono">{validateResult.verifactu_csv}</span></p>}
                        </div>
                        {!isOk && (validateResult.codigo_error_aeat || validateResult.descripcion_error_aeat) && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                            <p className="text-xs font-semibold text-red-800">Diagnóstico Veri*factu</p>
                            {validateResult.codigo_error_aeat && <p className="text-xs text-red-700"><span className="font-medium">Código: </span>{validateResult.codigo_error_aeat}</p>}
                            {validateResult.descripcion_error_aeat && <p className="text-xs text-red-700"><span className="font-medium">Detalle: </span>{validateResult.descripcion_error_aeat}</p>}
                            <p className="text-xs text-red-600 mt-1">La factura queda bloqueada y se reintentará el envío automáticamente.</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">⚠️ Este parte queda bloqueado y no puede editarse ni eliminarse.</p>
                      </>
                    );
                  })()}
                  <Button onClick={() => { setShowValidateModal(false); setValidateResult(null); }} className="w-full rounded-xl">Cerrar</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="font-semibold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Parte guardado correctamente</p>
                    <p className="text-xs text-emerald-600 mt-1">El parte ha sido archivado sin registro fiscal.</p>
                  </div>
                  <Button onClick={() => { setShowValidateModal(false); setValidateResult(null); }} className="w-full rounded-xl">Cerrar</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        icon={null}
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setShowDeleteConfirm(false);
        }}
        title="Eliminar parte"
        description={
          <>
            Vas a eliminar el parte <strong>{intervention?.number}</strong>.
          </>
        }
        note="Esta acción no se puede deshacer, pero quedará registrada en el log de auditoría."
        confirmText="Eliminar parte"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton label="Partes" to="/interventions" />
          <div>
            <p className="text-sm text-muted-foreground">{intervention.number}</p>
            <h1 className="text-xl font-bold">{intervention.client_name}</h1>
            {intervention.machine_name && (
              <p className="text-sm text-muted-foreground">Máquina: {intervention.machine_name}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge className={cn("text-xs", statusColors[intervention.status])}>
            {statusLabels[intervention.status]}
          </Badge>
          {intervention.status === 'facturado' && invoice && (() => {
            const rectList = invoice.factura_rectificada_id || false;
            return rectList ? <Badge className="text-xs bg-amber-100 text-amber-700">Rectificada</Badge> : null;
          })()}
        </div>
      </div>

      {/* Admin/Oficina Actions */}
      {canEdit && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Acciones</h2>

          {/* Grupo 1: Estado y validación */}
          <div className="flex flex-wrap gap-3">
            {!isLocked ? (
            <Select value={intervention.status} onValueChange={updateStatus}>
              <SelectTrigger className="w-48 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en_curso">En Curso</SelectItem>
                <SelectItem value="pendiente_revision">Pendiente Revisión</SelectItem>
                <SelectItem value="validado">Validado</SelectItem>
              </SelectContent>
            </Select>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 bg-muted/50 rounded-xl">
                <Lock className="h-3.5 w-3.5" /> Estado: {statusLabels[intervention.status]}
              </div>
            )}
            {intervention.status === "pendiente_revision" && (
              <Button onClick={() => setShowValidateModal(true)} className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle2 className="h-4 w-4" /> Validar Parte
              </Button>
            )}
            {intervention.status === "validado" && !invoice && (
              <Button onClick={() => setShowValidateModal(true)} className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Receipt className="h-4 w-4" /> Facturar ahora
              </Button>
            )}
            {isLocked && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 bg-muted/50 rounded-xl">
                <Lock className="h-3.5 w-3.5" /> Parte bloqueado (inalterable)
              </div>
            )}
          </div>

          {/* Grupo 2: Documento */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
            <Button variant="outline" onClick={generatePDF} disabled={generatingPdf} className="rounded-xl">
              {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Generar PDF
            </Button>
            <Button variant="outline" onClick={sendEmail} disabled={sendingEmail || intervention.email_sent} className="rounded-xl">
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              {intervention.email_sent ? <><Check className="h-4 w-4 mr-1 text-emerald-600" />Email enviado</> : "Enviar Email"}
            </Button>
            {(invoiceAceptada || intervention?.status === 'facturado') && invoice && (
              <Button variant="outline" onClick={() => { setShowRectModal(true); setRectMode(null); setRectMotivoAnular(""); }} className="rounded-xl gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                <RotateCcw className="h-4 w-4" /> Rectificativa
              </Button>
            )}
            {intervention?.status === 'completado' && !invoice && (
              <Button variant="outline" onClick={() => { setShowRectModal(true); setRectMode(null); setRectMotivoAnular(""); }} className="rounded-xl gap-2 border-teal-300 text-teal-700 hover:bg-teal-50">
                <RotateCcw className="h-4 w-4" /> Reabrir Parte
              </Button>
            )}
          </div>

          {intervention.validated_by && (
            <p className="text-xs text-muted-foreground">✓ Validado por {intervention.validated_by} el {intervention.validated_at ? new Date(intervention.validated_at).toLocaleString("es") : ""}</p>
          )}
          {intervention.rectified_by_info && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-2"><RotateCcw className="h-3.5 w-3.5" /> Registro de Rectificación</p>
              <p className="text-xs text-amber-800 mt-1">{intervention.rectified_by_info}</p>
            </div>
          )}

          {/* Grupo 3: Edición/destrucción */}
          {!isLocked && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => navigate(`/interventions/${id}/edit`)} className="rounded-xl gap-2">
                <Pencil className="h-4 w-4" /> Editar Parte
              </Button>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(true)} className="rounded-xl gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" /> Eliminar Parte
              </Button>
            </div>
          )}
        </div>
      )}

      {intervention.desplazamiento_pendiente_tarifa &&
        (intervention.desplazamientos_cantidad ?? 0) > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Pendiente asignar tramo de desplazamiento ({intervention.desplazamientos_cantidad}{" "}
            desplazamiento{(intervention.desplazamientos_cantidad || 0) === 1 ? "" : "s"}).
          </div>
        )}

      {canEdit && !isLocked && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Desplazamiento (revisión)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <Label className="text-xs">Número de desplazamientos</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={depCantidad}
                onChange={(e) => setDepCantidad(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="mt-1 rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Tramo</Label>
              <Select value={depTramoId || "__none__"} onValueChange={(v) => setDepTramoId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue placeholder="Seleccionar tramo…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin tramo —</SelectItem>
                  {tramosOrg.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre} · {t.precio.toFixed(2)} €
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!tramosOrg.length && (
                <p className="text-xs text-muted-foreground mt-1">
                  Configura tramos en Configuración → Tarifas.
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            onClick={applyDisplacementReview}
            disabled={depSaving}
            className="rounded-xl"
          >
            {depSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Recalcular totales
          </Button>
        </div>
      )}

      {/* Info */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{moment(intervention.date).format("DD MMM YYYY · HH:mm")}</span>
        </div>
        {intervention.location_address && (
          <div className="flex items-center gap-2 text-sm">
            <MapLink
              address={intervention.location_address}
              lat={intervention.location_lat}
              lng={intervention.location_lng}
            />
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>Operario 1: <strong>{intervention.technician_name}</strong></span>
        </div>
        {intervention.helper_name && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Operario 2: <strong>{intervention.helper_name}</strong></span>
          </div>
        )}
      </div>

      {/* Gas */}
      {intervention.gas_type && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Flame className="h-4 w-4" /> Gas Refrigerante
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Tipo</p>
              <p className="font-semibold">{intervention.gas_type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cargados</p>
              <p className="font-semibold">{intervention.gas_loaded_kg} kg</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recuperados</p>
              <p className="font-semibold">{intervention.gas_recovered_kg} kg</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fuga</p>
              <p className="font-semibold text-destructive">{intervention.gas_leak_kg} kg</p>
            </div>
          </div>
          {intervention.gas_media?.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground font-medium">
                Evidencias de la carga (pesajes / fuga)
              </p>
              <GasMediaGallery media={intervention.gas_media} />
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {(intervention.description || intervention.technician_notes) && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          {intervention.description && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Descripción</p>
              <p className="text-sm mt-1">{intervention.description}</p>
            </div>
          )}
          {intervention.technician_notes && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Notas Técnicas</p>
              <p className="text-sm mt-1">{intervention.technician_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Materials */}
      {materials.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Package className="h-4 w-4" /> Materiales
          </h2>
          <div className="space-y-2">
            {materials.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{m.material_name || "Material"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isFieldStaff ? (
                      <>
                        {m.quantity} {m.unit || "ud"}
                        {m.observation && ` — ${m.observation}`}
                      </>
                    ) : (
                      <>
                        {m.quantity} {m.unit || "ud"} × {(m.unit_price || 0).toFixed(2)}€
                        {m.observation && ` — ${m.observation}`}
                      </>
                    )}
                  </p>
                </div>
                <p className="font-semibold text-sm">
                  {isFieldStaff ? "" : `${(m.total || 0).toFixed(2)} €`}
                </p>
              </div>
            ))}
          </div>
          {!isFieldStaff && (
          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{(intervention.subtotal || 0).toFixed(2)} €</span>
            </div>
            {intervention.discount_percent > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Descuento ({intervention.discount_percent}%)</span>
                <span>-{(intervention.subtotal * intervention.discount_percent / 100).toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IVA</span>
              <span>{(intervention.iva_total || 0).toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
              <span>Total</span>
              <span>{(intervention.total || 0).toFixed(2)} €</span>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Historial de Visitas */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Historial de Visitas ({visits.length + 1})
          </h2>
          <Link to={`/interventions/${id}/new-visit`}>
            <Button size="sm" variant="outline" className="rounded-xl gap-1">
              <Plus className="h-3 w-3" /> Nueva Visita
            </Button>
          </Link>
        </div>

        {/* Initial visit */}
        <div className="border border-border rounded-xl p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Visita 1 · {moment(intervention.date).format("DD/MM/YY HH:mm")}</span>
            <span className="text-xs text-muted-foreground">{intervention.technician_name}</span>
          </div>
          {intervention.description && <p className="text-sm">{intervention.description}</p>}
          {intervention.gas_loaded_kg > 0 && <p className="text-xs text-muted-foreground">Gas: {intervention.gas_type} · {intervention.gas_loaded_kg} kg cargados</p>}
        </div>

        {/* Additional visits */}
        {visits.map((v) => (
          <div key={v.id} className="border border-border rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Visita {v.visit_number + 1} · {moment(v.date).format("DD/MM/YY HH:mm")}</span>
              <span className="text-xs text-muted-foreground">{v.technician_name}</span>
            </div>
            {v.description && <p className="text-sm">{v.description}</p>}
            {v.gas_loaded_kg > 0 && <p className="text-xs text-muted-foreground">Gas: {v.gas_type} · {v.gas_loaded_kg} kg cargados</p>}
            {isAdmin && v.total > 0 && <p className="text-xs font-semibold">Total: {v.total.toFixed(2)} €</p>}
          </div>
        ))}

        {/* Incident status badge */}
        {intervention.incident_status && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
            intervention.incident_status === "finalizado" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
            intervention.incident_status === "pendiente_parada" ? "bg-red-50 text-red-700 border border-red-200" :
            "bg-amber-50 text-amber-700 border border-amber-200"
          }`}>
            <AlertTriangle className="h-4 w-4" />
            {intervention.incident_status === "finalizado" ? "Finalizado (Revisar y Facturar)" :
             intervention.incident_status === "pendiente_parada" ? "Pendiente (Máquina Parada)" :
             "Pendiente (Máquina Operativa)"}
          </div>
        )}
      </div>

      {/* Diagnóstico Veri*factu */}
      {invoice && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Factura · Diagnóstico Veri*factu
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nº Factura</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado</span>
              <span className={`font-semibold ${getVerifactuLabel(invoice.verifactu_status).color}`}>
                {getVerifactuLabel(invoice.verifactu_status).label}
              </span>
            </div>
            {invoice.verifactu_csv && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CSV AEAT</span>
                <span className="font-mono text-xs">{invoice.verifactu_csv}</span>
              </div>
            )}
            {invoice.verifactu_idregistro && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID Registro</span>
                <span className="font-mono text-xs">{invoice.verifactu_idregistro}</span>
              </div>
            )}
            {invoice.verifactu_timestamp && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recepción AEAT</span>
                <span className="text-xs">{invoice.verifactu_timestamp}</span>
              </div>
            )}
            {invoice.codigo_error_aeat && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl mt-2 space-y-1">
                <p className="text-xs font-semibold text-red-800">Error Veri*factu</p>
                <p className="text-xs text-red-700"><span className="font-medium">Código: </span>{invoice.codigo_error_aeat}</p>
                {invoice.descripcion_error_aeat && <p className="text-xs text-red-700"><span className="font-medium">Detalle: </span>{invoice.descripcion_error_aeat}</p>}
              </div>
            )}
            {invoice.verifactu_http_status > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">HTTP Status</span>
                <span className="font-mono text-xs">{invoice.verifactu_http_status}</span>
              </div>
            )}
            {invoice.verifactu_diagnostico && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diagnóstico</span>
                <span className="font-mono text-xs text-amber-700">{invoice.verifactu_diagnostico}</span>
              </div>
            )}
            {invoice.verifactu_response && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver respuesta completa AEAT ({invoice.verifactu_response?.length} chars)</summary>
                <pre className="mt-2 text-xs bg-muted/60 p-2 rounded-lg overflow-auto max-h-60 whitespace-pre-wrap break-all">{invoice.verifactu_response}</pre>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Conformidad / Receptor */}
      {(intervention.receptor_name || intervention.client_conformidad) && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conformidad del Cliente</h2>
          <div className="space-y-2 text-sm">
            {intervention.receptor_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre Receptor</span>
                <span className="font-medium">{intervention.receptor_name}</span>
              </div>
            )}
            {intervention.receptor_dni && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">DNI / Código</span>
                <span className="font-medium">{intervention.receptor_dni}</span>
              </div>
            )}
            {intervention.saved_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha/Hora Guardado</span>
                <span className="font-medium">{moment(intervention.saved_at).format("DD/MM/YYYY HH:mm:ss")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Conformidad</span>
              <span className={intervention.client_conformidad ? "text-emerald-600 font-semibold" : "text-amber-600"}>
                {intervention.client_conformidad ? "✓ Confirmada" : "Pendiente"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

