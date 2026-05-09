const DEFAULTS = {
  normal: 45,
  extra: 60,
  nocturno: 70,
  festivo: 80,
};

function rateOrDefault(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Snapshot of MO tariff fields merged onto auth.me from OrganizationSettings */
export function buildOrganizationTariffProfile(me) {
  if (!me) return null;
  return {
    tarifa_1_oficial_normal: me.tarifa_1_oficial_normal,
    tarifa_1_oficial_extra: me.tarifa_1_oficial_extra,
    tarifa_1_oficial_nocturna: me.tarifa_1_oficial_nocturna,
    tarifa_1_oficial_festiva: me.tarifa_1_oficial_festiva,
    tarifa_oficial_ayudante_normal: me.tarifa_oficial_ayudante_normal,
    tarifa_oficial_ayudante_extra: me.tarifa_oficial_ayudante_extra,
    tarifa_oficial_ayudante_nocturna: me.tarifa_oficial_ayudante_nocturna,
    tarifa_oficial_ayudante_festiva: me.tarifa_oficial_ayudante_festiva,
  };
}

export function getTarifa1Oficial(profile, tipoHorario) {
  const map = {
    normal: rateOrDefault(profile?.tarifa_1_oficial_normal, DEFAULTS.normal),
    extra: rateOrDefault(profile?.tarifa_1_oficial_extra, DEFAULTS.extra),
    nocturno: rateOrDefault(profile?.tarifa_1_oficial_nocturna, DEFAULTS.nocturno),
    festivo: rateOrDefault(profile?.tarifa_1_oficial_festiva, DEFAULTS.festivo),
  };
  return map[tipoHorario] ?? DEFAULTS.normal;
}

/** Explicit oficial+ayudante rate, or oficial × 1.8 when unset */
export function getTarifaOficialAyudante(profile, tipoHorario) {
  const keys = {
    normal: "tarifa_oficial_ayudante_normal",
    extra: "tarifa_oficial_ayudante_extra",
    nocturno: "tarifa_oficial_ayudante_nocturna",
    festivo: "tarifa_oficial_ayudante_festiva",
  };
  const key = keys[tipoHorario];
  const explicit = key ? profile?.[key] : undefined;
  const n = Number(explicit);
  if (Number.isFinite(n) && n >= 0) return n;
  return getTarifa1Oficial(profile, tipoHorario) * 1.8;
}
