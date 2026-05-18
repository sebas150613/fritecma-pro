// Colores y etiquetas compartidos para estados y prioridades en todo el proyecto.
// Fuente única de verdad — si necesitas cambiar un color, hazlo aquí.

export const BREAKDOWN_STATUS_COLORS = {
  abierta: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  terminada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export const BREAKDOWN_STATUS_LABELS = {
  abierta: "Abierta",
  pendiente: "Pendiente",
  terminada: "Terminada",
};

export const PRIORITY_COLORS = {
  alta: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  baja: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export const PRIORITY_LABELS = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const INTERVENTION_STATUS_COLORS = {
  en_curso: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pendiente_revision: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  validado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completado: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  facturado: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  anulado: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export const INTERVENTION_STATUS_LABELS = {
  en_curso: "En Curso",
  pendiente_revision: "Pendiente Revisión",
  validado: "Validado",
  completado: "Completado",
  facturado: "Facturado",
  anulado: "Anulado",
};
