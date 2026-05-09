import { cn } from "@/lib/utils";

export default function StatsCard({
  icon: Icon,
  label,
  value,
  subtitle = null,
  className = "",
}) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow duration-200",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <p className="text-3xl font-bold mt-1 tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className="h-11 w-11 rounded-xl bg-accent/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-accent" />
          </div>
        )}
      </div>
    </div>
  );
}
