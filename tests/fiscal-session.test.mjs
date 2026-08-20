/**
 * Disociacion del acceso (art. 8.4 RD 1007/2023).
 *
 * "En los sistemas informaticos debera encontrarse debidamente disociado el
 * acceso a la informacion con trascendencia tributaria del acceso a la posible
 * informacion confidencial de caracter no patrimonial."
 *
 * Se implementa como en el ejemplo oficial de la AEAT: un control marcado antes
 * de entrar que abre una sesion distinta, de solo lectura sobre los registros
 * de facturacion. La restriccion vive en el servidor, no en ocultar botones.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FISCAL_SESSION_ENTITIES,
  FISCAL_SESSION_FUNCTIONS,
  assertFiscalSessionAllowsEntity,
  assertFiscalSessionAllowsFunction,
  blockFiscalSession,
  isFiscalSession,
} from "../server/lib/fiscal-session.js";

const fiscalReq = (method = "GET") => ({ fiscalOnlySession: true, method });
const normalReq = (method = "GET") => ({ fiscalOnlySession: false, method });

test("una sesion normal no queda restringida por nada de esto", () => {
  assert.equal(isFiscalSession(normalReq()), false);
  for (const entity of ["Invoice", "Client", "Intervention", "User"]) {
    assert.doesNotThrow(() =>
      assertFiscalSessionAllowsEntity(entity, normalReq("POST"))
    );
  }
  assert.doesNotThrow(() =>
    assertFiscalSessionAllowsFunction("processVerifactu", normalReq("POST"))
  );
});

test("la sesion fiscal lee los registros de facturacion", () => {
  assert.doesNotThrow(() => assertFiscalSessionAllowsEntity("Invoice", fiscalReq("GET")));
});

test("la sesion fiscal NO ve informacion confidencial no patrimonial", () => {
  // Personal, partes, averias, fichajes, clientes: justo lo que el articulo
  // manda disociar del acceso con trascendencia tributaria.
  for (const entity of [
    "User",
    "Client",
    "Intervention",
    "Breakdown",
    "TimeRecord",
    "WorkDay",
    "Machine",
    "OrganizationSettings",
  ]) {
    assert.throws(
      () => assertFiscalSessionAllowsEntity(entity, fiscalReq("GET")),
      (err) => {
        assert.equal(err.status, 403);
        return true;
      },
      `${entity} deberia estar fuera del alcance de una sesion fiscal`
    );
  }
});

test("la sesion fiscal es de SOLO LECTURA, incluso sobre facturas", () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    assert.throws(
      () => assertFiscalSessionAllowsEntity("Invoice", fiscalReq(method)),
      (err) => {
        assert.equal(err.status, 403);
        assert.match(err.message, /solo lectura/i);
        return true;
      },
      `${method} sobre Invoice deberia estar prohibido`
    );
  }
});

test("solo se permiten las funciones de consulta y comprobacion", () => {
  for (const fn of ["exportInvoiceRecords", "verifyInvoiceHashes"]) {
    assert.doesNotThrow(() => assertFiscalSessionAllowsFunction(fn, fiscalReq("POST")));
  }
  for (const fn of ["processVerifactu", "syncGasBottleStatus", "sendClockInNotifications"]) {
    assert.throws(
      () => assertFiscalSessionAllowsFunction(fn, fiscalReq("POST")),
      (err) => {
        assert.equal(err.status, 403);
        return true;
      },
      `${fn} no deberia poder ejecutarse en sesion fiscal`
    );
  }
});

test("el bloqueo de routers ajenos corta la peticion", (t, done) => {
  const middleware = blockFiscalSession("el almacen");
  middleware(fiscalReq("GET"), {}, (err) => {
    assert.ok(err, "deberia cortar");
    assert.equal(err.status, 403);
    assert.match(err.message, /el almacen/);
    done();
  });
});

test("el bloqueo deja pasar una sesion normal", (t, done) => {
  const middleware = blockFiscalSession("el almacen");
  middleware(normalReq("GET"), {}, (err) => {
    assert.equal(err, undefined);
    done();
  });
});

test("el alcance fiscal se mantiene deliberadamente estrecho", () => {
  // Si alguien amplia estas listas, que sea una decision consciente: cada
  // entidad añadida es informacion que un inspector podra ver.
  assert.deepEqual([...FISCAL_SESSION_ENTITIES], ["Invoice"]);
  assert.deepEqual(
    [...FISCAL_SESSION_FUNCTIONS].sort(),
    ["exportInvoiceRecords", "verifyInvoiceHashes"]
  );
});
