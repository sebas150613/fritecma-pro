import { useState, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { useAuth } from "@/lib/app-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings, Users, Shield, Trash2, Upload, Key, FileCheck, Loader2, Crown, Copy, Building2, Coins, Plus, ShoppingBag } from "lucide-react";
import OrganizationBillingPanel from "@/components/OrganizationBillingPanel";
import { parseTramosJson, ensureTramoIds } from "@/lib/displacementBilling";
import { toast } from "sonner";

const ROLE_LABELS = {
  superadmin: "Super Admin",
  admin: "Admin",
  oficina: "Oficina",
  ayudante: "Ayudante",
  tecnico: "Técnico",
};

export default function AppSettings() {
  const { logout } = useAuth();
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("tecnico");
  const [inviting, setInviting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [certFile, setCertFile] = useState(null);
  const [certPassword, setCertPassword] = useState("");
  const [emisorNif, setEmisorNif] = useState("");
  const [emisorNombre, setEmisorNombre] = useState("FRIGEST S.L.");
  const [emisorDireccion, setEmisorDireccion] = useState("");
  const [emisorTelefono, setEmisorTelefono] = useState("");
  const [emisorLogo, setEmisorLogo] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [savingCert, setSavingCert] = useState(false);
  const [certSaved, setCertSaved] = useState(false);
  const [certUri, setCertUri] = useState("");
  const [modoProduccion, setModoProduccion] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [copiedInviteUrl, setCopiedInviteUrl] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassConfigured, setSmtpPassConfigured] = useState(false);
  const [emailFrom, setEmailFrom] = useState("");
  const [emailFromName, setEmailFromName] = useState("");
  const [emailReplyTo, setEmailReplyTo] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smtpUsesEnvFallback, setSmtpUsesEnvFallback] = useState(false);
  const [smtpSecretsEncrypted, setSmtpSecretsEncrypted] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState("");
  const [ownerOrganizations, setOwnerOrganizations] = useState([]);
  const [editableUsers, setEditableUsers] = useState({});
  const [savingUserId, setSavingUserId] = useState("");
  const [userManagementError, setUserManagementError] = useState("");
  const [tarifa1Normal, setTarifa1Normal] = useState("");
  const [tarifa1Extra, setTarifa1Extra] = useState("");
  const [tarifa1Noct, setTarifa1Noct] = useState("");
  const [tarifa1Fest, setTarifa1Fest] = useState("");
  const [tarifaOaNormal, setTarifaOaNormal] = useState("");
  const [tarifaOaExtra, setTarifaOaExtra] = useState("");
  const [tarifaOaNoct, setTarifaOaNoct] = useState("");
  const [tarifaOaFest, setTarifaOaFest] = useState("");
  const [despTramos, setDespTramos] = useState([]);
  const [tarifasSaving, setTarifasSaving] = useState(false);
  const [tarifasMessage, setTarifasMessage] = useState("");
  const [pedidosEmailFrom, setPedidosEmailFrom] = useState("");
  const [pedidosEmailFromName, setPedidosEmailFromName] = useState("");
  const [pedidosReplyTo, setPedidosReplyTo] = useState("");
  const [pedidosEntregaDireccion, setPedidosEntregaDireccion] = useState("");
  const [pedidosEntregaContacto, setPedidosEntregaContacto] = useState("");
  const [pedidosEntregaTelefono, setPedidosEntregaTelefono] = useState("");
  const [pedidosEntregaObservaciones, setPedidosEntregaObservaciones] = useState("");
  const [pedidosSaving, setPedidosSaving] = useState(false);
  const [pedidosMessage, setPedidosMessage] = useState("");
  const [pedidosSmtpEnabled, setPedidosSmtpEnabled] = useState(false);
  const [pedidosSmtpHost, setPedidosSmtpHost] = useState("");
  const [pedidosSmtpPort, setPedidosSmtpPort] = useState("587");
  const [pedidosSmtpSecure, setPedidosSmtpSecure] = useState(false);
  const [pedidosSmtpUser, setPedidosSmtpUser] = useState("");
  const [pedidosSmtpPass, setPedidosSmtpPass] = useState("");
  const [pedidosSmtpTesting, setPedidosSmtpTesting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const me = await appApi.auth.me();
    setUser(me);
    setTarifa1Normal(me.tarifa_1_oficial_normal ?? "");
    setTarifa1Extra(me.tarifa_1_oficial_extra ?? "");
    setTarifa1Noct(me.tarifa_1_oficial_nocturna ?? "");
    setTarifa1Fest(me.tarifa_1_oficial_festiva ?? "");
    setTarifaOaNormal(me.tarifa_oficial_ayudante_normal ?? "");
    setTarifaOaExtra(me.tarifa_oficial_ayudante_extra ?? "");
    setTarifaOaNoct(me.tarifa_oficial_ayudante_nocturna ?? "");
    setTarifaOaFest(me.tarifa_oficial_ayudante_festiva ?? "");
    setDespTramos(ensureTramoIds(parseTramosJson(me.desplazamiento_tramos_json)));
    setPedidosEmailFrom(me.pedidos_email_from ?? "");
    setPedidosEmailFromName(me.pedidos_email_from_name ?? "");
    setPedidosReplyTo(me.pedidos_reply_to ?? "");
    setPedidosEntregaDireccion(me.pedidos_entrega_direccion ?? "");
    setPedidosEntregaContacto(me.pedidos_entrega_contacto ?? "");
    setPedidosEntregaTelefono(me.pedidos_entrega_telefono ?? "");
    setPedidosEntregaObservaciones(me.pedidos_entrega_observaciones ?? "");
    setPedidosSmtpEnabled(me.pedidos_smtp_enabled === true);
    setPedidosSmtpHost(me.pedidos_smtp_host ?? "");
    setPedidosSmtpPort(String(me.pedidos_smtp_port ?? "587"));
    setPedidosSmtpSecure(me.pedidos_smtp_secure === true);
    setPedidosSmtpUser(me.pedidos_smtp_user ?? "");
    setPedidosSmtpPass("");
    if (["admin", "superadmin"].includes(me.role) && me.is_hidden_owner !== true) {
      const allUsers = await appApi.entities.User.list("full_name", 100);
      setUsers(allUsers);
      setEditableUsers(
        Object.fromEntries(
          allUsers.map((item) => [
            item.id,
            {
              full_name: item.full_name || "",
              email: item.email || "",
              role: item.role || "tecnico",
              is_active: item.is_active !== false,
            },
          ])
        )
      );
    } else {
      setUsers([]);
      setEditableUsers({});
    }
    setEmisorNif(me.verifactu_nif || "");
    setEmisorNombre(me.verifactu_nombre || "FRIGEST S.L.");
    setEmisorDireccion(me.emisor_direccion || "");
    setEmisorTelefono(me.emisor_telefono || "");
    setEmisorLogo(me.emisor_logo_url || "");
    setCertUri(me.verifactu_cert_uri || "");
    setModoProduccion(me.verifactu_produccion === true);
    if (me.is_hidden_owner === true) {
      const [emailSettings, overview] = await Promise.all([
        appApi.email.getSettings(),
        appApi.organizations.ownerOverview(),
      ]);
      setSmtpHost(emailSettings?.smtp_host || "");
      setSmtpPort(String(emailSettings?.smtp_port || 587));
      setSmtpSecure(emailSettings?.smtp_secure === true);
      setSmtpUser(emailSettings?.smtp_user || "");
      setSmtpPass("");
      setSmtpPassConfigured(emailSettings?.smtp_pass_configured === true);
      setEmailFrom(emailSettings?.email_from || "");
      setEmailFromName(emailSettings?.email_from_name || "");
      setEmailReplyTo(emailSettings?.email_reply_to || "");
      setEmailEnabled(emailSettings?.email_enabled !== false);
      setSmtpUsesEnvFallback(emailSettings?.uses_env_fallback === true);
      setSmtpSecretsEncrypted(emailSettings?.secrets_encrypted === true);
      setOwnerOrganizations(overview?.organizations || []);
    } else {
      setOwnerOrganizations([]);
    }
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    const response = await appApi.users.invite(inviteEmail, inviteRole);
    setLastInviteUrl(response?.invite_url || "");
    setInviteEmail("");
    setInviting(false);
    loadData();
  };

  const updateEditableUser = (userId, field, value) => {
    setEditableUsers((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] || {}),
        [field]: value,
      },
    }));
  };

  const saveEditableUser = async (userId) => {
    const draft = editableUsers[userId];
    if (!draft) {
      return;
    }

    const fullName = String(draft.full_name || "").trim();
    const email = String(draft.email || "").trim().toLowerCase();
    const role = String(draft.role || "tecnico").trim();
    const isActive = draft.is_active !== false;

    if (!fullName) {
      setUserManagementError("El nombre del usuario es obligatorio.");
      return;
    }

    if (!email) {
      setUserManagementError("El email del usuario es obligatorio.");
      return;
    }

    setSavingUserId(userId);
    setUserManagementError("");

    try {
      await appApi.entities.User.update(userId, {
        full_name: fullName,
        email,
        role,
        is_active: isActive,
      });
      await loadData();
    } catch (error) {
      setUserManagementError(
        error?.message || "No se pudo guardar la información del usuario."
      );
    } finally {
      setSavingUserId("");
    }
  };

  const deleteOrganizationUser = async (userId) => {
    const confirmed = window.confirm(
      "¿Quitar el acceso de este usuario a esta empresa? Sus registros históricos se conservarán."
    );
    if (!confirmed) {
      return;
    }
    await appApi.organizations.deleteUser(user?.current_organization?.id, userId);
    loadData();
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "ELIMINAR") return;
    await appApi.entities.User.delete(user.id);
    void logout();
  };

  const handleSaveSmtp = async () => {
    setSmtpSaving(true);
    setSmtpMessage("");
    try {
      const response = await appApi.email.updateSettings({
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort || 587),
        smtp_secure: smtpSecure,
        smtp_user: smtpUser,
        ...(smtpPass ? { smtp_pass: smtpPass } : {}),
        email_from: emailFrom,
        email_from_name: emailFromName,
        email_reply_to: emailReplyTo,
        email_enabled: emailEnabled,
      });
      setSmtpPass("");
      setSmtpPassConfigured(response?.smtp_pass_configured === true);
      setSmtpUsesEnvFallback(response?.uses_env_fallback === true);
      setSmtpSecretsEncrypted(response?.secrets_encrypted === true);
      setSmtpMessage("Configuración SMTP guardada.");
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSendSmtpTest = async () => {
    setSmtpTesting(true);
    setSmtpMessage("");
    try {
      const result = await appApi.email.sendTest({ to: user?.email });
      setSmtpMessage(
        result?.provider === "smtp"
          ? "Correo de prueba enviado."
          : result?.provider === "disabled"
            ? "El envío de correo está desactivado en la plataforma."
            : "SMTP no está configurado; el envío se ha quedado en modo stub."
      );
    } finally {
      setSmtpTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!["admin", "superadmin", "oficina", "encargado"].includes(user?.role)) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Acceso restringido</h2>
        <p className="text-muted-foreground text-sm">Solo los administradores pueden acceder a esta sección.</p>
      </div>
    );
  }

  const canManageUsers = ["admin", "superadmin"].includes(user?.role);
  const isOwner = user?.is_hidden_owner === true;
  const canManageClientUsers = canManageUsers && !isOwner;
  const canEditTarifas = ["admin", "superadmin", "oficina", "encargado"].includes(user?.role);
  const canEditPedidosSettings =
    !isOwner &&
    ["admin", "oficina", "encargado"].includes(user?.role) &&
    user?.role !== "superadmin";

  const parseTarifaInput = (v) => {
    const x = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(x) && x >= 0 ? x : undefined;
  };

  const handleSavePedidos = async () => {
    setPedidosSaving(true);
    setPedidosMessage("");
    try {
      const portNum = parseInt(String(pedidosSmtpPort).trim(), 10);
      const payload = {
        pedidos_smtp_enabled: pedidosSmtpEnabled,
        pedidos_smtp_host: pedidosSmtpHost.trim(),
        pedidos_smtp_port: Number.isFinite(portNum) && portNum > 0 ? portNum : 587,
        pedidos_smtp_secure: pedidosSmtpSecure === true,
        pedidos_smtp_user: pedidosSmtpUser.trim(),
        pedidos_email_from: pedidosEmailFrom.trim(),
        pedidos_email_from_name: pedidosEmailFromName.trim(),
        pedidos_reply_to: pedidosReplyTo.trim(),
        pedidos_entrega_direccion: pedidosEntregaDireccion.trim(),
        pedidos_entrega_contacto: pedidosEntregaContacto.trim(),
        pedidos_entrega_telefono: pedidosEntregaTelefono.trim(),
        pedidos_entrega_observaciones: pedidosEntregaObservaciones.trim(),
      };
      if (pedidosSmtpPass.trim()) {
        payload.pedidos_smtp_pass = pedidosSmtpPass.trim();
      }
      await appApi.auth.updateMe(payload);
      setPedidosMessage("Datos de pedidos guardados.");
      setPedidosSmtpPass("");
      await loadData();
    } catch (e) {
      setPedidosMessage(e?.message || "No se pudo guardar.");
    } finally {
      setPedidosSaving(false);
    }
  };

  const handleTestPedidosSmtp = async () => {
    setPedidosSmtpTesting(true);
    try {
      const res = await appApi.purchaseOrders.testSmtp({});
      toast.success(res?.message || "Correo de prueba enviado.");
    } catch (e) {
      toast.error(e?.message || "No se pudo enviar la prueba.");
    } finally {
      setPedidosSmtpTesting(false);
    }
  };

  const handleSaveTarifas = async () => {
    setTarifasSaving(true);
    setTarifasMessage("");
    try {
      await appApi.auth.updateMe({
        tarifa_1_oficial_normal: parseTarifaInput(tarifa1Normal),
        tarifa_1_oficial_extra: parseTarifaInput(tarifa1Extra),
        tarifa_1_oficial_nocturna: parseTarifaInput(tarifa1Noct),
        tarifa_1_oficial_festiva: parseTarifaInput(tarifa1Fest),
        tarifa_oficial_ayudante_normal: parseTarifaInput(tarifaOaNormal),
        tarifa_oficial_ayudante_extra: parseTarifaInput(tarifaOaExtra),
        tarifa_oficial_ayudante_nocturna: parseTarifaInput(tarifaOaNoct),
        tarifa_oficial_ayudante_festiva: parseTarifaInput(tarifaOaFest),
        desplazamiento_tramos_json: JSON.stringify(ensureTramoIds(despTramos)),
      });
      setTarifasMessage("Tarifas guardadas.");
      await loadData();
    } catch (e) {
      setTarifasMessage(e?.message || "No se pudo guardar.");
    } finally {
      setTarifasSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32 lg:pb-8">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
      </div>

      {/* User Management */}
      {canManageClientUsers && (
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" /> Gestión de Usuarios
        </h2>

        <div className="flex gap-3">
          <Input
            placeholder="Email del nuevo usuario..."
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="rounded-xl"
          />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="w-40 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tecnico">Técnico</SelectItem>
              <SelectItem value="ayudante">Ayudante</SelectItem>
              <SelectItem value="oficina">Oficina</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleInvite} disabled={inviting} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
            Invitar
          </Button>
        </div>

        {lastInviteUrl && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Enlace de activacion del usuario invitado</p>
            <Input value={lastInviteUrl} readOnly className="rounded-xl font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={async () => {
                await navigator.clipboard.writeText(lastInviteUrl);
                setCopiedInviteUrl(true);
                setTimeout(() => setCopiedInviteUrl(false), 3000);
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              {copiedInviteUrl ? "Enlace copiado" : "Copiar enlace de alta"}
            </Button>
          </div>
        )}

{userManagementError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {userManagementError}
          </div>
        )}

        <div className="space-y-3">
          {users.map((u) => {
            const draft = editableUsers[u.id] || {
              full_name: u.full_name || "",
              email: u.email || "",
              role: u.role || "tecnico",
              is_active: u.is_active !== false,
            };
            const isSavingThisUser = savingUserId === u.id;

            return (
              <div key={u.id} className="rounded-2xl border border-border bg-muted/40 p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nombre</Label>
                    <Input
                      value={draft.full_name}
                      onChange={(event) =>
                        updateEditableUser(u.id, "full_name", event.target.value)
                      }
                      placeholder="Nombre y apellidos"
                      className="mt-1 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      value={draft.email}
                      onChange={(event) =>
                        updateEditableUser(u.id, "email", event.target.value)
                      }
                      placeholder="usuario@empresa.com"
                      className="mt-1 rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Select
                      value={draft.role || "tecnico"}
                      onValueChange={(value) => updateEditableUser(u.id, "role", value)}
                    >
                      <SelectTrigger className="h-9 rounded-xl sm:w-40">
                        <SelectValue>{ROLE_LABELS[draft.role] || draft.role}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {u.role === "superadmin" && (
                          <SelectItem value="superadmin">Super Admin</SelectItem>
                        )}
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="oficina">Oficina</SelectItem>
                        <SelectItem value="ayudante">Ayudante</SelectItem>
                        <SelectItem value="tecnico">Técnico</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={draft.is_active !== false}
                        onCheckedChange={(checked) =>
                          updateEditableUser(u.id, "is_active", checked)
                        }
                      />
                      <span
                        className={`text-xs font-medium ${
                          draft.is_active !== false ? "text-green-600" : "text-destructive"
                        }`}
                      >
                        {draft.is_active !== false ? "Activo" : "Bloqueado"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={isSavingThisUser}
                      onClick={() => saveEditableUser(u.id)}
                    >
                      {isSavingThisUser ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Guardar cambios
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5"
                      disabled={isSavingThisUser}
                      onClick={() => deleteOrganizationUser(u.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {!users.length && (
            <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Esta empresa todavía no tiene usuarios.
            </div>
          )}
        </div>
      </div>
      )}

      {/* Verifactu / Datos Empresa + Certificado Digital */}
      {["admin", "superadmin", "oficina"].includes(user?.role) && (
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-accent" /> Configuración Veri*factu (Ley Antifraude)
        </h2>
        <p className="text-xs text-muted-foreground">Configure los datos de emisión y el certificado digital para el protocolo Veri*factu de la AEAT.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>NIF / CIF Empresa *</Label>
            <Input value={emisorNif} onChange={e => setEmisorNif(e.target.value)} placeholder="B12345678" className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Nombre / Razón Social *</Label>
            <Input value={emisorNombre} onChange={e => setEmisorNombre(e.target.value)} placeholder="FRIGEST S.L." className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Dirección Fiscal</Label>
            <Input value={emisorDireccion} onChange={e => setEmisorDireccion(e.target.value)} placeholder="C/ Ejemplo, 1 · 28001 Madrid" className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={emisorTelefono} onChange={e => setEmisorTelefono(e.target.value)} placeholder="+34 91 000 00 00" className="mt-1 rounded-xl" />
          </div>
          <div className="sm:col-span-2">
            <Label>Logo de la Empresa (aparece en el PDF)</Label>
            <div className="mt-1 flex items-center gap-3">
              {emisorLogo && !logoFile && (
                <img src={emisorLogo} alt="Logo" className="h-12 object-contain border rounded-xl p-1 bg-white" />
              )}
              <label className="flex-1 cursor-pointer">
                <div className="border-2 border-dashed border-border rounded-xl p-3 text-center hover:border-accent transition-colors">
                  {logoFile ? (
                    <p className="text-sm text-emerald-600 font-medium">✓ {logoFile.name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{emisorLogo ? 'Subir nuevo logo' : 'Subir logo (.png, .jpg)'}</p>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={e => setLogoFile(e.target.files[0])} />
              </label>
            </div>
          </div>
        </div>

        <div>
          <Label className="flex items-center gap-2"><Key className="h-3.5 w-3.5" /> Certificado Digital (.p12 / .pfx)</Label>
          {certUri && !certFile && (
            <div className="mt-1 mb-2 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-emerald-700 text-sm font-medium">✓ Certificado cargado</span>
              <span className="text-xs text-emerald-600">— Sube un nuevo archivo para reemplazarlo</span>
            </div>
          )}
          <div className="mt-1 flex items-center gap-3">
            <label className="flex-1 cursor-pointer">
              <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-accent transition-colors">
                {certFile ? (
                  <p className="text-sm text-emerald-600 font-medium">✓ {certFile.name}</p>
                ) : (
                  <>
                    <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{certUri ? 'Subir nuevo certificado' : 'Subir archivo .p12 / .pfx'}</p>
                  </>
                )}
              </div>
              <input type="file" accept=".p12,.pfx" className="hidden" onChange={e => setCertFile(e.target.files[0])} />
            </label>
          </div>
        </div>

        <div>
          <Label className="flex items-center gap-2"><Key className="h-3.5 w-3.5" /> Contraseña del Certificado</Label>
          <Input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)} placeholder="Contraseña del certificado" className="mt-1 rounded-xl" />
        </div>

        {certSaved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-emerald-700 font-semibold text-sm">✓ Configuración guardada con éxito</span>
          </div>
        )}
        <Button
          onClick={async () => {
            setSavingCert(true);
            let newCertUri = certUri;
            if (certFile) {
              const { file_uri } = await appApi.files.uploadPrivate({ file: certFile });
              newCertUri = file_uri;
            }
            let newLogoUrl = emisorLogo;
            if (logoFile) {
              const { file_url } = await appApi.files.uploadPublic({ file: logoFile });
              newLogoUrl = file_url;
              setEmisorLogo(file_url);
              setLogoFile(null);
            }
            const updateData = { verifactu_nif: emisorNif, verifactu_nombre: emisorNombre };
            if (newCertUri) updateData.verifactu_cert_uri = newCertUri;
            if (certPassword) updateData.verifactu_cert_password = certPassword;
            updateData.emisor_direccion = emisorDireccion;
            updateData.emisor_telefono = emisorTelefono;
            updateData.emisor_logo_url = newLogoUrl;
            await appApi.auth.updateMe(updateData);
            if (newCertUri) setCertUri(newCertUri);
            setCertFile(null);
            setCertSaved(true);
            setSavingCert(false);
            setTimeout(() => setCertSaved(false), 5000);
          }}
          disabled={savingCert || !emisorNif}
          className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          {savingCert ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
          Guardar Configuración
        </Button>
        {/* Toggle sandbox / producción */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
          <div>
            <p className="font-medium text-sm">Modo Producción AEAT</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {modoProduccion
                ? '🔴 PRODUCCIÓN — Las facturas se envían a Hacienda de forma real.'
                : '🟢 SANDBOX — Modo de pruebas. Los envíos son simulados.'}
            </p>
          </div>
          <Switch checked={modoProduccion} onCheckedChange={async (val) => {
            setModoProduccion(val);
            await appApi.auth.updateMe({ verifactu_produccion: val });
          }} />
        </div>
        {modoProduccion && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">
            ⚠️ <strong>Modo Producción activo.</strong> Asegúrate de tener el certificado .p12 real configurado y el NIF/CIF correcto antes de facturar.
          </p>
        )}
        {!modoProduccion && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-3 rounded-xl">
            🧪 <strong>Modo Sandbox activo.</strong> Los envíos a la AEAT son simulados. El hash se genera correctamente para poder verificar el flujo. Activa el toggle para pasar a producción real.
          </p>
        )}
      </div>
      )}

      {canEditTarifas && (
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Coins className="h-4 w-4 text-accent" /> Tarifas
        </h2>
        <p className="text-xs text-muted-foreground">
          Aplica a la empresa suscriptora de la aplicación. Las tarifas de la ficha de clientes finales no sustituyen estos valores en mano de obra.
        </p>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">1 oficial (€/h)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Normal</Label>
              <Input value={tarifa1Normal} onChange={(e) => setTarifa1Normal(e.target.value)} placeholder="45" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Extra</Label>
              <Input value={tarifa1Extra} onChange={(e) => setTarifa1Extra(e.target.value)} placeholder="60" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Nocturno</Label>
              <Input value={tarifa1Noct} onChange={(e) => setTarifa1Noct(e.target.value)} placeholder="70" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Festivo</Label>
              <Input value={tarifa1Fest} onChange={(e) => setTarifa1Fest(e.target.value)} placeholder="80" className="mt-1 rounded-xl" />
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Oficial + ayudante (€/h)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Normal</Label>
              <Input value={tarifaOaNormal} onChange={(e) => setTarifaOaNormal(e.target.value)} placeholder="81" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Extra</Label>
              <Input value={tarifaOaExtra} onChange={(e) => setTarifaOaExtra(e.target.value)} placeholder="108" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Nocturno</Label>
              <Input value={tarifaOaNoct} onChange={(e) => setTarifaOaNoct(e.target.value)} placeholder="126" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Festivo</Label>
              <Input value={tarifaOaFest} onChange={(e) => setTarifaOaFest(e.target.value)} placeholder="144" className="mt-1 rounded-xl" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Si dejas vacío un campo de oficial + ayudante, se usará tarifa 1 oficial × 1,8 para ese tipo de horario.
          </p>
        </div>
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-sm">Tramos de desplazamiento</p>
              <p className="text-xs text-muted-foreground">Nombre, descripción opcional y precio por aplicación del tramo.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl shrink-0"
              onClick={() =>
                setDespTramos([
                  ...despTramos,
                  { id: `tramo-${Date.now()}`, nombre: "", descripcion: "", precio: 0 },
                ])
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Añadir tramo
            </Button>
          </div>
          {despTramos.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border border-border rounded-xl p-3 bg-muted/20">
              <div className="sm:col-span-4">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={row.nombre}
                  onChange={(e) => {
                    const n = [...despTramos];
                    n[idx] = { ...n[idx], nombre: e.target.value };
                    setDespTramos(n);
                  }}
                  placeholder="Ej: Palma"
                  className="mt-1 rounded-xl"
                />
              </div>
              <div className="sm:col-span-5">
                <Label className="text-xs">Descripción</Label>
                <Input
                  value={row.descripcion}
                  onChange={(e) => {
                    const n = [...despTramos];
                    n[idx] = { ...n[idx], descripcion: e.target.value };
                    setDespTramos(n);
                  }}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Precio (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.precio}
                  onChange={(e) => {
                    const n = [...despTramos];
                    n[idx] = { ...n[idx], precio: Math.max(0, parseFloat(e.target.value) || 0) };
                    setDespTramos(n);
                  }}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div className="sm:col-span-1 flex justify-end pb-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-destructive hover:text-destructive"
                  onClick={() => setDespTramos(despTramos.filter((_, i) => i !== idx))}
                  aria-label="Eliminar tramo"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {tarifasMessage && (
          <p className="text-xs text-muted-foreground">{tarifasMessage}</p>
        )}
        <Button
          type="button"
          onClick={handleSaveTarifas}
          disabled={tarifasSaving}
          className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          {tarifasSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Guardar tarifas
        </Button>
      </div>
      )}

      {canEditPedidosSettings && (
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-accent" /> Pedidos a proveedor
        </h2>
        <p className="text-xs text-muted-foreground">
          Este SMTP solo se usará para enviar pedidos a proveedores de esta empresa. No afecta al correo de plataforma FRIGEST (recuperación de contraseña, invitaciones, etc.), que sigue configurándose solo en el panel owner.
        </p>

        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-medium">SMTP para pedidos</p>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs">Activar envío SMTP de pedidos</Label>
            <Switch checked={pedidosSmtpEnabled} onCheckedChange={setPedidosSmtpEnabled} />
          </div>
          <div>
            <Label className="text-xs">Servidor SMTP</Label>
            <Input
              value={pedidosSmtpHost}
              onChange={(e) => setPedidosSmtpHost(e.target.value)}
              placeholder="smtp.tu-proveedor.com"
              className="mt-1 rounded-xl"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Puerto</Label>
              <Input
                value={pedidosSmtpPort}
                onChange={(e) => setPedidosSmtpPort(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>
            <div className="flex items-end justify-between gap-2 pb-1">
              <div>
                <Label className="text-xs block mb-1">TLS / SSL</Label>
                <p className="text-[10px] text-muted-foreground">Activa si tu servidor exige conexión segura</p>
              </div>
              <Switch checked={pedidosSmtpSecure} onCheckedChange={setPedidosSmtpSecure} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Usuario SMTP</Label>
            <Input
              value={pedidosSmtpUser}
              onChange={(e) => setPedidosSmtpUser(e.target.value)}
              className="mt-1 rounded-xl"
              autoComplete="off"
            />
          </div>
          <div>
            <Label className="text-xs">Contraseña SMTP</Label>
            <Input
              type="password"
              value={pedidosSmtpPass}
              onChange={(e) => setPedidosSmtpPass(e.target.value)}
              placeholder="Dejar vacío para mantener la contraseña actual"
              className="mt-1 rounded-xl"
              autoComplete="new-password"
            />
            {user?.pedidos_smtp_pass_configured ? (
              <p className="text-xs text-muted-foreground mt-1">Contraseña SMTP configurada</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Email de pedidos de la empresa</Label>
            <Input
              value={pedidosEmailFrom}
              onChange={(e) => setPedidosEmailFrom(e.target.value)}
              placeholder="compras@miempresa.com"
              className="mt-1 rounded-xl"
              type="email"
              autoComplete="off"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Nombre remitente visible</Label>
            <Input
              value={pedidosEmailFromName}
              onChange={(e) => setPedidosEmailFromName(e.target.value)}
              placeholder="Ej. Mi empresa — Compras"
              className="mt-1 rounded-xl"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Email de respuesta (reply-to)</Label>
            <Input
              value={pedidosReplyTo}
              onChange={(e) => setPedidosReplyTo(e.target.value)}
              placeholder="Opcional; si está vacío se usa el email de pedidos"
              className="mt-1 rounded-xl"
              type="email"
              autoComplete="off"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Dirección completa de entrega / almacén</Label>
            <Input
              value={pedidosEntregaDireccion}
              onChange={(e) => setPedidosEntregaDireccion(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs">Persona de contacto para entregas</Label>
            <Input
              value={pedidosEntregaContacto}
              onChange={(e) => setPedidosEntregaContacto(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs">Teléfono de entregas</Label>
            <Input
              value={pedidosEntregaTelefono}
              onChange={(e) => setPedidosEntregaTelefono(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Observaciones de entrega</Label>
            <Input
              value={pedidosEntregaObservaciones}
              onChange={(e) => setPedidosEntregaObservaciones(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>
        </div>
        {pedidosMessage && (
          <p className="text-xs text-muted-foreground">{pedidosMessage}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            onClick={handleSavePedidos}
            disabled={pedidosSaving}
            className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {pedidosSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar datos de pedidos
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={pedidosSaving || pedidosSmtpTesting}
            onClick={handleTestPedidosSmtp}
          >
            {pedidosSmtpTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar prueba de correo de pedidos
          </Button>
        </div>
      </div>
      )}

      {isOwner && (
      <div className="bg-card rounded-2xl border border-amber-300/60 p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-600" /> Panel Owner
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Cuenta protegida</p>
            <p className="font-medium mt-1">{user?.email}</p>
            <p className="text-xs text-emerald-600 mt-2">Acceso directo disponible desde el login principal</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Rol efectivo</p>
            <p className="font-medium mt-1">Superadmin</p>
            <p className="text-xs text-emerald-600 mt-2">Panel owner activado</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Vista owner</p>
            <p className="text-sm mt-1">
              Este panel ya no usa la gestión interna de usuarios de una empresa. Aquí ves las empresas registradas y los usuarios asociados a cada una.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-600" />
            <h3 className="font-medium">Empresas y usuarios</h3>
          </div>
          <div className="space-y-3">
            {ownerOrganizations.map((organization) => (
              <div key={organization.id} className="rounded-2xl border border-border bg-background/70 p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-sm">{organization.name}</p>
                    <p className="text-xs text-muted-foreground">{organization.slug || "sin-slug"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>{organization.user_count} usuarios</p>
                    <p>Plan: {organization.plan_code || "starter"}</p>
                  </div>
                </div>

                {organization.users?.length ? (
                  <div className="space-y-2">
                    {organization.users.map((member) => (
                      <div key={member.membership_id || member.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{member.full_name || member.email}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="font-medium">{ROLE_LABELS[member.role] || member.role || "Sin rol"}</p>
                          <p className={member.is_active !== false ? "text-emerald-600" : "text-destructive"}>
                            {member.is_active !== false ? "Activo" : "Bloqueado"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Esta empresa no tiene usuarios asociados todavía.</p>
                )}
              </div>
            ))}
            {!ownerOrganizations.length && (
              <p className="text-sm text-muted-foreground">No hay empresas registradas para mostrar.</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">SMTP de plataforma</p>
            <p className="text-sm mt-1">
              Configura el proveedor de correo saliente desde este panel. Los emails de invitación, verificación y reset usarán esta cuenta.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>SMTP Host</Label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.resend.com" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>SMTP Port</Label>
              <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>SMTP User</Label>
              <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="usuario SMTP" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>SMTP Password</Label>
              <Input value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} type="password" placeholder={smtpPassConfigured ? "••••••••••" : "Contraseña SMTP"} className="mt-1 rounded-xl" />
              <p className="text-[11px] text-muted-foreground mt-1">
                {smtpPassConfigured ? "Ya hay una contraseña guardada. Solo escribe aquí si quieres reemplazarla." : "Todavía no hay contraseña guardada."}
              </p>
            </div>
            <div>
              <Label>Email From (dirección)</Label>
              <Input value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="no-reply@tudominio.com" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>Nombre remitente (opcional)</Label>
              <Input value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="FRIGEST" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>Reply-To</Label>
              <Input value={emailReplyTo} onChange={(e) => setEmailReplyTo(e.target.value)} placeholder="soporte@tudominio.com" className="mt-1 rounded-xl" />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/60">
            <div>
              <p className="font-medium text-sm">Envío de correo habilitado</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Si lo desactivas, la plataforma no enviará correo saliente (incluye prueba SMTP y notificaciones automáticas).
              </p>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/60">
            <div>
              <p className="font-medium text-sm">Usar conexión segura</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Actívalo si tu proveedor SMTP requiere TLS implícito en el puerto configurado.
              </p>
            </div>
            <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <p className="text-muted-foreground">Origen actual</p>
              <p className="font-medium mt-1">{smtpUsesEnvFallback ? "Variables de entorno" : "Panel de plataforma"}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <p className="text-muted-foreground">Secretos cifrados</p>
              <p className="font-medium mt-1">{smtpSecretsEncrypted ? "Sí" : "No"}</p>
            </div>
          </div>
          {smtpMessage && (
            <div className="rounded-xl border border-border bg-background/60 p-3 text-sm">
              {smtpMessage}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              onClick={handleSaveSmtp}
              disabled={smtpSaving}
              className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {smtpSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar SMTP
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSendSmtpTest}
              disabled={smtpTesting}
              className="rounded-xl"
            >
              {smtpTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar prueba a mi email
            </Button>
          </div>
        </div>
      </div>

      )}

      <OrganizationBillingPanel user={user} onChange={loadData} ownerOrganizations={ownerOrganizations} />

      {/* App Info */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h2 className="font-semibold">Información de la App</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Versión: 1.0.0</p>
          <p>Empresa: FRIGEST</p>
          <p>Soporte: Contactar con administrador</p>
        </div>
        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          <a href="/legal/privacy.html" className="underline underline-offset-2 mr-3">
            Política de privacidad
          </a>
          <a href="/legal/terms.html" className="underline underline-offset-2 mr-3">
            Términos de uso
          </a>
          <a href="/legal/data-deletion.html" className="underline underline-offset-2">
            Eliminación de datos
          </a>
        </p>
      </div>

      {/* Delete Account */}
      <div className="bg-card rounded-2xl border border-destructive/30 p-5 space-y-3">
        <h2 className="font-semibold text-destructive flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Zona de peligro
        </h2>
        <p className="text-sm text-muted-foreground">Eliminar tu cuenta es una acción irreversible. Perderás el acceso inmediatamente.</p>
        <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="rounded-xl">
          Eliminar mi cuenta
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar cuenta?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción es irreversible. Escribe <strong>ELIMINAR</strong> para confirmar.</p>
          <Input
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            placeholder="Escribe ELIMINAR"
            className="rounded-xl"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" disabled={deleteConfirm !== "ELIMINAR"} onClick={handleDeleteAccount} className="rounded-xl">
              Confirmar eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

