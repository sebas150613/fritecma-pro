/**
 * Página HTML de activación por invitación (español, sin framework).
 * La lógica de negocio y rutas viven en server/routes/auth.js.
 */

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const renderInviteUnavailablePageEs = ({ redirectUri, loginPath }) =>
  `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invitación no disponible</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%);
        color: #0f172a;
      }
      .card {
        width: 100%;
        max-width: 480px;
        padding: 32px;
        border-radius: 24px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
      h1 { margin: 0 0 12px; font-size: 26px; }
      p { color: #475569; line-height: 1.65; margin: 0 0 16px; }
      a {
        display: inline-flex;
        margin-top: 8px;
        padding: 12px 18px;
        border-radius: 14px;
        background: linear-gradient(135deg, #0f766e 0%, #0b4f54 100%);
        color: #ffffff;
        text-decoration: none;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Invitación no disponible</h1>
      <p>Esta invitación ya fue utilizada o ha caducado.</p>
      <p><a href="${escapeHtml(loginPath)}">Volver al inicio de sesión</a></p>
    </div>
  </body>
</html>`;

export const renderInviteActivationPageEs = ({
  token,
  redirectUri,
  loginPath,
  errorMessage = "",
  organizationName,
  email,
  roleLabelEs,
  defaultFirstName = "",
  defaultLastName = "",
  defaultDni = "",
}) => {
  const cfgJson = JSON.stringify({ token, redirectUri });
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Activa tu cuenta — FRIGEST</title>
    <style>
      :root {
        --ink: #0f172a;
        --muted: #64748b;
        --line: #e2e8f0;
        --brand: #0f766e;
        --brand-deep: #0b4f54;
        --danger-bg: #fff1f2;
        --danger: #9f1239;
        --ok-bg: #ecfdf5;
        --ok: #047857;
        --card: #ffffff;
        --shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", system-ui, sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 12% 18%, rgba(15, 118, 110, 0.2), transparent 38%),
          radial-gradient(circle at 88% 12%, rgba(14, 165, 233, 0.12), transparent 32%),
          linear-gradient(165deg, #f8fafc 0%, #f1f5f9 100%);
        padding: 24px 16px 40px;
      }
      .wrap { max-width: 520px; margin: 0 auto; }
      .badge {
        display: inline-flex;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: var(--brand-deep);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
      }
      h1 { margin: 14px 0 8px; font-size: 28px; line-height: 1.15; }
      .sub { margin: 0 0 22px; color: var(--muted); font-size: 15px; line-height: 1.55; }
      .panel {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: var(--shadow);
        padding: 26px 24px 28px;
      }
      .meta {
        display: grid;
        gap: 10px;
        padding: 16px;
        border-radius: 16px;
        background: #f8fafc;
        border: 1px solid var(--line);
        margin-bottom: 20px;
        font-size: 14px;
      }
      .meta div { color: var(--muted); }
      .meta strong { color: var(--ink); font-weight: 700; }
      label {
        display: block;
        margin: 14px 0 6px;
        font-size: 13px;
        font-weight: 700;
        color: var(--ink);
      }
      input {
        width: 100%;
        border-radius: 14px;
        padding: 13px 14px;
        font-size: 15px;
        border: 1px solid #cbd5e1;
        background: #fbfdff;
      }
      input:focus {
        outline: 2px solid rgba(15, 118, 110, 0.25);
        border-color: rgba(15, 118, 110, 0.55);
      }
      .btn {
        width: 100%;
        margin-top: 14px;
        border: 0;
        border-radius: 14px;
        padding: 14px 16px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        color: #fff;
        background: linear-gradient(135deg, var(--brand) 0%, var(--brand-deep) 100%);
        box-shadow: 0 14px 28px rgba(11, 79, 84, 0.22);
      }
      .btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .btn.secondary {
        background: #f1f5f9;
        color: var(--ink);
        box-shadow: none;
        border: 1px solid var(--line);
      }
      .section-title {
        margin: 22px 0 8px;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--brand-deep);
      }
      .msg {
        margin-top: 12px;
        padding: 12px 14px;
        border-radius: 14px;
        font-size: 14px;
        font-weight: 600;
        display: none;
      }
      .msg.show { display: block; }
      .msg.err { background: var(--danger-bg); color: var(--danger); border: 1px solid #fecdd3; }
      .msg.ok { background: var(--ok-bg); color: var(--ok); border: 1px solid #a7f3d0; }
      .hint { margin-top: 8px; font-size: 13px; color: var(--muted); line-height: 1.5; }
      .hidden { display: none !important; }
      .foot { margin-top: 22px; font-size: 12px; color: var(--muted); text-align: center; }
      .foot a { color: var(--brand-deep); font-weight: 700; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="badge">INVITACIÓN FRIGEST</div>
      <h1>Activa tu cuenta</h1>
      <p class="sub">Completa tus datos y verifica tu email para crear tu contraseña.</p>
      <div class="panel">
        <div class="meta">
          <div><strong>Empresa:</strong> ${escapeHtml(organizationName)}</div>
          <div><strong>Email:</strong> ${escapeHtml(email)}</div>
          <div><strong>Rol:</strong> ${escapeHtml(roleLabelEs)}</div>
        </div>
        ${
          errorMessage
            ? `<div class="msg show err" id="boot-error">${escapeHtml(errorMessage)}</div>`
            : `<div class="msg err" id="boot-error"></div>`
        }
        <div class="msg ok" id="msg-ok"></div>
        <div class="msg err" id="msg-err"></div>

        <label for="first_name">Nombre</label>
        <input id="first_name" name="first_name" type="text" autocomplete="given-name" value="${escapeHtml(defaultFirstName)}" required minlength="2" />

        <label for="last_name">Apellidos</label>
        <input id="last_name" name="last_name" type="text" autocomplete="family-name" value="${escapeHtml(defaultLastName)}" required minlength="2" />

        <label for="dni">DNI/NIE</label>
        <input id="dni" name="dni" type="text" autocomplete="off" value="${escapeHtml(defaultDni)}" required />

        <div class="section-title">Verificación por email</div>
        <p class="hint">Enviaremos un código de un solo uso al email de esta invitación.</p>
        <button type="button" class="btn secondary" id="btn-request-otp">Solicitar código</button>

        <div id="otp-block" class="hidden">
          <label for="otp">Código de verificación</label>
          <input id="otp" name="otp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="000000" />
          <button type="button" class="btn secondary" id="btn-verify-otp">Verificar código</button>
        </div>

        <form id="activate-form" class="hidden" method="post" action="/api/auth/accept-invite">
          <input type="hidden" name="token" value="${escapeHtml(token)}" />
          <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
          <input type="hidden" name="first_name" id="hf-first" />
          <input type="hidden" name="last_name" id="hf-last" />
          <input type="hidden" name="dni" id="hf-dni" />
          <input type="hidden" name="otp_verified_nonce" id="hf-nonce" />

          <div class="section-title">Contraseña</div>
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
          <label for="password_confirm">Repetir contraseña</label>
          <input id="password_confirm" name="password_confirm" type="password" autocomplete="new-password" minlength="8" required />
          <button type="submit" class="btn" id="btn-activate">Activar cuenta</button>
        </form>
      </div>
      <p class="foot"><a href="${escapeHtml(loginPath)}">Volver al inicio de sesión</a></p>
    </div>
    <script>
      (function () {
        var cfg = ${cfgJson};
        var $ = function (id) { return document.getElementById(id); };
        function show(el, text, asOk) {
          if (!el) return;
          el.textContent = text || "";
          el.classList.add("show");
          el.classList.toggle("ok", !!asOk);
          el.classList.toggle("err", !asOk);
        }
        function hideMsg(el) {
          if (!el) return;
          el.classList.remove("show");
          el.textContent = "";
        }
        function readProfile() {
          return {
            first_name: ($("first_name").value || "").trim(),
            last_name: ($("last_name").value || "").trim(),
            dni: ($("dni").value || "").trim(),
          };
        }
        $("btn-request-otp").addEventListener("click", function () {
          hideMsg($("msg-ok"));
          hideMsg($("msg-err"));
          var p = readProfile();
          $("btn-request-otp").disabled = true;
          fetch("/api/auth/invite/request-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              token: cfg.token,
              first_name: p.first_name,
              last_name: p.last_name,
              dni: p.dni,
            }),
          })
            .then(function (r) {
              return r.json().then(function (j) {
                return { ok: r.ok, status: r.status, body: j };
              });
            })
            .then(function (res) {
              $("btn-request-otp").disabled = false;
              if (!res.ok) {
                show($("msg-err"), (res.body && res.body.message) || "No se pudo enviar el código.", false);
                return;
              }
              show($("msg-ok"), "Código enviado. Revisa tu correo.", true);
              $("otp-block").classList.remove("hidden");
            })
            .catch(function () {
              $("btn-request-otp").disabled = false;
              show($("msg-err"), "No se pudo enviar el código.", false);
            });
        });
        $("btn-verify-otp").addEventListener("click", function () {
          hideMsg($("msg-ok"));
          hideMsg($("msg-err"));
          var otp = ($("otp").value || "").trim();
          $("btn-verify-otp").disabled = true;
          fetch("/api/auth/invite/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ token: cfg.token, otp: otp }),
          })
            .then(function (r) {
              return r.json().then(function (j) {
                return { ok: r.ok, body: j };
              });
            })
            .then(function (res) {
              $("btn-verify-otp").disabled = false;
              if (!res.ok || !res.body || !res.body.otp_verified_nonce) {
                show($("msg-err"), "Código incorrecto o caducado.", false);
                return;
              }
              var p = readProfile();
              $("hf-first").value = p.first_name;
              $("hf-last").value = p.last_name;
              $("hf-dni").value = p.dni;
              $("hf-nonce").value = res.body.otp_verified_nonce;
              $("activate-form").classList.remove("hidden");
              show($("msg-ok"), "Código verificado. Crea tu contraseña.", true);
            })
            .catch(function () {
              $("btn-verify-otp").disabled = false;
              show($("msg-err"), "Código incorrecto o caducado.", false);
            });
        });
      })();
    </script>
  </body>
</html>`;
};
