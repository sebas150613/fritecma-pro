# Auditoría de FriGest como Sistema Informático de Facturación (SIF)

> ## Estado de corrección — DESPLEGADO en producción el 2026-08-20 (commit `5cfa018`)
>
> | # | Hueco | Estado |
> |---|---|---|
> | 1 | `TipoUsoPosibleMultiOT` en `N` | **Corregido** — constantes `SIF_SOLO_VERIFACTU` / `SIF_MULTI_OT`, contrato y tests |
> | 2 | `SOFTWARE_NIF` heredaba el NIF del cliente | **Corregido** — obligatoria, corta el envío si falta, documentada |
> | 3 | Versión `0.0.0` | **Corregido** — `1.0.0`, leída de `package.json` en servidor, XML e interfaz |
> | 4 | Declaración no visible en el sistema | **Corregido** — `/declaracion-responsable` + enlace permanente en el menú |
> | 5 | Sin acceso disociado (art. 8.4) | **Corregido** — sesión de consulta, verificada en vivo contra el servidor |
> | 6 | Sin detección de alteraciones | **Corregido y ampliado** — ver la corrección del apartado 3 |
> | 7 | Exportación de registros insuficiente | **Corregido** — volcado XML UTF-8 con huella y encadenamiento |
> | 8 | VPS sin backups de BD | **Corregido** — timer diario a las 03:30, copia por organización + volcado completo |
> | 9 | Sin `RegistroAnulacion` | **Pendiente** — decisión, no está claro que sea exigible |
>
> Verificado: 57 tests (`npm test`), una prueba en vivo de 22 comprobaciones contra el servidor real para el acceso disociado, recorrido manual en navegador y **`npm run release:check` 18/18**.
>
> Las 8 vulnerabilidades de `npm audit` se cerraron en el commit `688d3f2`: seis con `npm audit fix` y las dos de `react-router` con el salto a v7, que la app admite porque solo usa el subconjunto declarativo. `npm audit` da **0 vulnerabilidades**, también en el servidor.
>
> **Configuración aplicada en producción:** `APP_VERIFACTU_SOFTWARE_NIF=41572545E`, `APP_VERIFACTU_INSTALLATION_ID=frigest-prod-01`, `APP_VERIFACTU_MULTIPLES_OT=S`, y `APP_VERIFACTU_SOFTWARE_NAME` corregido de `FRIGEST` a `Sebastián Estela Adrover` — ese campo identifica al **productor**, no al programa, y tenía que cuadrar con el apartado 1.h) de la declaración.

**Fecha:** 19 de agosto de 2026
**Objeto:** comprobar si FriGest cumple los requisitos que debe declarar su productor en la declaración responsable del artículo 13 del RD 1007/2023.
**Rama auditada:** `main` de `frigest-work`.

## Qué es esto y qué no es

Es una revisión del código contra el texto de la norma, con la evidencia de dónde está cada cosa. **No es un dictamen jurídico ni una certificación.** No soy abogado ni asesor fiscal. Los puntos marcados como "a confirmar" son exactamente eso: cuestiones de interpretación que no me corresponde cerrar.

Fuentes consultadas (texto consolidado, no de memoria):

- [RD 1007/2023, de 5 de diciembre](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840) — Reglamento (RRSIF), texto consolidado con las modificaciones del RD 254/2025
- [Orden HAC/1177/2024, de 17 de octubre](https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138) — especificaciones técnicas
- [Ejemplos de declaraciones responsables (AEAT, v0.5.1)](https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/Verifactu/EjemplosDeclaracionResponsable(V0.5.1).pdf)
- [FAQs para desarrolladores (AEAT, 4-12-2025)](https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf)

---

## 1. Lo primero: el plazo ya venció

La **disposición final cuarta** del RD 1007/2023 fija tres plazos distintos. El que te aplica a ti **no es** ninguno de los dos que se citan siempre en prensa:

| Sujeto | Plazo |
|---|---|
| Obligados tributarios del art. 3.1.a) (contribuyentes de Sociedades) | antes del **1 de enero de 2027** |
| Resto de obligados del art. 3.1 | antes del **1 de julio de 2027** |
| **Productores y comercializadores** (art. 3.2) | **nueve meses desde la entrada en vigor de la Orden HAC/1177/2024** |

La Orden entró en vigor el **29 de octubre de 2024**. Nueve meses después es el **29 de julio de 2025**.

Como productor, tu plazo para ofrecer el producto plenamente adaptado **venció hace más de un año**. La norma lo dice así:

> Los obligados tributarios del artículo 3.2, en relación con sus actividades de producción y comercialización de los sistemas informáticos, deberán ofrecer sus productos plenamente adaptados al reglamento en el plazo máximo de nueve meses desde la entrada en vigor de la orden ministerial a que se refiere la disposición final tercera de este real decreto.

Y el artículo 3.2 define a quién alcanza:

> El presente Reglamento también se aplicará a los productores y comercializadores de los sistemas informáticos a que se refiere el artículo 1 de este Reglamento en las cuestiones relativas a sus respectivas actividades de producción y comercialización de los sistemas informáticos puestos a disposición de los obligados tributarios mencionados en el apartado 1 de este artículo 3.

**Qué significa en la práctica.** La obligación se activa cuando el sistema se pone a disposición de obligados tributarios. FriGest todavía no está comercializado ni hay clientes emitiendo facturas reales con él, así que hoy la exposición es baja. Pero es justo lo que estás a punto de cambiar con los 52 correos. Qué consecuencias tiene el plazo vencido a estas alturas es una pregunta para un profesional, no para mí.

---

## 2. Una corrección importante sobre el registro de eventos

En nuestra conversación anterior te dije que la falta de registro de eventos era un hueco. **Consultada la fuente, no lo es en tu caso.** Las FAQ para desarrolladores de la AEAT lo dicen sin ambigüedad:

> NOTA 1: El productor de un SIF que solo puede actuar exclusivamente en modo VERI\*FACTU ("SOLO VERI\*FACTU"), no está obligado a implementar en él un registro de eventos, pero puede hacerlo voluntariamente, si así lo desea. Sin embargo, si el SIF puede ser utilizado para actuar en modo VERI\*FACTU o "NO VERI\*FACTU" (SIF "DUAL"), deberá obligatoriamente implementar en dicho SIF un registro de eventos.

FriGest declara `TipoUsoPosibleSoloVerifactu = S` en [verifactu-aeat.js:126](server/services/verifactu-aeat.js#L126), es decir, se declara SOLO VERI\*FACTU. **Mientras eso sea cierto —y hay que mantenerlo cierto—, no necesitas registro de eventos.** Es la ventaja de no haber implementado nunca el modo no-VERI\*FACTU.

Esto convierte lo que parecía el hueco más caro en un no-problema, y es la razón por la que merecía la pena leer la norma en vez de tirar de memoria.

---

## 3. Requisitos del artículo 8 RRSIF, uno a uno

### 8.1 — Integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad; capacidad de remisión

| | Estado |
|---|---|
| Remisión electrónica continuada a la AEAT | **Cumple.** SOAP con mTLS contra los endpoints reales de la AEAT, sandbox y producción, en [verifactu-aeat.js:15-27](server/services/verifactu-aeat.js#L15). Probado E2E contra preproducción. |

### 8.2.a — Integridad e inalterabilidad

> una vez generados y registrados, no puedan ser alterados sin que el sistema informático lo detecte y avise de ello

La norma define alteración como "la ocultación o eliminación de cualquier registro de facturación", su modificación total o parcial, o "la adición de registros de facturación, simulados o falsos".

| Vector | Estado | Evidencia |
|---|---|---|
| Crear una factura saltándose el proceso | **Bloqueado**, 403 | [entities.js:364](server/routes/entities.js#L364) — "Las facturas solo se emiten mediante el proceso Veri\*factu." |
| Modificar una factura emitida | **Bloqueado**, 422 salvo campos de cobro | [entities.js:80](server/routes/entities.js#L80) — solo `payment_status`, `payment_method`, `paid_at`, `payment_notes`, `due_date` |
| Borrar una factura | **Bloqueado**, 403 | `Invoice` está en `NON_DELETABLE_OPERATIONAL_ENTITIES`, [entities.js:40](server/routes/entities.js#L40) |
| Corrección mediante registro posterior | **Cumple** | Rectificativas; la norma exige exactamente esto: "mediante al menos un registro de facturación adicional posterior, de forma que se conserven inalterables los datos originalmente registrados" |
| **Detección y aviso de alteración** | **Corregido** | `auditInvoiceChain` + `verifyInvoiceHashes`, lanzable desde Configuración → Veri\*factu |

### Corrección: aquí me equivoqué en la primera pasada

Escribí que no existía ningún proceso de verificación. **Sí existía**: la función `verifyInvoiceHashes`, registrada desde el principio en `app-schema/functions.json`. No la encontré porque busqué por «cadena», «anomalía» y «checkChain», y no por «hashes». Buscar mal no es lo mismo que que no exista, y la conclusión que saqué era falsa.

Dicho eso, la función que había tenía tres defectos que sí eran reales:

1. **No filtraba por organización.** Hacía `invoiceStore.list()` sobre *todas* las facturas de *todas* las empresas, y avisaba por correo a *todos* los administradores del sistema. En un SaaS multi-tenant eso es una fuga entre inquilinos, además de incumplir que la cadena es por obligado tributario.
2. **Tope silencioso de 500 facturas.** Una comprobación de integridad que solo mira las últimas 500 deja de serlo en cuanto la empresa crece.
3. **No comprobaba el encadenamiento.** Recalculaba la huella de cada factura usando su propio `hash_anterior` almacenado, sin verificar nunca que ese valor coincidiera con la huella de la factura anterior, ni que el índice de cadena fuera continuo. Con lo cual **borrar un registro intermedio no se detectaba** — justo el supuesto que el art. 8.2.a nombra explícitamente como alteración: "la ocultación o eliminación de cualquier registro de facturación".

Lo corregido: la lógica vive ahora en `auditInvoiceChain`, una función pura que recorre la cadena ordenada por índice y comprueba los tres vectores (huella recalculada, eslabón que apunta al anterior, continuidad de índices). Está cubierta por siete tests en `tests/verifactu-chain-audit.test.mjs`, incluido el de eliminación de un registro intermedio. `verifyInvoiceHashes` la usa acotada a la organización del usuario y sin tope, y avisa solo a los administradores de esa organización.

Nota: las FAQ de la AEAT admiten que estas comprobaciones no tienen que estar ejecutándose constantemente, "basta con que estén disponibles para ser lanzadas cuando el usuario del SIF estime oportuno". Por eso se ha añadido el botón «Comprobar ahora» en Configuración → Veri\*factu. **A confirmar** sigue siendo si el requisito de detección de anomalías aplica igual a un SOLO VERI\*FACTU; el pasaje de las FAQ aparece en un contexto que habla de NO VERI\*FACTU. Como no está claro, se ha implementado.

### 8.2.b — Trazabilidad y encadenamiento

> deberán estar encadenados de manera que pueda verificarse su rastro siguiendo su secuencia de creación desde el primero al último

**Cumple.** Huella calculada con los campos que exige la AEAT y encadenada al registro anterior:

- `computeInvoiceFingerprint` en [verifactu-service.js:230](server/services/verifactu-service.js#L230)
- La cadena es **por obligado tributario**, no global: [verifactu-service.js:214](server/services/verifactu-service.js#L214) — *"The VeriFactu hash chain is per obligado tributario (per organization)"*. Esto es imprescindible en un sistema multi-OT, y las FAQ lo confirman: *"un SIF 'multiOT' debe cumplir los requisitos individualmente para cada obligado tributario"*.
- Mutex por parte para evitar dobles emisiones y roturas de cadena en concurrencia: [verifactu-service.js:78](server/services/verifactu-service.js#L78)
- Los registros van fechados con `generatedAt`, como pide el último párrafo del apartado.

Falta lo dicho arriba: existe el encadenamiento, no existe la función que lo recorra y lo verifique.

### 8.2.c — Conservación, accesibilidad, legibilidad y volcado

> El sistema informático deberá contar con un procedimiento de descarga, volcado y archivo seguro de los registros de facturación generados por él, que deberán poder ser exportados a un almacenamiento externo en formato electrónico legible.

**Corregido.** Antes había dos exportaciones y ninguna volcaba el registro:

- CSV de facturas para gestoría, [Invoices.jsx](src/pages/Invoices.jsx) — datos comerciales, sin huella
- XML Facturae por factura, [generateFacturaE.js](src/utils/generateFacturaE.js) — formato de factura electrónica, no de registro

Se ha añadido `server/services/verifactu-export.js`, que vuelca los **registros de facturación** en XML con codificación UTF-8 —el formato que fija la Orden HAC/1177/2024— con huella, huella anterior, índice de cadena, tipo de huella, estado, CSV e identificador de registro de la AEAT. Acotado a la organización, ordenado por cadena y con filtro opcional por periodo, que es como el art. 9.h) de la Orden nombra la exportación. Se descarga desde Facturación → «Exportar registros (XML)» y está cubierto por seis tests.

Aparte, la conservación depende de la infraestructura. **Resuelto el 2026-08-20**: hay un `frigest-backup.timer` diario (03:30 UTC) que ejecuta dos cosas —la copia cifrada por organización de la propia aplicación, y un `pg_dump` completo con retención de 14 días—. El volcado completo hacía falta porque la copia por organización filtra por `organization_id` y **se dejaba fuera las entidades globales**: 7 usuarios, 3 organizaciones y 3 planes. Sin ellas no se puede restaurar el sistema. Los permisos de `/var/backups/frigest` estaban mal desde el 4 de agosto (el servicio corre como `frigest_svc` y el directorio era de root), y también se corrigieron.

### 8.3 — Registro de eventos

**No aplica**, por lo explicado en el apartado 2. Con la condición de que FriGest siga siendo SOLO VERI\*FACTU: el día que se implemente un modo alternativo, este requisito se activa entero.

### 8.4 — Disociación del acceso

> deberá encontrarse debidamente disociado el acceso a la información con trascendencia tributaria del acceso a la posible información confidencial de carácter no patrimonial, de forma que la Administración tributaria pueda acceder directamente a la consulta

**Corregido.** Implementado como lo describe el ejemplo de la propia AEAT: *"un control tipo 'check' que puede ser seleccionado (por defecto no lo está) antes de entrar en la aplicación"*.

En la pantalla de acceso hay ahora una casilla, **desmarcada por defecto**, que abre una sesión distinta. La restricción se aplica **en el servidor**, no ocultando botones:

- La sesión guarda una marca `fiscalOnly` ([auth.js](server/lib/auth.js)), que `attachFiscalSessionFlag` resuelve antes de repartir a los routers.
- [fiscal-session.js](server/lib/fiscal-session.js) define el alcance: solo la entidad `Invoice`, solo lectura, y solo las funciones `exportInvoiceRecords` y `verifyInvoiceHashes`.
- Trece routers ajenos a la facturación —almacén, personal, averías, archivos, compras, IA, copias, correo…— quedan cortados enteros con `blockFiscalSession`.
- La interfaz reduce el menú a los registros de facturación y a la declaración responsable, y muestra un aviso permanente del modo en que se está.

Verificado en vivo levantando el servidor real: 22 comprobaciones, incluidas las de que una sesión normal **no** queda afectada por ninguna de estas restricciones.

---

## 4. Registros de facturación (arts. 9, 10 y 11 RRSIF)

| | Estado |
|---|---|
| Registro de alta (art. 9 y 10) | **Implementado.** `RegistroAlta` construido en [verifactu-aeat.js:207](server/services/verifactu-aeat.js#L207) |
| **Registro de anulación (art. 11)** | **No implementado.** No existe `RegistroAnulacion` en el código |

Sobre el registro de anulación: FriGest corrige mediante facturas rectificativas, que es el camino que pide el art. 8.2.a. El `RegistroAnulacion` sirve para anular un registro de facturación previamente enviado. **A confirmar** si un SIF debe soportarlo siempre o solo si permite ese supuesto. No me atrevo a darlo por prescindible.

---

## 5. Identificación del sistema: dos errores concretos

El bloque `<SistemaInformatico>` de [verifactu-aeat.js:103](server/services/verifactu-aeat.js#L103) viaja en cada envío y **tiene que cuadrar con lo que declares**. Hay dos valores mal:

### 5.1 `TipoUsoPosibleMultiOT` está en `N` y debería ser `S`

```js
<sum1:TipoUsoPosibleMultiOT>N</sum1:TipoUsoPosibleMultiOT>
<sum1:IndicadorMultiplesOT>N</sum1:IndicadorMultiplesOT>
```

FriGest **es** multi-obligado tributario: es un SaaS multi-tenant, y precisamente por eso la numeración y la cadena de hash se aislaron por organización. Declarar `N` contradice lo que el propio sistema hace. Este campo tiene que ser coherente con el apartado **1.f)** de la declaración responsable.

`IndicadorMultiplesOT` indica si esa instalación concreta está dando servicio a varios obligados a la vez; con varias organizaciones en producción, también debería ser `S`.

### 5.2 `APP_VERIFACTU_SOFTWARE_NIF` hereda el NIF del cliente

```js
const softwareNif = safe(process.env.APP_VERIFACTU_SOFTWARE_NIF, issuerNif);
```

Si la variable no está puesta, se envía el NIF de **quien factura** como NIF del productor del software. Ese fallback solo es correcto si el contribuyente se hizo el programa a sí mismo. Vendiéndolo a terceros, cada cliente estaría declarando ante la AEAT que él fabricó FriGest.

Lo mismo con `APP_VERIFACTU_INSTALLATION_ID`, que por defecto vale `<appId>-local`.

**Ninguna de estas variables está documentada** en `docs/production-env-template.md`. Lo comprobé: ese fichero no menciona VeriFactu en ninguna línea.

### 5.3 La versión no cuadra

`package.json` declara `"version": "0.0.0"` y el XML envía `1.0.0` por defecto. La declaración responsable es **por versión concreta** (apartado 1.c) y hay que conservar la de todas las versiones publicadas (art. 13.3). Con la versión a `0.0.0` no hay nada consistente que declarar.

---

## 6. La declaración responsable como requisito en sí (art. 13)

Más allá de firmarla, el artículo 13.2 impone algo que hoy no existe:

> La declaración responsable deberá constar por escrito y **de modo visible en el propio sistema informático en cada una de sus versiones**, así como para el cliente y el comercializador en el momento de la adquisición del producto.

**Corregido.** Se ha añadido la pantalla `/declaracion-responsable` ([SifDeclaration.jsx](src/pages/SifDeclaration.jsx)), accesible para cualquier usuario autenticado y enlazada de forma permanente al pie del menú lateral, junto a la versión que está ejecutando. El contenido sale de [sifDeclaration.js](src/lib/sifDeclaration.js), con los apartados 1.a) a 1.l) y el anexo del modelo oficial de la AEAT.

Mientras los datos del productor estén vacíos o `SIGNED` sea `false`, la pantalla avisa de que la declaración aún no está suscrita en lugar de fingir que sí.

Queda por tu parte: rellenar `PRODUCER` y `SIGNATURE` en ese fichero, poner `SIGNED = true` cuando la firmes, y publicar la URL del histórico. El 13.3 obliga además a **guardar y conservar** las declaraciones de todas las versiones producidas.

---

## 7. Resumen: qué falta antes de poder firmar

Ordenado por lo que yo haría primero:

1. **`TipoUsoPosibleMultiOT` a `S`** e `IndicadorMultiplesOT` coherente. Una línea, y sin ella la declaración se contradice con lo que el sistema envía.
2. **Fijar `APP_VERIFACTU_SOFTWARE_NIF` e `INSTALLATION_ID`** en producción, quitar el fallback silencioso al NIF del cliente y documentar el bloque en `production-env-template.md`.
3. **Versionado real** del producto, distinto de `0.0.0`, porque la declaración es por versión.
4. **Pantalla con la declaración responsable visible** dentro de FriGest (art. 13.2) y entrega al cliente al contratar.
5. **Modo de acceso disociado** para la Administración (art. 8.4).
6. **Función de verificación de la cadena** que detecte y avise de alteraciones, lanzable a demanda (art. 8.2.a).
7. **Exportación de los registros de facturación** propiamente dichos (art. 8.2.c).
8. **Copias de seguridad automáticas de la base de datos** en el VPS. No es código, pero sostiene el requisito de conservación.
9. **Decidir sobre el registro de anulación** (art. 11).

Los puntos 1, 2 y 3 son de horas. El 4 y el 5, de un día. El 6 y el 7, algo más.

## Lo que no he verificado

- No he auditado el contenido del `RegistroAlta` campo a campo contra los 17 elementos del art. 10 RRSIF ni contra el diseño de registro del anexo de la Orden.
- No he comprobado el servidor: todo esto es la rama `main` del repositorio, no lo que está desplegado ahora mismo en el VPS.
- No he validado la huella contra los vectores de prueba de la AEAT.
- Los tres puntos marcados "a confirmar" siguen abiertos: detección de anomalías en SOLO VERI\*FACTU, suficiencia de las exportaciones actuales, y obligatoriedad del registro de anulación.
