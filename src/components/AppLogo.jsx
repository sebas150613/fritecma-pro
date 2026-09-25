import { cn } from "@/lib/utils";

// `compact` es la versión de la cabecera del móvil, sobre fondo claro: el texto
// no puede ser blanco como en la barra lateral oscura.
export default function AppLogo({ compact = false, className = "" }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/logo.png"
        alt="FRIGEST"
        className={cn(
          "rounded-2xl",
          compact ? "h-9 w-9 rounded-xl" : "h-11 w-11 shadow-lg shadow-sidebar-primary/25"
        )}
      />
      <div className={cn("min-w-0", compact && "flex-1")}>
        <p
          className={cn(
            "truncate font-black uppercase",
            compact ? "text-base tracking-[0.18em] text-foreground" : "text-lg tracking-[0.22em] text-white"
          )}
        >
          FRIGEST
        </p>
        <p
          className={cn(
            "truncate text-[11px] font-medium uppercase",
            compact ? "tracking-[0.2em] text-muted-foreground" : "tracking-[0.28em] text-sidebar-foreground/55"
          )}
        >
          Gestión técnica
        </p>
      </div>
    </div>
  );
}
