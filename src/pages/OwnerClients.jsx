import { useCallback, useEffect, useMemo, useState } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { NewCompanyModal } from "@/pages/owner-clients/NewCompanyModal";
import { BillingAddressSuggestInput } from "@/pages/owner-clients/BillingAddressSuggestInput";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";

/** Must match `DEFAULT_ORGANIZATION_ID` in `server/lib/tenant.js`. */
const PLATFORM_INTERNAL_ORG_ID = "org-frigest";

const INITIAL_FISCAL_DRAFT = {
  name: "",
  trade_name: "",
  legal_name: "",
  tax_id: "",
  tax_id_type: "nif",
  commercial_status: "prueba",
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
  commercial_notes: "",
  commercial_contact_name: "",
  commercial_contact_role: "",
  commercial_contact_email: "",
  commercial_contact_phone: "",
  commercial_contact_mobile: "",
  preferred_language: "es",
  preferred_contact_channel: "email",
  mirror_commercial_to_billing: false,
};

const emptyBillingDirty = () => ({
  billing_fiscal_name: false,
  billing_tax_id: false,
  billing_contact_name: false,
  billing_email: false,
  billing_phone: false,
});

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
  return "Sin datos";
};

const isPlatformInternalOrg = (org) =>
  org?.is_platform_internal === true || org?.id === PLATFORM_INTERNAL_ORG_ID;

const formatMetric = (value, suffix = "") => {
  if (value === null || value === undefined || value === "") {
    return "Sin datos";
  }
  return `${value}${suffix}`;
};

export default function OwnerClients() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLicense, setFilterLicense] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterExtra, setFilterExtra] = useState("all");
  const [detailTab, setDetailTab] = useState("resumen");
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [fiscalDraft, setFiscalDraft] = useState(() => ({ ...INITIAL_FISCAL_DRAFT }));
  const [userDeleteTarget, setUserDeleteTarget] = useState(null);

  const [createUserForm, setCreateUserForm] = useState({
    full_name: "",
    email: "",
    role: "admin",
    temporary_password: "",
  });
  const [inviteUrl, setInviteUrl] = useState("");
  const [userActionMessage, setUserActionMessage] = useState("");
  const [ownerBanner, setOwnerBanner] = useState(null);
  const [billingDirty, setBillingDirty] = useState(emptyBillingDirty);
  const [copyBillingConfirmOpen, setCopyBillingConfirmOpen] = useState(false);
  const [fiscalSaveOk, setFiscalSaveOk] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeletePhrase, setHardDeletePhrase] = useState("");
  const [advancedInviteOpen, setAdvancedInviteOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [currentMe, overview, plansList] = await Promise.all([
        appApi.auth.me(),
        appApi.organizations.ownerOverview(),
        appApi.organizations.listPlans().catch(() => []),
      ]);
      setMe(currentMe);
      setPlans(Array.isArray(plansList) ? plansList : []);
      const items = overview?.organizations || [];
      const sorted = [...items].sort((a, b) => {
        return Number(isPlatformInternalOrg(a)) - Number(isPlatformInternalOrg(b));
      });
      setOrganizations(sorted);
      const clientSorted = sorted.filter((o) => !isPlatformInternalOrg(o));
      setSelectedId((prev) => {
        if (prev && clientSorted.some((o) => o.id === prev)) {
          return prev;
        }
        return clientSorted[0]?.id || "";
      });
    } catch (e) {
      setError(e?.message || "No se pudo cargar el panel.");
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
    setUserActionMessage("");
    setAdvancedInviteOpen(false);
  }, [selectedId]);

  useEffect(() => {
    setBillingDirty(emptyBillingDirty());
  }, [selectedId]);

  const clientOrganizations = useMemo(
    () => organizations.filter((org) => !isPlatformInternalOrg(org)),
    [organizations]
  );

  const selectedOrganization = useMemo(
    () => clientOrganizations.find((org) => org.id === selectedId) || null,
    [clientOrganizations, selectedId]
  );

  useEffect(() => {
    if (!selectedOrganization) {
      setFiscalDraft({ ...INITIAL_FISCAL_DRAFT });
      return;
    }
    const p = selectedOrganization.owner_profile || {};
    setFiscalDraft({
      ...INITIAL_FISCAL_DRAFT,
      name: p.name || selectedOrganization.name || "",
      trade_name: p.trade_name || "",
      legal_name: p.legal_name || "",
      tax_id: p.tax_id || "",
      tax_id_type: p.tax_id_type || "nif",
      commercial_status: p.commercial_status || selectedOrganization.commercial_status || "prueba",
      billing_fiscal_name: p.billing_fiscal_name || "",
      billing_tax_id: p.billing_tax_id || "",
      billing_email: p.billing_email || "",
      billing_phone: p.billing_phone || "",
      billing_contact_name: p.billing_contact_name || "",
      billing_address_line1: p.billing_address_line1 || "",
      billing_address_line2: p.billing_address_line2 || "",
      billing_postal_code: p.billing_postal_code || "",
      billing_city: p.billing_city || "",
      billing_region: p.billing_region || "",
      billing_country: p.billing_country || "ES",
      payment_method: p.payment_method || "pendiente",
      payment_terms: p.payment_terms || "30_dias",
      internal_customer_reference: p.internal_customer_reference || "",
      owner_private_notes: p.owner_private_notes || "",
      commercial_notes: p.commercial_notes || "",
      commercial_contact_name: p.commercial_contact_name || "",
      commercial_contact_role: p.commercial_contact_role || "",
      commercial_contact_email: p.commercial_contact_email || "",
      commercial_contact_phone: p.commercial_contact_phone || "",
      commercial_contact_mobile: p.commercial_contact_mobile || "",
      preferred_language: p.preferred_language || "es",
      preferred_contact_channel: p.preferred_contact_channel || "email",
      mirror_commercial_to_billing: p.mirror_commercial_to_billing === true,
    });
  }, [selectedOrganization]);

  useEffect(() => {
    if (!selectedOrganization?.id || !fiscalDraft.mirror_commercial_to_billing) {
      return;
    }
    setFiscalDraft((d) => {
      let changed = false;
      const n = { ...d };
      const sync = (dirtyKey, from, to) => {
        if (billingDirty[dirtyKey]) {
          return;
        }
        const src = d[from] ?? "";
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
      return changed ? n : d;
    });
  }, [
    selectedOrganization?.id,
    fiscalDraft.mirror_commercial_to_billing,
    fiscalDraft.legal_name,
    fiscalDraft.tax_id,
    fiscalDraft.commercial_contact_name,
    fiscalDraft.commercial_contact_email,
    fiscalDraft.commercial_contact_phone,
    billingDirty.billing_fiscal_name,
    billingDirty.billing_tax_id,
    billingDirty.billing_contact_name,
    billingDirty.billing_email,
    billingDirty.billing_phone,
  ]);

  const filteredOrganizations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clientOrganizations.filter((org) => {
      const p = org.owner_profile || {};
      const hay = [
        org.name,
        org.slug,
        org.legal_name,
        org.tax_id,
        p.legal_name,
        p.tax_id,
        p.billing_email,
        p.commercial_contact_email,
        ...(org.users || []).map((u) => u.email),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (q) {
        const tokens = q.split(/\s+/).filter((t) => t.length > 0);
        if (!tokens.every((t) => hay.includes(t))) {
          return false;
        }
      }
      const lic = String(org.billing?.subscription?.status || "").toLowerCase();
      if (filterLicense !== "all" && lic !== filterLicense) {
        return false;
      }
      const pc = org.billing?.subscription?.plan_code || org.plan_code || "";
      if (filterPlan !== "all" && String(pc) !== filterPlan) {
        return false;
      }
      if (filterExtra === "trial" && lic !== "trialing") {
        return false;
      }
      if (filterExtra === "no_admin" && org.has_admin) {
        return false;
      }
      if (filterExtra === "no_fiscal" && org.fiscal_complete) {
        return false;
      }
      return true;
    });
  }, [clientOrganizations, searchQuery, filterLicense, filterPlan, filterExtra]);

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

  const applyCommercialToBilling = () => {
    setFiscalDraft((d) => ({
      ...d,
      billing_fiscal_name: d.legal_name || "",
      billing_tax_id: d.tax_id || "",
      billing_contact_name: d.commercial_contact_name || "",
      billing_email: d.commercial_contact_email || "",
      billing_phone: d.commercial_contact_phone || "",
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
    const anyFilled = targets.some((k) => String(fiscalDraft[k] || "").trim() !== "");
    if (anyFilled) {
      setCopyBillingConfirmOpen(true);
    } else {
      applyCommercialToBilling();
    }
  };

  const isSessionOwnerContextOrg =
    me?.is_hidden_owner === true &&
    Boolean(me?.current_organization?.id) &&
    selectedOrganization?.id === me.current_organization.id;

  const hardDeleteBlocked =
    isSessionOwnerContextOrg || (selectedOrganization && isPlatformInternalOrg(selectedOrganization));

  const planFilterOptions = useMemo(() => {
    const codes = new Set();
    clientOrganizations.forEach((o) => {
      codes.add(o.billing?.subscription?.plan_code || o.plan_code || "starter");
    });
    return [...codes].sort();
  }, [clientOrganizations]);

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
      const ed = response?.email_delivery;
      const okSmtp = ed?.success === true && ed?.provider === "smtp";
      setInviteUrl(response?.invite_url || "");
      if (okSmtp) {
        setUserActionMessage("Invitación enviada correctamente.");
      } else if (response?.invite_url) {
        setUserActionMessage(
          "Usuario creado, pero no se pudo enviar el email. Copie este enlace y envíelo manualmente."
        );
      } else if (ed?.success === true && (ed?.provider === "stub" || ed?.provider === "disabled")) {
        setUserActionMessage("Usuario creado. El correo está en modo simulación o desactivado.");
      } else {
        setUserActionMessage("");
      }
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

  const confirmDeleteUser = async () => {
    if (!userDeleteTarget) {
      return;
    }
    const { organizationId, userId } = userDeleteTarget;
    setUserDeleteTarget(null);
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

  const handleSaveFiscal = async () => {
    if (!selectedOrganization?.id) return;
    setBusy("save-fiscal");
    setError("");
    try {
      await appApi.organizations.updateOwnerProfile(selectedOrganization.id, {
        name: fiscalDraft.name?.trim() || selectedOrganization.name,
        trade_name: fiscalDraft.trade_name,
        legal_name: fiscalDraft.legal_name,
        tax_id: fiscalDraft.tax_id,
        tax_id_type: fiscalDraft.tax_id_type,
        commercial_status: fiscalDraft.commercial_status,
        billing_fiscal_name: fiscalDraft.billing_fiscal_name,
        billing_tax_id: fiscalDraft.billing_tax_id,
        billing_email: fiscalDraft.billing_email,
        billing_phone: fiscalDraft.billing_phone,
        billing_contact_name: fiscalDraft.billing_contact_name,
        billing_address_line1: fiscalDraft.billing_address_line1,
        billing_address_line2: fiscalDraft.billing_address_line2,
        billing_postal_code: fiscalDraft.billing_postal_code,
        billing_city: fiscalDraft.billing_city,
        billing_region: fiscalDraft.billing_region,
        billing_country: fiscalDraft.billing_country,
        payment_method: fiscalDraft.payment_method,
        payment_terms: fiscalDraft.payment_terms,
        internal_customer_reference: fiscalDraft.internal_customer_reference,
        owner_private_notes: fiscalDraft.owner_private_notes,
        commercial_notes: fiscalDraft.commercial_notes,
        commercial_contact_name: fiscalDraft.commercial_contact_name,
        commercial_contact_role: fiscalDraft.commercial_contact_role,
        commercial_contact_email: fiscalDraft.commercial_contact_email,
        commercial_contact_phone: fiscalDraft.commercial_contact_phone,
        commercial_contact_mobile: fiscalDraft.commercial_contact_mobile,
        preferred_language: fiscalDraft.preferred_language,
        preferred_contact_channel: fiscalDraft.preferred_contact_channel,
      });
      await load();
      setFiscalSaveOk(true);
      window.setTimeout(() => setFiscalSaveOk(false), 5000);
    } catch (e) {
      setError(e?.message || "No se pudieron guardar los datos.");
    } finally {
      setBusy("");
    }
  };

  const onNewCompanyCreated = useCallback(
    async (info) => {
      setOwnerBanner(null);
      setError("");
      await load();
      const organizationId = info?.organizationId;
      if (organizationId) {
        setSelectedId(organizationId);
        setDetailTab("resumen");
      }
      if (info?.initial_admin_warning) {
        setError(
          "La empresa se ha creado, pero no se pudo crear el administrador inicial. Puede reintentar desde Usuarios."
        );
        return;
      }
      if (info?.create_initial_admin && info?.initial_admin_access_mode === "invite") {
        const d = info?.initial_admin_email_delivery;
        const okSmtp = d?.success === true && d?.provider === "smtp";
        if (okSmtp) {
          setOwnerBanner({
            type: "success",
            message: "Empresa creada. Invitación enviada al administrador.",
          });
          return;
        }
        if (info?.initial_admin_invite_url) {
          setOwnerBanner({
            type: "warn",
            message:
              "Empresa creada, pero no se pudo enviar el email. Copie este enlace de invitación y envíelo manualmente.",
            url: info.initial_admin_invite_url,
          });
          return;
        }
        if (d?.success === true && (d?.provider === "stub" || d?.provider === "disabled")) {
          setOwnerBanner({
            type: "info",
            message:
              "Empresa creada. El correo está en modo simulación o desactivado; use el enlace si lo necesita.",
            url: info?.initial_admin_invite_url,
          });
          return;
        }
      }
      setOwnerBanner({ type: "success", message: "Empresa creada correctamente." });
    },
    []
  );

  if (loading) {
    return (
      <div className="p-6 lg:p-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando empresas…
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
    <div className="p-4 lg:p-10 max-w-7xl mx-auto space-y-6 pb-32 lg:pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Building2 className="h-7 w-7 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Empresas FRIGEST</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Consola owner: alta de clientes, ficha fiscal, licencias y soporte. Sin acceso a datos
              operativos del tenant.
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="rounded-xl shrink-0 self-start"
          onClick={() => setNewCompanyOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva empresa
        </Button>
      </div>

      <NewCompanyModal
        open={newCompanyOpen}
        onOpenChange={setNewCompanyOpen}
        plans={plans}
        ownerEmail={me?.email}
        onCreated={onNewCompanyCreated}
      />

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {ownerBanner ? (
        <div
          className={`rounded-2xl border p-4 text-sm flex flex-col gap-2 ${
            ownerBanner.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-950"
              : ownerBanner.type === "warn"
                ? "border-amber-500/35 bg-amber-500/5 text-amber-950"
                : "border-border bg-muted/30 text-foreground"
          }`}
        >
          <p>{ownerBanner.message}</p>
          {ownerBanner.url ? (
            <p className="font-mono text-xs break-all text-muted-foreground">{ownerBanner.url}</p>
          ) : null}
          <div>
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setOwnerBanner(null)}>
              Cerrar aviso
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 rounded-xl"
            placeholder="Buscar por nombre, razón social, NIF, slug o email…"
            value={searchQuery}
            autoComplete="off"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterLicense} onValueChange={setFilterLicense}>
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue placeholder="Licencia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las licencias</SelectItem>
              <SelectItem value="active">Activa</SelectItem>
              <SelectItem value="trialing">Prueba</SelectItem>
              <SelectItem value="paused">Pausada</SelectItem>
              <SelectItem value="past_due">Impago</SelectItem>
              <SelectItem value="incomplete">Pendiente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-[140px] rounded-xl">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los planes</SelectItem>
              {planFilterOptions.map((c) => (
                <SelectItem key={c} value={String(c)}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterExtra} onValueChange={setFilterExtra}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue placeholder="Filtro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sin filtro extra</SelectItem>
              <SelectItem value="trial">Solo en prueba</SelectItem>
              <SelectItem value="no_admin">Sin administrador</SelectItem>
              <SelectItem value="no_fiscal">Fiscal incompleto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-4 space-y-2">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Directorio</p>
              <span className="text-xs text-muted-foreground">{filteredOrganizations.length}</span>
            </div>
            <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {filteredOrganizations.map((org) => {
                const billing = org.billing || null;
                const status = billing?.subscription?.status || "active";
                const seats = billing?.usage?.active_seats ?? org.user_count ?? 0;
                const limit = billing?.limits?.seat_limit ?? null;
                const isSelected = org.id === selectedId;
                const internal = isPlatformInternalOrg(org);
                const p = org.owner_profile || {};
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(org.id);
                      setDetailTab("resumen");
                    }}
                    className={[
                      "w-full text-left p-4 hover:bg-muted/30 transition-colors",
                      isSelected ? "bg-muted/40" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-semibold truncate">{org.name}</p>
                          {internal ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground border border-border px-1 py-0.5 rounded">
                              Interna
                            </span>
                          ) : null}
                        </div>
                        {p.legal_name || org.legal_name ? (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.legal_name || org.legal_name}
                          </p>
                        ) : null}
                        {(p.tax_id || org.tax_id) && !internal ? (
                          <p className="text-[11px] font-mono text-muted-foreground">{p.tax_id || org.tax_id}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground truncate">{org.slug || "sin-slug"}</p>
                        {!org.fiscal_complete && !internal ? (
                          <p className="text-[11px] text-amber-800">Fiscal incompleto</p>
                        ) : null}
                        {!org.has_admin && !internal ? (
                          <p className="text-[11px] text-amber-800">Sin administrador</p>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium">{statusLabel(status)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {seats}
                          {limit ? ` / ${limit}` : " / ∞"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {billing?.subscription?.plan_code || org.plan_code || "starter"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!filteredOrganizations.length && (
                <div className="p-6 text-sm text-muted-foreground text-center space-y-2">
                  {clientOrganizations.length ? (
                    <p>Ninguna empresa coincide con el criterio.</p>
                  ) : (
                    <>
                      <p>Todavía no hay empresas cliente.</p>
                      <p>Crea la primera empresa desde Nueva empresa.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-8 space-y-4">
          {!selectedOrganization ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground space-y-2">
              {clientOrganizations.length ? (
                <p>Seleccione una empresa en el directorio.</p>
              ) : (
                <>
                  <p>Todavía no hay empresas cliente.</p>
                  <p>Crea la primera empresa desde Nueva empresa.</p>
                </>
              )}
            </div>
          ) : (
            <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-4">
              <div className="rounded-2xl border border-border bg-card px-2 pt-2">
                <TabsList className="flex w-full flex-wrap h-auto gap-1 bg-transparent p-0 justify-start">
                  {[
                    ["resumen", "Resumen"],
                    ["fiscal", "Datos fiscales"],
                    ["contactos", "Contactos"],
                    ["usuarios", "Usuarios"],
                    ["plan", "Plan y licencia"],
                    ["consumo", "Consumo"],
                    ["soporte", "Soporte"],
                    ["peligro", "Zona de peligro"],
                  ].map(([id, label]) => (
                    <TabsTrigger
                      key={id}
                      value={id}
                      className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-muted px-3 py-2"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="resumen" className="mt-0 space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{selectedOrganization.name}</h2>
                    {isPlatformInternalOrg(selectedOrganization) ? (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                        Interna FRIGEST
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{selectedOrganization.slug}</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border/80 p-4 bg-muted/10">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Licencia</p>
                      <p className="mt-2 font-medium">{statusLabel(licenseStatus)}</p>
                    </div>
                    <div className="rounded-xl border border-border/80 p-4 bg-muted/10">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Plan</p>
                      <p className="mt-2 font-medium">
                        {selectedBilling?.plan?.name ||
                          selectedBilling?.subscription?.plan_code ||
                          selectedOrganization.plan_code ||
                          "Sin datos"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/80 p-4 bg-muted/10">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Usuarios</p>
                      <p className="mt-2 font-medium">
                        {activeSeats}
                        {seatLimit ? ` / ${seatLimit}` : " / ∞"}
                      </p>
                    </div>
                  </div>
                  {!selectedOrganization.has_admin && !isPlatformInternalOrg(selectedOrganization) ? (
                    <p className="text-sm text-amber-900 border border-amber-500/25 bg-amber-500/5 rounded-xl px-3 py-2">
                      Esta empresa aún no tiene administrador.
                    </p>
                  ) : null}
                  {!selectedOrganization.fiscal_complete && !isPlatformInternalOrg(selectedOrganization) ? (
                    <p className="text-sm text-amber-900 border border-amber-500/25 bg-amber-500/5 rounded-xl px-3 py-2">
                      Faltan datos fiscales para facturación.
                    </p>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="fiscal" className="mt-0">
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">Datos fiscales y comerciales</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedOrganization.fiscal_complete ? "Ficha fiscal completa" : "Faltan datos fiscales"}
                      </p>
                      {fiscalSaveOk ? (
                        <p className="text-xs text-emerald-700 mt-2">Cambios guardados correctamente.</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      className="rounded-xl shrink-0"
                      disabled={busy === "save-fiscal" || isPlatformInternalOrg(selectedOrganization)}
                      onClick={handleSaveFiscal}
                    >
                      {busy === "save-fiscal" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Guardar cambios
                    </Button>
                  </div>
                  {!isPlatformInternalOrg(selectedOrganization) ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-muted/10 px-3 py-2">
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={fiscalDraft.mirror_commercial_to_billing}
                          onCheckedChange={(v) =>
                            setFiscalDraft((d) => ({ ...d, mirror_commercial_to_billing: v === true }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">Usar datos comerciales también para facturación</span>
                          <span className="block text-xs text-muted-foreground font-normal">
                            Sincroniza razón social, NIF y contacto salvo que edite facturación manualmente.
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
                  ) : null}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Nombre comercial</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        name="owner_edit_org_name"
                        value={fiscalDraft.name}
                        onChange={(e) => setFiscalDraft((d) => ({ ...d, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Marca (opcional)</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.trade_name}
                        onChange={(e) => setFiscalDraft((d) => ({ ...d, trade_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Razón social</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.legal_name}
                        onChange={(e) => setFiscalDraft((d) => ({ ...d, legal_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>NIF / CIF / VAT</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.tax_id}
                        onChange={(e) => setFiscalDraft((d) => ({ ...d, tax_id: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Tipo fiscal</Label>
                      <Select
                        value={fiscalDraft.tax_id_type}
                        onValueChange={(v) => setFiscalDraft((d) => ({ ...d, tax_id_type: v }))}
                      >
                        <SelectTrigger className="mt-1 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nif">NIF</SelectItem>
                          <SelectItem value="cif">CIF</SelectItem>
                          <SelectItem value="nie">NIE</SelectItem>
                          <SelectItem value="vat">VAT</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Estado comercial</Label>
                      <Select
                        value={fiscalDraft.commercial_status}
                        onValueChange={(v) => setFiscalDraft((d) => ({ ...d, commercial_status: v }))}
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
                    <div className="sm:col-span-2">
                      <Label>Nombre fiscal facturación</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_fiscal_name}
                        onChange={(e) => {
                          setBillingDirty((x) => ({ ...x, billing_fiscal_name: true }));
                          setFiscalDraft((d) => ({ ...d, billing_fiscal_name: e.target.value }));
                        }}
                      />
                    </div>
                    <div>
                      <Label>NIF facturación</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_tax_id}
                        onChange={(e) => {
                          setBillingDirty((x) => ({ ...x, billing_tax_id: true }));
                          setFiscalDraft((d) => ({ ...d, billing_tax_id: e.target.value }));
                        }}
                      />
                    </div>
                    <div>
                      <Label>Email facturación</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        type="email"
                        autoComplete="off"
                        name="owner_edit_billing_email"
                        value={fiscalDraft.billing_email}
                        onChange={(e) => {
                          setBillingDirty((x) => ({ ...x, billing_email: true }));
                          setFiscalDraft((d) => ({ ...d, billing_email: e.target.value }));
                        }}
                      />
                    </div>
                    <div>
                      <Label>Teléfono facturación</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_phone}
                        onChange={(e) => {
                          setBillingDirty((x) => ({ ...x, billing_phone: true }));
                          setFiscalDraft((d) => ({ ...d, billing_phone: e.target.value }));
                        }}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Contacto facturación</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_contact_name}
                        onChange={(e) => {
                          setBillingDirty((x) => ({ ...x, billing_contact_name: true }));
                          setFiscalDraft((d) => ({ ...d, billing_contact_name: e.target.value }));
                        }}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Dirección fiscal línea 1</Label>
                      <BillingAddressSuggestInput
                        className="mt-1 rounded-xl"
                        name="owner_edit_billing_address1"
                        value={fiscalDraft.billing_address_line1}
                        onChange={(v) => setFiscalDraft((d) => ({ ...d, billing_address_line1: v }))}
                        onPick={(s) =>
                          setFiscalDraft((d) => ({
                            ...d,
                            billing_address_line1: s.address_line1 || s.label || "",
                            billing_postal_code: s.postal_code || "",
                            billing_city: s.city || "",
                            billing_region: s.region || "",
                            billing_country: s.country_code || s.country || d.billing_country || "ES",
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Código postal</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_postal_code}
                        onChange={(e) =>
                          setFiscalDraft((d) => ({ ...d, billing_postal_code: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Población</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_city}
                        onChange={(e) => setFiscalDraft((d) => ({ ...d, billing_city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Provincia / región</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_region}
                        onChange={(e) => setFiscalDraft((d) => ({ ...d, billing_region: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>País</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.billing_country}
                        onChange={(e) =>
                          setFiscalDraft((d) => ({ ...d, billing_country: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Método de pago previsto</Label>
                      <Select
                        value={fiscalDraft.payment_method}
                        onValueChange={(v) => setFiscalDraft((d) => ({ ...d, payment_method: v }))}
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
                        value={fiscalDraft.payment_terms}
                        onValueChange={(v) => setFiscalDraft((d) => ({ ...d, payment_terms: v }))}
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
                    <div className="sm:col-span-2">
                      <Label>Referencia interna</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        autoComplete="off"
                        value={fiscalDraft.internal_customer_reference}
                        onChange={(e) =>
                          setFiscalDraft((d) => ({ ...d, internal_customer_reference: e.target.value }))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2 pt-2 border-t border-border">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Contacto principal
                      </p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <Label>Nombre</Label>
                          <Input
                            className="mt-1 rounded-xl"
                            autoComplete="name"
                            value={fiscalDraft.commercial_contact_name}
                            onChange={(e) =>
                              setFiscalDraft((d) => ({ ...d, commercial_contact_name: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Cargo</Label>
                          <Input
                            className="mt-1 rounded-xl"
                            autoComplete="off"
                            value={fiscalDraft.commercial_contact_role}
                            onChange={(e) =>
                              setFiscalDraft((d) => ({ ...d, commercial_contact_role: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Email</Label>
                          <Input
                            className="mt-1 rounded-xl"
                            type="email"
                            autoComplete="off"
                            value={fiscalDraft.commercial_contact_email}
                            onChange={(e) =>
                              setFiscalDraft((d) => ({ ...d, commercial_contact_email: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Teléfono</Label>
                          <Input
                            className="mt-1 rounded-xl"
                            autoComplete="off"
                            value={fiscalDraft.commercial_contact_phone}
                            onChange={(e) =>
                              setFiscalDraft((d) => ({ ...d, commercial_contact_phone: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Móvil</Label>
                          <Input
                            className="mt-1 rounded-xl"
                            autoComplete="off"
                            value={fiscalDraft.commercial_contact_mobile}
                            onChange={(e) =>
                              setFiscalDraft((d) => ({ ...d, commercial_contact_mobile: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Idioma preferido</Label>
                          <Select
                            value={fiscalDraft.preferred_language}
                            onValueChange={(v) => setFiscalDraft((d) => ({ ...d, preferred_language: v }))}
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
                            value={fiscalDraft.preferred_contact_channel}
                            onValueChange={(v) =>
                              setFiscalDraft((d) => ({ ...d, preferred_contact_channel: v }))
                            }
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
                    <div className="sm:col-span-2">
                      <Label>Notas comerciales internas</Label>
                      <Textarea
                        className="mt-1 rounded-xl min-h-[72px]"
                        autoComplete="off"
                        value={fiscalDraft.commercial_notes}
                        onChange={(e) =>
                          setFiscalDraft((d) => ({ ...d, commercial_notes: e.target.value }))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Notas privadas facturación</Label>
                      <Textarea
                        className="mt-1 rounded-xl min-h-[72px]"
                        autoComplete="off"
                        value={fiscalDraft.owner_private_notes}
                        onChange={(e) =>
                          setFiscalDraft((d) => ({ ...d, owner_private_notes: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contactos" className="mt-0">
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4 text-sm">
                  <h3 className="font-semibold">Contactos</h3>
                  <div className="grid sm:grid-cols-2 gap-4 text-muted-foreground">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Principal</p>
                      <p className="mt-2 text-foreground font-medium">
                        {fiscalDraft.commercial_contact_name || "Sin datos"}
                      </p>
                      <p>{fiscalDraft.commercial_contact_role || "—"}</p>
                      <p className="mt-1">{fiscalDraft.commercial_contact_email || "—"}</p>
                      <p>{fiscalDraft.commercial_contact_phone || "—"}</p>
                      <p className="text-xs mt-2">
                        Idioma: {fiscalDraft.preferred_language || "—"} · Canal:{" "}
                        {fiscalDraft.preferred_contact_channel || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Facturación</p>
                      <p className="mt-2 text-foreground font-medium">
                        {fiscalDraft.billing_contact_name || "Sin datos"}
                      </p>
                      <p>{fiscalDraft.billing_email || "—"}</p>
                      <p>{fiscalDraft.billing_phone || "—"}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Edite en «Datos fiscales», use la copia comercial → facturación si aplica y pulse Guardar
                    cambios.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="usuarios" className="mt-0 space-y-4">
                <form
                  className="rounded-2xl border border-border bg-card p-5 space-y-4"
                  autoComplete="off"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-accent" />
                    <h3 className="font-semibold">Crear / invitar usuario</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Por defecto, invitación segura por email. La contraseña provisional solo en opciones
                    avanzadas.
                  </p>
                  {userActionMessage ? (
                    <p className="text-sm text-foreground border border-border rounded-xl px-3 py-2 bg-muted/20">
                      {userActionMessage}
                    </p>
                  ) : null}
                  <div className="grid sm:grid-cols-2 gap-3">
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
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        type="email"
                        name="corporate_invite_email"
                        autoComplete="off"
                        value={createUserForm.email}
                        onChange={(e) =>
                          setCreateUserForm((c) => ({ ...c, email: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Rol</Label>
                      <Select
                        value={createUserForm.role}
                        onValueChange={(value) =>
                          setCreateUserForm((c) => ({ ...c, role: value }))
                        }
                      >
                        <SelectTrigger className="mt-1 rounded-xl">
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
                      <Label>Contraseña temporal (opcional)</Label>
                      <Input
                        className="mt-1 rounded-xl"
                        name="corporate_invite_temp_password"
                        autoComplete="new-password"
                        type="password"
                        value={createUserForm.temporary_password}
                        onChange={(e) =>
                          setCreateUserForm((c) => ({
                            ...c,
                            temporary_password: e.target.value,
                          }))
                        }
                      />
                    </CollapsibleContent>
                  </Collapsible>
                  {isOwnerEmailInInviteForm ? (
                    <p className="text-sm text-amber-900 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                      La cuenta owner no puede añadirse como usuario de empresa.
                    </p>
                  ) : null}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      disabled={
                        busy === "create-user" ||
                        !createUserForm.email.trim() ||
                        isOwnerEmailInInviteForm
                      }
                      className="rounded-xl"
                      onClick={handleCreateUser}
                    >
                      {busy === "create-user" ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Crear usuario
                    </Button>
                    {inviteUrl ? (
                      <div className="flex-1 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                        <p className="text-xs text-muted-foreground">Enlace de invitación</p>
                        <p className="font-mono text-xs break-all mt-1">{inviteUrl}</p>
                      </div>
                    ) : null}
                  </div>
                </form>

                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold">Usuarios actuales</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {(selectedOrganization.users || []).map((u) => (
                      <div
                        key={u.membership_id || u.id}
                        className="p-4 flex items-start justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.full_name || u.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">{u.role || "—"}</p>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-2 h-8 rounded-xl text-destructive border-destructive/30"
                            disabled={busy.startsWith("delete-user")}
                            onClick={() =>
                              setUserDeleteTarget({
                                organizationId: selectedOrganization.id,
                                userId: u.id,
                                label: u.full_name || u.email,
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1 inline" />
                            Quitar
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!selectedOrganization.users?.length && (
                      <div className="p-4 text-sm text-muted-foreground">Sin usuarios todavía.</div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="plan" className="mt-0 space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {canPause && (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        disabled={busy === "pause"}
                        onClick={handlePause}
                      >
                        {busy === "pause" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        <PauseCircle className="h-4 w-4 mr-2" />
                        Pausar licencia
                      </Button>
                    )}
                    {canActivate && (
                      <Button
                        type="button"
                        className="rounded-xl"
                        disabled={busy === "activate"}
                        onClick={handleActivate}
                      >
                        {busy === "activate" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Activar licencia
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-3">
                    Cambio de plan: pendiente de integración con facturación y validación comercial. Use el flujo
                    actual de Stripe o soporte interno hasta activar esta acción en el panel.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="consumo" className="mt-0">
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3 text-sm">
                  <h3 className="font-semibold">Consumo</h3>
                  <p>
                    Almacenamiento:{" "}
                    <span className="font-medium text-foreground">
                      {formatMetric(selectedBilling?.usage?.storage_used_gb)} GB
                    </span>{" "}
                    /{" "}
                    <span className="font-medium text-foreground">
                      {formatMetric(selectedBilling?.limits?.storage_limit_gb)} GB
                    </span>
                  </p>
                  <p>
                    IA (mes):{" "}
                    <span className="font-medium text-foreground">
                      {formatMetric(selectedBilling?.usage?.ai_requests_month)}
                    </span>{" "}
                    /{" "}
                    <span className="font-medium text-foreground">
                      {formatMetric(selectedBilling?.limits?.ai_requests_month)}
                    </span>
                  </p>
                  <p>
                    Usuarios activos:{" "}
                    <span className="font-medium text-foreground">{formatMetric(activeSeats)}</span> /{" "}
                    <span className="font-medium text-foreground">
                      {seatLimit != null ? seatLimit : "Sin datos"}
                    </span>
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="soporte" className="mt-0">
                <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground space-y-2">
                  <h3 className="font-semibold text-foreground">Soporte FRIGEST</h3>
                  <p>
                    Use los datos de contacto de la pestaña «Contactos» para coordinar incidencias con el
                    cliente. Este espacio reservará enlaces internos de soporte cuando estén disponibles.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="peligro" className="mt-0">
                <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-destructive">Eliminar empresa definitivamente</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Borrado completo del tenant. No afecta a otras empresas. Requiere escribir el slug en el
                        diálogo de confirmación.
                      </p>
                      {isSessionOwnerContextOrg ? (
                        <p className="text-xs text-amber-900 mt-2 leading-relaxed">
                          Esta organización está asociada al contexto interno de la sesión owner y no puede
                          eliminarse desde el panel de clientes.
                        </p>
                      ) : null}
                      {isPlatformInternalOrg(selectedOrganization) && !isSessionOwnerContextOrg ? (
                        <p className="text-xs text-amber-900 mt-2 leading-relaxed">
                          Organización interna de plataforma: el borrado definitivo no está disponible.
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
                        Eliminar empresa…
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>

      <Dialog open={hardDeleteOpen} onOpenChange={setHardDeleteOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar eliminación
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción elimina todos los datos de la empresa en FRIGEST. Escriba el slug exacto para
            continuar.
          </p>
          <p className="text-xs font-mono bg-muted/50 rounded-lg px-3 py-2">
            Slug: <span className="font-semibold">{selectedOrganization?.slug || "—"}</span>
          </p>
          <div>
            <Label className="text-xs">Slug de confirmación</Label>
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

      <Dialog open={copyBillingConfirmOpen} onOpenChange={setCopyBillingConfirmOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Sustituir datos de facturación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ya hay datos de facturación escritos. ¿Quiere sustituirlos por los datos comerciales (razón social,
            NIF y contacto)?
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setCopyBillingConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              onClick={() => {
                applyCommercialToBilling();
                setCopyBillingConfirmOpen(false);
              }}
            >
              Sustituir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(userDeleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setUserDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Quitar usuario</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Retirar el acceso de <strong>{userDeleteTarget?.label}</strong> a esta empresa? El histórico se
            conserva.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setUserDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" className="rounded-xl" onClick={confirmDeleteUser}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
