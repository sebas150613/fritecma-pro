import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BackButton from "../components/BackButton";
import RectificativaForm from "../components/RectificativaForm";
import { ArrowLeft, FileText, Mail, Clock, MapPin, Flame, User, Loader2, Package, CheckCircle2, Pencil, Trash2, Plus, AlertTriangle, Wrench, Lock, Receipt, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import MapLink from "../components/MapLink";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import moment from "moment";

const statusColors = {
  en_curso: "bg-blue-100 text-blue-700",
  pendiente_revision: "bg-amber-100 text-amber-700",
  validado: "bg-emerald-100 text-emerald-700",
  completado: "bg-teal-100 text-teal-700",
  facturado: "bg-purple-100 text-purple-700",
};

const statusLabels = {
  en_curso: "En Curso",
  pendiente_revision: "Pendiente Revisión",
  validado: "Validado",
  completado: "Completado",
  facturado: "Facturado",
};



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
  const [showRectModal, setShowRectModal] = useState(false);
  const [rectMode, setRectMode] = useState(null); // null | 'anular' | 'corregir'
  const [rectificando, setRectificando] = useState(false);
  const [rectResult, setRectResult] = useState(null);
  const [adminTipoHorario, setAdminTipoHorario] = useState('');
  const [adminTarifaOverride, setAdminTarifaOverride] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    const [me, items, visitList, invoiceList] = await Promise.all([
      base44.auth.me(),
      base44.entities.Intervention.filter({ id }, "-created_date", 1),
      base44.entities.Visit.filter({ intervention_id: id }, "date", 50),
      base44.entities.Invoice.filter({ intervention_id: id }, "-created_date", 1),
    ]);
    setUser(me);
    if (items.length > 0) setIntervention(items[0]);
    setVisits(visitList);
    if (invoiceList.length > 0) setInvoice(invoiceList[0]);
    setLoading(false);
  };

  const updateStatus = async (status) => {
    await base44.entities.Intervention.update(id, { status });
    setIntervention(prev => ({ ...prev, status }));
  };

  const sendEmail = async () => {
    if (!intervention) return;
    setSendingEmail(true);
    try {
      const client = await base44.entities.Client.filter({ id: intervention.client_id }, "-created_date", 1);
      const clientEmail = client[0]?.email;
      if (clientEmail) {
        await base44.integrations.Core.SendEmail({
          to: clientEmail,
          subject: `Parte de Trabajo ${intervention.number} - FRITECMA`,
          body: `Estimado/a ${intervention.client_name},\n\nAdjunto le enviamos el parte de trabajo ${intervention.number}.\n\nTotal: ${(intervention.total || 0).toFixed(2)} €\n\nGracias por confiar en FRITECMA.\n\nUn saludo.`,
        });
        await base44.entities.Intervention.update(id, { email_sent: true });
        setIntervention(prev => ({ ...prev, email_sent: true }));
      } else {
        alert("El cliente no tiene email registrado.");
      }
    } catch (e) {
      alert(`No se pudo enviar el email: ${e.message || "El destinatario debe ser un usuario registrado en la app."}`);
    }
    setSendingEmail(false);
  };

  const generatePDF = async () => {
    setGeneratingPdf(true);

    // Cargar datos del cliente y del emisor
    const [clientList, allUserList] = await Promise.all([
      base44.entities.Client.filter({ id: intervention.client_id }, '-created_date', 1).catch(() => []),
      base44.entities.User.list('full_name', 100).catch(() => []),
    ]);
    const client = clientList[0] || {};
    const adminUser = allUserList.find(u => u.verifactu_nif) || {};

    // Datos del emisor (Fritecma)
    const emisorNif = adminUser.verifactu_nif || 'B00000000';
    const emisorNombre = adminUser.verifactu_nombre || 'FRITECMA S.L.';
    const emisorDireccion = adminUser.emisor_direccion || '';
    const emisorTelefono = adminUser.emisor_telefono || '';

    // Datos del cliente
    const clientNif = client.cif || invoice?.client_nif || '';
    const clientAddress = client.address ? `${client.address}${client.postal_code ? ', ' + client.postal_code : ''}${client.city ? ' ' + client.city : ''}` : '';

    const mats = intervention.materials_json ? JSON.parse(intervention.materials_json) : [];
    const materialsRows = mats.map((m, i) =>
      `<tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 4px">${i+1}. ${m.material_name || 'Material'}${m.observation ? '<br><span style="font-size:11px;color:#64748b">' + m.observation + '</span>' : ''}</td>
        <td style="padding:8px 4px;text-align:center">${m.quantity} ${m.unit || 'ud'}</td>
        <td style="padding:8px 4px;text-align:right">${(m.unit_price||0).toFixed(2)} €</td>
        <td style="padding:8px 4px;text-align:center">${m.iva_percent || 21}%</td>
        <td style="padding:8px 4px;text-align:right"><strong>${(m.total||0).toFixed(2)} €</strong></td>
      </tr>`
    ).join('');

    // Desglose IVA por tipo
    const ivaByRate = {};
    mats.forEach(m => {
      const rate = m.iva_percent || 21;
      const lineBase = (m.total || 0) * (1 - (intervention.discount_percent || 0) / 100);
      if (!ivaByRate[rate]) ivaByRate[rate] = { base: 0, cuota: 0 };
      ivaByRate[rate].base += lineBase;
      ivaByRate[rate].cuota += lineBase * (rate / 100);
    });
    const ivaRows = Object.entries(ivaByRate).sort(([a],[b]) => Number(a)-Number(b)).map(([rate, vals]) =>
      `<tr>
        <td style="padding:6px 8px;font-size:12px">IVA ${rate}%</td>
        <td style="padding:6px 8px;text-align:right;font-size:12px">${vals.base.toFixed(2)} €</td>
        <td style="padding:6px 8px;text-align:right;font-size:12px">${vals.cuota.toFixed(2)} €</td>
      </tr>`
    ).join('');

    // QR: siempre presente. En producción usa qr_url de la AEAT; en sandbox construye la URL de cotejo de pruebas.
    const AEAT_QR_BASE_SANDBOX = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';
    const qrTargetUrl = invoice?.qr_url || (() => {
      if (!invoice) return '';
      const fechaQR = invoice.issue_date?.slice(0,10).split('-').reverse().join('-') || '';
      const params = new URLSearchParams({
        nif: invoice.issuer_nif || '',
        numserie: invoice.invoice_number || '',
        fecha: fechaQR,
        importe: (invoice.total || 0).toFixed(2),
      });
      return `${AEAT_QR_BASE_SANDBOX}?${params.toString()}`;
    })();

    const isSandbox = invoice && !invoice.qr_url;

    const isSinEnvio = invoice?.verifactu_status === 'sin_envio';
    const verifactuBlock = invoice ? (
      isSinEnvio ? `
      <div style="padding:14px;border:2px solid #f59e0b;border-radius:8px;background:#fffbeb">
        <p style="font-size:11px;font-weight:700;color:#92400e;margin:0">⚠️ FACTURA GENERADA — ENVÍO MANUAL REQUERIDO</p>
        <p style="font-size:10px;color:#b45309;margin:4px 0 0">El XML de la factura es correcto y cumple la Ley Antifraude (hash SHA-256 encadenado). Sin embargo, el envío automático a la AEAT requiere autenticación mTLS que debe realizarse desde el portal de la AEAT o con software homologado.</p>
        <p style="font-size:10px;color:#b45309;margin:4px 0 0">Nº Factura: <strong>${invoice.invoice_number}</strong> · Hash: ${invoice.hash_huella?.slice(0,32)}...</p>
      </div>` :
      `${isSandbox ? `<div style="margin-bottom:10px;padding:10px 14px;border:1px solid #f59e0b;background:#fffbeb;border-radius:8px">
        <p style="font-size:11px;font-weight:700;color:#92400e;margin:0">⚠️ MODO SANDBOX — PRUEBAS AEAT (sin validez fiscal real)</p>
        <p style="font-size:10px;color:#b45309;margin:3px 0 0">Factura generada en entorno de pruebas. El QR apunta al cotejo de Sandbox de la AEAT.</p>
      </div>` : ''}
      <div style="padding:16px;border:2px solid #1e3a5f;border-radius:8px;display:flex;align-items:flex-start;gap:16px">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrTargetUrl)}" width="100" height="100" alt="QR AEAT" />
        <div>
          <p style="font-size:11px;font-weight:700;color:#1e3a5f;margin:0">FACTURA VERIFICABLE EN LA SEDE ELECTRÓNICA DE LA AEAT</p>
          <p style="font-size:10px;color:#475569;margin:4px 0 0">Verificable en www.agenciatributaria.es · ${isSandbox ? 'Entorno Sandbox' : 'Producción'}</p>
          <p style="font-size:10px;color:#475569;margin:4px 0 0">Nº Factura: ${invoice.invoice_number} · Fecha: ${moment(invoice.issue_date).format('DD/MM/YYYY')}</p>
          <p style="font-size:10px;color:#475569;margin:2px 0 0">Hash (SHA-256): ${invoice.hash_huella?.slice(0,32)}...</p>
          ${invoice.verifactu_csv ? `<p style="font-size:10px;color:#475569;margin:2px 0 0">CSV AEAT: ${invoice.verifactu_csv}</p>` : ''}
        </div>
      </div>`
    ) : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${invoice ? 'Factura' : 'Parte'} ${invoice ? invoice.invoice_number : intervention.number}</title>
<style>body{font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:24px} table{width:100%;border-collapse:collapse} @media print{body{padding:0}}</style>
</head><body>

<!-- CABECERA -->
<div style="background:#1e3a5f;color:white;padding:20px 24px;border-radius:8px;display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <h1 style="margin:0;font-size:22px">${emisorNombre}</h1>
  </div>
  <div style="text-align:right">
    <p style="margin:0;font-size:20px;font-weight:700">${invoice ? 'FACTURA' : 'PARTE DE TRABAJO'}</p>
    <p style="margin:4px 0 0;font-size:15px">${invoice ? invoice.invoice_number : intervention.number}</p>
    <p style="margin:4px 0 0;font-size:11px;opacity:.8">Fecha: ${moment(intervention.date).format('DD/MM/YYYY')}</p>
  </div>
</div>

<!-- EMISOR Y CLIENTE -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
  <div style="padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
    <p style="font-size:10px;color:#64748b;margin:0 0 6px;font-weight:700;text-transform:uppercase">Emisor</p>
    <p style="font-weight:700;margin:0;font-size:13px">${emisorNombre}</p>
    <p style="margin:2px 0 0;font-size:12px">NIF: ${emisorNif}</p>
    <p style="margin:2px 0 0;font-size:12px">${emisorDireccion}</p>
    <p style="margin:2px 0 0;font-size:12px">Tel: ${emisorTelefono}</p>
  </div>
  <div style="padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
    <p style="font-size:10px;color:#64748b;margin:0 0 6px;font-weight:700;text-transform:uppercase">Cliente / Destinatario</p>
    <p style="font-weight:700;margin:0;font-size:13px">${intervention.client_name}</p>
    ${clientNif ? `<p style="margin:2px 0 0;font-size:12px">NIF/CIF: ${clientNif}</p>` : ''}
    ${clientAddress ? `<p style="margin:2px 0 0;font-size:12px">${clientAddress}</p>` : ''}
    ${intervention.work_center_name ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b">Centro: ${intervention.work_center_name}</p>` : ''}
    ${client.email ? `<p style="margin:2px 0 0;font-size:12px">${client.email}</p>` : ''}
  </div>
</div>

<!-- DATOS PARTE -->
<div style="margin-top:14px;padding:12px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;display:flex;gap:24px;flex-wrap:wrap">
  <span style="font-size:12px">Nº Parte: <strong>${intervention.number}</strong></span>
  <span style="font-size:12px">Técnico: <strong>${intervention.technician_name}</strong></span>
  ${intervention.helper_name ? `<span style="font-size:12px">Ayudante: <strong>${intervention.helper_name}</strong></span>` : ''}
  <span style="font-size:12px">Fecha: <strong>${moment(intervention.date).format('DD/MM/YYYY HH:mm')}</strong></span>
</div>

${intervention.description ? `<div style="margin-top:14px;padding:14px;background:#f8fafc;border-radius:8px"><p style="font-size:10px;color:#64748b;margin:0 0 4px;text-transform:uppercase;font-weight:700">Descripción del Trabajo</p><p style="margin:0;font-size:13px">${intervention.description}</p></div>` : ''}

<!-- TABLA MATERIALES -->
${mats.length > 0 ? `<div style="margin-top:20px">
  <p style="font-size:10px;color:#64748b;margin:0 0 8px;text-transform:uppercase;font-weight:700">Materiales y Servicios</p>
  <table>
    <thead>
      <tr style="background:#1e3a5f;color:white">
        <th style="padding:8px;text-align:left">Descripción</th>
        <th style="padding:8px;text-align:center">Cant.</th>
        <th style="padding:8px;text-align:right">Precio Ud.</th>
        <th style="padding:8px;text-align:center">IVA</th>
        <th style="padding:8px;text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${materialsRows}</tbody>
  </table>

  <!-- DESGLOSE IVA -->
  <div style="display:flex;justify-content:flex-end;margin-top:16px">
    <div style="min-width:340px">
      <table style="width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b">Tipo IVA</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;color:#64748b">Base Imponible</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;color:#64748b">Cuota IVA</th>
        </tr></thead>
        <tbody>${ivaRows}</tbody>
      </table>
      <div style="margin-top:8px;text-align:right">
        <p style="margin:4px 0;font-size:12px">Base Imponible Total: <strong>${(intervention.subtotal||0).toFixed(2)} €</strong></p>
        ${(intervention.discount_percent||0)>0 ? `<p style="margin:4px 0;font-size:12px;color:#dc2626">Descuento (${intervention.discount_percent}%): <strong>-${(intervention.subtotal*intervention.discount_percent/100).toFixed(2)} €</strong></p>` : ''}
        <p style="margin:4px 0;font-size:12px">Total IVA: <strong>${(intervention.iva_total||0).toFixed(2)} €</strong></p>
        <p style="margin:8px 0 0;font-size:20px;color:#1e3a5f;font-weight:700;border-top:2px solid #1e3a5f;padding-top:6px">TOTAL: ${(intervention.total||0).toFixed(2)} €</p>
      </div>
    </div>
  </div>
</div>` : ''}

<!-- CONFORMIDAD -->
<div style="margin-top:20px;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
  <p style="font-size:10px;color:#64748b;margin:0 0 4px;text-transform:uppercase;font-weight:700">Conformidad del Cliente</p>
  <p style="margin:0;font-size:13px">Receptor: <strong>${intervention.receptor_name || '-'}</strong> &nbsp;·&nbsp; DNI: <strong>${intervention.receptor_dni || '-'}</strong></p>
  <p style="margin:4px 0 0;font-size:12px">Fecha/Hora: ${intervention.saved_at ? moment(intervention.saved_at).format('DD/MM/YYYY HH:mm:ss') : '-'} &nbsp;·&nbsp; Conformidad: <strong style="color:#16a34a">${intervention.client_conformidad ? '✓ Confirmada' : 'Pendiente'}</strong></p>
</div>

${verifactuBlock}
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) win.print();
    setGeneratingPdf(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!intervention) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Intervención no encontrada</p>
      </div>
    );
  }

  const isAdmin = user?.role === "admin" || user?.role === "superadmin" || user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const canEdit = isAdmin || isOficina;
  // PERMANENTE: parte facturado = bloqueado para siempre (Ley Antifraude)
  const invoiceAceptada = invoice?.verifactu_status === 'aceptado';
  const isLocked = intervention?.status === "facturado" || intervention?.status === "completado" || invoiceAceptada;

  const handleRectificativaAnular = async () => {
  setRectificando(true);
  try {
    const res = await base44.functions.invoke('processVerifactu', {
      intervention_id: id,
      mode: 'rectificar',
      original_invoice_id: invoice.id,
      rectificativa_motivo: 'Anulación completa de factura',
    });
    setRectResult(res.data);
    await loadData();
  } catch (e) {
    alert('Error al anular: ' + e.message);
  }
  setRectificando(false);
  };
  const materials = intervention.materials_json ? JSON.parse(intervention.materials_json) : [];

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.AuditLog.create({
      action: "eliminacion",
      entity_type: "Intervention",
      entity_id: id,
      entity_reference: intervention.number,
      user_email: user.email,
      user_name: user.full_name,
      changes_summary: `Parte eliminado: ${intervention.client_name} - ${intervention.number}`,
      timestamp: new Date().toISOString(),
    });
    await base44.entities.Intervention.delete(id);
    setDeleting(false);
    navigate("/interventions");
  };

  const handleValidateOption = async (mode) => {
    setValidating(true);
    try {
      const payload = { intervention_id: id, mode };
      if (mode === 'facturar') {
        if (adminTipoHorario) payload.tipo_horario_override = adminTipoHorario;
        if (adminTarifaOverride) payload.tarifa_override = parseFloat(adminTarifaOverride);
      }
      const res = await base44.functions.invoke('processVerifactu', payload);
      const data = res.data;
      setValidateResult(data);
      await loadData();
    } catch (e) {
      alert('Error al procesar: ' + e.message);
    }
    setValidating(false);
  };

  const handleRectificativa = async () => {
    if (!rectMotivo.trim()) return;
    setRectificando(true);
    try {
      const res = await base44.functions.invoke('processVerifactu', {
        intervention_id: id,
        mode: 'rectificar',
        original_invoice_id: invoice.id,
        rectificativa_motivo: rectMotivo,
      });
      setRectResult(res.data);
      await loadData();
    } catch (e) {
      alert('Error al rectificar: ' + e.message);
    }
    setRectificando(false);
  };

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
              <Button onClick={() => { setShowRectModal(false); setRectResult(null); setRectMode(null); }} className="w-full rounded-xl">Cerrar</Button>
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
          ) : (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-semibold text-amber-800">Factura original: {invoice?.invoice_number}</p>
                <p className="text-xs text-amber-700 mt-1">Elige cómo deseas proceder con esta factura.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleRectificativaAnular}
                  disabled={rectificando}
                  className="p-4 border-2 border-red-200 hover:border-red-400 rounded-xl text-left transition-all hover:bg-red-50"
                >
                  <p className="font-semibold flex items-center gap-2 text-red-700"><RotateCcw className="h-5 w-5" /> Anular completamente</p>
                  <p className="text-xs text-red-600 mt-1">Genera una factura rectificativa R1 en negativo con todos los valores invertidos y la envía automáticamente a AEAT.</p>
                </button>
                <button
                  onClick={() => setRectMode('corregir')}
                  disabled={rectificando}
                  className="p-4 border-2 border-blue-200 hover:border-blue-400 rounded-xl text-left transition-all hover:bg-blue-50"
                >
                  <p className="font-semibold flex items-center gap-2 text-blue-700"><Receipt className="h-5 w-5" /> Crear rectificativa editada</p>
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
              )}
              </DialogContent>
              </Dialog>

      {/* Validate Modal */}
      <Dialog open={showValidateModal} onOpenChange={v => { if (!validating) { setShowValidateModal(v); setValidateResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Validar Parte</DialogTitle>
          </DialogHeader>
          {validateResult ? (
            <div className="space-y-4">
              {validateResult.mode === 'facturar' ? (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="font-semibold text-emerald-700 flex items-center gap-2"><Receipt className="h-4 w-4" /> Factura generada</p>
                    <p className="text-sm text-emerald-700 mt-1">Nº {validateResult.invoice_number}</p>
                  </div>
                  <div className="text-xs space-y-1 font-mono bg-muted/50 p-3 rounded-xl">
                    <p className="text-muted-foreground">Hash SHA-256:</p>
                    <p className="break-all">{validateResult.hash?.slice(0, 32)}...</p>
                    <p className="text-muted-foreground mt-2">Estado Veri*factu: <span className="font-semibold">{validateResult.verifactu_status}</span></p>
                  </div>
                  <p className="text-xs text-muted-foreground">⚠️ Este parte queda bloqueado y no puede editarse ni eliminarse.</p>
                </div>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="font-semibold text-blue-700">✓ Parte guardado sin factura</p>
                  <p className="text-sm text-blue-600 mt-1">Archivado como completado.</p>
                </div>
              )}
              <Button onClick={() => { setShowValidateModal(false); setValidateResult(null); }} className="w-full rounded-xl">Cerrar</Button>
            </div>
          ) : !rectMode ? (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-semibold text-blue-800">Factura original: {invoice?.invoice_number}</p>
                <p className="text-xs text-blue-700 mt-1">Elige cómo deseas proceder con esta factura.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleRectificativaAnular}
                  disabled={rectificando}
                  className="p-4 border-2 border-red-200 hover:border-red-400 rounded-xl text-left transition-all hover:bg-red-50"
                >
                  <p className="font-semibold flex items-center gap-2 text-red-700"><RotateCcw className="h-5 w-5" /> Anular completamente</p>
                  <p className="text-xs text-red-600 mt-1">Genera una factura rectificativa R1 en negativo con todos los valores invertidos y la envía automáticamente a AEAT.</p>
                </button>
                <button
                  onClick={() => setRectMode('corregir')}
                  disabled={rectificando}
                  className="p-4 border-2 border-blue-200 hover:border-blue-400 rounded-xl text-left transition-all hover:bg-blue-50"
                >
                  <p className="font-semibold flex items-center gap-2 text-blue-700"><Receipt className="h-5 w-5" /> Crear rectificativa editada</p>
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
          ) : (
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

              <p className="text-sm text-muted-foreground">Selecciona cómo deseas cerrar este parte:</p>
              <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => handleValidateOption('guardar')}
                  disabled={validating}
                  className="p-4 border-2 border-border hover:border-primary rounded-xl text-left transition-all hover:bg-primary/5"
                >
                  <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-600" /> Guardar Parte (sin factura)</p>
                  <p className="text-xs text-muted-foreground mt-1">Para garantías, mantenimientos incluidos en cuota o partes internos. Se archiva sin registro fiscal.</p>
                </button>
                <button
                  onClick={() => handleValidateOption('facturar')}
                  disabled={validating}
                  className="p-4 border-2 border-border hover:border-accent rounded-xl text-left transition-all hover:bg-accent/5"
                >
                  <p className="font-semibold flex items-center gap-2"><Receipt className="h-5 w-5 text-accent" /> Facturar (Protocolo Veri*factu)</p>
                  <p className="text-xs text-muted-foreground mt-1">Genera factura con hash encadenado, envía a la AEAT y bloquea el parte. Cumple Ley Antifraude.</p>
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
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Eliminar Parte
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">¿Estás seguro de que quieres eliminar el parte <strong>{intervention?.number}</strong>? Esta acción no se puede deshacer pero quedará registrada en el log de auditoría.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="rounded-xl">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />} Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <p className="text-sm text-muted-foreground">{intervention.number}</p>
            <h1 className="text-xl font-bold">{intervention.client_name}</h1>
          </div>
        </div>
        <Badge className={cn("text-xs", statusColors[intervention.status])}>
          {statusLabels[intervention.status]}
        </Badge>
      </div>

      {/* Admin/Oficina Actions */}
      {canEdit && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Acciones</h2>
          <div className="flex flex-wrap gap-3">
            <Select value={intervention.status} onValueChange={updateStatus}>
              <SelectTrigger className="w-48 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en_curso">En Curso</SelectItem>
                <SelectItem value="pendiente_revision">Pendiente Revisión</SelectItem>
                <SelectItem value="validado">Validado</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
                <SelectItem value="facturado">Facturado</SelectItem>
              </SelectContent>
            </Select>

            {intervention.status === "pendiente_revision" && (
              <Button onClick={() => setShowValidateModal(true)} className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle2 className="h-4 w-4" /> Validar Parte
              </Button>
            )}
            {isLocked && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 bg-muted/50 rounded-xl">
                <Lock className="h-3.5 w-3.5" /> Parte bloqueado (inalterable)
              </div>
            )}

            {(invoiceAceptada || intervention?.status === 'facturado') && invoice && (
              <Button variant="outline" onClick={() => { setShowRectModal(true); setRectMode(null); }} className="rounded-xl gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                <RotateCcw className="h-4 w-4" /> Rectificativa
              </Button>
            )}
            <Button variant="outline" onClick={generatePDF} disabled={generatingPdf} className="rounded-xl">
              {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Generar PDF
            </Button>
            <Button variant="outline" onClick={sendEmail} disabled={sendingEmail || intervention.email_sent} className="rounded-xl">
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              {intervention.email_sent ? "Email Enviado ✓" : "Enviar Email"}
            </Button>
          </div>
          {intervention.validated_by && (
          <p className="text-xs text-muted-foreground">✓ Validado por {intervention.validated_by} el {intervention.validated_at ? new Date(intervention.validated_at).toLocaleString("es") : ""}</p>
          )}
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
                    {m.quantity} {m.unit || "ud"} × {(m.unit_price || 0).toFixed(2)}€
                    {m.observation && ` — ${m.observation}`}
                  </p>
                </div>
                <p className="font-semibold text-sm">{(m.total || 0).toFixed(2)} €</p>
              </div>
            ))}
          </div>
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