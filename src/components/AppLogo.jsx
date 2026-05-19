import { cn } from "@/lib/utils";

export default function AppLogo({ compact = false, className = "" }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img src="/logo.png" alt="FRIGEST" className="h-11 w-11 rounded-2xl shadow-lg shadow-sidebar-primary/25" />
      <div className={cn("min-w-0", compact && "flex-1")}>
        <p className="truncate text-lg font-black uppercase tracking-[0.22em] text-white">
          FRIGEST
        </p>
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.28em] text-sidebar-foreground/55">
          Gestion Tecnica
        </p>
      </div>
    </div>
  );
}
