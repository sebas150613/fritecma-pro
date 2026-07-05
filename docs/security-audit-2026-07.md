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
| F5 | MEDIO | Store carga toda la entidad en memoria por request | 🟡 **MITIGADO + DESPLEGADO** (2026-07-05) — filtro de igualdad + `id` empujados a SQL e índice JSONB por `organization_id`; paginación/`limit` en SQL sigue pendiente (fase 2) |
| F6 | MEDIO | Sesiones/rate-limit sin bloqueo ni estado compartido | 🟡 **MITIGADO + DESPLEGADO** (2026-07-05) — race de sesiones resuelta con mutex de escritura; rate-limit sigue en memoria (aceptable con 1 instancia) |
| F7 | MEDIO | Rol `encargado` se normaliza a `admin` | ✅ Aceptado — decisión de producto (intencionado: `encargado` = permisos de `admin`) |
| F8 | BAJO | CORS en prod acepta origen = host de la request | ⏳ Aceptable tras el proxy (ver nota) |
| V1 | **CRÍTICO** | VeriFactu: numeración y cadena de hash **globales**, no por organización | ✅ **CORREGIDO + DESPLEGADO** (2026-07-05) |
| V2 | ALTO | Scheduler de reintentos AEAT abandona facturas reales al primer tick | ✅ **CORREGIDO + DESPLEGADO** (2026-07-05) |
| S1 | ALTO | `POST /api/billing/contact-sales` lanza `ReferenceError` (500) | ✅ **CORREGIDO + DESPLEGADO** (2026-07-05) |
| S2 | BAJO | Webhook Stripe sin idempotencia por `event.id` | ✅ **CORREGIDO + DESPLEGADO** (2026-07-05) |
| V3 | BAJO | Certificado `.p12` sin cifrar en disco | ✅ **CORREGIDO + DESPLEGADO** (2026-07-05) — cifrado AES-256-GCM en reposo con auto-migración al primer uso |

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

### F5 · Cuello de botella del store — MITIGADO 🟡 (en rama, pendiente desplegar)
`server/lib/json-store.js`: el `filter()` del store **Postgres** cargaba TODAS las filas de la entidad y filtraba en JS. Ahora empuja las igualdades de tipo string a SQL (`readScoped`): clave y valor **parametrizados** (`payload->>$k = $v`, sin inyección por nombre de clave), y el filtro por `id` usa la PK `record_id`. Se re-aplica `matchesFilter` en JS para preservar la semántica exacta (filtros no-string y tipado), así que el SQL solo **reduce** el conjunto, nunca cambia el resultado. Nuevo índice `(entity_name, (payload->>'organization_id'))` para la consulta tenant-scoped más común. **Validado contra Postgres de producción (solo-lectura): el nuevo SQL devuelve conjuntos idénticos al scan+filtro-JS**; regresión local (store JSON) 12/12 + contratos multitenant/rbac OK. **Desplegado 2026-07-05** (validado en vivo con el módulo real: 7 comparaciones idénticas; índice `app_entity_records_entity_org_idx` creado).
**Pendiente (fase 2):** empujar también `sort`/`limit` a SQL (hoy la paginación sigue en JS sobre el conjunto ya reducido) y considerar índices adicionales según los patrones de consulta reales al crecer los datos.

### F6 · Sesiones y rate-limit — MITIGADO 🟡 (desplegado 2026-07-05)
**Sesiones (resuelto):** el blob de sesiones (`auth-sessions.json`, una fila JSONB en Postgres) se mutaba con read-modify-write en cada login/logout/cambio-de-org y en la limpieza lazy de expiradas → dos operaciones concurrentes se pisaban (última escritura gana), pudiendo perder un token recién creado o **resucitar uno recién invalidado**. Ahora todas esas mutaciones pasan por `mutateSessions`, un mutex en proceso (mismo patrón que `counterLock`) que serializa leer→mutar→escribir; los sitios que dependen del estado previo (cambio-de-org, limpieza) **re-verifican dentro del lock** para no resucitar tokens. Verificado con test de concurrencia (25 logins concurrentes → 25 sesiones sin pérdida; 10 logout + 10 login concurrentes → conteo consistente) + contratos auth-storage/rbac/multitenant.
**Rate-limit (aceptado):** sigue en memoria del proceso; **aceptable con una sola instancia** (la realidad actual de producción). Si se escala horizontalmente, mover a un store compartido (p. ej. Redis). Documentado, no bloqueante hoy.

### F7 · `encargado` → `admin` — ACEPTADO (decisión de producto, 2026-07-05)
`server/lib/roles.js`: `LEGACY_ROLE_ALIASES = { encargado: "admin" }`. **Decisión confirmada por el propietario: es intencionado — `encargado` debe tener exactamente los mismos permisos que `admin`.** No es sobre-privilegio; es un alias de rol deliberado. El mapeo se aplica en un único punto de normalización (`normalizeOrganizationRole` → `resolveAppRole`), por lo que la resolución a `admin` es consistente en toda la app (permisos, visibilidad de precios, billing, gestión de usuarios). La etiqueta "encargado" se conserva como nombre visible en la UI. No requiere cambios de código.

### F8 · CORS en producción — aceptable tras el proxy
`server/index.js` permite orígenes cuyo host = host de la request (necesario para las páginas HTML servidas por la API, p. ej. aceptar invitación). El `Host`/`X-Forwarded-Host` lo fija el proxy de confianza, así que el riesgo práctico es bajo. Se puede endurecer a solo `APP_ALLOWED_ORIGINS` si se separan esos flujos.

---

## Aspectos correctos
scrypt + `timingSafeEqual`; secretos AES-256-GCM; cookies HttpOnly/Secure/SameSite=strict; CSP+HSTS; SQL parametrizado; anti path-traversal en ficheros y backups; backups cifrados con checksum y restauración transaccional; validaciones de arranque que abortan config insegura de producción.

## ¿Hay más fallos? — barrido de completitud
Tras el barrido dirigido no encontré vulnerabilidades adicionales de severidad alta/crítica en el código revisado.

---

## Auditoría en profundidad — VeriFactu / Stripe / Organizaciones (2026-07-05)

### V1 · VeriFactu multi-tenant: numeración y cadena de hash GLOBALES — CRÍTICO 🔴
`server/services/verifactu-service.js` no tiene **ninguna** referencia a `organization_id`:
- `getNextInvoiceNumber(series)` usa un único contador global en `function-counters.json` con claves `F`/`R` compartidas por todas las empresas.
- `getLastInvoice()` devuelve la última factura de **todas** las organizaciones, así que la primera factura de la empresa B encadena su `hash_anterior` con el hash de la empresa A.
- `invoiceStore.create({...})` (línea ~394) **no guarda `organization_id`** en la factura.

**Impacto:**
1. **Incumplimiento VeriFactu**: cada obligado (NIF) debe tener su propia serie consecutiva y su propia huella encadenada. Con dos clientes, las series se entrelazan (A→F-000001, B→F-000002) y las cadenas de hash se cruzan entre empresas.
2. **Facturas fuera del ámbito de la organización**: al no llevar `organization_id`, las facturas creadas por VeriFactu no pasan el filtro tenant de `GET /entities/Invoice` (`buildTenantFilter` exige `organization_id === currentOrg.id`), por lo que **no aparecen en la página de Facturación** de ninguna empresa.
3. **Purga incompleta**: `purgeOrganizationCompletely` borra por `organization_id`; esas facturas quedarían huérfanas en un hard-delete.

Hoy es en gran parte **latente** porque solo opera la organización `org-frigest` (la factura semilla `inv-bahia-001` sí lleva `organization_id`, pero lo pone el seed, no el runtime). **Se convierte en fallo real en cuanto se dé de alta un segundo cliente** — inminente en el roadmap SaaS.

> **Nota histórica:** este fix ya se implementó el 2026-06-24 en el backup del VPS (numeración + cadena por `organization_id`, con script de backfill) pero **nunca se comiteó a `main`**; se perdió. Ver la memoria `frigest-verifactu-per-org-fix`.

**Recomendación:** reintroducir el scope por `organization_id` (contador por-org con migración de las claves legacy `{F,R}`, `getLastInvoice` filtrado por org, y `organization_id` en el `create`), recuperando el `scripts/migrate-verifactu-per-organization.mjs` del backup. Requiere pruebas de regresión de numeración y de la cadena.

### V2 · El scheduler de reintentos abandona facturas AEAT reales — ALTO 🔴
`startVerifactuRetryScheduler` invoca `retryVerifactuSubmissions()` **sin `currentUser`**. Para una factura que exige envío real (`xml_payload` con `RegFactuSistemaFacturacion`), `processVerifactuRetry` cae a `owner` = registro `User` del `created_by_email`. Pero los campos `verifactu_cert_uri` / `verifactu_produccion` viven en `OrganizationSettings`, no en `User`, así que `canUseRealSubmission` es `false` → `HttpError(400)`. Como es 4xx, `retryVerifactuSubmissions` lo trata como **fallo permanente** y marca la factura `error` (`MAX_RETRIES_REACHED`) en el **primer tick**. El reintento **manual** (vía ruta `/functions`, que enriquece `currentUser` con los secretos de la org) sí funciona; el automático no.

**Recomendación:** en el scheduler, resolver por factura la organización y cargar los secretos de `OrganizationSettings` (equivalente a `mergeDecryptedOrgSecretsForServer`) antes de reintentar, o excluir del abandono los 400 por "certificado no disponible".

### V3 · Certificado `.p12` sin cifrar en disco — CORREGIDO ✅ (2026-07-05)
`server/lib/secret-crypto.js`: nuevas primitivas binarias `encryptBufferAtRest`/`decryptBufferAtRest`/`isEncryptedBuffer` (AES-256-GCM, misma derivación de clave de `APP_SETTINGS_SECRET` que los secretos de organización; formato `MAGIC|iv|tag|ciphertext`). `server/services/verifactu-aeat.js`: `readCertificateSecure` lee el `.p12`, lo descifra si está sellado y, si lo encuentra en claro, **lo re-cifra in situ al primer uso** (escritura atómica tmp+rename, best-effort) — las instalaciones existentes se auto-migran sin intervención. El plaintext solo vive en memoria para el handshake TLS. Sin `APP_SETTINGS_SECRET` (dev local) degrada a comportamiento anterior sin romper envíos. No se tocó el pipeline genérico de subida.
**Verificado (2026-07-05, con certificados de prueba FNMT):** round-trip binario, auto-cifrado en primer uso (disco cifrado, lectura íntegra), lectura descifrada idéntica, y **envío mTLS real al sandbox de AEAT con el `.p12` ya cifrado en disco (HTTP 200, misma respuesta que en claro)**. Caso sin secreto: fichero intacto y lectura correcta.

### VeriFactu · Prueba end-to-end contra el sandbox de AEAT — HECHA ✅ (2026-07-05)
Con los certificados de prueba FNMT (`ACTIVO_EIDAS_CERTIFICADO_PRUEBAS___99999999R.p12`):
- **mTLS**: handshake con certificado cliente aceptado por `prewww1.aeat.es` (HTTP 200).
- **Pipeline completo** (`processVerifactu` en modo producción → envelope `RegFactuSistemaFacturacion` → envío → parseo → persistencia): funciona de extremo a extremo; AEAT parseó el envelope y ejecutó la validación de cabecera.
- **Resultado funcional**: error **4104** ("NIF del ObligadoEmision no está identificado") — limitación del entorno, no fallo de la app: los NIF genéricos de prueba FNMT (99999999R, Q0000000J) **no están en el censo** que contrasta la preproducción de AEAT. El certificado de representante devuelve 302 (no autorizado a nivel de aplicación) y el sello de entidad no completa el handshake en preproducción.
- **Conclusión**: todo lo que depende de FriGest está verificado (certificado, mTLS, envelope, parseo de respuestas, persistencia de errores). Para obtener un "Correcto" real hace falta el **certificado real de la empresa** (NIF censado) — mismo procedimiento, sin cambios de código.

### S1 · `POST /api/billing/contact-sales` siempre falla — ALTO 🔴
`server/services/billing-service.js` → `createSalesContactRequest` usa `userStore.list()` (línea ~439) pero **`userStore` no está declarado**: el módulo importa `getUserStore` y nunca lo instancia. Resultado: `ReferenceError` → **HTTP 500** en cada solicitud comercial. Endpoint roto.
**Corrección:** `const userStore = getUserStore();` a nivel de módulo (o llamar `getUserStore().list()`).

### Stripe · webhook y escalada de plan — CORRECTO ✅
- **Firma del webhook:** correcta. `server/index.js` monta `express.raw({type:"application/json"})` en `/api/billing/webhook` **antes** de `express.json`, y `parseStripeWebhookEvent` valida con `stripe.webhooks.constructEvent(rawBuffer, signature, STRIPE_WEBHOOK_SECRET)`.
- **Sin escalada de plan desde cliente:** el plan efectivo solo se aplica vía webhook mapeando `price.id` → plan (`updateSubscriptionFromStripePayload`); `/checkout` valida el plan contra el catálogo y exige `stripe_price_id`; `/assign-plan` y `license/activate|pause` exigen owner (`is_hidden_owner`). Un cliente no puede autopromocionarse sin pagar.

### S2 · Webhook sin idempotencia — CORREGIDO ✅ (en rama, pendiente desplegar)
Nueva entidad global `StripeWebhookEvent` (keyed por el `event.id` de Stripe). `stripeWebhookHandler` comprueba `hasStripeEventBeenProcessed(event.id)` y sale con `{received:true, duplicate:true}` si ya se procesó; registra el evento con `recordStripeEventProcessed` **solo tras** manejarlo con éxito (así un evento fallido se sigue reintentando). Defensa en profundidad sobre unos handlers que ya eran idempotentes. Verificado con test de integración (mismo `event.id` dos veces → segunda es no-op).

### Organizaciones — CORRECTO ✅ (con una consecuencia de V1)
- **Hard-delete:** restringido a owner (`canAccessHiddenUsers`), bloquea la org activa de la sesión y la org interna de plataforma; purga entidades tenant por `organization_id`, memberships y usuarios sin otra membership (nunca al owner oculto). Salvedad: las facturas sin `organization_id` de V1 no se purgan.
- **switch / creación de sesión de owner:** validado contra las memberships del usuario; los usos de `req.currentUser.id` son correctos tras F10.
- **Baja de usuario:** impide eliminar el último admin activo y protege al owner oculto y a superadmin frente a no-owners.

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
5. **Proceso continuo:** ~~revisión de XSS en el frontend~~ ✅ hecha 2026-07-05 (limpia, ver abajo); ~~`npm audit`~~ ✅ 0 vulnerabilidades (2026-07-05); ~~`npm audit` en CI~~ ✅ **ya cubierto** — `.github/workflows/release-check.yml` corre `npm run release:check` en cada push/PR a `main`, que incluye `npm audit` ("must be clean") + todos los contratos de seguridad (hardening, auth-storage, org-settings, multitenant, rbac, headers), secrets scan, tests, lint, typecheck, build y smoke. **Único pendiente de proceso:** fuzzing de entradas en endpoints públicos (signup, invitación, reset).

### Frontend · Revisión de XSS — SIN HALLAZGOS ✅ (2026-07-05)
- Único `dangerouslySetInnerHTML` en `src/components/ui/chart.jsx`: blindado con allowlist (`SAFE_CSS_KEY` `/^[\w-]+$/` y `SAFE_CSS_COLOR`), el `id`/`config` provienen del código (no del usuario). Seguro.
- Todos los `href`/`src` dinámicos usan esquema fijo (`tel:`/`mailto:`), URL `https://maps.google.com/?q=` + `encodeURIComponent` (`MapLink`), o URLs construidas por el backend (`qr_url` de AEAT, media de ficheros). Ninguno permite inyección `javascript:` ni HTML.
- React escapa por defecto todo el texto de datos de usuario (nombres de cliente, notas, campos de factura, etc.). Sin `eval`/`new Function`/`document.write`.
- `npm audit`: **0 vulnerabilidades**.

### Historial
- **2026-07-04:** primera pasada de auditoría + corrección de F1/F2/F3/F4/F10 y despliegue. Pendientes 1–5 arriba.
- **2026-07-05:** segunda pasada en profundidad de VeriFactu (`verifactu-service.js`, `verifactu-aeat.js`, `functions.js`), Stripe (`billing.js`, `billing-service.js`) y organizaciones (`organizations.js`, `organization-hard-delete.js`). Nuevos hallazgos: **V1** (crítico, VeriFactu no es multi-tenant), **V2** (alto, scheduler abandona reintentos reales), **S1** (alto, `contact-sales` roto). Webhook Stripe y hard-delete de orgs verificados correctos.
- **2026-07-05 (correcciones):** V1/V2/S1 corregidos en la rama `fix/security-audit-2026-07-v2` (**pendiente de desplegar a producción**):
  - **V1:** `verifactu-service.js` — numeración por-organización (contador `{ "<org>": { F, R } }` con `migrateLegacyCounters` que atribuye las claves planas legacy a `org-frigest`, y auto-seed desde las facturas existentes vía `getMaxInvoiceIndex`), `getLastInvoice` filtrado por `organization_id`, y `organization_id` guardado en el `create`. Nuevo `scripts/migrate-verifactu-per-organization.mjs` (dry-run por defecto) para backfill de facturas legacy por la organización de su intervención.
  - **V2:** `processVerifactuRetry` resuelve el certificado desde `OrganizationSettings` de la organización de la factura cuando ni el llamante ni el creador lo tienen (caso del scheduler automático), en vez de abandonarla.
  - **S1:** `billing-service.js` usa `getUserStore().list()` (llamada diferida para evitar el ciclo de import con `auth.js`).
  - **Verificado:** `node --check`, test unitario de `migrateLegacyCounters`/`parseInvoiceIndex`, test de integración de numeración+cadena por-org con dos organizaciones, contrato `multitenant-isolation` OK, 12/12 tests, lint y build OK.
- **2026-07-05 (continuación):** revisión de XSS del frontend (sin hallazgos), `npm audit` = 0, F7 cerrado como decisión de producto, y **S2** corregido (idempotencia del webhook Stripe con la entidad `StripeWebhookEvent`). Verificado: 12/12 tests, contrato multitenant-isolation, test de integración de idempotencia, lint y build.
- **2026-07-05 (F5, F6, S2 desplegados):** **S2**, **F5** (filtro de igualdad + `id` empujados a SQL en el store Postgres + índice JSONB por `organization_id`; validado en vivo contra Postgres, resultados idénticos) y **F6** (mutex de escritura de sesiones; test de concurrencia 25 logins → 25 sesiones sin pérdida; login en prod devuelve 401 correcto) fusionados a `main` y desplegados. Servicio reiniciado, `/health` 200, sin errores, GitHub actualizado.
- **2026-07-05 (despliegue):** `fix/security-audit-2026-07-v2` (commit `3f56001`) fusionado a `main` y desplegado. Producción usa **Postgres** (no el store JSON), y al desplegar había **0 facturas** y sin fila de contadores, así que **no fue necesario backfill** (`scripts/migrate-verifactu-per-organization.mjs` es solo para el store JSON y se salta con `DATABASE_URL`). Servicio `frigest-api` reiniciado, `/health` 200, sin errores en logs. `main` publicado en GitHub.
