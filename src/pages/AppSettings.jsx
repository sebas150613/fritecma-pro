import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings, Users, Shield, Trash2, Upload, Key, FileCheck, Loader2 } from "lucide-react";

const ROLE_LABELS = {
  superadmin: "Super Admin",
  admin: "Admin",
  encargado: "Encargado",
  oficina: "Oficina",
  ayudante: "Ayudante",
  user: "Técnico",
  tecnico: "Técnico",
};

export default function AppSettings() {
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
  const [emisorNombre, setEmisorNombre] = useState("FRITECMA S.L.");
  const [emisorDireccion, setEmisorDireccion] = useState("");
  const [emisorTelefono, setEmisorTelefono] = useState("");
  const [emisorLogo, setEmisorLogo] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [savingCert, setSavingCert] = useState(false);
  const [certSaved, setCertSaved] = useState(false);
  const [certUri, setCertUri] = useState("");
  const [modoProduccion, setModoProduccion] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const me = await base44.auth.me();
    setUser(me);
    if (me.role === "superadmin") {
      const allUsers = await base44.entities.User.list("full_name", 100);
      setUsers(allUsers);
    }
    setEmisorNif(me.verifactu_nif || "");
    setEmisorNombre(me.verifactu_nombre || "FRITECMA S.L.");
    setEmisorDireccion(me.emisor_direccion || "");
    setEmisorTelefono(me.emisor_telefono || "");
    setEmisorLogo(me.emisor_logo_url || "");
    setCertUri(me.verifactu_cert_uri || "");
    setModoProduccion(me.verifactu_produccion === true);
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    await base44.users.inviteUser(inviteEmail, inviteRole === "admin" ? "admin" : "user");
    // Update role to tecnico after invite if needed
    setInviteEmail("");
    setInviting(false);
    loadData();
  };

  const setUserRole = async (userId, newRole) => {
    await base44.entities.User.update(userId, { role: newRole });
    loadData();
  };

  const toggleUserActive = async (userId, currentValue) => {
    await base44.entities.User.update(userId, { is_active: !currentValue });
    loadData();
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "ELIMINAR") return;
    await base44.entities.User.delete(user.id);
    base44.auth.logout("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!['admin','superadmin','encargado','oficina'].includes(user?.role)) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Acceso restringido</h2>
        <p className="text-muted-foreground text-sm">Solo los administradores pueden acceder a esta sección.</p>
      </div>
    );
  }

  const isSuperAdmin = user?.role === "superadmin";

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32 lg:pb-8">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
      </div>

      {/* User Management — Solo SuperAdmin */}
      {isSuperAdmin && (
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
              <SelectItem value="encargado">Encargado</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="superadmin">Super Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleInvite} disabled={inviting} className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
            Invitar
          </Button>
        </div>

        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between py-3 px-4 bg-muted/50 rounded-xl">
              <div>
                <p className="font-medium text-sm">{u.full_name || u.email}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={u.is_active !== false}
                    onCheckedChange={() => toggleUserActive(u.id, u.is_active !== false)}
                  />
                  <span className={`text-xs font-medium ${u.is_active !== false ? 'text-green-600' : 'text-destructive'}`}>
                    {u.is_active !== false ? 'Activo' : 'Bloqueado'}
                  </span>
                </div>
                <Select value={u.role || "user"} onValueChange={v => setUserRole(u.id, v)}>
                  <SelectTrigger className="h-8 text-xs rounded-lg w-32">
                    <SelectValue>{ROLE_LABELS[u.role] || u.role}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="superadmin">Super Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="encargado">Encargado</SelectItem>
                    <SelectItem value="oficina">Oficina</SelectItem>
                    <SelectItem value="ayudante">Ayudante</SelectItem>
                    <SelectItem value="user">Técnico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Verifactu / Datos Empresa + Certificado Digital */}
      {['admin','superadmin','encargado','oficina'].includes(user?.role) && (
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
            <Input value={emisorNombre} onChange={e => setEmisorNombre(e.target.value)} placeholder="FRITECMA S.L." className="mt-1 rounded-xl" />
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
              const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: certFile });
              newCertUri = file_uri;
            }
            let newLogoUrl = emisorLogo;
            if (logoFile) {
              const { file_url } = await base44.integrations.Core.UploadFile({ file: logoFile });
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
            await base44.auth.updateMe(updateData);
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
            await base44.auth.updateMe({ verifactu_produccion: val });
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

      {/* App Info */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h2 className="font-semibold">Información de la App</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Versión: 1.0.0</p>
          <p>Empresa: FRITECMA</p>
          <p>Soporte: Contactar con administrador</p>
        </div>
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