import React, { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";

/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

import { useSessionGuard } from "../hooks/useSessionGuard";
import { appApi } from "@/api/app-api";
import { toast } from "sonner";
import { useAuth } from "@/lib/app-auth";
import AppLogo from "@/components/AppLogo";
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
  Clock,
  FlaskConical,
  PackagePlus,
  Building2,
  CalendarDays,
  Fingerprint,
  Truck,
  ShoppingCart,
  ShoppingBag,
  Wrench,
  Receipt,
  Car,
  FileText,
  BarChart3,
  MapPin,
  UserMinus,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


// Sesión de consulta para la Administración tributaria (art. 8.4 RRSIF).
// Solo lo que tiene trascendencia tributaria; el servidor bloquea el resto.
const fiscalSessionLinks = [
  { to: "/invoices", label: "Registros de facturación", icon: Receipt },
  { to: "/declaracion-responsable", label: "Declaración responsable", icon: FileText },
];

// Mismas opciones que antes para cada rol (el acceso real lo controla cada
// página y el servidor); solo cambian los nombres y se agrupan en el menú.
const L = {
  panel: { to: "/", label: "Panel", icon: LayoutDashboard },
  inicio: { to: "/", label: "Inicio", icon: LayoutDashboard },
  fichaje: { to: "/fichaje", label: "Fichar", icon: Fingerprint },
  averias: { to: "/breakdowns", label: "Averías", icon: Wrench },
  partes: { to: "/interventions", label: "Partes de trabajo", icon: ClipboardList },
  actividad: { to: "/workday", label: "Mi actividad por cliente", icon: MapPin },
  calendario: { to: "/calendar", label: "Calendario", icon: CalendarDays },
  clientes: { to: "/clients", label: "Clientes", icon: Users },
  obras: { to: "/projects", label: "Obras y proyectos", icon: Building2 },
  presupuestos: { to: "/budgets", label: "Presupuestos", icon: FileText },
  stock: { to: "/materials", label: "Stock y materiales", icon: Package },
  materiales: { to: "/materials", label: "Materiales", icon: Package },
  vehiculo: { to: "/my-vehicle", label: "Mi furgoneta", icon: Car },
  recepcion: { to: "/stock-entry", label: "Recepción de material", icon: PackagePlus },
  solicitudes: { to: "/material-requests", label: "Solicitudes de material", icon: ShoppingCart },
  pedirMaterial: { to: "/material-requests", label: "Pedir material", icon: ShoppingCart },
  proveedores: { to: "/suppliers", label: "Proveedores", icon: Truck },
  gases: { to: "/gas-bottles", label: "Gases y botellas", icon: FlaskConical },
  facturacion: { to: "/invoices", label: "Facturación", icon: Receipt },
  fichajes: { to: "/time-records", label: "Historial de fichajes", icon: Clock },
  horas: { to: "/workday-report", label: "Horas por cliente/obra", icon: BarChart3 },
  ausencias: { to: "/absences", label: "Ausencias", icon: UserMinus },
  config: { to: "/settings", label: "Configuración", icon: Settings },
  // Al personal de campo /settings le abre su cuenta (AccountSettings), no la configuración.
  miCuenta: { to: "/settings", label: "Mi cuenta", icon: Settings },
};

const adminLinks = [
  L.panel, L.fichaje, L.averias, L.partes, L.calendario, L.clientes, L.stock, L.vehiculo,
  L.recepcion, L.solicitudes, L.proveedores, L.gases, L.obras, L.presupuestos, L.facturacion,
  L.fichajes, L.horas, L.ausencias, L.config,
];

const oficinaLinks = [
  L.panel, L.fichaje, L.averias, L.partes, L.calendario, L.clientes, L.stock, L.vehiculo,
  L.recepcion, L.solicitudes, L.proveedores, L.gases, L.obras, L.presupuestos, L.facturacion,
  L.fichajes, L.horas, L.config,
];

const techLinks = [
  L.inicio, L.fichaje, L.averias, L.partes, L.actividad, L.calendario, L.clientes, L.stock,
  L.vehiculo, L.recepcion, L.pedirMaterial, L.proveedores, L.gases, L.obras, L.miCuenta,
];

const ayudanteLinks = [
  L.panel, L.fichaje, L.averias, L.partes, L.actividad, L.calendario, L.clientes, L.proveedores,
  L.materiales, L.vehiculo, L.pedirMaterial, L.miCuenta,
];

const ownerLinks = [
  { to: "/owner/clients", label: "Clientes", icon: Building2 },
  { to: "/settings", label: "Ajustes", icon: Settings },
];

// Grupos del menú lateral, en orden. Lo que no esté en ninguno va al final.
const NAV_GROUPS = [
  { label: null, paths: ["/", "/breakdowns", "/interventions", "/calendar", "/fichaje", "/workday"] },
  { label: "Clientes y obras", paths: ["/clients", "/projects", "/budgets"] },
  { label: "Almacén y gas", paths: ["/materials", "/my-vehicle", "/material-requests", "/stock-entry", "/purchase-orders", "/suppliers", "/gas-bottles"] },
  { label: "Oficina", paths: ["/invoices", "/time-records", "/workday-report", "/absences"] },
];

export const groupNavLinks = (links) => {
  const used = new Set();
  const groups = NAV_GROUPS.map((g) => {
    const items = g.paths
      .map((p) => links.find((l) => l.to === p))
      .filter(Boolean);
    items.forEach((l) => used.add(l));
    return { label: g.label, items };
  }).filter((g) => g.items.length > 0);
  const rest = links.filter((l) => !used.has(l));
  if (rest.length) groups.push({ label: null, items: rest });
  return groups;
};

const TAB_ROOTS = ["/", "/breakdowns", "/interventions", "/fichaje"];

// Barra inferior del móvil. Averías es lo primero que mira un técnico; la
// configuración y el resto del menú quedan detrás de "Más".
const BOTTOM_TABS = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/breakdowns", label: "Averías", icon: Wrench },
  { to: "/interventions", label: "Partes", icon: ClipboardList },
  { to: "/fichaje", label: "Fichar", icon: Fingerprint },
];

const pedidosLink = { to: "/purchase-orders", label: "Pedidos a proveedor", icon: ShoppingBag };

const injectPedidos = (links, show) => {
  if (!show) {
    return links;
  }
  const idx = links.findIndex((l) => l.to === "/suppliers" || l.to === "/settings");
  if (idx === -1) {
    return [...links, pedidosLink];
  }
  return [...links.slice(0, idx), pedidosLink, ...links.slice(idx)];
};

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switchingOrg, setSwitchingOrg] = useState(false);
  useSessionGuard();

  // Remember last visited path per bottom tab
  const tabHistoryRef = useRef({
    "/": "/",
    "/breakdowns": "/breakdowns",
    "/interventions": "/interventions",
    "/fichaje": "/fichaje",
  });

  useEffect(() => {
    appApi.auth.me().then(setUser).catch(() => toast.error("Error al cargar tu sesión. Recarga la página."));
  }, []);

  useEffect(() => {
    const root = TAB_ROOTS.find(r =>
      r === "/" ? location.pathname === "/" : location.pathname.startsWith(r)
    );
    if (root) tabHistoryRef.current[root] = location.pathname;
  }, [location.pathname]);

  const isAdmin =
    user?.role === "admin" ||
    user?.role === "superadmin" ||
    user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const isAyudante = user?.role === "ayudante";
  const isHiddenOwner = user?.is_hidden_owner === true;
  const showPurchaseOrdersNav =
    !isHiddenOwner &&
    user?.role !== "superadmin" &&
    ["admin", "oficina", "encargado"].includes(user?.role || "");
  // Sesión de consulta para la Administración tributaria (art. 8.4 RRSIF): el
  // servidor ya bloquea todo lo demás, así que el menú no debe ofrecerlo.
  const isFiscalSession = user?.fiscal_session === true;
  const links = isFiscalSession
    ? fiscalSessionLinks
    : isHiddenOwner
      ? ownerLinks
      : isAdmin
        ? injectPedidos(adminLinks, showPurchaseOrdersNav)
        : isOficina
          ? injectPedidos(oficinaLinks, showPurchaseOrdersNav)
          : isAyudante
            ? ayudanteLinks
            : techLinks;

  const handleLogout = () => {
    void logout();
  };

  const handleOrganizationSwitch = async (organizationId) => {
    if (!organizationId || organizationId === user?.current_organization?.id) {
      return;
    }

    setSwitchingOrg(true);

    try {
      const nextUser = await appApi.auth.switchOrganization(organizationId);
      setUser(nextUser);
      window.location.reload();
    } finally {
      setSwitchingOrg(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center gap-3">
          <AppLogo />
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden text-sidebar-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 px-3 mt-1 overflow-y-auto space-y-4 pb-2">
          {groupNavLinks(links).map((group, gi) => (
            <div key={group.label || `g${gi}`} className="space-y-0.5">
              {group.label && (
                <p className="px-4 pb-1 text-[11px] font-medium text-sidebar-foreground/45">
                  {group.label}
                </p>
              )}
              {group.items.map((link) => {
                const isActive = link.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <link.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border pb-28 lg:pb-4">
          {user?.organization_memberships?.length > 1 && (
            <div className="px-2 mb-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/40 mb-2">
                Empresa
              </p>
              <select
                className="w-full rounded-xl border border-sidebar-border bg-sidebar-accent px-3 py-2 text-sm text-sidebar-foreground"
                value={user?.current_organization?.id || ""}
                onChange={(e) => handleOrganizationSwitch(e.target.value)}
                disabled={switchingOrg}
              >
                {(user.organization_memberships || []).map((membership) => (
                  <option key={membership.organization_id} value={membership.organization_id}>
                    {membership.organization_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-semibold text-sidebar-foreground">
              {user?.full_name?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.full_name || "Usuario"}</p>
              <p className="text-[11px] text-sidebar-foreground/60 truncate">
                {switchingOrg ? "Cambiando empresa..." : user?.current_organization?.name || "Sin empresa"}
              </p>
              <p className="text-xs text-sidebar-foreground/50 capitalize">
                {isHiddenOwner ? "Owner" : isAdmin ? "Administrador" : isOficina ? "Oficina" : isAyudante ? "Ayudante" : "Técnico"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/50 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          {/* Art. 13.2 RD 1007/2023: la declaración responsable del sistema
              informático de facturación debe constar de modo visible en el
              propio sistema. */}
          <Link
            to="/declaracion-responsable"
            className="block px-2 text-[11px] text-sidebar-foreground/45 hover:text-sidebar-foreground/80 transition-colors"
          >
            FriGest v{APP_VERSION} · Declaración responsable
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — mobile only */}
        <header
          className="lg:hidden flex items-center justify-between px-3 border-b border-border bg-card gap-3"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))', paddingBottom: '1rem' }}
        >
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="flex-shrink-0 text-foreground" aria-label="Abrir el menú">
            <Menu className="h-5 w-5" />
          </Button>
          <AppLogo compact className="flex-1 min-w-0" />
          <div className="w-9 flex-shrink-0" />
        </header>

        <main className="flex-1 overflow-y-auto pb-28 lg:pb-0">
          {isFiscalSession && (
            <div className="sticky top-0 z-40 border-b border-sky-200/70 bg-sky-50 text-sky-900">
              <div className="mx-auto max-w-6xl px-4 py-3 text-sm font-medium">
                Sesión de consulta para la Administración tributaria: solo lectura de los registros de facturación.
              </div>
            </div>
          )}
          {user?.license_read_only === true && (
            <div className="sticky top-0 z-40 border-b border-amber-200/70 bg-amber-50 text-amber-900">
              <div className="mx-auto max-w-6xl px-4 py-3 text-sm font-medium">
                {user?.license_message || "Licencia caducada. Contacte con FRIGEST para renovación."}
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Bottom Tab Bar — mobile only */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', minHeight: '56px' }}
      >
        {BOTTOM_TABS.filter((tab) => links.some((l) => l.to === tab.to)).map((item) => {
          const isActive = item.to === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.to);
          return (
            <button
              key={item.to}
              onClick={() => {
                if (isActive) {
                  navigate(item.to);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  navigate(tabHistoryRef.current[item.to] || item.to);
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors flex-1 min-h-[44px]",
                isActive ? "text-accent" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir el menú completo"
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors flex-1 min-h-[44px]",
            sidebarOpen ? "text-accent" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">Más</span>
        </button>
      </nav>


    </div>
  );
}

