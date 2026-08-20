/// <reference types="vite/client" />

/**
 * Versión del producto, inyectada por Vite desde package.json.
 *
 * La declaración responsable del art. 13 RD 1007/2023 es por versión concreta y
 * debe mostrarse en el propio sistema informático, así que la interfaz necesita
 * conocer la versión que está ejecutando.
 */
declare const __APP_VERSION__: string;
