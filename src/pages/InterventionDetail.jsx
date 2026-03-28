import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Mail, Clock, MapPin, Flame, User, Loader2, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";

const statusColors = {
  en_curso: "bg-blue-100 text-blue-700",
  pendiente_revision: "bg-amber-100 text-amber-700",
  completado: "bg-emerald-100 text-emerald-700",
  facturado: "bg-purple-100 text-purple-700",
};

const statusLabels = {
  en_curso: "En Curso",
  pendiente_revision: "Pendiente Revisión",
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

Materials:
${materialsTable || "No materials"}

Subtotal: ${(intervention.subtotal || 0).toFixed(2)}€
Discount: ${intervention.discount_percent || 0}%
IVA: ${(intervention.iva_total || 0).toFixed(2)}€
TOTAL: ${(intervention.total || 0).toFixed(2)}€

Generate clean, professional HTML with inline CSS. Include FRITECMA logo area, clean table layout, IVA breakdown, and signature areas. The style should be corporate blue (#1e3a5f) and clean white. Format it as a printable A4 document.`;

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
  const materials = intervention.materials_json ? JSON.parse(intervention.materials_json) : [];

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
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

      {/* Admin Actions */}
      {isAdmin && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Acciones</h2>
          <div className="flex flex-wrap gap-3">
            <Select value={intervention.status} onValueChange={updateStatus}>
              <SelectTrigger className="w-48 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en_curso">En Curso</SelectItem>
                <SelectItem value="pendiente_revision">Pendiente Revisión</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
                <SelectItem value="facturado">Facturado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={generatePDF} disabled={generatingPdf} className="rounded-xl">
              {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Generar PDF
            </Button>
            <Button variant="outline" onClick={sendEmail} disabled={sendingEmail || intervention.email_sent} className="rounded-xl">
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              {intervention.email_sent ? "Email Enviado ✓" : "Enviar Email"}
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

      {/* Signatures */}
      {(intervention.technician_signature || intervention.client_signature) && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Firmas</h2>
          <div className="grid grid-cols-2 gap-4">
            {intervention.technician_signature && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Técnico</p>
                <img src={intervention.technician_signature} alt="Firma técnico" className="h-24 border rounded-lg" />
              </div>
            )}
            {intervention.client_signature && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Cliente</p>
                <img src={intervention.client_signature} alt="Firma cliente" className="h-24 border rounded-lg" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}