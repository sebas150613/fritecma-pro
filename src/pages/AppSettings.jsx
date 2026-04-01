import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings, Users, Shield, Trash2 } from "lucide-react";

export default function AppSettings() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("tecnico");
  const [inviting, setInviting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

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

  if (user?.role !== "admin" && user?.role !== "superadmin" && user?.role !== "encargado") {
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
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
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
                    <SelectValue />
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