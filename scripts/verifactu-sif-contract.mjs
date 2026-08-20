/**
 * Contrato: identificacion del sistema informatico de facturacion (SIF).
 *
 * Lo que se declara a la AEAT en <SistemaInformatico> tiene que seguir
 * cuadrando con la declaracion responsable del art. 13 RD 1007/2023
 * (docs/declaracion-responsable-frigest.md). Este contrato falla si alguien
 * cambia una de esas propiedades sin rehacer la declaracion.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");

const read = (relative) =>
  fs.readFileSync(path.join(workspaceRoot, relative), "utf8");

const aeat = read("server/services/verifactu-aeat.js");
const pkg = JSON.parse(read("package.json"));

// 1. FriGest no implementa modo no-VERI*FACTU. Mientras sea asi, esta exento
//    del registro de eventos (art. 8.3 RRSIF; FAQ de desarrolladores AEAT).
//    Si esto cambia a "N", hay que implementar el registro de eventos completo.
assert.match(
  aeat,
  /export const SIF_SOLO_VERIFACTU = "S";/,
  "SIF_SOLO_VERIFACTU debe ser S. Ponerlo a N obliga a implementar el registro de eventos del art. 9 de la Orden HAC/1177/2024 y a rehacer la declaracion responsable."
);
assert.match(
  aeat,
  /<sum1:TipoUsoPosibleSoloVerifactu>\$\{SIF_SOLO_VERIFACTU\}/,
  "TipoUsoPosibleSoloVerifactu debe emitirse desde la constante, no hardcodeado"
);

// 2. FriGest es multi-tenant: numeracion y cadena de huellas por organizacion.
//    Declararlo como no-multiOT contradice al propio sistema.
assert.match(
  aeat,
  /export const SIF_MULTI_OT = "S";/,
  "SIF_MULTI_OT debe ser S: FriGest da soporte a varios obligados tributarios"
);
assert.match(
  aeat,
  /<sum1:TipoUsoPosibleMultiOT>\$\{SIF_MULTI_OT\}/,
  "TipoUsoPosibleMultiOT debe emitirse desde la constante"
);

// 3. El NIF del productor jamas puede heredarse del obligado tributario.
assert.ok(
  !/APP_VERIFACTU_SOFTWARE_NIF,\s*issuerNif/.test(aeat),
  "APP_VERIFACTU_SOFTWARE_NIF no puede caer al NIF del emisor: declararia que el cliente fabrico el software"
);
assert.match(
  aeat,
  /requireSystemEnv\(\s*"APP_VERIFACTU_SOFTWARE_NIF"/,
  "APP_VERIFACTU_SOFTWARE_NIF debe ser obligatorio y cortar el envio si falta"
);
assert.match(
  aeat,
  /requireSystemEnv\(\s*"APP_VERIFACTU_INSTALLATION_ID"/,
  "APP_VERIFACTU_INSTALLATION_ID debe ser obligatorio y cortar el envio si falta"
);

// 4. buildSystemXml ya no recibe el NIF del emisor: no puede usarlo por error.
assert.ok(
  !/buildSystemXml\(issuerNif\)/.test(aeat),
  "buildSystemXml no debe recibir el NIF del emisor"
);

// 5. La declaracion responsable es POR VERSION CONCRETA (art. 13.1 y 1.c).
assert.notEqual(
  pkg.version,
  "0.0.0",
  "package.json no puede quedarse en 0.0.0: la declaracion responsable identifica una version concreta"
);
assert.match(
  aeat,
  /APP_VERIFACTU_SYSTEM_VERSION,\s*serverConfig\.appVersion/,
  "la version declarada debe salir de package.json, no de un literal"
);

// 6. Las variables tienen que estar documentadas donde se despliega.
const envTemplate = read("docs/production-env-template.md");
for (const key of [
  "APP_VERIFACTU_SOFTWARE_NIF",
  "APP_VERIFACTU_INSTALLATION_ID",
  "APP_VERIFACTU_MULTIPLES_OT",
]) {
  assert.ok(
    envTemplate.includes(key),
    `${key} debe estar documentada en docs/production-env-template.md`
  );
}

console.log("verifactu-sif-contract: OK");
