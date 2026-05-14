// Test script — run with: node scripts/test-fiscal.mjs
// Delete after use if desired.

import { validateFiscalId } from "../src/lib/spanishFiscalId.js";
import { validatePostalCode } from "../src/lib/spanishPostalCodes.js";

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

console.log("\n--- DNI ---");
assert("12345678Z válido",   validateFiscalId("12345678Z").valid, true);
assert("12345678Z tipo DNI", validateFiscalId("12345678Z").type,  "DNI");
assert("12345678A inválido", validateFiscalId("12345678A").valid, false);

console.log("\n--- NIE ---");
assert("X1234567L válido",   validateFiscalId("X1234567L").valid, true);
assert("X1234567L tipo NIE", validateFiscalId("X1234567L").type,  "NIE");
assert("X1234567A inválido", validateFiscalId("X1234567A").valid, false);

console.log("\n--- CIF ---");
assert("B12345674 válido",   validateFiscalId("B12345674").valid, true);
assert("B12345674 tipo CIF", validateFiscalId("B12345674").type,  "CIF");
assert("B12345678 inválido", validateFiscalId("B12345678").valid, false);

console.log("\n--- CP ---");
const cp07 = validatePostalCode("07001");
assert("07001 válido",           cp07.valid,    true);
assert("07001 → Illes Balears",  cp07.province, "Illes Balears");

const cp28 = validatePostalCode("28001");
assert("28001 válido",    cp28.valid,    true);
assert("28001 → Madrid",  cp28.province, "Madrid");

const cp99 = validatePostalCode("99999");
assert("99999 inválido",  cp99.valid, false);

const cp12 = validatePostalCode("1234");
assert("1234 inválido",   cp12.valid, false);

const cpEmpty = validatePostalCode("");
assert("vacío → null",    cpEmpty.valid, null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
