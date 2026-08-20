# Declaración responsable de FriGest — BORRADOR

> ## ⚠️ Antes de firmar
>
> El apartado **1.k)** afirma que FriGest cumple el RD 1007/2023, la Orden HAC/1177/2024 y las especificaciones de la sede de la AEAT.
>
> Los huecos de código que se detectaron en la [auditoría](verifactu-auditoria-rrsif-2026-08.md) **están corregidos** en la rama `feat/rrsif-cumplimiento`: identificación del sistema, versión, declaración visible, detección de alteraciones, exportación de registros y acceso disociado. Esa rama tiene que estar **desplegada en producción** antes de que esta declaración sea cierta.
>
> Queda pendiente, y no es código:
>
> 1. **Rellenar los campos** marcados abajo: NIF, dirección, versión, fecha y lugar.
> 2. **Copias de seguridad automáticas** de la base de datos en el VPS. Sostienen el requisito de conservación del art. 8.2.c.
> 3. **Decidir sobre el registro de anulación** (art. 11), que sigue sin implementarse.
> 4. **Publicar la URL del histórico** de declaraciones (art. 13.3).
>
> **No soy abogado ni asesor fiscal.** Este borrador reproduce la estructura del modelo oficial de la AEAT y rellena lo que consta en el código. Antes de publicarlo, que lo revise un profesional.

---

## Cómo se ha construido

Sigue el **Ejemplo 1** del documento [«Ejemplos de declaraciones responsables de sistemas informáticos de facturación» (v0.5.1)](https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/Verifactu/EjemplosDeclaracionResponsable(V0.5.1).pdf) de la AEAT, que es justo tu caso: **producto software comercial, de uso SOLO VERI\*FACTU, de productor con NIF español**.

Los apartados 1.a) a 1.l) y el anexo 2.a) a 2.c) son los del modelo oficial. Los enunciados van literales; lo que cambia es la respuesta.

**Campos que solo puedes rellenar tú** — van marcados `⟦ASÍ⟧`:

- NIF y dirección postal del productor
- Si el productor es **TramuntanaLabs como entidad** (razón social + NIF de la entidad) o **tú como persona física** (nombre y apellidos + tu NIF). El modelo de la AEAT contempla los dos casos: si es persona, en 1.h) se pone «Nombre y apellidos de la persona productora» y en 1.i), 1.j), 1.k) y 1.l) se sustituye «entidad productora» por «persona productora». He dejado la versión de entidad; si vas como autónomo, hay que hacer ese cambio.
- Versión concreta, fecha y lugar de la firma
- Teléfono, correo y direcciones web

---

# DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN

**1.a) Nombre del sistema informático a que se refiere esta declaración responsable:**

FriGest

**1.b) Código identificador del sistema informático a que se refiere el apartado a) de esta declaración responsable:**

01

**1.c) Identificador completo de la versión concreta del sistema informático a que se refiere esta declaración responsable:**

⟦VERSIÓN⟧ — la versión sale ya de `package.json` (hoy `1.0.0`) y es la que el servidor envía a la AEAT y la que muestra la pantalla de la declaración. Pon aquí la versión concreta que publiques, y rehaz la declaración en cada versión que cambie algo de lo declarado.

**1.d) Componentes, hardware y software, de que consta el sistema informático a que se refiere esta declaración responsable, junto con una breve descripción de lo que hace dicho sistema informático y de sus principales funcionalidades:**

Se trata únicamente de software, sin componentes hardware propios. FriGest es una aplicación web de gestión para empresas de instalación y mantenimiento de frío industrial y climatización, que incluye entre sus funcionalidades la facturación.

Se presta en modalidad de software como servicio (SaaS): se ejecuta en servidores del productor y los usuarios acceden a él mediante un navegador web desde ordenador, tableta o teléfono móvil, sin instalación en las dependencias del usuario.

Consta de dos componentes de software:

- Una aplicación de servidor que gestiona los datos, genera los registros de facturación, calcula su huella, los encadena y los remite a la Agencia Estatal de Administración Tributaria.
- Una interfaz de usuario web que permite capturar la información, expedir las facturas y consultarlas.

Sus funcionalidades relativas a la facturación son: elaboración de presupuestos, generación de partes de trabajo, expedición de facturas ordinarias, rectificativas, recapitulativas y recurrentes, consulta y listado de facturas, generación del documento de factura en PDF con su código «QR», exportación de los registros de facturación y control de cobros. El sistema incluye además otras funcionalidades de gestión ajenas al proceso de facturación.

Este software permite gestionar de forma independiente varias facturaciones dentro de él, cumpliendo separadamente con la normativa mencionada en el apartado 1.k) de esta declaración responsable para cada una de ellas, como si, en la práctica, se tratara de sistemas informáticos de facturación distintos.

**1.e) Indicación de si el sistema informático a que se refiere esta declaración responsable se ha producido de tal manera que, a los efectos de cumplir con el Reglamento, solo pueda funcionar exclusivamente como «VERI\*FACTU»:**

S - Sí

**1.f) Indicación de si el sistema informático a que se refiere la declaración responsable permite ser usado por varios obligados tributarios o por un mismo usuario para dar soporte a la facturación de varios obligados tributarios:**

S - Sí

> Coherencia verificada: el sistema envía `TipoUsoPosibleMultiOT = S`, y el contrato `npm run check:verifactu-sif` falla si alguien lo cambia sin rehacer esta declaración.

**1.g) Tipos de firma utilizados para firmar los registros de facturación y de evento en el caso de que el sistema informático a que se refiere esta declaración responsable no sea utilizado como «VERI\*FACTU»:**

Dado que se trata de un producto de facturación que solo puede ser utilizado exclusivamente en la modalidad de «VERI\*FACTU», no se realiza una firma electrónica expresa de los registros de facturación generados, ya que la normativa considera que quedan firmados al ser remitidos correctamente a los servicios electrónicos de la Agencia Tributaria con la debida autenticación mediante el adecuado certificado electrónico cualificado.

**1.h) Nombre y apellidos de la persona productora del sistema informático a que se refiere esta declaración responsable:**

Sebastián Estela Adrover

**1.i) Número de identificación fiscal (NIF) español de la persona productora del sistema informático a que se refiere esta declaración responsable:**

41572545E

**1.j) Dirección postal completa de contacto de la persona productora del sistema informático a que se refiere esta declaración responsable:**

C/ Ramon Serra, 9, 1º
07010 – Palma de Mallorca (Illes Balears).
España.

**1.k) La persona productora del sistema informático a que se refiere esta declaración responsable hace constar que dicho sistema informático, en la versión indicada en ella, cumple con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria, en el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la estandarización de formatos de los registros de facturación, aprobado por el Real Decreto 1007/2023, de 5 de diciembre, en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden.**

**1.l) - Fecha en que la persona productora de este sistema informático suscribe esta declaración responsable del mismo:**

⟦FECHA⟧

**- Lugar en que la persona productora de este sistema informático suscribe esta declaración responsable del mismo:**

Palma de Mallorca (Illes Balears) – España.

---

## ANEXO

**2.a) Otras formas de contacto con la persona productora del sistema informático a que se refiere esta declaración responsable:**

- Teléfono: 646 786 073
- Correo electrónico: ⟦CORREO DE CONTACTO⟧

**2.b) Direcciones de internet de la persona productora del sistema informático a que se refiere esta declaración responsable:**

- Sitio web de la empresa: ⟦WEB DE TRAMUNTANALABS⟧
- Información sobre este producto en el sitio web de la empresa: https://frigest.tramuntanalabs.es
- Acceso al histórico de declaraciones responsables de las versiones de este producto: ⟦URL DEL HISTÓRICO⟧

> El artículo 13.3 obliga a guardar y conservar las declaraciones responsables de **todas** las versiones producidas o comercializadas. Conviene publicar esa URL desde el principio, aunque al inicio solo tenga una entrada.

**2.c) El sistema informático a que se refiere esta declaración responsable cumple las diferentes especificaciones técnicas y funcionales contenidas en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden, de la siguiente manera:**

Además del modo que es de obligado cumplimiento en ciertos casos (como el algoritmo de huella a emplear), otras implementaciones utilizadas son:

- Empleo de un bloqueo por exclusión mutua sobre cada operación de facturación, de manera que la expedición de la factura y la generación del registro de facturación correspondiente se resuelven en una sola unidad, evitando duplicidades y roturas del encadenamiento ante peticiones simultáneas.
- La numeración de las facturas y el encadenamiento de las huellas se llevan de forma separada e independiente para cada obligado tributario gestionado dentro del sistema.
- El certificado electrónico de cada obligado tributario se conserva cifrado en reposo mediante AES-256-GCM, y se descifra únicamente en el momento de establecer la comunicación con la Agencia Estatal de Administración Tributaria.
- El sistema permite exportar los registros de facturación de un periodo a un almacenamiento externo en formato XML con codificación UTF-8.
- El sistema ofrece una comprobación, lanzable a demanda, que recorre la cadena de registros de facturación y detecta y avisa de cualquier modificación, eliminación o ruptura de secuencia.
- El acceso a la información con trascendencia tributaria está disociado del acceso al resto de información: existe un control que puede seleccionarse (por defecto no lo está) antes de entrar en la aplicación, que abre una sesión de solo lectura limitada a los registros de facturación y a las funcionalidades de consulta y comprobación exigidas, sin acceso al resto de datos del sistema.

---

## Después de firmarla

1. **Publicarla dentro de FriGest**, visible (art. 13.2). No basta con tenerla en un cajón.
2. **Entregarla al cliente** al contratar, y al comercializador si algún día vendes por terceros.
3. **Archivar la de cada versión** que publiques (art. 13.3), sin borrar las anteriores.
4. **Rehacerla en cada versión** que cambie algo de lo declarado.
