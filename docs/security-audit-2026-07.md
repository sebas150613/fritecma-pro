# Auditoría de seguridad — FriGest / fritecma-pro (2026-07-04)

**Alcance:** backend REST (`server/`), frontend (`src/`), dependencias.
**Método:** revisión estática + pruebas dinámicas en instancia local aislada (JSON store, datos temporales). No se ejecutó nada contra producción.

## Estado tras correcciones (rama `fix/security-audit-2026-07`)
| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| F1 | **CRÍTICO** | Login sin contraseña vía `user_id` | ✅ **CORREGIDO + verificado** |
| F2 | **ALTO** | Mass-assignment en `PATCH /me` | ✅ **CORREGIDO + verificado** |
| F10 | **ALTO** | `OrganizationSettings.id` machacaba `req.currentUser.id` | ✅ **CORREGIDO + verificado** (hallazgo nuevo) |
| F3 | **ALTO** | Dependencias vulnerables | ✅ **CORREGIDO** (`npm audit` = 0) |
| F4 | MEDIO | Lectura de ficheros cruzada entre orgs vía IA | ✅ **CORREGIDO** (verificado por código) |
| F5 | MEDIO | Store carga toda la entidad en memoria por request | ⏳ Documentado (refactor arquitectónico) |
| F6 | MEDIO | Sesiones/rate-limit sin bloqueo ni estado compartido | ⏳ Documentado (arquitectónico) |
| F7 | MEDIO | Rol `encargado` se normaliza a `admin` | ⏳ Requiere decisión de producto |
| F8 | BAJO | CORS en prod acepta origen = host de la request | ⏳ Aceptable tras el proxy (ver nota) |

---

## Correcciones aplicadas y verificadas

### F1 · Login sin contraseña por `user_id` — CORREGIDO
`server/routes/auth.js`: la rama `user_id` solo se permite si `allowAuthBypass && !isProduction`. En producción `POST /api/auth/login` con `user_id` devuelve 400.
**Verificado:** instancia con bypass off → `{"user_id":"local-tech"}` → **HTTP 400** "Introduce email y contraseña".

### F2 · Mass-assignment en `PATCH /me` — CORREGIDO
`server/routes/auth.js`: lista blanca `SELF_EDITABLE_USER_FIELDS` (full_name, first_name, last_name, phone, avatar_url, locale, notification_preferences). Todo lo demás se descarta.
**Verificado:** usuario real → `PATCH /me {full_name, is_hidden_owner:true, global_role:"superadmin", role:"superadmin", is_active}` → solo persistió `full_name`; rol siguió `admin`, sin `is_hidden_owner`.

### F10 · `OrganizationSettings.id` machacaba el id del usuario — CORREGIDO (NUEVO)
`server/lib/tenant.js` (`mergeOrganizationSettingsIntoUser`): se descartan `id`/`created_date`/`updated_date`/`organization_id` de los settings antes de fusionarlos y se re-afirma la identidad del usuario.
**Por qué importa:** `req.currentUser.id` valía el id de la fila de OrganizationSettings, no el del usuario. Efectos: `DELETE /me` no borraba nada (el flujo legal de eliminación de datos era un no-op), `PATCH /me` no persistía el perfil, y `purchase_orders.requested_by_user_id` guardaba un id incorrecto. Además era el motivo *accidental* por el que F2 no era explotable; corregirlo habría reabierto F2 de no aplicarse la lista blanca simultáneamente.
**Verificado:** `me.id` ahora coincide con el id real del usuario en la BD y la edición legítima de perfil persiste.

### F3 · Dependencias — CORREGIDO
`npm audit fix` (express/qs DoS, react-router open redirect) + `nodemailer@9.0.3`. Resultado: **0 vulnerabilidades**. La app usa SMTP user/pass con STARTTLS (no OAuth2 ni opción `raw`), así que las vías de la CVE de nodemailer no eran explotables aquí; aun así se actualizó. Build y tests (12/12) OK tras el bump.

### F4 · Lectura cruzada de ficheros vía IA — CORREGIDO
`server/routes/ai.js` pasa `{organizationId, isOwner}` a `invokeAi`; `server/services/ai-service.js` solo convierte a data-URL ficheros locales cuya ruta empiece por `public/<org>/` o `private/<org>/` del solicitante (owner exento). Otras rutas → 403.

---

## Pendientes (no auto-corregidos, con motivo)

### F5 · Cuello de botella del store — arquitectónico
`server/lib/json-store.js`: cada `list`/`filter` carga TODAS las filas de la entidad en memoria y filtra en JS; el filtro por `organization_id` es solo en JS. Escala O(N) y frágil. **Recomendación:** filtrar/paginar en SQL con índice JSONB `(entity_name, (payload->>'organization_id'))`. No aplicado por ser un refactor que requiere pruebas de regresión de todas las consultas.

### F6 · Sesiones y rate-limit — arquitectónico
Sesiones: read-modify-write del objeto completo (race sin bloqueo). Rate-limit: en memoria del proceso (inútil al escalar horizontalmente). **Recomendación:** tabla `sessions` por-fila con TTL; store de rate-limit compartido si se escala. Aceptable hoy con una sola instancia.

### F7 · `encargado` → `admin` — decisión de producto
`server/lib/roles.js`: `LEGACY_ROLE_ALIASES = { encargado: "admin" }` da a `encargado` permisos plenos de admin. Si el producto lo entiende como rol intermedio, es sobre-privilegio. **No lo cambio sin confirmar la intención**, porque convertir `encargado` en rol de primera clase implica definir su matriz de permisos en toda la app.

### F8 · CORS en producción — aceptable tras el proxy
`server/index.js` permite orígenes cuyo host = host de la request (necesario para las páginas HTML servidas por la API, p. ej. aceptar invitación). El `Host`/`X-Forwarded-Host` lo fija el proxy de confianza, así que el riesgo práctico es bajo. Se puede endurecer a solo `APP_ALLOWED_ORIGINS` si se separan esos flujos.

---

## Aspectos correctos
scrypt + `timingSafeEqual`; secretos AES-256-GCM; cookies HttpOnly/Secure/SameSite=strict; CSP+HSTS; SQL parametrizado; anti path-traversal en ficheros y backups; backups cifrados con checksum y restauración transaccional; validaciones de arranque que abortan config insegura de producción.

## ¿Hay más fallos? — barrido de completitud
Tras el barrido dirigido no encontré vulnerabilidades adicionales de severidad alta/crítica en el código revisado.

---

## Estado de la auditoría

### ✅ Completado y desplegado (esta iteración)
- **Corregido y verificado:** F1, F2, F10, F4, F3 (ver arriba). Verificación en instancia local aislada + lint + 12/12 tests + build. Desplegado a producción el 2026-07-04 (rama `fix/security-audit-2026-07` → `main`).
- **Revisado a fondo (sin hallazgos críticos nuevos):** autenticación/sesiones (`auth.js`, `security-config.js`), aislamiento multi-tenant (`tenant.js`, `entities.js`), subida/descarga de ficheros (`files.js`), backups (`backup-service.js`), cifrado de secretos (`secret-crypto.js`), cabeceras/CSP (`security-headers.js`), rate-limit (`rate-limit.js`), servicio de IA (`ai-service.js`), rutas de cuenta/usuarios (`account.js`, `users.js`), CORS y config de arranque (`index.js`, `config.js`).

### ⏳ Pendiente para cerrar la auditoría en profundidad
1. **VeriFactu** (`server/services/verifactu-*.js`): validar la generación de la cadena de hash y la firma XAdES, el manejo del certificado .p12, y que no se registren datos sensibles en logs. Alto valor legal/fiscal.
2. **Facturación / Stripe** (`server/routes/billing.js`): verificar que el webhook valida la firma (`STRIPE_WEBHOOK_SECRET`) con el cuerpo *raw*, idempotencia de eventos y que no haya escalada de plan/licencia manipulable desde el cliente.
3. **Organizaciones** (`server/routes/organizations.js`): revisar la lógica de switch/creación de sesión de owner (usos de `req.currentUser.id`, ahora correctos tras F10) y el hard-delete de organizaciones.
4. **Decisiones de arquitectura/producto:** F5 (filtrado/paginación en SQL con índice JSONB), F6 (tabla de sesiones + rate-limit compartido), F7 (rol `encargado`).
5. **Proceso continuo:** `npm audit` en CI, fuzzing de entradas en endpoints públicos (signup, invitación, reset), y una revisión del frontend más allá de patrones peligrosos (XSS en render de datos de usuario).

### Historial
- **2026-07-04:** primera pasada de auditoría + corrección de F1/F2/F3/F4/F10 y despliegue. Pendientes 1–5 arriba.
