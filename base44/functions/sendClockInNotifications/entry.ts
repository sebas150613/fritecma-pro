import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Festivos: Nacionales + Baleares + Palma de Mallorca
const HOLIDAYS_2026 = [
  // Nacionales
  "2026-01-01", // Año Nuevo
  "2026-01-06", // Reyes Magos
  "2026-03-19", // San José
  "2026-04-10", // Viernes Santo
  "2026-05-01", // Día del Trabajo
  "2026-08-15", // Asunción
  "2026-10-12", // Hispanidad
  "2026-11-01", // Todos los Santos
  "2026-12-06", // Constitución
  "2026-12-25", // Navidad
  // Baleares
  "2026-03-01", // Día de Baleares
  // Palma
  "2026-07-22", // Santa María Magdalena (patrona de Palma)
];

const isHoliday = (dateStr) => HOLIDAYS_2026.includes(dateStr);

const isWeekday = (dateStr) => {
  const date = new Date(dateStr + "T00:00:00Z");
  const day = date.getUTCDay();
  return day >= 1 && day <= 5; // Lunes a viernes
};

const isUserOnAbsence = async (base44, userEmail, dateStr) => {
  try {
    const absences = await base44.asServiceRole.entities.Absence.filter(
      { user_email: userEmail },
      "-start_date",
      100
    );
    
    return absences.some(a => {
      const start = a.start_date;
      const end = a.end_date;
      return dateStr >= start && dateStr <= end;
    });
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== "admin" && user?.role !== "superadmin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const today = new Date().toISOString().slice(0, 10);
    
    if (isHoliday(today) || !isWeekday(today)) {
      return Response.json({ 
        success: true, 
        skipped: true,
        reason: isHoliday(today) ? "holiday" : "weekend",
        date: today
      });
    }

    const body = await req.json().catch(() => ({}));
    const notificationType = body.notificationType;
    
    if (!notificationType || !["morning", "afternoon"].includes(notificationType)) {
      return Response.json({ error: "Missing or invalid notificationType" }, { status: 400 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list("full_name", 500);
    const techUsers = allUsers.filter(u => ["user", "tecnico", "ayudante"].includes(u.role));

    const message = notificationType === "morning"
      ? "¡Buenos días! Comienza la jornada en Fritecma. No olvides fichar tu entrada."
      : "Son las 15:00. Recuerda fichar tu salida y verificar que tus partes de hoy estén cerrados.";

    const sent = [];
    const skipped = [];

    for (const techUser of techUsers) {
      const onAbsence = await isUserOnAbsence(base44, techUser.email, today);
      
      if (onAbsence) {
        skipped.push({ email: techUser.email, name: techUser.full_name, reason: "on_absence" });
        continue;
      }

      try {
        await base44.integrations.Core.SendEmail({
          to: techUser.email,
          subject: `Recordatorio de Fichaje - ${notificationType === "morning" ? "Entrada" : "Salida"}`,
          body: message
        });
        sent.push({ email: techUser.email, name: techUser.full_name });
      } catch (err) {
        skipped.push({ email: techUser.email, name: techUser.full_name, reason: "send_error", error: err.message });
      }
    }

    return Response.json({
      success: true,
      date: today,
      notificationType,
      sent: sent.length,
      skipped: skipped.length,
      details: { sent, skipped }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});