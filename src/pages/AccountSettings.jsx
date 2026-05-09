import { useEffect, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Settings, Shield, Trash2 } from "lucide-react";

export default function AccountSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    appApi.auth
      .me()
      .then(setUser)
      .catch(() => setError("No se pudo cargar la información de tu cuenta."))
      .finally(() => setLoading(false));
  }, []);

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "ELIMINAR") {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      await appApi.account.deleteMe();
      appApi.auth.logout("/");
    } catch (deleteError) {
      setError(deleteError?.message || "No se pudo eliminar la cuenta.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 pb-32 lg:pb-8">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" /> Mi cuenta
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Nombre</p>
            <p className="font-medium mt-1">{user?.full_name || "Sin nombre"}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium mt-1">{user?.email || "Sin email"}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Rol</p>
            <p className="font-medium mt-1 capitalize">{user?.role || "usuario"}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Empresa</p>
            <p className="font-medium mt-1">{user?.current_organization?.name || "Sin empresa"}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Tu rol puede acceder a esta pantalla para revisar tu cuenta y solicitar la eliminación de tus datos. La gestión de usuarios de la empresa está reservada al administrador.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="bg-card rounded-2xl border border-destructive/30 p-5 space-y-3">
        <h2 className="font-semibold text-destructive flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Zona de peligro
        </h2>
        <p className="text-sm text-muted-foreground">
          Eliminar tu cuenta es una acción irreversible. Perderás el acceso inmediatamente y se retirará tu usuario de la empresa.
        </p>
        <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="rounded-xl">
          Eliminar mi cuenta
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar cuenta?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción es irreversible. Escribe <strong>ELIMINAR</strong> para confirmar.
          </p>
          <Input
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder="Escribe ELIMINAR"
            className="rounded-xl"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "ELIMINAR" || deleting}
              onClick={handleDeleteAccount}
              className="rounded-xl"
            >
              {deleting ? "Eliminando..." : "Confirmar eliminación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
