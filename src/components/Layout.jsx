import React, { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useSessionGuard } from "../hooks/useSessionGuard";
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
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/materials", label: "Stock / Materiales", icon: Package },
  { to: "/stock-entry", label: "Entrada Stock", icon: PackagePlus },
  { to: "/material-requests", label: "Pedir Material", icon: ShoppingCart },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/gas-bottles", label: "Trazabilidad Gases", icon: FlaskConical },
  { to: "/projects", label: "Obras y Proyectos", icon: Building2 },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const ayudanteLinks = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/fichaje", label: "Fichaje", icon: Fingerprint },
  { to: "/interventions", label: "Partes de Trabajo", icon: ClipboardList },
  { to: "/workday", label: "Mi Jornada", icon: CalendarDays },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/materials", label: "Materiales", icon: Package },
  { to: "/material-requests", label: "Pedir Material", icon: ShoppingCart },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const TAB_ROOTS = ["/", "/interventions", "/fichaje", "/settings"];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useSessionGuard();

  // Remember last visited path per bottom tab
  const tabHistoryRef = useRef({
    "/": "/",
    "/interventions": "/interventions",
    "/fichaje": "/fichaje",
    "/settings": "/settings",
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    const root = TAB_ROOTS.find(r =>
      r === "/" ? location.pathname === "/" : location.pathname.startsWith(r)
    );
    if (root) tabHistoryRef.current[root] = location.pathname;
  }, [location.pathname]);

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
        <div className="p-6 flex items-center gap-3">
          <img src="https://media.base44.com/images/public/69c81838d85448113a40d658/54eaa6c58_Fritecma.jpg" alt="FRITECMA" className="h-20 w-auto object-contain" />
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
          className="lg:hidden flex items-center justify-between px-3 border-b border-border bg-card gap-3"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))', paddingBottom: '1rem' }}
        >
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="flex-shrink-0">
            <Menu className="h-5 w-5" />
          </Button>
          <img src="https://media.base44.com/images/public/69c81838d85448113a40d658/54eaa6c58_Fritecma.jpg" alt="FRITECMA" className="h-18 w-auto object-contain flex-1 min-w-0" />
          <div className="w-9 flex-shrink-0" />
        </header>

        {/* Content with animated transitions */}
        <main className="flex-1 overflow-y-auto pb-28 lg:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
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

      {/* AI Chat Widget */}
      {user && <AIChat user={user} />}
    </div>
  );
}