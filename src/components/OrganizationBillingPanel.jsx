import { useEffect, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BadgeEuro, Building2, CreditCard, Layers3, Loader2, Plus } from "lucide-react";

const formatMoney = (amountCents, currency = "EUR") => {
  if (!amountCents) {
    return "A medida";
  }

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
};

const statusLabels = {
  trialing: "Prueba",
  active: "Activa",
  past_due: "Impago",
  canceled: "Cancelada",
  incomplete: "Pendiente",
  unpaid: "No pagada",
};

export default function OrganizationBillingPanel({ user, onChange, ownerOrganizations = [] }) {
  const [organizations, setOrganizations] = useState([]);
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactPlan, setContactPlan] = useState(null);
  const [contactMessage, setContactMessage] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    plan_code: "starter",
  });
  const [error, setError] = useState("");

  const canManageBilling = ["admin", "superadmin"].includes(user?.role);
  const isOwner = user?.is_hidden_owner === true;
  const visibleOrganizations = isOwner ? ownerOrganizations : organizations;
  const targetOrganizationId = isOwner
    ? selectedOrganizationId || ownerOrganizations[0]?.id || user?.current_organization?.id || ""
    : user?.current_organization?.id || "";
  const targetOrganization = isOwner
    ? ownerOrganizations.find((organization) => organization.id === targetOrganizationId) || null
    : user?.current_organization || null;

  const loadPanel = async () => {
    setLoading(true);
    setError("");
    setContactSuccess("");

    try {
      const [orgList, planList, billingSummary] = await Promise.all([
        isOwner ? Promise.resolve(ownerOrganizations || []) : appApi.organizations.list(),
        appApi.organizations.listPlans(),
        appApi.billing.summary(targetOrganizationId || undefined),
      ]);

      setOrganizations(orgList || []);
      setPlans(planList || []);
      setSummary(billingSummary || null);
    } catch (panelError) {
      setError(panelError?.message || "No se pudo cargar la informacion SaaS.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner && !selectedOrganizationId && ownerOrganizations[0]?.id) {
      setSelectedOrganizationId(ownerOrganizations[0].id);
      return;
    }

    if (targetOrganizationId) {
      loadPanel();
    }
  }, [isOwner, ownerOrganizations, selectedOrganizationId, user?.current_organization?.id]);

  const handleOrganizationSwitch = async (organizationId) => {
    if (!organizationId || organizationId === user?.current_organization?.id) {
      return;
    }

    setSwitchingOrg(true);
    setError("");

    try {
      await appApi.auth.switchOrganization(organizationId);
      await onChange?.();
      window.location.reload();
    } catch (switchError) {
      setError(switchError?.message || "No se pudo cambiar de empresa.");
    } finally {
      setSwitchingOrg(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!createForm.name.trim()) {
      return;
    }

    setCreateBusy(true);
    setError("");

    try {
      await appApi.organizations.create(createForm);
      setCreateOpen(false);
      setCreateForm({
        name: "",
        slug: "",
        plan_code: "starter",
      });
      await onChange?.();
      window.location.reload();
    } catch (createError) {
      setError(createError?.message || "No se pudo crear la empresa.");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleCheckout = async (planCode) => {
    setBillingBusy(planCode);
    setError("");

    try {
      const response = await appApi.billing.checkout({
        organization_id: targetOrganizationId,
        plan_code: planCode,
        success_url: `${window.location.origin}/settings?billing=success`,
        cancel_url: `${window.location.origin}/settings?billing=cancel`,
      });

      if (response?.url) {
        window.location.assign(response.url);
      }
    } catch (checkoutError) {
      setError(checkoutError?.message || "No se pudo iniciar el checkout.");
    } finally {
      setBillingBusy("");
    }
  };

  const handlePortal = async () => {
    setBillingBusy("portal");
    setError("");

    try {
      const response = await appApi.billing.portal({
        organization_id: targetOrganizationId,
        return_url: window.location.href,
      });

      if (response?.url) {
        window.location.assign(response.url);
      }
    } catch (portalError) {
      setError(portalError?.message || "No se pudo abrir el portal de billing.");
    } finally {
      setBillingBusy("");
    }
  };

  const openContactDialog = (plan) => {
    setContactPlan(plan);
    setContactMessage("");
    setError("");
    setContactSuccess("");
    setContactOpen(true);
  };

  const handleContactSales = async () => {
    if (!contactPlan?.code) {
      return;
    }

    setBillingBusy(`contact:${contactPlan.code}`);
    setError("");

    try {
      const response = await appApi.billing.contactSales({
        organization_id: targetOrganizationId,
        plan_code: contactPlan.code,
        message: contactMessage,
      });
      setContactOpen(false);
      setContactMessage("");
      setContactSuccess(
        response?.queued
          ? "Solicitud registrada. El aviso comercial ha quedado en cola."
          : "Solicitud enviada al equipo comercial."
      );
    } catch (contactError) {
      setError(contactError?.message || "No se pudo enviar la solicitud comercial.");
    } finally {
      setBillingBusy("");
    }
  };

  const handleOwnerAssignPlan = async (planCode) => {
    if (!targetOrganizationId) {
      return;
    }

    setBillingBusy(`assign:${planCode}`);
    setError("");

    try {
      await appApi.billing.assignPlan({
        organization_id: targetOrganizationId,
        plan_code: planCode,
      });
      setContactSuccess("Plan actualizado directamente desde el panel owner.");
      await onChange?.();
      await loadPanel();
    } catch (assignError) {
      setError(assignError?.message || "No se pudo actualizar el plan.");
    } finally {
      setBillingBusy("");
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando panel SaaS...
        </div>
      </div>
    );
  }

  const currentPlanCode = summary?.plan?.code || summary?.subscription?.plan_code;
  const currentPlanName = summary?.plan?.name || currentPlanCode || "Sin plan";
  const seatLimit = summary?.limits?.seat_limit;
  const activeSeats = summary?.usage?.active_seats ?? 0;

  return (
    <>
      <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-accent" />
              Empresa y Suscripcion
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Gestiona organizaciones, plan activo y capacidad comercial.
            </p>
          </div>
          <div className="flex gap-2">
            {canManageBilling && isOwner && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva empresa
              </Button>
            )}
            {summary?.billing?.portal_enabled && canManageBilling && (
              <Button
                type="button"
                className="rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
                onClick={handlePortal}
                disabled={billingBusy === "portal"}
              >
                {billingBusy === "portal" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Gestionar billing
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Empresa activa
            </p>
            <p className="text-lg font-semibold">
              {targetOrganization?.name || "Sin empresa"}
            </p>
            <p className="text-sm text-muted-foreground">
              {targetOrganization?.slug || "sin-slug"}
            </p>
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground">{isOwner ? "Empresa a administrar" : "Cambiar empresa"}</Label>
              <select
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={targetOrganizationId}
                onChange={(event) => {
                  if (isOwner) {
                    setSelectedOrganizationId(event.target.value);
                    return;
                  }

                  handleOrganizationSwitch(event.target.value);
                }}
                disabled={switchingOrg || visibleOrganizations.length <= 1}
              >
                {(visibleOrganizations || []).map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Plan actual
            </p>
            <p className="text-lg font-semibold">{currentPlanName}</p>
            <p className="text-sm text-muted-foreground">
              Estado: {statusLabels[summary?.subscription?.status] || summary?.subscription?.status || "N/D"}
            </p>
            <p className="text-sm text-muted-foreground">
              {summary?.subscription?.current_period_end
                ? `Renueva / termina: ${new Date(summary.subscription.current_period_end).toLocaleDateString("es-ES")}`
                : "Sin periodo definido"}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Capacidad
            </p>
            <p className="text-lg font-semibold">
              {activeSeats}
              {seatLimit ? ` / ${seatLimit}` : " / Ilimitado"}
            </p>
            <p className="text-sm text-muted-foreground">Usuarios activos</p>
            <p className="text-sm text-muted-foreground">
              {summary?.limits?.storage_limit_gb
                ? `${summary.limits.storage_limit_gb} GB incluidos`
                : "Almacenamiento personalizado"}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {contactSuccess && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {contactSuccess}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BadgeEuro className="h-4 w-4 text-accent" />
            <h3 className="font-medium">Catalogo de planes</h3>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            {plans.map((plan) => {
              const isCurrent = plan.code === currentPlanCode;
              const isContactPlan = !plan.monthly_price_cents || !plan.stripe_price_id;
              const canOwnerAssign = isOwner && !isCurrent;
              const shouldOfferContact =
                !isOwner &&
                canManageBilling &&
                !isCurrent &&
                (isContactPlan || !summary?.billing?.stripe_enabled);
              const canCheckout =
                !isOwner &&
                canManageBilling &&
                !isCurrent &&
                summary?.billing?.stripe_enabled &&
                !isContactPlan;

              return (
                <div
                  key={plan.code}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isCurrent
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {plan.description}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                        Actual
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-2xl font-bold">
                      {formatMoney(plan.monthly_price_cents, plan.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {plan.monthly_price_cents ? "por mes" : "contacto comercial"}
                    </p>
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <p>
                      {plan.seat_limit ? `${plan.seat_limit} usuarios` : "Usuarios ilimitados"}
                    </p>
                    <p>
                      {plan.storage_limit_gb
                        ? `${plan.storage_limit_gb} GB almacenamiento`
                        : "Almacenamiento personalizado"}
                    </p>
                    {(plan.features || []).slice(0, 4).map((feature) => (
                      <p key={feature}>{feature}</p>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant={isCurrent ? "outline" : "default"}
                    className={`w-full rounded-xl ${
                      !isCurrent
                        ? "bg-accent hover:bg-accent/90 text-accent-foreground"
                        : ""
                    }`}
                    disabled={
                      isCurrent ||
                      billingBusy === plan.code ||
                      billingBusy === `assign:${plan.code}` ||
                      billingBusy === `contact:${plan.code}` ||
                      (!canCheckout && !shouldOfferContact && !canOwnerAssign)
                    }
                    onClick={() => {
                      if (canOwnerAssign) {
                        handleOwnerAssignPlan(plan.code);
                        return;
                      }

                      if (canCheckout) {
                        handleCheckout(plan.code);
                        return;
                      }

                      if (shouldOfferContact) {
                        openContactDialog(plan);
                      }
                    }}
                  >
                    {billingBusy === plan.code || billingBusy === `assign:${plan.code}` || billingBusy === `contact:${plan.code}` ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Building2 className="h-4 w-4 mr-2" />
                    )}
                    {isCurrent
                      ? "Plan activo"
                      : canOwnerAssign
                        ? "Asignar plan"
                      : canCheckout
                        ? "Contratar plan"
                        : shouldOfferContact
                          ? "Contactar"
                          : "No disponible"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre de la empresa</Label>
              <Input
                className="mt-1 rounded-xl"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ej: Frio Levante SL"
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                className="mt-1 rounded-xl"
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
                placeholder="frio-levante"
              />
            </div>
            <div>
              <Label>Plan inicial</Label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={createForm.plan_code}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    plan_code: event.target.value,
                  }))
                }
              >
                {plans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              className="w-full rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={handleCreateOrganization}
              disabled={createBusy || !createForm.name.trim()}
            >
              {createBusy ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Crear empresa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Solicitar plan {contactPlan?.name || ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <p className="font-medium">{targetOrganization?.name || "Empresa actual"}</p>
              <p className="text-muted-foreground mt-1">
                Esta solicitud se enviará al equipo comercial para activar o preparar el cambio de suscripción.
              </p>
            </div>
            <div>
              <Label>Mensaje opcional</Label>
              <textarea
                className="mt-1 min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="Ej: necesitamos ampliar usuarios y soporte de implantación."
                value={contactMessage}
                onChange={(event) => setContactMessage(event.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={handleContactSales}
              disabled={billingBusy === `contact:${contactPlan?.code || ""}`}
            >
              {billingBusy === `contact:${contactPlan?.code || ""}` ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Enviar solicitud
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
