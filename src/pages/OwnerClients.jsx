import { useEffect, useMemo, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle2, Loader2, PauseCircle, PlayCircle, UserPlus } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "oficina", label: "Oficina" },
  { value: "encargado", label: "Encargado" },
  { value: "tecnico", label: "Técnico" },
  { value: "ayudante", label: "Ayudante" },
];

const statusLabel = (status) => {
  const value = String(status || "").toLowerCase();
  if (value === "active") return "Activa";
  if (value === "trialing") return "Prueba";
  if (value === "paused") return "Pausada";
  if (value === "past_due") return "Impago";
  if (value === "canceled") return "Cancelada";
  if (value === "incomplete") return "Pendiente";
  return status || "N/D";
};

export default function OwnerClients() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [selectedId, setSelectedId] = useState("");

  const [createUserForm, setCreateUserForm] = useState({
    full_name: "",
    email: "",
    role: "admin",
    temporary_password: "",
  });
  const [inviteUrl, setInviteUrl] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [currentMe, overview] = await Promise.all([
        appApi.auth.me(),
        appApi.organizations.ownerOverview(),
      ]);
      setMe(currentMe);
      const items = overview?.organizations || [];
      setOrganizations(items);
      if (!selectedId && items[0]?.id) {
        setSelectedId(items[0].id);
      }
    } catch (e) {
      setError(e?.message || "No se pudo cargar el panel de clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === selectedId) || null,
    [organizations, selectedId]
  );

  const selectedBilling = selectedOrganization?.billing || null;
  const licenseStatus = selectedBilling?.subscription?.status || "active";
  const canPause = ["active", "trialing"].includes(String(licenseStatus || "").toLowerCase());
  const canActivate = ["paused", "past_due", "canceled"].includes(
    String(licenseStatus || "").toLowerCase()
  );

  const activeSeats = selectedBilling?.usage?.active_seats ?? selectedOrganization?.user_count ?? 0;
  const seatLimit = selectedBilling?.limits?.seat_limit ?? null;

  const handleCreateUser = async () => {
    if (!selectedOrganization?.id) return;
    if (!createUserForm.email.trim()) return;
    setBusy("create-user");
    setError("");
    setInviteUrl("");

    try {
      const payload = {
        email: createUserForm.email.trim(),
        full_name: createUserForm.full_name.trim(),
        role: createUserForm.role,
        ...(createUserForm.temporary_password
          ? { temporary_password: createUserForm.temporary_password }
          : {}),
      };
      const response = await appApi.organizations.createUser(selectedOrganization.id, payload);
      setInviteUrl(response?.invite_url || "");
      setCreateUserForm((cur) => ({
        ...cur,
        full_name: "",
        email: "",
        temporary_password: "",
      }));
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo crear/invitar el usuario.");
    } finally {
      setBusy("");
    }
  };

  const handlePause = async () => {
    if (!selectedOrganization?.id) return;
    setBusy("pause");
    setError("");
    try {
      await appApi.organizations.pauseLicense(selectedOrganization.id);
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo pausar la licencia.");
    } finally {
      setBusy("");
    }
  };

  const handleActivate = async () => {
    if (!selectedOrganization?.id) return;
    setBusy("activate");
    setError("");
    try {
      await appApi.organizations.activateLicense(selectedOrganization.id);
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo activar la licencia.");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando clientes...
        </div>
      </div>
    );
  }

  if (me?.is_hidden_owner !== true) {
    return (
      <div className="p-6 lg:p-10 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Acceso restringido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-10 max-w-6xl mx-auto space-y-6 pb-32 lg:pb-10">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-amber-600" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Empresas, usuarios, plan, consumo y estado de licencia.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-4">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Empresas
              </p>
            </div>
            <div className="divide-y divide-border">
              {(organizations || []).map((org) => {
                const billing = org.billing || null;
                const status = billing?.subscription?.status || "active";
                const seats = billing?.usage?.active_seats ?? org.user_count ?? 0;
                const limit = billing?.limits?.seat_limit ?? null;
                const isSelected = org.id === selectedId;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => setSelectedId(org.id)}
                    className={[
                      "w-full text-left p-4 hover:bg-muted/30 transition-colors",
                      isSelected ? "bg-muted/40" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{org.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{org.slug || "sin-slug"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium">{statusLabel(status)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {seats}{limit ? ` / ${limit}` : " / ∞"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Plan: {billing?.subscription?.plan_code || org.plan_code || "starter"}</span>
                      <span>{org.user_count || 0} usuarios</span>
                    </div>
                  </button>
                );
              })}
              {!organizations?.length && (
                <div className="p-4 text-sm text-muted-foreground">
                  No hay empresas para mostrar.
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-8 space-y-4">
          {!selectedOrganization ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Selecciona una empresa para ver el detalle.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedOrganization.name}</h2>
                    <p className="text-sm text-muted-foreground">{selectedOrganization.slug || "sin-slug"}</p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Licencia:</span>{" "}
                      <span className="font-medium">{statusLabel(licenseStatus)}</span>
                    </div>
                    <div className="flex gap-2">
                      {canPause && (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl"
                          disabled={busy === "pause"}
                          onClick={handlePause}
                        >
                          {busy === "pause" ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <PauseCircle className="h-4 w-4 mr-2" />
                          )}
                          Pausar licencia
                        </Button>
                      )}
                      {canActivate && (
                        <Button
                          type="button"
                          className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
                          disabled={busy === "activate"}
                          onClick={handleActivate}
                        >
                          {busy === "activate" ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <PlayCircle className="h-4 w-4 mr-2" />
                          )}
                          Activar licencia
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plan</p>
                    <p className="mt-2 font-semibold">
                      {selectedBilling?.plan?.name ||
                        selectedBilling?.subscription?.plan_code ||
                        selectedOrganization.plan_code ||
                        "starter"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedBilling?.plan?.monthly_price_cents !== null &&
                      selectedBilling?.plan?.monthly_price_cents !== undefined
                        ? `${Number(selectedBilling.plan.monthly_price_cents) / 100}€ / mes`
                        : ""}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Usuarios</p>
                    <p className="mt-2 font-semibold">
                      {activeSeats}{seatLimit ? ` / ${seatLimit}` : " / ∞"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Activos / límite</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Consumo</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Almacenamiento:{" "}
                      <span className="font-medium text-foreground">
                        {selectedBilling?.usage?.storage_used_gb ?? null}
                      </span>{" "}
                      /{" "}
                      <span className="font-medium text-foreground">
                        {selectedBilling?.limits?.storage_limit_gb ?? null}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      IA:{" "}
                      <span className="font-medium text-foreground">
                        {selectedBilling?.usage?.ai_requests_month ?? null}
                      </span>{" "}
                      /{" "}
                      <span className="font-medium text-foreground">
                        {selectedBilling?.limits?.ai_requests_month ?? null}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Si no hay dato, se muestra <span className="font-mono">null</span>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-accent" />
                  <h3 className="font-semibold">Crear / invitar usuario</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Nombre</Label>
                    <Input
                      className="mt-1 rounded-xl"
                      value={createUserForm.full_name}
                      onChange={(e) =>
                        setCreateUserForm((c) => ({ ...c, full_name: e.target.value }))
                      }
                      placeholder="Nombre y apellidos"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      className="mt-1 rounded-xl"
                      value={createUserForm.email}
                      onChange={(e) =>
                        setCreateUserForm((c) => ({ ...c, email: e.target.value }))
                      }
                      placeholder="usuario@empresa.com"
                    />
                  </div>
                  <div>
                    <Label>Rol</Label>
                    <div className="mt-1">
                      <Select
                        value={createUserForm.role}
                        onValueChange={(value) =>
                          setCreateUserForm((c) => ({ ...c, role: value }))
                        }
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Contraseña temporal (opcional)</Label>
                    <Input
                      className="mt-1 rounded-xl"
                      value={createUserForm.temporary_password}
                      onChange={(e) =>
                        setCreateUserForm((c) => ({
                          ...c,
                          temporary_password: e.target.value,
                        }))
                      }
                      placeholder="Si la dejas vacía, se genera invitación"
                      type="password"
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
                    disabled={busy === "create-user" || !createUserForm.email.trim()}
                    onClick={handleCreateUser}
                  >
                    {busy === "create-user" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Crear usuario
                  </Button>
                  {inviteUrl && (
                    <div className="flex-1 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                      <p className="text-xs text-muted-foreground">Invite URL</p>
                      <p className="font-mono text-xs break-all mt-1">{inviteUrl}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold">Usuarios</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Usuarios actuales de la empresa seleccionada.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {(selectedOrganization.users || []).map((u) => (
                    <div key={u.membership_id || u.id} className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{u.role || "sin-rol"}</p>
                        <p className="text-xs text-muted-foreground">{u.membership_status || "active"}</p>
                      </div>
                    </div>
                  ))}
                  {!selectedOrganization.users?.length && (
                    <div className="p-4 text-sm text-muted-foreground">
                      Esta empresa no tiene usuarios asociados todavía.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

