import React, { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
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
  ChevronRight,
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
  FileText,
  BarChart3,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


const adminLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichar entrada/salida", icon: Fingerprint },
  { to: "/breakdowns", label: "Averías", icon: Wrench },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/stock-entry", label: "Recepción de material", icon: PackagePlus },
  { to: "/material-requests", label: "Solicitudes de material", icon: ShoppingCart },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/budgets", label: "Presupuestos", icon: FileText },
  { to: "/invoices", label: "Facturación", icon: Receipt },
  { to: "/time-records", label: "Historial de fichajes", icon: Clock },
  { to: "/workday-report", label: "Horas por cliente/obra", icon: BarChart3 },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const oficinaLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichar entrada/salida", icon: Fingerprint },
  { to: "/breakdowns", label: "Averías", icon: Wrench },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/stock-entry", label: "Recepción de material", icon: PackagePlus },
  { to: "/material-requests", label: "Solicitudes de material", icon: ShoppingCart },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/budgets", label: "Presupuestos", icon: FileText },
  { to: "/invoices", label: "Facturación", icon: Receipt },
  { to: "/time-records", label: "Historial de fichajes", icon: Clock },
  { to: "/workday-report", label: "Horas por cliente/obra", icon: BarChart3 },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const techLinks = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichar entrada/salida", icon: Fingerprint },
  { to: "/breakdowns", label: "Averías", icon: Wrench },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/workday", label: "Mi actividad por cliente", icon: MapPin },
  { to: "/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/stock-entry", label: "Recepción de material", icon: PackagePlus },
  { to: "/material-requests", label: "Pedir Material", icon: ShoppingCart },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const ayudanteLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichar entrada/salida", icon: Fingerprint },
  { to: "/breakdowns", label: "Averías", icon: Wrench },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/workday", label: "Mi actividad por cliente", icon: MapPin },
  { to: "/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/materials", label: "Materiales", icon: Package },
  { to: "/material-requests", label: "Pedir Material", icon: ShoppingCart },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const ownerLinks = [
  { to: "/owner/clients", label: "Clientes", icon: Building2 },
  { to: "/settings", label: "Ajustes", icon: Settings },
];

const TAB_ROOTS = ["/", "/interventions", "/fichaje", "/settings"];

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
    "/interventions": "/interventions",
    "/fichaje": "/fichaje",
    "/settings": "/settings",
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
  const links = isHiddenOwner
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

        <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto">
          {links.map((link) => {
            const isActive = link.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <link.icon className="h-5 w-5" />
                <span>{link.label}</span>
                {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
              </Link>
            );
          })}
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
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — mobile only */}
        <header
          className="lg:hidden flex items-center justify-between px-3 border-b border-border bg-card gap-3"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))', paddingBottom: '1rem' }}
        >
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="flex-shrink-0">
            <Menu className="h-5 w-5" />
          </Button>
          <AppLogo compact className="flex-1 min-w-0" />
          <div className="w-9 flex-shrink-0" />
        </header>

        <main className="flex-1 overflow-y-auto pb-28 lg:pb-0">
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
        {[
          { to: "/", label: "Panel", icon: LayoutDashboard },
          { to: "/interventions", label: "Partes", icon: ClipboardList },
          { to: "/fichaje", label: "Fichar", icon: Fingerprint },
          { to: "/settings", label: "Config", icon: Settings },
        ].map((item) => {
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
      </nav>


    </div>
  );
}

