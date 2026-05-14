/**
 * Validación local de identificadores fiscales españoles: DNI, NIE, CIF.
 * Sin llamadas externas. Sin dependencias.
 */

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const NIE_FIRST = { X: "0", Y: "1", Z: "2" };
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

// Tipos de CIF que obligatoriamente terminan en letra
const CIF_MUST_LETTER = new Set(["P", "Q", "S", "W"]);
// Tipos de CIF que obligatoriamente terminan en dígito
const CIF_MUST_DIGIT = new Set(["A", "B", "E", "H"]);

/** Elimina espacios, guiones y puntos; convierte a mayúsculas. */
export function normalizeFiscalId(raw) {
  return String(raw || "").replace(/[\s\-.]/g, "").toUpperCase();
}

function isDniValid(n) {
  if (!/^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/.test(n)) return false;
  return n[8] === DNI_LETTERS[parseInt(n.slice(0, 8), 10) % 23];
}

function isNieValid(n) {
  if (!/^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/.test(n)) return false;
  return isDniValid(NIE_FIRST[n[0]] + n.slice(1));
}

function isCifValid(n) {
  // Letra inicial + 7 dígitos + carácter de control
  if (!/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/i.test(n)) return false;

  const digits = n.slice(1, 8).split("").map(Number);
  let sumOdd = 0;   // D1,D3,D5,D7 (índices 0,2,4,6): se doblan y se suman sus dígitos
  let sumEven = 0;  // D2,D4,D6   (índices 1,3,5):   se suman directamente

  for (let i = 0; i < 7; i++) {
    if (i % 2 === 0) {
      const d = digits[i] * 2;
      sumOdd += d >= 10 ? d - 9 : d;
    } else {
      sumEven += digits[i];
    }
  }

  const controlDigit = (10 - ((sumOdd + sumEven) % 10)) % 10;
  const controlLetter = CIF_CONTROL_LETTERS[controlDigit];
  const last = n[8].toUpperCase();
  const type = n[0].toUpperCase();

  if (CIF_MUST_LETTER.has(type)) return last === controlLetter;
  if (CIF_MUST_DIGIT.has(type)) return last === String(controlDigit);
  return last === controlLetter || last === String(controlDigit);
}

/**
 * Valida un DNI/NIE/CIF español.
 *
 * @param {string} raw  Valor tal cual viene del input.
 * @returns {{ value: string, valid: boolean|null, type: string|null, message: string }}
 *   valid = null  → campo vacío, no mostrar error
 *   valid = true  → correcto
 *   valid = false → incorrecto
 */
export function validateFiscalId(raw) {
  const value = normalizeFiscalId(raw);

  if (!value) {
    return { value, valid: null, type: null, message: "" };
  }

  // DNI: 8 dígitos + letra
  if (/^[0-9]{8}[A-Z]$/.test(value)) {
    const valid = isDniValid(value);
    return {
      value,
      valid,
      type: "DNI",
      message: valid
        ? "DNI válido"
        : "DNI inválido — la letra no corresponde al número",
    };
  }

  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(value)) {
    const valid = isNieValid(value);
    return {
      value,
      valid,
      type: "NIE",
      message: valid
        ? "NIE válido"
        : "NIE inválido — la letra no corresponde al número",
    };
  }

  // CIF: letra tipo organización + 7 dígitos + control (9 chars)
  if (/^[ABCDEFGHJNPQRSUVW]/i.test(value) && value.length === 9) {
    const valid = isCifValid(value);
    return {
      value,
      valid,
      type: "CIF",
      message: valid
        ? "CIF válido"
        : "CIF inválido — dígito de control incorrecto",
    };
  }

  // Formato no reconocido
  return {
    value,
    valid: false,
    type: null,
    message: "Formato no reconocido. Ejemplos: 12345678A (DNI), X1234567A (NIE), B12345678 (CIF)",
  };
}
