import "./PremiumSubmitButton.css";
import { cn } from "@/lib/utils";

function FineSpinner({ className }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Botón de envío premium (solo UI). No altera lógica de auth.
 * variant: "light" (login corporativo) o "dark" (acceso privado).
 */
export function PremiumSubmitButton({
  loading,
  disabled,
  variant = "light",
  loadingLabel = "Entrando…",
  children,
  className,
}) {
  const isBusy = Boolean(loading);
  const isDisabled = Boolean(disabled) || isBusy;

  const base =
    "premium-submit group relative inline-flex w-full min-h-[2.75rem] items-center justify-center overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold tracking-tight transition-[transform,box-shadow,filter] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none";

  // Mismo naranja que los botones principales de la app (antes, verde azulado).
  const light =
    "border border-transparent bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 focus-visible:outline-accent/60 disabled:opacity-[0.58]";

  const dark =
    "premium-submit--dark border border-transparent bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 focus-visible:outline-accent/60 disabled:opacity-[0.58]";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={isBusy ? true : undefined}
      className={cn(base, variant === "dark" ? dark : light, className)}
    >
      {!isBusy ? <span className="premium-submit__shimmer" aria-hidden /> : null}
      <span className="relative z-10 flex w-full items-center justify-center gap-2.5">
        {isBusy ? (
          <>
            <FineSpinner className="h-[1.125rem] w-[1.125rem] animate-spin motion-reduce:animate-none" />
            <span>{loadingLabel}</span>
          </>
        ) : (
          children
        )}
      </span>
    </button>
  );
}
