import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Mail, Clock, MapPin, Flame, User, Loader2, Package, CheckCircle2, Pencil, Trash2 } from "lucide-react";
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

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    const [me, items] = await Promise.all([
      base44.auth.me(),
      base44.entities.Intervention.filter({ id }, "-created_date", 1),
    ]);
    setUser(me);
    if (items.length > 0) setIntervention(items[0]);
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
    let materialsTable = "";
    const materials = intervention.materials_json ? JSON.parse(intervention.materials_json) : [];
    if (materials.length > 0) {
      materialsTable = materials.map((m, i) =>
        `${i + 1}. ${m.material_name || "Material"} | Cant: ${m.quantity} ${m.unit || "ud"} | ${(m.unit_price || 0).toFixed(2)}€ | Total: ${(m.total || 0).toFixed(2)}€${m.observation ? ` | Obs: ${m.observation}` : ""}`
      ).join("\n");
    }

    const prompt = `Generate a professional work order / invoice document in HTML format for FRITECMA (refrigeration technical services company).
    
Details:
- Document Number: ${intervention.number}
- Date: ${moment(intervention.date).format("DD/MM/YYYY HH:mm")}
- Client: ${intervention.client_name}
- Technician: ${intervention.technician_name}
- Location: ${intervention.location_address || "N/A"}
- Gas Type: ${intervention.gas_type || "N/A"}
- Gas Loaded: ${intervention.gas_loaded_kg || 0} kg
- Gas Recovered: ${intervention.gas_recovered_kg || 0} kg
- Gas Leak: ${intervention.gas_leak_kg || 0} kg
- Description: ${intervention.description || "N/A"}
- Technical Notes: ${intervention.technician_notes || "N/A"}
- Receptor Name: ${intervention.receptor_name || "N/A"}
- Receptor DNI: ${intervention.receptor_dni || "N/A"}
- Saved At: ${intervention.saved_at ? moment(intervention.saved_at).format("DD/MM/YYYY HH:mm:ss") : moment().format("DD/MM/YYYY HH:mm:ss")}
- Client Conformidad: ${intervention.client_conformidad ? "Confirmada" : "Pendiente"}

Generate clean, professional HTML with inline CSS. Include FRITECMA logo area, clean table layout, IVA breakdown. Instead of signature fields, include a validation section that shows: 'Validado por: [Receptor Name] con DNI: [Receptor DNI]' and the exact save date/time. The style should be corporate blue (#1e3a5f) and clean white. Format it as a printable A4 document.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt });
    
    const blob = new Blob([result], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
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

  const isAdmin = user?.role === "admin";
  const isOficina = user?.role === "oficina";
  const canEdit = isAdmin || isOficina;
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

  const validatePart = async () => {
    const now = new Date().toISOString();
    await base44.entities.Intervention.update(id, {
      status: "validado",
      validated_by: user.email,
      validated_at: now,
    });
    setIntervention(prev => ({ ...prev, status: "validado", validated_by: user.email, validated_at: now }));
    // Auto-send email on validation
    const clientRes = await base44.entities.Client.filter({ id: intervention.client_id }, "-created_date", 1);
    const clientEmail = clientRes[0]?.email;
    if (clientEmail) {
      setSendingEmail(true);
      try {
        await base44.integrations.Core.SendEmail({
          to: clientEmail,
          subject: `Parte Validado ${intervention.number} - FRITECMA`,
          body: `Estimado/a ${intervention.client_name},\n\nSu parte de trabajo ${intervention.number} ha sido validado.\n\nTotal: ${(intervention.total || 0).toFixed(2)} €\n\nGracias por confiar en FRITECMA.`,
        });
        await base44.entities.Intervention.update(id, { email_sent: true });
        setIntervention(prev => ({ ...prev, email_sent: true }));
      } catch (e) {
        console.warn("Email no enviado:", e.message);
      }
      setSendingEmail(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
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
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
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
              <Button onClick={validatePart} disabled={sendingEmail} className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle2 className="h-4 w-4" /> Validar Parte
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
          <div className="flex gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => navigate(`/interventions/${id}/edit`)} className="rounded-xl gap-2">
            <Pencil className="h-4 w-4" /> Editar Parte
          </Button>
          <Button variant="outline" onClick={() => setShowDeleteConfirm(true)} className="rounded-xl gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> Eliminar Parte
          </Button>
          </div>
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
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{intervention.location_address}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{intervention.technician_name}</span>
        </div>
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