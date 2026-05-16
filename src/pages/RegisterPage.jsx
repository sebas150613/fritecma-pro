import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { useAuth } from "@/lib/app-auth";
import { PremiumSubmitButton } from "@/components/PremiumSubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const FEATURES = [
  "Órdenes de trabajo e intervenciones",
  "Gestión de clientes y equipos",
  "Control de stock y materiales",
  "Facturación en un clic",
  "Calendario y planificación del equipo",
  "Fichaje y control horario",
];

const BrandPanel = () => (
  <div className="hidden lg:flex flex-col justify-between w-[460px] flex-shrink-0 bg-[#0a0f1e] p-12">
    <div>
      <div className="flex items-center gap-2.5 mb-16">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm"
          style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
        >
          F
        </div>
        <span className="text-white font-bold text-xl tracking-tight">FRIGEST</span>
      </div>

      <h2 className="text-[2rem] font-extrabold leading-tight text-white mb-4 tracking-tight">
        Tu servicio técnico,<br />
        <span style={{
          background: "linear-gradient(135deg, #60a5fa, #06b6d4)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          sin el caos
        </span>
      </h2>
      <p className="text-slate-400 text-[15px] leading-relaxed mb-10">
        Todo lo que necesita tu equipo técnico, en una sola plataforma.
      </p>

      <ul className="space-y-3.5">
        {FEATURES.map((feat) => (
          <li key={feat} className="flex items-center gap-3">
            <span
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-slate-300 text-sm">{feat}</span>
          </li>
        ))}
      </ul>

      <div
        className="mt-10 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium"
        style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#93c5fd" }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        15 días de prueba gratuita · Sin tarjeta de crédito
      </div>
    </div>
    <p className="text-slate-700 text-xs">© 2026 Frigest · Hecho con ♥ en España</p>
  </div>
);

const MobileLogo = () => (
  <div className="lg:hidden flex items-center gap-2 mb-8">
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
      style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
    >
      F
    </div>
    <span className="font-bold text-lg tracking-tight">FRIGEST</span>
  </div>
);

// ─── Paso 1: formulario de datos ─────────────────────────────────────────────

function StepForm({ onSuccess }) {
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const { pending_id } = await appApi.auth.signupRequestOtp({
        organizationName: organizationName.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
      });
      onSuccess({ pendingId: pending_id, email: email.trim(), organizationName: organizationName.trim() });
    } catch (err) {
      setFormError(err?.data?.message || err?.message || "No se pudo enviar el código. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Crea tu cuenta</h1>
        <p className="text-sm text-muted-foreground">
          15 días de prueba gratuita · Sin tarjeta de crédito
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {formError}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="reg-org">Nombre de tu empresa</Label>
          <Input
            id="reg-org"
            type="text"
            autoComplete="organization"
            placeholder="Ej: Servicios Técnicos García"
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-name">Tu nombre completo</Label>
          <Input
            id="reg-name"
            type="text"
            autoComplete="name"
            placeholder="Ej: Carlos García"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-email">Email</Label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="pt-1">
          <PremiumSubmitButton loading={submitting}>
            Continuar →
          </PremiumSubmitButton>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}

// ─── Paso 2: verificación OTP + contraseña ────────────────────────────────────

function StepOtp({ pendingId, email, organizationName, onBack }) {
  const navigate = useNavigate();
  const { checkAppState } = useAuth();
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [resendMsg, setResendMsg] = useState(null);
  const [currentPendingId, setCurrentPendingId] = useState(pendingId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await appApi.auth.signupVerifyOtp({
        pendingId: currentPendingId,
        otp,
        password,
      });
      await checkAppState();
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(err?.data?.message || err?.message || "No se pudo verificar el código.");
      if (err?.data?.code_exhausted) {
        setOtp("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResendMsg(null);
    setFormError(null);
    setResending(true);
    try {
      const { pending_id } = await appApi.auth.signupRequestOtp({
        organizationName,
        fullName: "",
        email,
      });
      setCurrentPendingId(pending_id);
      setOtp("");
      setResendMsg("Nuevo código enviado. Revisa tu bandeja de entrada.");
    } catch (err) {
      setFormError(err?.data?.message || "No se pudo reenviar el código.");
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <div className="mb-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Volver
        </button>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Verifica tu email</h1>
        <p className="text-sm text-muted-foreground">
          Hemos enviado un código de 6 dígitos a{" "}
          <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {formError}
          </div>
        )}
        {resendMsg && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 px-3 py-2.5 text-sm text-green-700 dark:text-green-400">
            {resendMsg}
          </div>
        )}

        <div className="space-y-2">
          <Label>Código de verificación</Label>
          <div className="flex justify-center pt-1">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
              disabled={submitting}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-password">Contraseña</Label>
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            hint="Mínimo 8 caracteres"
          />
        </div>

        <div className="pt-1">
          <PremiumSubmitButton loading={submitting} disabled={otp.length !== 6}>
            Crear cuenta y empresa →
          </PremiumSubmitButton>
        </div>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        ¿No recibiste el código?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          {resending ? "Enviando…" : "Reenviar código"}
        </button>
      </p>
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("form");
  const [otpData, setOtpData] = useState(null);

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleFormSuccess = (data) => {
    setOtpData(data);
    setStep("otp");
  };

  return (
    <div className="min-h-screen flex">
      <BrandPanel />
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-[420px]">
          <MobileLogo />
          {step === "form" ? (
            <StepForm onSuccess={handleFormSuccess} />
          ) : (
            <StepOtp
              pendingId={otpData.pendingId}
              email={otpData.email}
              organizationName={otpData.organizationName}
              onBack={() => setStep("form")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
