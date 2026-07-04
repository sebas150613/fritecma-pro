# Adjuntos de partes (fotos/vídeos) — plan de almacenamiento

## ⚠️ OBLIGACIÓN PENDIENTE

**Cuando FriGest tenga clientes de pago, hay que contratar Hetzner Object Storage
y migrar los adjuntos de los partes allí.** Los adjuntos NO deben quedarse en el
disco del VPS a largo plazo: con clientes reales subiendo fotos de pesajes y
vídeos de fugas, el disco del VPS se llenaría y encarecería los backups.

Decisión tomada el 2026-07-04 (ver historial de este archivo).

## Estado actual (fase sin clientes)

- Al rellenar la sección de gas de un parte (Nuevo Parte), el técnico puede
  adjuntar fotos (pesaje de botella antes/después de la carga) y vídeos (fuga
  localizada) en la sección "Evidencias de la Carga de Gas", antes de la
  conformidad del cliente.
- Las imágenes se comprimen en el cliente antes de subir (máx. 1600 px,
  JPEG ~72 %) en `src/components/GasMediaSection.jsx`.
- Los vídeos se suben tal cual con límite de 25 MB (`APP_UPLOAD_MAX_FILE_SIZE_MB`,
  y `client_max_body_size 25m` en nginx — **ojo: también en el proxy de
  TramuntanaLabs**, si su vhost no lo define los vídeos >1 MB fallarán con 413).
- Se almacenan en el VPS vía `POST /api/files/private` (multer →
  `APP_UPLOADS_DIR/private/<org_id>/`), y las referencias (`file_uri`) en el
  campo `gas_media` de la entidad `Intervention`.
- La visualización usa `POST /api/files/signed-url` (detalle del parte).

## Migración futura a Hetzner Object Storage (S3-compatible)

Cuando se contrate el bucket (~5 €/mes por 1 TB):

1. Añadir credenciales S3 al `.env` del VPS (endpoint, bucket, access/secret key).
2. Sustituir en `server/routes/files.js` el `multer.diskStorage` por subida a S3
   (`@aws-sdk/client-s3`) manteniendo el mismo esquema de `file_uri`
   (`private/<org_id>/<uuid>.<ext>`), y `signed-url` por presigned URLs de S3.
   El frontend no necesita cambios: solo maneja `file_uri` + `signed_url`.
3. Migrar los ficheros existentes del VPS al bucket (`aws s3 sync` o rclone)
   conservando las rutas.
4. Mantener/mejorar la compresión en cliente ("se enviarán allí comprimidos"):
   las imágenes ya se comprimen; para vídeos valorar límite menor o compresión.
5. Verificar acceso en tiempo real desde la app (presigned URLs) y borrar los
   ficheros del disco del VPS.
