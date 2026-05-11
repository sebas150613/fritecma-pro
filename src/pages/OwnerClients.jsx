import { useEffect, useMemo, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Loader2,
  PauseCircle,
  PlayCircle,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Default tenant id — must match `DEFAULT_ORGANIZATION_ID` in `server/lib/tenant.js`. */
const PLATFORM_INTERNAL_ORG_ID = "org-frigest";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeletePhrase, setHardDeletePhrase] = useState("");
  const [advancedInviteOpen, setAdvancedInviteOpen] = useState(false);

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
      const sorted = [...items].sort((a, b) => {
        const internal = (o) =>
          o?.is_platform_internal === true || o?.id === PLATFORM_INTERNAL_ORG_ID;
        return Number(internal(a)) - Number(internal(b));
      });
      setOrganizations(sorted);
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

  useEffect(() => {
    setCreateUserForm({
      full_name: "",
      email: "",
      role: "admin",
      temporary_password: "",
    });
    setInviteUrl("");
    setAdvancedInviteOpen(false);
  }, [selectedId]);

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

  const ownerEmailNormalized = String(me?.email || "")
    .trim()
    .toLowerCase();
  const inviteEmailNormalized = String(createUserForm.email || "")
    .trim()
    .toLowerCase();
  const isOwnerEmailInInviteForm =
    Boolean(ownerEmailNormalized) &&
    Boolean(inviteEmailNormalized) &&
    inviteEmailNormalized === ownerEmailNormalized;

  const isPlatformInternalOrg = (org) =>
    org?.is_platform_internal === true || org?.id === PLATFORM_INTERNAL_ORG_ID;

  const isSessionOwnerContextOrg =
    me?.is_hidden_owner === true &&
    Boolean(me?.current_organization?.id) &&
    selectedOrganization?.id === me.current_organization.id;

  const hardDeleteBlocked =
    isSessionOwnerContextOrg || (selectedOrganization && isPlatformInternalOrg(selectedOrganization));

  const handleCreateUser = async () => {
    if (!selectedOrganization?.id) return;
    if (!createUserForm.email.trim()) return;
    if (isOwnerEmailInInviteForm) return;
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

  const handleHardDeleteOrganization = async () => {
    if (!selectedOrganization?.id) return;
    const slug = String(selectedOrganization.slug || "").trim();
    if (!slug || hardDeletePhrase.trim() !== slug) {
      setError("Escribe exactamente el slug de la empresa para confirmar.");
      return;
    }
    const ok = window.confirm(
      "Esta acción eliminará todos los datos de la empresa sin dejar rastro funcional en FRIGEST. No afecta a otras empresas. ¿Continuar?"
    );
    if (!ok) return;
    setBusy("hard-delete-org");
    setError("");
    try {
      await appApi.organizations.hardDeleteOrganization(selectedOrganization.id);
      setHardDeleteOpen(false);
      setHardDeletePhrase("");
      setSelectedId("");
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo eliminar la empresa.");
    } finally {
      setBusy("");
    }
  };

  const handleDeleteUser = async (organizationId, userId) => {
    if (!organizationId || !userId) {
      return;
    }
    const confirmed = window.confirm(
      "¿Quitar el acceso de este usuario a esta empresa? Sus registros históricos se conservarán."
    );
    if (!confirmed) {
      return;
    }
    setBusy(`delete-user:${userId}`);
    setError("");
    try {
      await appApi.organizations.deleteUser(organizationId, userId);
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo eliminar el usuario.");
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
                const internal = isPlatformInternalOrg(org);
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
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-semibold truncate">{org.name}</p>
                          {internal ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 px-1.5 py-0.5">
                              Interna FRIGEST
                            </span>
                          ) : null}
                        </div>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{selectedOrganization.name}</h2>
                      {isPlatformInternalOrg(selectedOrganization) ? (
                        <span className="text-[10px] uppercase tracking-wide rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 px-1.5 py-0.5">
                          Interna FRIGEST
                        </span>
                      ) : null}
                    </div>
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

              <form
                className="rounded-2xl border border-border bg-card p-5 space-y-4"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-accent" />
                  <h3 className="font-semibold">Crear / invitar usuario</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Por defecto se envía una invitación por enlace. La contraseña provisional solo aplica si la
                  configuras en opciones avanzadas.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Nombre</Label>
                    <Input
                      className="mt-1 rounded-xl"
                      name="invite_full_name"
                      autoComplete="off"
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
                      type="email"
                      name="corporate_invite_email"
                      autoComplete="off"
                      inputMode="email"
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
                </div>

                <Collapsible open={advancedInviteOpen} onOpenChange={setAdvancedInviteOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/15 px-3 py-2 text-left text-sm font-medium hover:bg-muted/25 transition-colors"
                    >
                      <span>Opciones avanzadas</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                          advancedInviteOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div>
                      <Label>Contraseña temporal (opcional)</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        name="corporate_invite_temp_password"
                        autoComplete="new-password"
                        value={createUserForm.temporary_password}
                        onChange={(e) =>
                          setCreateUserForm((c) => ({
                            ...c,
                            temporary_password: e.target.value,
                          }))
                        }
                        placeholder="Solo si no quieres usar el flujo de invitación"
                        type="password"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Si permanece vacío, el usuario recibirá invitación con enlace (recomendado).
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {isOwnerEmailInInviteForm ? (
                  <p className="text-sm text-amber-800 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                    La cuenta owner no puede añadirse como usuario de empresa.
                  </p>
                ) : null}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
                    disabled={
                      busy === "create-user" ||
                      !createUserForm.email.trim() ||
                      isOwnerEmailInInviteForm
                    }
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
              </form>

              <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-destructive">Zona de peligro — eliminar empresa</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      La única forma de borrar todos los datos de una empresa es desde aquí. No elimina otras empresas ni usuarios que sigan en otra empresa.
                    </p>
                    {isSessionOwnerContextOrg ? (
                      <p className="text-xs text-amber-900 mt-2 leading-relaxed">
                        Esta organización está asociada al contexto interno de la sesión owner y no puede eliminarse
                        desde el panel de clientes.
                      </p>
                    ) : null}
                    {isPlatformInternalOrg(selectedOrganization) && !isSessionOwnerContextOrg ? (
                      <p className="text-xs text-amber-900 mt-2 leading-relaxed">
                        Organización interna de plataforma: el borrado definitivo no está disponible para este
                        registro.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-3 rounded-xl"
                      disabled={busy !== "" || hardDeleteBlocked}
                      onClick={() => {
                        setHardDeletePhrase("");
                        setHardDeleteOpen(true);
                      }}
                    >
                      Eliminar empresa definitivamente
                    </Button>
                  </div>
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
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5"
                            disabled={busy === `delete-user:${u.id}` || busy === "pause" || busy === "activate"}
                            onClick={() => handleDeleteUser(selectedOrganization.id, u.id)}
                          >
                            {busy === `delete-user:${u.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                            )}
                            Eliminar
                          </Button>
                        </div>
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

      <Dialog open={hardDeleteOpen} onOpenChange={setHardDeleteOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Eliminar empresa definitivamente
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción eliminará todos los datos de la empresa sin dejar rastro funcional en FRIGEST. No afecta a otras empresas.
          </p>
          <p className="text-xs font-mono bg-muted/50 rounded-lg px-3 py-2">
            Slug: <span className="font-semibold">{selectedOrganization?.slug || "—"}</span>
          </p>
          <div>
            <Label className="text-xs">Escribe el slug exacto para confirmar</Label>
            <Input
              className="mt-1 rounded-xl"
              value={hardDeletePhrase}
              onChange={(e) => setHardDeletePhrase(e.target.value)}
              placeholder={selectedOrganization?.slug || ""}
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setHardDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={busy === "hard-delete-org"}
              onClick={handleHardDeleteOrganization}
            >
              {busy === "hard-delete-org" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

