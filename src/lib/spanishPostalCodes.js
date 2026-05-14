/**
 * Validación local de códigos postales españoles y detección de provincia.
 * Sin llamadas externas. Sin dependencias.
 */

const PROVINCES = {
  "01": "Álava",
  "02": "Albacete",
  "03": "Alicante",
  "04": "Almería",
  "05": "Ávila",
  "06": "Badajoz",
  "07": "Illes Balears",
  "08": "Barcelona",
  "09": "Burgos",
  "10": "Cáceres",
  "11": "Cádiz",
  "12": "Castellón",
  "13": "Ciudad Real",
  "14": "Córdoba",
  "15": "A Coruña",
  "16": "Cuenca",
  "17": "Girona",
  "18": "Granada",
  "19": "Guadalajara",
  "20": "Gipuzkoa",
  "21": "Huelva",
  "22": "Huesca",
  "23": "Jaén",
  "24": "León",
  "25": "Lleida",
  "26": "La Rioja",
  "27": "Lugo",
  "28": "Madrid",
  "29": "Málaga",
  "30": "Murcia",
  "31": "Navarra",
  "32": "Ourense",
  "33": "Asturias",
  "34": "Palencia",
  "35": "Las Palmas",
  "36": "Pontevedra",
  "37": "Salamanca",
  "38": "Santa Cruz de Tenerife",
  "39": "Cantabria",
  "40": "Segovia",
  "41": "Sevilla",
  "42": "Soria",
  "43": "Tarragona",
  "44": "Teruel",
  "45": "Toledo",
  "46": "Valencia",
  "47": "Valladolid",
  "48": "Bizkaia",
  "49": "Zamora",
  "50": "Zaragoza",
  "51": "Ceuta",
  "52": "Melilla",
};

/**
 * Valida un código postal español y detecta la provincia.
 *
 * @param {string} raw  Valor tal cual viene del input.
 * @returns {{ valid: boolean|null, province: string|null, country: string|null, message: string }}
 *   valid = null  → campo vacío, no mostrar nada
 *   valid = true  → CP correcto, province y country rellenos
 *   valid = false → formato incorrecto o prefijo desconocido
 */
export function validatePostalCode(raw) {
  const value = String(raw || "").trim();

  if (!value) {
    return { valid: null, province: null, country: null, message: "" };
  }

  if (!/^\d{5}$/.test(value)) {
    return {
      valid: false,
      province: null,
      country: null,
      message: "El código postal debe tener exactamente 5 dígitos",
    };
  }

  const prefix = value.slice(0, 2);
  const province = PROVINCES[prefix];

  if (!province) {
    return {
      valid: false,
      province: null,
      country: null,
      message: "Código postal fuera de rango (01000–52999)",
    };
  }

  return {
    valid: true,
    province,
    country: "España",
    message: `Provincia detectada: ${province} · España`,
  };
}
