import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { useAuth } from "@/lib/app-auth";
import { PremiumSubmitButton } from "@/components/PremiumSubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, checkAppState } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fiscalOnly, setFiscalOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await appApi.auth.loginWithCredentials(
        email.trim(),
        password,
        undefined,
        fiscalOnly
      );
      await checkAppState();
      // El panel carga datos que una sesión de consulta no puede ver: se entra
      // directamente a los registros de facturación.
      navigate(fiscalOnly ? "/invoices" : "/", { replace: true });
    } catch (error) {
      setFormError(
        error?.data?.message ||
          error?.message ||
          "No se pudo iniciar sesión. Comprueba email y contraseña."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-xl">
        <div className="p-6 space-y-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="FRIGEST" className="h-11 w-11 rounded-2xl shadow-md" />
            <div>
              <p className="text-lg font-black uppercase tracking-[0.22em]">FRIGEST</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">Gestión técnica</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Inicia sesión con tu cuenta corporativa. Los datos permanecen aislados por
            organización.
          </p>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Art. 8.4 RD 1007/2023: acceso disociado para la Administración
                tributaria. Como en el ejemplo oficial de la AEAT, es un control
                que se marca antes de entrar y por defecto NO está marcado. */}
            <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={fiscalOnly}
                onChange={(e) => setFiscalOnly(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-orange-500 cursor-pointer"
              />
              <span>
                Acceso de consulta para la Administración tributaria
                <span className="block text-[11px] opacity-80">
                  Sesión de solo lectura, limitada a los registros de facturación.
                </span>
              </span>
            </label>

            <PremiumSubmitButton loading={submitting}>
              {fiscalOnly ? "Entrar en modo consulta" : "Entrar"}
            </PremiumSubmitButton>

            <p className="text-center text-xs text-muted-foreground">
              ¿Aún no tienes cuenta?{" "}
              <Link
                to="/register"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Crear cuenta gratis
              </Link>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              <Link
                to="/private-login"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Acceso privado
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
