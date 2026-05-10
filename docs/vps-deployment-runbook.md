# Runbook de despliegue VPS — FRIGEST (producción / staging)

Documento de **planificación**: no ejecuta despliegue real. Infra objetivo: **Ubuntu 24.04 LTS**, **Node 22**, **Nginx**, **Let’s Encrypt**, firewall **UFW**. CORREOS en IONOS (privacidad@, soporte@, etc.); **solo DNS** apuntando al VPS cuando exista la IP.

---

## 1. Arquitectura recomendada

| Componente | Rol |
|-------------|-----|
| **Nginx** | TLS termination, HTTP→HTTPS, sirve estáticos (apex + SPA), `proxy_pass` a Node para **api.**. |
| **Node (Express)** | API REST en `127.0.0.1:3000`; **no** sirve el bundle del frontend en producción (el SPA es estático generado por Vite). |
| **PM2 o systemd** | Mantener el proceso Node vivo y reinicios ante fallo o reboot. |
| **Certbot** | Certificados Let’s Encrypt para `frigest.es`, `www`, `app`, `api`. |
| **Datos persistentes** | `APP_DATA_DIR` + `APP_UPLOADS_DIR` fuera del clone git (p. ej. `/var/www/frigest/data`). |

**Dominios:**

| Host | Uso |
|------|-----|
| **frigest.es** | Landing + páginas legales estáticas (`/legal/*.html`). |
| **www.frigest.es** | Redirección 301 → `https://frigest.es`. |
| **app.frigest.es** | SPA (contenido de `dist/` tras `npm run build`). |
| **api.frigest.es** | Proxy a Node (`/api/*`, `/health`, `/uploads` si aplica). |

El backend **no** monta el `dist/` por defecto (`server/index.js` solo registra rutas API y estáticos de uploads); por tanto **conviene separar**: Nginx sirve frontend y legal; Nginx proxy hacia Node para API.

---

## 2. Estructura de carpetas sugerida

```
/var/www/frigest/
  current/              # symlink al release activo (opcional capistrano-style)
  releases/YYYYmmdd-HHMM/   # checkout + npm ci + build (opcional)
  shared/
    data/                 # APP_DATA_DIR
    uploads/              # APP_UPLOADS_DIR (public/private dentro)
    logs/                 # opcional; o /var/log/frigest/
  static-frigest-es/      # solo apex: landing index.html + legal/ (copiar desde dist/legal o public/legal)
.env                      # NO en git; permisos 600; fuera del web root si es posible
```

Logs aplicación: stdout del proceso (journalctl si systemd; PM2 logs si PM2). Nginx: `/var/log/nginx/access.log` / `error.log`.

---

## 3. DNS en IONOS (cuando exista IP del VPS)

Apuntar registros **A** al IPv4 del VPS (y **AAAA** si usáis IPv6):

| Tipo | Nombre / Host | Valor |
|------|----------------|-------|
| A | @ | `IP_DEL_VPS` |
| A | www | `IP_DEL_VPS` |
| A | app | `IP_DEL_VPS` |
| A | api | `IP_DEL_VPS` |

Opcional: **CNAME** `www` → `frigest.es` si el panel lo permite en lugar de A duplicado.

**No activar** estos registros hasta que el VPS y Nginx estén listos para responder en :80 (Certbot).

---

## 4. Variables críticas (resumen)

Ver **`docs/production-env-template.md`**. Mínimo en producción:

- `NODE_ENV=production`
- `APP_ALLOW_AUTH_BYPASS=false` (explícito)
- `APP_DEV_TOKEN=` (vacío)
- `APP_ALLOWED_ORIGINS` con `https://app.frigest.es`, `https://frigest.es`, …
- `APP_TRUST_PROXY=1` detrás de Nginx
- `APP_SETTINGS_SECRET` ≥ 32 caracteres
- `VITE_APP_API_URL=https://api.frigest.es` (en build del frontend)

---

## 5. Build y arranque (referencia repo)

| Acción | Comando |
|--------|---------|
| Build frontend | `npm run build` → salida en **`dist/`** (Vite). |
| Arranque API | `npm run server:start` → `node server/index.js` |
| Puerto por defecto | **3000** (`APP_SERVER_PORT`, `server/config.js`) |
| Health check | `GET https://api.frigest.es/health` |

---

## 6. PM2 vs systemd

| Opción | Cuándo usarla |
|--------|----------------|
| **systemd** | Recomendado por defecto: integración con Ubuntu, logs en journalctl, reinicios en boot sin herramienta extra. Unidad `frigest-api.service` ejecutando `node server/index.js` con `WorkingDirectory` y `EnvironmentFile=/var/www/frigest/.env`. |
| **PM2** | Útil si queréis cluster multi-proceso, despliegues `reload` sin cortar, o dashboard; añade dependencia operativa (`npm i -g pm2`). |

Para una sola instancia Express tras Nginx, **systemd es suficiente**.

---

## 7. Backups

- **Datos aplicación:** directorios `APP_DATA_DIR` y `APP_UPLOADS_DIR`.
- **Configuración:** copia cifrada o fuera de línea de `.env` (sin subir a git).
- **Nginx / systemd:** copia de `/etc/nginx/sites-available/frigest` y unidad systemd.
- **Frecuencia:** diaria incremental + retención acorde a RGPD/necesidad operativa.
- Probad restauración en entorno de **staging** antes de confiar en el backup.

---

## 8. Checks previos al primer deploy

- [ ] `npm run release:check` en CI o máquina limpia tras `npm ci`.
- [ ] `npm run check:production-env` en el VPS con variables reales cargadas.
- [ ] Orígenes CORS alineados con URLs HTTPS finales.
- [ ] Stripe webhook URL apuntando a `https://api.frigest.es/api/billing/webhook` si usáis Stripe.
- [ ] Correos IONOS probados (SPF/DKIM según IONOS).

---

## 9. Pasos de despliegue (cuando tengáis IP del VPS)

1. **Crear VPS** Ubuntu 24.04 LTS en el proveedor elegido.
2. **Usuario no root** con sudo y SSH por clave; desactivar password login si procede.
3. **UFW:** `allow OpenSSH`, `allow 'Nginx Full'` o 80/443; `enable`.
4. **Instalar Node 22** (NodeSource o nvm según política del equipo).
5. **Instalar Nginx:** `apt install nginx`.
6. **Clonar repo** en `/var/www/frigest/current` (o releases + symlink).
7. **`npm ci`** en el directorio del proyecto.
8. **`npm run release:check`** (validación completa antes de producción).
9. Crear **`.env`** manualmente en el servidor según `docs/production-env-template.md` (permisos 600).
10. **`npm run check:production-env`** con variables exportadas.
11. **`npm run build`** con variables `VITE_*` correctas para URLs públicas.
12. Poblar **`static-frigest-es`:** copiar `dist/legal/` (o `public/legal`) y añadir `index.html` de landing si existe.
13. Copiar/ejemplo **Nginx** desde `docs/nginx-frigest.example.conf`; ajustar rutas; `nginx -t && systemctl reload nginx`.
14. **systemd:** crear servicio `frigest-api.service` → `ExecStart=/usr/bin/node server/index.js`, `WorkingDirectory=/var/www/frigest/current`, `EnvironmentFile=/var/www/frigest/.env`; `systemctl enable --now frigest-api`.
15. **DNS en IONOS:** registros A (§3).
16. **Certbot:** `certbot --nginx -d frigest.es -d www.frigest.es -d app.frigest.es -d api.frigest.es` (ajustar según bloques).
17. **Probar URLs:**
   - `https://frigest.es/legal/privacy.html`
   - `https://frigest.es/legal/terms.html`
   - `https://frigest.es/legal/data-deletion.html`
   - `https://app.frigest.es` (carga SPA)
   - `https://api.frigest.es/health` → JSON `{ ok: true, ... }`

---

## 10. Documentos relacionados

- `docs/production-env-template.md` — plantilla de variables.
- `docs/nginx-frigest.example.conf` — ejemplo Nginx.
- `docs/release-readiness.md` — checklist seguridad release.
- `README.md` — desarrollo local y `check:production-env`.
