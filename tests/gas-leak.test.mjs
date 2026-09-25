import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeGasLeakKg } from "../src/lib/refrigerantGases.js";

describe("computeGasLeakKg", () => {
  test("fuga = cargado - recuperado cuando no es puesta en marcha", () => {
    assert.equal(computeGasLeakKg({ loadedKg: 2, recoveredKg: 0.5, puestaEnMarcha: false }), 1.5);
  });

  test("puesta en marcha: toda la carga es de la máquina, no hay fuga", () => {
    assert.equal(computeGasLeakKg({ loadedKg: 10, recoveredKg: 0, puestaEnMarcha: true }), 0);
  });

  test("nunca negativa si se recupera más de lo que se carga", () => {
    assert.equal(computeGasLeakKg({ loadedKg: 1, recoveredKg: 3, puestaEnMarcha: false }), 0);
  });

  test("valores vacíos cuentan como 0", () => {
    assert.equal(computeGasLeakKg({ loadedKg: undefined, recoveredKg: null }), 0);
    assert.equal(computeGasLeakKg({ loadedKg: "4", recoveredKg: "" }), 4);
  });
});
