# Google Play — borrador Data Safety (FRIGEST)

**Advertencia:** este documento es un **borrador técnico** para facilitar el formulario “Data safety” en Play Console. **No sustituye** asesoría legal ni la declaración final que debe publicarse tras revisión del responsable del tratamiento y, cuando aplique, del DPO. **Validar en Play Console** y con **asesoría legal/DPO** antes de publicar la declaración definitiva.

**Titular / contacto (referencia):**

| | |
|--|--|
| Responsable | Sebastia Estela Adrover (NIF 41572545E) |
| Domicilio | c/ Ramon Serra 9, 07010 Palma de Mallorca, Baleares, España |
| Privacidad / RGPD | [privacidad@frigest.es](mailto:privacidad@frigest.es) |
| Soporte | [soporte@frigest.es](mailto:soporte@frigest.es) |

**URLs legales públicas (HTTPS definitivas para enlazar desde Play cuando el despliegue esté verificado):**

| Documento | URL |
|-----------|-----|
| Política de privacidad | https://frigest.es/legal/privacy.html |
| Términos de uso | https://frigest.es/legal/terms.html |
| Eliminación de cuenta / datos | https://frigest.es/legal/data-deletion.html |
| Sitio | https://frigest.es |

Los HTML fuente están en el repositorio bajo `public/legal/`.

---

## Tabla orientativa (rellenar en Play Console)

| Categoría Play (aprox.) | Dato / función FRIGEST | Ejemplos | Finalidad | ¿Compartido con terceros? | Terceros | ¿Obligatorio u opcional? | Cifrado en tránsito | Eliminación disponible | Notas |
|-------------------------|-------------------------|----------|-----------|---------------------------|----------|--------------------------|---------------------|------------------------|-------|
| Información personal | Cuenta de usuario | Nombre, email, rol | Prestación del servicio, autenticación | Puede serlo (hosting/API) | Infraestructura donde se despliegue el backend | Obligatorio para usar la app autenticada | HTTPS recomendado en prod | Solicitud por email / flujos cuenta según rol | Sesión en cliente según diseño actual |
| Información personal | Organización | Nombre empresa, datos de contacto cargados | Multi-tenant, facturación interna | Proveedor hosting | Mismo que API | Obligatorio para contexto empresa | HTTPS | Según solicitud y conservación legal | |
| Información financiera | Facturación interna / líneas | Importes, Cliente, referencias factura | Operativa y fiscal | AEAT si envío real; Stripe si pago | AEAT, Stripe | Depende de funciones activadas | HTTPS | Limitado por obligaciones fiscales | VeriFactu conservación |
| Pagos | Suscripción | Datos gestionados por Stripe | Cobro de licencias | Sí | Stripe | Opcional según plan | TLS (Stripe) | Según Stripe y contrato | No almacenar PAN en FRIGEST |
| Ubicación aproximada / precisa | Fichaje | Coordenadas si el usuario acepta geolocalización en navegador | Registro de entrada/salida | No necesariamente | — | Opcional (permiso navegador) | HTTPS hasta API | Datos operativos según política interna | `navigator.geolocation` en cliente |
| Fotos y vídeos / Archivos | Adjuntos, albaranes | Imágenes o PDF subidos | Gestión documental | Hosting/almacenamiento | Disco del servidor / URLs firmadas | Opcional | HTTPS | Según solicitud y obligaciones | |
| Documentos | PDF facturas / pedidos | PDF generados en servidor | Entrega a usuario / prueba fiscal | QR externo opcional | api.qrserver.com si se usa en PDF | Opcional | HTTPS | Conservación fiscal | |
| App activity | Uso y diagnóstico | Interacción con la app | Mejora producto (si se instrumenta) | — | — | Opcional | — | — | Actualmente sin analytics obligatorio en tabla |
| Identificadores del dispositivo / técnico | IP, logs | Rate limiting, seguridad | Seguridad y cumplimiento | Infra logs | Hosting | Obligatorio implícito en servidor HTTP | TLS terminación | Retención según política | |
| Correo electrónico | SMTP empresarial | Envío pedidos/notificaciones | Operativa | Sí (servidor correo configurado) | SMTP del cliente/proveedor | Opcional | STARTTLS/TLS típico | N/A | Credenciales cifradas en reposo si APP_SETTINGS_SECRET |
| IA | Prompts / adjuntos a IA | Texto e imágenes enviados al modelo | Asistencia | Sí si IA externa | OpenAI u otro configurado | Opcional | HTTPS a proveedor IA | Según política proveedor | Variables `OPENAI_*` / `APP_AI_*` |
| Gobierno / fiscal | VeriFactu / AEAT | Registros factura, huellas | Cumplimiento tributario | Sí | AEAT | Cuando usuario active envío real | Según canal oficial | Conservación legal | Usuario debe validar antes de producción |

---

## Checklist Play Console (cuando publique la app)

- [ ] **Política de privacidad:** URL HTTPS — **https://frigest.es/legal/privacy.html** (comprobar que responde 200 en producción).
- [ ] **URL de eliminación de cuenta:** **https://frigest.es/legal/data-deletion.html** (requisito Google).
- [ ] **Términos (referencia):** https://frigest.es/legal/terms.html
- [ ] **Credenciales demo / instrucciones de prueba** para revisores (cuenta de solo lectura si es posible).
- [ ] **Permisos Android:** cuando exista envoltorio nativo o TWA, declarar solo los permisos usados (p. ej. ubicación si la WebView los solicita).
- [ ] **Formulario Data Safety:** completar según esta tabla tras **validación legal/DPO** y lista real de SDK/servicios en producción.
- [ ] **Revisión legal final** antes de marcar declaraciones como definitivas en Play.
