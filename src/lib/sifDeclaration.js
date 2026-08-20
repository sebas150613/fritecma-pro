/**
 * Declaración responsable del sistema informático de facturación.
 *
 * El artículo 13.2 del RD 1007/2023 obliga a que conste "por escrito y de modo
 * visible en el propio sistema informático en cada una de sus versiones". Esta
 * es la fuente de la pantalla /declaracion-responsable.
 *
 * Los apartados siguen el modelo oficial de la AEAT ("Ejemplos de declaraciones
 * responsables de sistemas informáticos de facturación", v0.5.1), ejemplo 1:
 * producto comercial, de uso SOLO VERI*FACTU, de productor con NIF español.
 *
 * IMPORTANTE: lo que se declara aquí debe coincidir campo a campo con el bloque
 * <SistemaInformatico> que se envía a la AEAT (server/services/verifactu-aeat.js)
 * y con docs/declaracion-responsable-frigest.md. El contrato
 * `npm run check:verifactu-sif` vigila esa coherencia.
 *
 * SIGNED se pone a true SOLO cuando la declaración está efectivamente suscrita
 * por la persona productora. Suscrita el 20 de agosto de 2026 para la versión
 * 1.0.0; al publicar una versión nueva hay que archivar esta en
 * DECLARATION_HISTORY y suscribir la nueva.
 */

/** Datos del productor. Vacío = pendiente de completar. */
export const PRODUCER = {
  // "entidad" (razón social) o "persona" (nombre y apellidos)
  tipo: "persona",
  nombre: "Sebastián Estela Adrover",
  nif: "41572545E",
  direccion: "C/ Ramon Serra, 9, 1º\n07010 Palma de Mallorca (Illes Balears)\nEspaña",
  telefono: "646 786 073",
  email: "",
  web: "",
  // Art. 13.3: hay que conservar y poder consultar las declaraciones de TODAS
  // las versiones publicadas. Vive dentro del propio sistema.
  historicoUrl: "/declaracion-responsable/historico",
};

/** Identificación del sistema. Debe cuadrar con las variables APP_VERIFACTU_*. */
export const SYSTEM = {
  nombre: "FriGest",
  codigo: "01",
  soloVerifactu: true,
  multiObligado: true,
};

/** ¿Está firmada y publicada? Mientras sea false, la pantalla lo advierte. */
export const SIGNED = true;

/** Fecha y lugar de suscripción (apartado 1.l). */
export const SIGNATURE = {
  fecha: "20 de agosto de 2026",
  lugar: "Palma de Mallorca (Illes Balears) – España",
};

export const isDeclarationComplete = () =>
  Boolean(
    SIGNED &&
      PRODUCER.nombre &&
      PRODUCER.nif &&
      PRODUCER.direccion &&
      SIGNATURE.fecha &&
      SIGNATURE.lugar
  );

/**
 * Histórico de declaraciones responsables (art. 13.3 RD 1007/2023).
 *
 * "deberá guardar y conservar las declaraciones responsables de TODAS las
 * versiones de los sistemas informáticos producidos o comercializados"
 *
 * La declaración es por versión concreta, así que al publicar una versión nueva
 * la anterior NO se sustituye: se archiva aquí.
 *
 * CÓMO ARCHIVAR UNA VERSIÓN, al sacar la siguiente:
 *   1. Abre /declaracion-responsable/historico con la versión aún publicada.
 *   2. Pulsa "Copiar instantánea de esta versión": deja en el portapapeles el
 *      objeto ya construido, con el texto congelado tal y como se declaró.
 *   3. Pégalo al principio de este array.
 *   4. Sube la versión en package.json y actualiza SIGNATURE.
 *
 * Se congela el texto renderizado, no una referencia al código: si mañana
 * cambia la redacción de un apartado, lo archivado debe seguir diciendo lo que
 * se declaró en su día.
 */
export const DECLARATION_HISTORY = [];

/** Construye la instantánea archivable de una versión. */
export const buildDeclarationSnapshot = (version) => ({
  version,
  fecha: SIGNATURE.fecha,
  lugar: SIGNATURE.lugar,
  firmada: SIGNED,
  productor: { ...PRODUCER },
  sistema: { ...SYSTEM },
  apartados: buildDeclarationSections(version),
  anexo: buildAnnexSections(),
  archivadaEl: new Date().toISOString().slice(0, 10),
});

const productorLabel = () =>
  PRODUCER.tipo === "persona" ? "persona productora" : "entidad productora";

/**
 * Construye los apartados de la declaración para una versión concreta.
 * @param {string} version versión del producto (apartado 1.c)
 */
export const buildDeclarationSections = (version) => [
  {
    id: "1.a",
    label: "Nombre del sistema informático a que se refiere esta declaración responsable",
    value: SYSTEM.nombre,
  },
  {
    id: "1.b",
    label:
      "Código identificador del sistema informático a que se refiere el apartado a) de esta declaración responsable",
    value: SYSTEM.codigo,
  },
  {
    id: "1.c",
    label:
      "Identificador completo de la versión concreta del sistema informático a que se refiere esta declaración responsable",
    value: version,
  },
  {
    id: "1.d",
    label:
      "Componentes, hardware y software, de que consta el sistema informático a que se refiere esta declaración responsable, junto con una breve descripción de lo que hace dicho sistema informático y de sus principales funcionalidades",
    value:
      "Se trata únicamente de software, sin componentes hardware propios. FriGest es una aplicación web de gestión para empresas de instalación y mantenimiento de frío industrial y climatización, que incluye entre sus funcionalidades la facturación.\n\n" +
      "Se presta en modalidad de software como servicio (SaaS): se ejecuta en servidores del productor y los usuarios acceden a él mediante un navegador web desde ordenador, tableta o teléfono móvil, sin instalación en las dependencias del usuario.\n\n" +
      "Consta de dos componentes de software: una aplicación de servidor que gestiona los datos, genera los registros de facturación, calcula su huella, los encadena y los remite a la Agencia Estatal de Administración Tributaria; y una interfaz de usuario web que permite capturar la información, expedir las facturas y consultarlas.\n\n" +
      "Sus funcionalidades relativas a la facturación son: elaboración de presupuestos, generación de partes de trabajo, expedición de facturas ordinarias, rectificativas, recapitulativas y recurrentes, consulta y listado de facturas, generación del documento de factura en PDF con su código «QR», exportación de los registros de facturación y control de cobros. El sistema incluye además otras funcionalidades de gestión ajenas al proceso de facturación.\n\n" +
      "Este software permite gestionar de forma independiente varias facturaciones dentro de él, cumpliendo separadamente con la normativa mencionada en el apartado 1.k) de esta declaración responsable para cada una de ellas, como si, en la práctica, se tratara de sistemas informáticos de facturación distintos.",
  },
  {
    id: "1.e",
    label:
      "Indicación de si el sistema informático a que se refiere esta declaración responsable se ha producido de tal manera que, a los efectos de cumplir con el Reglamento, solo pueda funcionar exclusivamente como «VERI*FACTU»",
    value: SYSTEM.soloVerifactu ? "S - Sí" : "N - No",
  },
  {
    id: "1.f",
    label:
      "Indicación de si el sistema informático a que se refiere la declaración responsable permite ser usado por varios obligados tributarios o por un mismo usuario para dar soporte a la facturación de varios obligados tributarios",
    value: SYSTEM.multiObligado ? "S - Sí" : "N - No",
  },
  {
    id: "1.g",
    label:
      "Tipos de firma utilizados para firmar los registros de facturación y de evento en el caso de que el sistema informático a que se refiere esta declaración responsable no sea utilizado como «VERI*FACTU»",
    value:
      "Dado que se trata de un producto de facturación que solo puede ser utilizado exclusivamente en la modalidad de «VERI*FACTU», no se realiza una firma electrónica expresa de los registros de facturación generados, ya que la normativa considera que quedan firmados al ser remitidos correctamente a los servicios electrónicos de la Agencia Tributaria con la debida autenticación mediante el adecuado certificado electrónico cualificado.",
  },
  {
    id: "1.h",
    label:
      PRODUCER.tipo === "persona"
        ? "Nombre y apellidos de la persona productora del sistema informático a que se refiere esta declaración responsable"
        : "Razón social de la entidad productora del sistema informático a que se refiere esta declaración responsable",
    value: PRODUCER.nombre,
  },
  {
    id: "1.i",
    label: `Número de identificación fiscal (NIF) español de la ${productorLabel()} del sistema informático a que se refiere esta declaración responsable`,
    value: PRODUCER.nif,
  },
  {
    id: "1.j",
    label: `Dirección postal completa de contacto de la ${productorLabel()} del sistema informático a que se refiere esta declaración responsable`,
    value: PRODUCER.direccion,
  },
  {
    id: "1.k",
    label: `Declaración de cumplimiento`,
    value: `La ${productorLabel()} del sistema informático a que se refiere esta declaración responsable hace constar que dicho sistema informático, en la versión indicada en ella, cumple con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria, en el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la estandarización de formatos de los registros de facturación, aprobado por el Real Decreto 1007/2023, de 5 de diciembre, en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden.`,
  },
  {
    id: "1.l",
    label: `Fecha y lugar en que la ${productorLabel()} de este sistema informático suscribe esta declaración responsable del mismo`,
    value:
      SIGNATURE.fecha && SIGNATURE.lugar
        ? `${SIGNATURE.fecha} · ${SIGNATURE.lugar}`
        : "",
  },
];

export const buildAnnexSections = () => [
  {
    id: "2.a",
    label: `Otras formas de contacto con la ${productorLabel()} del sistema informático`,
    value: [
      PRODUCER.telefono ? `Teléfono: ${PRODUCER.telefono}` : "",
      PRODUCER.email ? `Correo electrónico: ${PRODUCER.email}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  },
  {
    id: "2.b",
    label: `Direcciones de internet de la ${productorLabel()} del sistema informático`,
    value: [
      PRODUCER.web ? `Sitio web: ${PRODUCER.web}` : "",
      PRODUCER.historicoUrl
        ? `Histórico de declaraciones responsables de las versiones de este producto: ${PRODUCER.historicoUrl}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  },
  {
    id: "2.c",
    label:
      "El sistema informático cumple las especificaciones técnicas y funcionales de la Orden HAC/1177/2024 de la siguiente manera",
    value:
      "Además del modo que es de obligado cumplimiento en ciertos casos (como el algoritmo de huella a emplear), otras implementaciones utilizadas son:\n\n" +
      "- Empleo de un bloqueo por exclusión mutua sobre cada operación de facturación, de manera que la expedición de la factura y la generación del registro de facturación correspondiente se resuelven en una sola unidad, evitando duplicidades y roturas del encadenamiento ante peticiones simultáneas.\n" +
      "- La numeración de las facturas y el encadenamiento de las huellas se llevan de forma separada e independiente para cada obligado tributario gestionado dentro del sistema.\n" +
      "- El certificado electrónico de cada obligado tributario se conserva cifrado en reposo mediante AES-256-GCM, y se descifra únicamente en el momento de establecer la comunicación con la Agencia Estatal de Administración Tributaria.\n" +
      "- El sistema ofrece una comprobación, lanzable a demanda, que recorre la cadena de registros de facturación y detecta y avisa de cualquier modificación, eliminación o ruptura de secuencia.\n" +
      "- El sistema permite exportar los registros de facturación de un periodo a un almacenamiento externo en formato XML con codificación UTF-8.\n" +
      "- El acceso a la información con trascendencia tributaria está disociado del acceso al resto de información: existe un control que puede seleccionarse (por defecto no lo está) antes de entrar en la aplicación, que abre una sesión de solo lectura limitada a los registros de facturación y a las funcionalidades de consulta y comprobación exigidas, sin acceso al resto de datos del sistema.",
  },
];
