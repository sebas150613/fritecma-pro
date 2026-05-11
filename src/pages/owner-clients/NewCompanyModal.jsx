import { useCallback, useEffect, useMemo, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { BillingAddressSuggestInput } from "./BillingAddressSuggestInput";

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "empresa";

const emptyForm = () => ({
  trade_name: "",
  name: "",
  legal_name: "",
  tax_id: "",
  tax_id_type: "nif",
  slug: "",
  slug_manual: false,
  commercial_status: "prueba",
  plan_code: "starter",
  trial_starts_at: "",
  trial_ends_at: "",
  commercial_notes: "",
  billing_fiscal_name: "",
  billing_tax_id: "",
  billing_email: "",
  billing_phone: "",
  billing_contact_name: "",
  billing_address_line1: "",
  billing_address_line2: "",
  billing_postal_code: "",
  billing_city: "",
  billing_region: "",
  billing_country: "ES",
  payment_method: "pendiente",
  payment_terms: "30_dias",
  internal_customer_reference: "",
  owner_private_notes: "",
  commercial_contact_name: "",
  commercial_contact_role: "",
  commercial_contact_email: "",
  commercial_contact_phone: "",
  commercial_contact_mobile: "",
  preferred_language: "es",
  preferred_contact_channel: "email",
  mirror_commercial_to_billing: false,
  activate_on_create: true,
  demo_seed_enabled: false,
  create_initial_admin: false,
  initial_admin_full_name: "",
  initial_admin_email: "",
  initial_admin_phone: "",
  initial_admin_access_mode: "invite",
  initial_admin_temporary_password: "",
});

const emptyBillingDirty = () => ({
  billing_fiscal_name: false,
  billing_tax_id: false,
  billing_contact_name: false,
  billing_email: false,
  billing_phone: false,
});

export function NewCompanyModal({ open, onOpenChange, plans, ownerEmail, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [billingDirty, setBillingDirty] = useState(emptyBillingDirty);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(emptyForm());
      setError("");
      setBusy(false);
      setBillingDirty(emptyBillingDirty());
      setCopyConfirmOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !form.mirror_commercial_to_billing) {
      return;
    }
    setForm((f) => {
      let changed = false;
      const n = { ...f };
      const sync = (dirtyKey, from, to) => {
        if (billingDirty[dirtyKey]) {
          return;
        }
        const src = f[from] ?? "";
        if (String(n[to] ?? "") !== String(src)) {
          n[to] = src;
          changed = true;
        }
      };
      sync("billing_fiscal_name", "legal_name", "billing_fiscal_name");
      sync("billing_tax_id", "tax_id", "billing_tax_id");
      sync("billing_contact_name", "commercial_contact_name", "billing_contact_name");
      sync("billing_email", "commercial_contact_email", "billing_email");
      sync("billing_phone", "commercial_contact_phone", "billing_phone");
      return changed ? n : f;
    });
  }, [
    open,
    form.mirror_commercial_to_billing,
    form.legal_name,
    form.tax_id,
    form.commercial_contact_name,
    form.commercial_contact_email,
    form.commercial_contact_phone,
    billingDirty.billing_fiscal_name,
    billingDirty.billing_tax_id,
    billingDirty.billing_contact_name,
    billingDirty.billing_email,
    billingDirty.billing_phone,
  ]);

  const planItems = useMemo(() => {
    const list = Array.isArray(plans) ? plans : [];
    return list.filter((p) => p?.is_active !== false);
  }, [plans]);

  const ownerNorm = String(ownerEmail || "")
    .trim()
    .toLowerCase();
  const adminEmailNorm = String(form.initial_admin_email || "")
    .trim()
    .toLowerCase();
  const adminEmailBlocks = Boolean(ownerNorm) && Boolean(adminEmailNorm) && adminEmailNorm === ownerNorm;

  const syncSlugFromName = useCallback((commercialName) => {
    setForm((f) => {
      if (f.slug_manual) {
        return f;
      }
      return { ...f, slug: slugify(commercialName) };
    });
  }, []);

  const applyCommercialToBilling = () => {
    setForm((f) => ({
      ...f,
      billing_fiscal_name: f.legal_name || "",
      billing_tax_id: f.tax_id || "",
      billing_contact_name: f.commercial_contact_name || "",
      billing_email: f.commercial_contact_email || "",
      billing_phone: f.commercial_contact_phone || "",
    }));
    setBillingDirty(emptyBillingDirty());
  };

  const requestCopyCommercialToBilling = () => {
    const targets = [
      "billing_fiscal_name",
      "billing_tax_id",
      "billing_contact_name",
      "billing_email",
      "billing_phone",
    ];
    const anyFilled = targets.some((k) => String(form[k] || "").trim() !== "");
    if (anyFilled) {
      setCopyConfirmOpen(true);
    } else {
      applyCommercialToBilling();
    }
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("El nombre comercial es obligatorio.");
      return;
    }
    if (form.create_initial_admin) {
      if (!form.initial_admin_email.trim() || !form.initial_admin_full_name.trim()) {
        setError("Completa nombre y email del administrador inicial.");
        return;
      }
      if (adminEmailBlocks) {
        setError("La cuenta owner no puede ser administrador inicial de empresa.");
        return;
      }
      if (form.initial_admin_access_mode === "password_temp" && !form.initial_admin_temporary_password) {
        setError("Indica una contraseña temporal o elige invitación por enlace.");
        return;
      }
    }

    const payload = {
      name: form.name.trim(),
      trade_name: form.trade_name.trim() || null,
      legal_name: form.legal_name.trim() || null,
      tax_id: form.tax_id.trim() || null,
      tax_id_type: form.tax_id_type,
      slug: form.slug.trim() || slugify(form.name),
      commercial_status: form.commercial_status,
      plan_code: form.plan_code || "starter",
      trial_starts_at: form.trial_starts_at.trim() || null,
      trial_ends_at: form.trial_ends_at.trim() || null,
      commercial_notes: form.commercial_notes.trim() || null,
      billing_fiscal_name: form.billing_fiscal_name.trim() || null,
      billing_tax_id: form.billing_tax_id.trim() || null,
      billing_email: form.billing_email.trim() || null,
      billing_phone: form.billing_phone.trim() || null,
      billing_contact_name: form.billing_contact_name.trim() || null,
      billing_address_line1: form.billing_address_line1.trim() || null,
      billing_address_line2: form.billing_address_line2.trim() || null,
      billing_postal_code: form.billing_postal_code.trim() || null,
      billing_city: form.billing_city.trim() || null,
      billing_region: form.billing_region.trim() || null,
      billing_country: form.billing_country.trim() || "ES",
      payment_method: form.payment_method,
      payment_terms: form.payment_terms,
      internal_customer_reference: form.internal_customer_reference.trim() || null,
      owner_private_notes: form.owner_private_notes.trim() || null,
      commercial_contact_name: form.commercial_contact_name.trim() || null,
      commercial_contact_role: form.commercial_contact_role.trim() || null,
      commercial_contact_email: form.commercial_contact_email.trim() || null,
      commercial_contact_phone: form.commercial_contact_phone.trim() || null,
      commercial_contact_mobile: form.commercial_contact_mobile.trim() || null,
      preferred_language: form.preferred_language,
      preferred_contact_channel: form.preferred_contact_channel,
      activate_on_create: form.activate_on_create,
      demo_seed_enabled: form.demo_seed_enabled,
      create_initial_admin: form.create_initial_admin,
      ...(form.create_initial_admin
        ? {
            initial_admin_full_name: form.initial_admin_full_name.trim(),
            initial_admin_email: form.initial_admin_email.trim().toLowerCase(),
            initial_admin_phone: form.initial_admin_phone.trim() || null,
            initial_admin_access_mode: form.initial_admin_access_mode,
            ...(form.initial_admin_access_mode === "password_temp"
              ? { initial_admin_temporary_password: form.initial_admin_temporary_password }
              : {}),
          }
        : {}),
    };

    setBusy(true);
    try {
      const res = await appApi.organizations.create(payload);
      onCreated?.({
        organizationId: res?.organization?.id,
        initial_admin_warning: res?.initial_admin_warning,
        initial_admin_email_delivery: res?.initial_admin_email_delivery,
        initial_admin_invite_url: res?.initial_admin_invite_url,
        create_initial_admin: form.create_initial_admin,
        initial_admin_access_mode: form.initial_admin_access_mode,
      });
      onOpenChange(false);
    } catch (e) {
      setError(e?.message || "No se pudo crear la empresa.");
    } finally {
      setBusy(false);
    }
  };

  const sectionTitle = (label) => (
    <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2 mb-3">{label}</h3>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] rounded-2xl p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-semibold tracking-tight">Nueva empresa</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Alta controlada para venta, facturación y soporte. Los campos marcados con * son obligatorios
            según el estado comercial.
          </p>
        </DialogHeader>

        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-6">
          <form
            className="space-y-8 pb-6"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div>
              {sectionTitle("A — Datos comerciales")}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Nombre comercial *</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    name="newco_trade_display"
                    autoComplete="off"
                    value={form.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, name: v }));
                      syncSlugFromName(v);
                    }}
                    placeholder="Nombre con el que opera la empresa"
                  />
                </div>
                <div>
                  <Label>Nombre de marca (opcional)</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.trade_name}
                    onChange={(e) => setForm((f) => ({ ...f, trade_name: e.target.value }))}
                    placeholder="Si difiere del nombre comercial"
                  />
                </div>
                <div>
                  <Label>Razón social *</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="organization"
                    value={form.legal_name}
                    onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                    placeholder="Razón social fiscal"
                  />
                </div>
                <div>
                  <Label>NIF / CIF / VAT *</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.tax_id}
                    onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Tipo identificador fiscal</Label>
                  <Select
                    value={form.tax_id_type}
                    onValueChange={(v) => setForm((f) => ({ ...f, tax_id_type: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nif">NIF</SelectItem>
                      <SelectItem value="cif">CIF</SelectItem>
                      <SelectItem value="nie">NIE</SelectItem>
                      <SelectItem value="vat">VAT intracomunitario</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Slug interno</Label>
                  <Input
                    className="mt-1 rounded-xl font-mono text-sm"
                    autoComplete="off"
                    name="newco_org_slug"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, slug: e.target.value, slug_manual: true }))
                    }
                    placeholder="se-genera-automaticamente"
                  />
                </div>
                <div>
                  <Label>Estado comercial</Label>
                  <Select
                    value={form.commercial_status}
                    onValueChange={(v) => setForm((f) => ({ ...f, commercial_status: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prueba">Prueba</SelectItem>
                      <SelectItem value="activa">Activa</SelectItem>
                      <SelectItem value="pendiente_pago">Pendiente de pago</SelectItem>
                      <SelectItem value="pausada">Pausada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Plan inicial</Label>
                  <Select
                    value={form.plan_code}
                    onValueChange={(v) => setForm((f) => ({ ...f, plan_code: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {planItems.map((p) => (
                        <SelectItem key={p.code || p.id} value={p.code}>
                          {p.name} ({p.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Inicio prueba (ISO opcional)</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.trial_starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, trial_starts_at: e.target.value }))}
                    placeholder="2026-01-15"
                  />
                </div>
                <div>
                  <Label>Fin prueba (ISO opcional)</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.trial_ends_at}
                    onChange={(e) => setForm((f) => ({ ...f, trial_ends_at: e.target.value }))}
                    placeholder="2026-02-15"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Notas comerciales internas</Label>
                  <Textarea
                    className="mt-1 rounded-xl min-h-[72px]"
                    autoComplete="off"
                    value={form.commercial_notes}
                    onChange={(e) => setForm((f) => ({ ...f, commercial_notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              {sectionTitle("B — Facturación")}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 rounded-xl border border-border bg-muted/10 px-3 py-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.mirror_commercial_to_billing}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, mirror_commercial_to_billing: v === true }))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Usar estos datos también para facturación</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Sincroniza razón social, NIF y contacto comercial con facturación salvo que edite
                      facturación a mano.
                    </span>
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl shrink-0"
                  onClick={requestCopyCommercialToBilling}
                >
                  Copiar datos comerciales a facturación
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Nombre fiscal / razón social de facturación</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.billing_fiscal_name}
                    onChange={(e) => {
                      setBillingDirty((d) => ({ ...d, billing_fiscal_name: true }));
                      setForm((f) => ({ ...f, billing_fiscal_name: e.target.value }));
                    }}
                  />
                </div>
                <div>
                  <Label>NIF / VAT facturación</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.billing_tax_id}
                    onChange={(e) => {
                      setBillingDirty((d) => ({ ...d, billing_tax_id: true }));
                      setForm((f) => ({ ...f, billing_tax_id: e.target.value }));
                    }}
                  />
                </div>
                <div>
                  <Label>Email facturación</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    type="email"
                    autoComplete="off"
                    name="newco_billing_email"
                    value={form.billing_email}
                    onChange={(e) => {
                      setBillingDirty((d) => ({ ...d, billing_email: true }));
                      setForm((f) => ({ ...f, billing_email: e.target.value }));
                    }}
                  />
                </div>
                <div>
                  <Label>Teléfono facturación</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.billing_phone}
                    onChange={(e) => {
                      setBillingDirty((d) => ({ ...d, billing_phone: true }));
                      setForm((f) => ({ ...f, billing_phone: e.target.value }));
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Persona de contacto facturación</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.billing_contact_name}
                    onChange={(e) => {
                      setBillingDirty((d) => ({ ...d, billing_contact_name: true }));
                      setForm((f) => ({ ...f, billing_contact_name: e.target.value }));
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Dirección línea 1</Label>
                  <BillingAddressSuggestInput
                    className="mt-1 rounded-xl"
                    name="newco_billing_address1"
                    value={form.billing_address_line1}
                    onChange={(v) => setForm((f) => ({ ...f, billing_address_line1: v }))}
                    onPick={(s) =>
                      setForm((f) => ({
                        ...f,
                        billing_address_line1: s.address_line1 || s.label || "",
                        billing_postal_code: s.postal_code || "",
                        billing_city: s.city || "",
                        billing_region: s.region || "",
                        billing_country: s.country_code || s.country || f.billing_country || "ES",
                      }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Dirección línea 2</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.billing_address_line2}
                    onChange={(e) => setForm((f) => ({ ...f, billing_address_line2: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Código postal</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="postal-code"
                    value={form.billing_postal_code}
                    onChange={(e) => setForm((f) => ({ ...f, billing_postal_code: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Población</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="address-level2"
                    value={form.billing_city}
                    onChange={(e) => setForm((f) => ({ ...f, billing_city: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Provincia</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="address-level1"
                    value={form.billing_region}
                    onChange={(e) => setForm((f) => ({ ...f, billing_region: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>País</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="country-name"
                    value={form.billing_country}
                    onChange={(e) => setForm((f) => ({ ...f, billing_country: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Método de pago previsto</Label>
                  <Select
                    value={form.payment_method}
                    onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="domiciliacion_sepa">Domiciliación SEPA</SelectItem>
                      <SelectItem value="tarjeta_stripe">Tarjeta / Stripe</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Condiciones de pago</Label>
                  <Select
                    value={form.payment_terms}
                    onValueChange={(v) => setForm((f) => ({ ...f, payment_terms: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inmediato">Inmediato</SelectItem>
                      <SelectItem value="15_dias">15 días</SelectItem>
                      <SelectItem value="30_dias">30 días</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Referencia interna de cliente</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.internal_customer_reference}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, internal_customer_reference: e.target.value }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Notas privadas de facturación</Label>
                  <Textarea
                    className="mt-1 rounded-xl min-h-[72px]"
                    autoComplete="off"
                    value={form.owner_private_notes}
                    onChange={(e) => setForm((f) => ({ ...f, owner_private_notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              {sectionTitle("C — Contacto principal")}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Nombre contacto</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="name"
                    value={form.commercial_contact_name}
                    onChange={(e) => setForm((f) => ({ ...f, commercial_contact_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.commercial_contact_role}
                    onChange={(e) => setForm((f) => ({ ...f, commercial_contact_role: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    type="email"
                    autoComplete="off"
                    name="newco_primary_contact_email"
                    value={form.commercial_contact_email}
                    onChange={(e) => setForm((f) => ({ ...f, commercial_contact_email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.commercial_contact_phone}
                    onChange={(e) => setForm((f) => ({ ...f, commercial_contact_phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Móvil (opcional)</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    autoComplete="off"
                    value={form.commercial_contact_mobile}
                    onChange={(e) => setForm((f) => ({ ...f, commercial_contact_mobile: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Idioma preferido</Label>
                  <Select
                    value={form.preferred_language}
                    onValueChange={(v) => setForm((f) => ({ ...f, preferred_language: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="ca">Català</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Canal preferido</Label>
                  <Select
                    value={form.preferred_contact_channel}
                    onValueChange={(v) => setForm((f) => ({ ...f, preferred_contact_channel: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="telefono">Teléfono</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="indistinto">Indistinto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              {sectionTitle("D — Administrador inicial")}
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/10 p-3 mb-3">
                <Checkbox
                  id="create_admin"
                  checked={form.create_initial_admin}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, create_initial_admin: v === true }))
                  }
                />
                <div>
                  <Label htmlFor="create_admin" className="cursor-pointer font-medium">
                    Crear administrador inicial ahora
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Rol admin fijo. Se recomienda enviar invitación segura.
                  </p>
                </div>
              </div>
              {form.create_initial_admin ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Nombre y apellidos</Label>
                    <Input
                      className="mt-1 rounded-xl"
                      autoComplete="off"
                      name="newco_admin_fullname"
                      value={form.initial_admin_full_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, initial_admin_full_name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Email administrador</Label>
                    <Input
                      className="mt-1 rounded-xl"
                      type="email"
                      autoComplete="off"
                      name="newco_admin_email"
                      value={form.initial_admin_email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, initial_admin_email: e.target.value }))
                      }
                    />
                  </div>
                  {adminEmailBlocks ? (
                    <p className="sm:col-span-2 text-sm text-amber-900 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                      La cuenta owner no puede añadirse como usuario de empresa.
                    </p>
                  ) : null}
                  <div>
                    <Label>Teléfono admin (opcional)</Label>
                    <Input
                      className="mt-1 rounded-xl"
                      autoComplete="off"
                      value={form.initial_admin_phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, initial_admin_phone: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Modo de acceso</Label>
                    <Select
                      value={form.initial_admin_access_mode}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          initial_admin_access_mode: v,
                          initial_admin_temporary_password:
                            v === "invite" ? "" : f.initial_admin_temporary_password,
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invite">Invitación segura por email (recomendado)</SelectItem>
                        <SelectItem value="password_temp">Contraseña temporal (avanzado)</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.initial_admin_access_mode === "invite" ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Se enviará un correo al administrador para activar su cuenta.
                      </p>
                    ) : null}
                  </div>
                  {form.initial_admin_access_mode === "password_temp" ? (
                    <div className="sm:col-span-2 rounded-xl border border-dashed border-border/80 bg-muted/5 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">Opciones avanzadas — contraseña temporal</p>
                      <Label>Contraseña temporal</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        type="password"
                        autoComplete="new-password"
                        name="newco_admin_temp_password"
                        value={form.initial_admin_temporary_password}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            initial_admin_temporary_password: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              {sectionTitle("E — Configuración inicial")}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.activate_on_create}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, activate_on_create: v === true }))}
                  />
                  Activar empresa al crear
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.demo_seed_enabled}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, demo_seed_enabled: v === true }))}
                  />
                  Habilitar demo / datos de ejemplo
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Módulos funcionales (partes, fichaje, compras, IA, etc.): configuración pendiente de
                producto — sin cambios en esta fase.
              </p>
            </div>
          </form>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={busy || adminEmailBlocks}
            onClick={submit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Crear empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={copyConfirmOpen} onOpenChange={setCopyConfirmOpen}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Sustituir datos de facturación</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Ya hay datos de facturación escritos. ¿Quiere sustituirlos por los datos comerciales (razón
          social, NIF y contacto)?
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCopyConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            onClick={() => {
              applyCommercialToBilling();
              setCopyConfirmOpen(false);
            }}
          >
            Sustituir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
