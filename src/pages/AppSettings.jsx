import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, Users, Shield } from "lucide-react";

export default function AppSettings() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("tecnico");
  const [inviting, setInviting] = useState(false);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role !== "superadmin") {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Acceso restringido</h2>
        <p className="text-muted-foreground text-sm">Solo los administradores pueden acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
      </div>

      {/* User Management */}
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
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-xl border border-input bg-card px-3 text-sm"
          >
            <option value="tecnico">Técnico</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Super Admin</option>
          </select>
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
                <select
                  value={u.role || "user"}
                  onChange={e => setUserRole(u.id, e.target.value)}
                  className="text-xs rounded-lg border border-input bg-card px-2 py-1"
                >
                  <option value="superadmin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="oficina">Oficina</option>
                  <option value="user">Técnico</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* App Info */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h2 className="font-semibold">Información de la App</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Versión: 1.0.0</p>
          <p>Empresa: FRITECMA</p>
          <p>Soporte: Contactar con administrador</p>
        </div>
      </div>
    </div>
  );
}