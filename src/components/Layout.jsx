import { Outlet, Link, useLocation } from "react-router-dom";
import { useSessionGuard } from "../hooks/useSessionGuard";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
  Snowflake,
  ChevronRight,
  Clock,
  FlaskConical,
  TrendingDown,
  PackagePlus,
  Building2,
  CalendarDays,
  Fingerprint,
  Truck,
  ShoppingCart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AIChat from "./AIChat";

const adminLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichaje", icon: Fingerprint },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/time-records", label: "Registro Fichajes", icon: Clock },
  { to: "/workday-report", label: "Jornadas", icon: CalendarDays },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/stock-entry", label: "Entrada Stock", icon: PackagePlus },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const encargadoLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichaje", icon: Fingerprint },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/time-records", label: "Registro Fichajes", icon: Clock },
  { to: "/workday-report", label: "Jornadas", icon: CalendarDays },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/stock-entry", label: "Entrada Stock", icon: PackagePlus },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const oficinaLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichaje", icon: Fingerprint },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/time-records", label: "Registro Fichajes", icon: Clock },
  { to: "/workday-report", label: "Jornadas", icon: CalendarDays },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/stock-entry", label: "Entrada Stock", icon: PackagePlus },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
];

const techLinks = [
  { to: "/", label: "Mis Partes", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichaje", icon: Fingerprint },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/workday", label: "Mi Jornada", icon: CalendarDays },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/stock-entry", label: "Entrada Stock", icon: PackagePlus },
  { to: "/material-requests", label: "Pedir Material", icon: ShoppingCart },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const ayudanteLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichaje", icon: Fingerprint },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/materials", label: "Materiales", icon: Package },
  { to: "/material-requests", label: "Pedir Material", icon: ShoppingCart },
  { to: "/settings", label: "Configuración", icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useSessionGuard();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isEncargado = user?.role === "encargado";
  const isOficina = user?.role === "oficina";
  const isAyudante = user?.role === "ayudante";
  const links = isAdmin ? adminLinks : isEncargado ? encargadoLinks : isOficina ? oficinaLinks : isAyudante ? ayudanteLinks : techLinks;

  const handleLogout = () => {
    base44.auth.logout("/");
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
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Snowflake className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">FRITECMA</h1>
            <p className="text-xs text-sidebar-foreground/60">Gestión Técnica</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden text-sidebar-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto">
          {links.map((link) => {
            const isActive = location.pathname === link.to ||
              (link.to !== "/" && location.pathname.startsWith(link.to));
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

        {/* User Info */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-semibold text-sidebar-foreground">
              {user?.full_name?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.full_name || "Usuario"}</p>
              <p className="text-xs text-sidebar-foreground/50 capitalize">
                {isAdmin ? "Administrador" : isEncargado ? "Encargado" : isOficina ? "Oficina" : isAyudante ? "Ayudante" : "Técnico"}
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
          className="lg:hidden flex items-center justify-between px-4 border-b border-border bg-card"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
        >
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-accent" />
            <span className="font-bold text-sm">FRITECMA</span>
          </div>
          <div className="w-9" />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
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
          { to: "/fichaje", label: "Fichaje", icon: Fingerprint },
          { to: "/settings", label: "Config", icon: Settings },
        ].map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== "/" && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors flex-1",
                isActive ? "text-accent" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* AI Chat Widget */}
      {user && <AIChat user={user} />}
    </div>
  );
}