/**
 * Modo de sesión "consulta de la Administración tributaria" (art. 8.4 RRSIF).
 *
 * "En los sistemas informáticos deberá encontrarse debidamente disociado el
 * acceso a la información con trascendencia tributaria del acceso a la posible
 * información confidencial de carácter no patrimonial, de forma que la
 * Administración tributaria pueda acceder directamente a la consulta y al resto
 * de funcionalidades exigidas sobre la información de los registros de
 * facturación y de eventos."
 *
 * Se implementa como en el ejemplo oficial de la AEAT: un control que se marca
 * ANTES de entrar (por defecto desmarcado) y que abre una sesión distinta. La
 * restricción se aplica en el servidor, no ocultando botones: una sesión fiscal
 * solo puede LEER los registros de facturación, y nada más.
 */
import { HttpError } from "./http-error.js";

/**
 * Entidades con trascendencia tributaria a efectos de este modo.
 *
 * Deliberadamente corto. Una factura ya contiene el destinatario, sus importes
 * y sus líneas, así que no hace falta abrir clientes, partes, averías, fichajes
 * ni personal — que es justo la información confidencial de carácter no
 * patrimonial que el artículo manda disociar.
 */
export const FISCAL_SESSION_ENTITIES = new Set(["Invoice"]);

/** Funciones invocables permitidas: consulta de registros y comprobación. */
export const FISCAL_SESSION_FUNCTIONS = new Set([
  "exportInvoiceRecords",
  "verifyInvoiceHashes",
]);

const READ_METHODS = new Set(["GET", "HEAD"]);

export const isFiscalSession = (req) => req?.fiscalOnlySession === true;

const deny = (detail) =>
  new HttpError(
    403,
    `Sesión de consulta para la Administración tributaria: ${detail}. Cierra la sesión y vuelve a entrar sin marcar esa casilla para usar el resto de la aplicación.`
  );

/**
 * Aplica la disociación sobre el API de entidades.
 * @param {string} entityName entidad solicitada
 * @param {object} req petición (usa req.method para distinguir lectura de escritura)
 */
export const assertFiscalSessionAllowsEntity = (entityName, req) => {
  if (!isFiscalSession(req)) return;

  if (!FISCAL_SESSION_ENTITIES.has(entityName)) {
    throw deny(
      `solo da acceso a los registros de facturación, no a "${entityName}"`
    );
  }

  if (!READ_METHODS.has(String(req.method || "").toUpperCase())) {
    throw deny("es de solo lectura");
  }
};

/** Aplica la disociación sobre las funciones invocables. */
export const assertFiscalSessionAllowsFunction = (functionName, req) => {
  if (!isFiscalSession(req)) return;

  if (!FISCAL_SESSION_FUNCTIONS.has(functionName)) {
    throw deny(`no permite ejecutar "${functionName}"`);
  }
};

/**
 * Corta cualquier otra ruta de la aplicación durante una sesión fiscal.
 * Se monta sobre los routers que no tienen nada que ver con la facturación.
 */
export const blockFiscalSession = (label) => (req, _res, next) => {
  if (!isFiscalSession(req)) {
    next();
    return;
  }
  next(deny(`no da acceso a ${label}`));
};
