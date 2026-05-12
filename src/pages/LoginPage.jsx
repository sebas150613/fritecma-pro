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
      await appApi.auth.loginWithCredentials(email.trim(), password);
      await checkAppState();
      navigate("/", { replace: true });
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/40 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-teal-900/10 bg-card text-card-foreground shadow-xl">
        <div className="p-6 space-y-2 border-b border-border/60">
          <h1 className="text-2xl font-semibold tracking-tight">FRIGEST</h1>
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

            <PremiumSubmitButton loading={submitting}>
              Entrar
            </PremiumSubmitButton>

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
