# Plantilla de variables de entorno — producción / staging (FRIGEST)

**No commitees valores reales.** Copia este listado al gestor de secretos del VPS o a un `.env` fuera del repositorio con permisos restrictivos (`chmod 600`).

Los nombres siguen `server/config.js` y `vite.config.js`. Ajusta según funciones activas (Stripe, IA, SMTP, PostgreSQL).

---

## Obligatorias en producción (según `server/config.js` y `npm run check:production-env`)

```bash
# Entorno
NODE_ENV=production

# Servidor HTTP (Express escucha aquí; Nginx hace proxy desde api.*)
APP_SERVER_HOST=127.0.0.1
APP_SERVER_PORT=3000

# Seguridad obligatoria en prod (debe existir explícitamente)
APP_ALLOW_AUTH_BYPASS=false

# Vacío en producción (no usar token de desarrollo)
APP_DEV_TOKEN=

# Orígenes del frontend permitidos (CORS); lista separada por comas, sin espacios wildcard
APP_ALLOWED_ORIGINS=https://app.frigest.es,https://frigest.es,https://www.frigest.es

# Proxy: true/1 si Nginx termina TLS delante de Node (recomendado con api.frigest.es)
APP_TRUST_PROXY=1

# Cifrado de secretos OrganizationSettings en reposo (≥ 32 caracteres; generar valor aleatorio fuerte)
APP_SETTINGS_SECRET=<generar_secreto_32_o_mas_caracteres>
```

---

## Frontend embebido en el build (Vite — prefijo `VITE_`)

Generar en **momento de build** (`npm run build`) o exportar en el mismo entorno antes del build:

```bash
VITE_APP_ID=<identificador_app>
VITE_APP_BACKEND_PROVIDER=rest
VITE_APP_API_URL=https://api.frigest.es
VITE_APP_LOGIN_URL=https://api.frigest.es/api/auth/login
VITE_APP_LOGOUT_URL=https://api.frigest.es/api/auth/logout-page
VITE_STRIPE_PUBLISHABLE_KEY=<si_facturación_Stripe>
```

---

## Almacenamiento y datos

Por defecto el backend usa directorios locales bajo el proyecto si no se sobreescribe:

```bash
APP_DATA_DIR=/var/www/frigest/data
APP_UPLOADS_DIR=/var/www/frigest/uploads
```

PostgreSQL (si migráis el store desde JSON — solo si aplica en vuestra rama):

```bash
DATABASE_URL=<postgresql_connection_string>
APP_DATABASE_SSL=true
```

Si no usáis Postgres, dejad `DATABASE_URL` vacío según configuración actual del proyecto.

---

## IA (opcional)

```bash
APP_AI_PROVIDER=openai
OPENAI_API_KEY=<si_IA_activa>
APP_AI_BASE_URL=https://api.openai.com/v1
APP_AI_MODEL=gpt-5-mini
APP_AI_VISION_MODEL=gpt-5-mini
APP_AI_TIMEOUT_MS=90000
```

---

## Correo SMTP (plataforma / invitaciones — opcional según producto)

```bash
APP_SMTP_HOST=
APP_SMTP_PORT=587
APP_SMTP_SECURE=false
APP_SMTP_USER=
APP_SMTP_PASS=
APP_EMAIL_FROM=
APP_EMAIL_REPLY_TO=
APP_SALES_EMAIL=
```

---

## Stripe (opcional)

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_ENTERPRISE=
```

---

## VeriFactu — identificación del sistema informático (obligatorio para enviar a la AEAT)

Estos valores viajan en el bloque `<SistemaInformatico>` de **cada** envío y describen al **productor del software**, no al cliente que factura. Tienen que coincidir campo a campo con la declaración responsable publicada ([`declaracion-responsable-frigest.md`](declaracion-responsable-frigest.md)); si no coinciden, se está declarando a la AEAT algo distinto de lo firmado.

**`APP_VERIFACTU_SOFTWARE_NIF` e `APP_VERIFACTU_INSTALLATION_ID` no tienen valor por defecto a propósito.** Si faltan, el envío se corta con un error 500 en vez de inventarse un dato: antes el NIF caía al del obligado tributario, con lo que cada cliente declaraba haber fabricado FriGest.

```bash
# NIF de la persona o entidad PRODUCTORA del software (apartado 1.i de la declaración)
APP_VERIFACTU_SOFTWARE_NIF=<NIF_del_productor>

# Número de instalación: identifica este despliegue concreto
APP_VERIFACTU_INSTALLATION_ID=<identificador_de_esta_instalacion>

# Razón social o nombre del productor (apartado 1.h). Por defecto: FRIGEST
APP_VERIFACTU_SOFTWARE_NAME=

# Nombre y código del sistema (apartados 1.a y 1.b). Por defecto: FRIGEST y 01
APP_VERIFACTU_SYSTEM_NAME=
APP_VERIFACTU_SYSTEM_ID=

# Versión declarada (apartado 1.c). Por defecto toma la de package.json,
# que es lo correcto: la declaración responsable es POR VERSIÓN CONCRETA.
APP_VERIFACTU_SYSTEM_VERSION=

# S (por defecto) si esta instalación da servicio a varios obligados tributarios
# a la vez; N en un despliegue dedicado a uno solo.
APP_VERIFACTU_MULTIPLES_OT=S

# Zona horaria para las marcas de tiempo de los registros
APP_VERIFACTU_TIMEZONE=Europe/Madrid
```

`TipoUsoPosibleSoloVerifactu` y `TipoUsoPosibleMultiOT` **no son configurables**: son propiedades del producto (`S` y `S`) fijadas en `server/services/verifactu-aeat.js` y verificadas por `npm run check:verifactu-sif`. Cambiarlas exige rehacer la declaración responsable.

---

## Otros (según `server/config.js`)

```bash
APP_UPLOAD_MAX_FILE_SIZE_MB=25
APP_PUBLIC_SIGNUP_ENABLED=true
APP_REQUIRE_EMAIL_VERIFICATION=false
APP_ID=<opcional_si_no_usa_VITE_APP_ID>
APP_SEED_DEMO_USERS=false
```

---

## Verificación

En el servidor, con las variables cargadas:

```bash
npm run check:production-env
```

No imprime secretos; falla si falta algo crítico para producción simulada (`--production`).
