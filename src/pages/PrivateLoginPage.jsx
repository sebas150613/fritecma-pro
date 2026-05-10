import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { useAuth } from "@/lib/app-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PrivateLoginPage() {
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
      await appApi.auth.loginPrivateWithCredentials(email.trim(), password);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700/80 bg-slate-950/90 text-slate-50 shadow-xl backdrop-blur-sm">
        <div className="p-6 space-y-2 border-b border-slate-700/80">
          <h1 className="text-2xl font-semibold tracking-tight">Acceso privado</h1>
          <p className="text-sm text-slate-400">
            Sesión restringida para la cuenta de propietaria de la plataforma. Usa el acceso
            corporativo habitual si eres usuario de una empresa.
          </p>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError ? (
              <div
                role="alert"
                className="rounded-lg border border-red-500/35 bg-red-950/40 px-3 py-2 text-sm text-red-200"
              >
                {formError}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="private-login-email" className="text-slate-200">
                Email
              </Label>
              <Input
                id="private-login-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="border-slate-600 bg-slate-900/80 text-slate-50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="private-login-password" className="text-slate-200">
                Contraseña
              </Label>
              <Input
                id="private-login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="border-slate-600 bg-slate-900/80 text-slate-50"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>

            <p className="text-center text-sm text-slate-500">
              <Link to="/login" className="text-teal-400/90 underline-offset-4 hover:underline">
                Volver al acceso corporativo
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
