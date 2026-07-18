import { useState, useRef, useEffect } from "react";
import { appApi } from "@/api/app-api";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Send, Loader2, Bot, User, ChevronDown, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

// ── Build rich context snapshot from DB ──────────────────────────────────────
async function loadContext(user) {
  const canSeePrices = user?.role === "admin" || user?.role === "superadmin" || user?.role === "oficina";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const [clients, materials, projects, gasBottles, interventions] = await Promise.all([
    appApi.entities.Client.list("name", 200),
    appApi.entities.Material.filter({ is_active: true }, "name", 500),
    appApi.entities.Project.list("name", 100),
    appApi.entities.GasBottle.list("-created_date", 200),
    isAdmin
      ? appApi.entities.Intervention.list("-date", 50)
      : appApi.entities.Intervention.filter({ technician_email: user.email }, "-date", 20),
  ]);

  // Summarize gas bottles by type
  const gasByType = {};
  gasBottles.filter(b => b.status === "activa").forEach(b => {
    if (!gasByType[b.gas_type]) gasByType[b.gas_type] = 0;
    gasByType[b.gas_type] += b.current_kg || 0;
  });

  // Summarize materials with low stock
  const lowStock = materials.filter(m => (m.stock_quantity || 0) <= (m.min_stock || 0) && m.min_stock > 0);

  // Active projects
  const activeProjects = projects.filter(p => p.status === "en_curso");

  // Build context text
  let ctx = "";

  // Clients
  ctx += `\n## CLIENTES REGISTRADOS (${clients.length} total)\n`;
  ctx += clients.map(c => `- ${c.name}${c.city ? ` (${c.city})` : ""}${c.phone ? ` Tel: ${c.phone}` : ""}`).join("\n");

  // Gas stock
  ctx += `\n\n## STOCK DE GAS REFRIGERANTE (botellas activas)\n`;
  if (Object.keys(gasByType).length === 0) {
    ctx += "- Sin botellas activas registradas\n";
  } else {
    Object.entries(gasByType).forEach(([type, kg]) => {
      ctx += `- ${type}: ${kg.toFixed(2)} kg disponibles\n`;
    });
  }
  ctx += `\nDetalle de botellas: ${gasBottles.filter(b => b.status === "activa").map(b => `${b.serial_number} (${b.gas_type}, ${b.current_kg}kg, ubicación: ${b.location_type})`).join("; ")}`;

  // Materials stock
  ctx += `\n\n## STOCK DE MATERIALES (${materials.length} activos)\n`;
  materials.forEach(m => {
    let line = `- ${m.name}${m.code ? ` [${m.code}]` : ""}: stock ${m.stock_quantity || 0} ${m.unit || "ud"}`;
    if (canSeePrices) line += `, precio venta ${m.sell_price || 0}€`;
    ctx += line + "\n";
  });

  if (lowStock.length > 0) {
    ctx += `\n⚠️ MATERIALES CON STOCK BAJO: ${lowStock.map(m => `${m.name} (${m.stock_quantity || 0}/${m.min_stock})`).join(", ")}`;
  }

  // Projects
  ctx += `\n\n## OBRAS Y PROYECTOS\n`;
  projects.forEach(p => {
    ctx += `- ${p.name}${p.reference ? ` [${p.reference}]` : ""}: estado "${p.status}", cliente: ${p.client_name}${p.address ? `, dir: ${p.address}` : ""}\n`;
  });

  // Recent interventions
  ctx += `\n\n## ÚLTIMAS INTERVENCIONES (${interventions.length})\n`;
  interventions.slice(0, 15).forEach(i => {
    ctx += `- Nº ${i.number || i.id?.slice(0, 8)}: cliente ${i.client_name}, técnico ${i.technician_name}, estado "${i.status}", fecha ${i.date?.slice(0, 10)}\n`;
  });

  return ctx;
}

// ── System Prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(user, contextText) {
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const canSeePrices = isAdmin || user?.role === "oficina";
  const roleName = isAdmin ? "Administrador" : user?.role === "oficina" ? "Oficina" : "Técnico";

  return `Eres el asistente oficial de FRIGEST, empresa de mantenimiento de refrigeración industrial.
Tu nombre es "Asistente FRIGEST". Siempre respondes en español, de forma clara y concisa.

USUARIO ACTIVO: ${user?.full_name || "Desconocido"} | Rol: ${roleName} | Email: ${user?.email || "—"}

═══════════════════════════════════════════
REGLAS DE SEGURIDAD (OBLIGATORIAS):
═══════════════════════════════════════════
${!canSeePrices ? "⚠️ ESTE USUARIO NO PUEDE VER PRECIOS. Si preguntan sobre precios, costes o totales económicos, responde: 'Lo siento, no tienes permisos para consultar datos económicos.'" : "El usuario tiene acceso a precios y datos económicos."}
${!isAdmin ? "⚠️ No compartas datos de otros técnicos ni información de nóminas o costes de personal." : "El usuario tiene acceso completo como administrador."}

═══════════════════════════════════════════
ESTRUCTURA DE LA APLICACIÓN (para guiar al usuario):
═══════════════════════════════════════════
MENÚ PRINCIPAL:
- 📊 Panel / Dashboard → Resumen del día, estadísticas, widget de fichaje
- 📋 Intervenciones → Lista de todos los partes de trabajo. Botón "Nuevo Parte" arriba a la derecha
- 🧰 Stock / Materiales → Inventario de materiales, precios y movimientos
- 👥 Clientes → Ficha completa de cada cliente
- ⏱ Registro Jornada (TimeRecords) → Historial de fichajes por día
- 📅 Jornadas (WorkDayReport) → Registro diario de actividad por tramos
- 🧪 Trazabilidad Gases → Botellas de gas, traspasos y consumos
- 🏗 Obras y Proyectos → Gestión de obras con materiales y horas de personal
- ⚙️ Configuración → Gestión de usuarios e invitaciones (solo admin)

FLUJOS CLAVE:
1. CREAR PARTE DE TRABAJO: Menú → Intervenciones → botón "Nuevo Parte" (arriba derecha) → Rellenar cliente, fecha, gas, materiales → "Guardar Parte"
2. AÑADIR AYUDANTE: Al crear/editar un parte → sección "Mano de Obra" → campo "Ayudante" → seleccionar técnico del equipo
3. FICHAR ENTRADA: Panel principal → Widget "Fichaje" → botón "Entrada"
4. REGISTRAR JORNADA: Menú → "Mi Jornada" → Añadir tramos con inicio/fin y tipo de actividad
5. AÑADIR MATERIAL A OBRA: Menú → Obras → botón "Vale de Salida" en la obra → seleccionar material y cantidad
6. VER HORAS DE OBRA: Menú → Obras → botón "Detalle" → pestaña "Horas de Personal"
7. VALIDAR PARTE (admin): Intervenciones → abrir parte → botón "Validar"
8. INVITAR USUARIO: Configuración → sección "Usuarios" → botón "Invitar Usuario"

TIPOS DE ACTIVIDAD EN JORNADA: Cliente, Obra, Taller, Comida, Desplazamiento, Guardia, Formación, Otro

ESTADOS DE PARTE: en_curso → pendiente_revision → validado → completado → facturado
ESTADOS DE OBRA: en_curso, pausada, finalizada, facturada

═══════════════════════════════════════════
DATOS ACTUALES DE LA APP (actualizado ahora):
═══════════════════════════════════════════
${contextText}

═══════════════════════════════════════════
TU MISIÓN:
═══════════════════════════════════════════
1. Responde preguntas sobre datos reales de la app (stock, clientes, obras, intervenciones)
2. Guía al usuario paso a paso por los menús cuando pregunten cómo hacer algo
3. ${isAdmin ? "Genera informes y análisis cuando el admin lo solicite (consumo de gas, horas por técnico, etc.)" : "Ayuda al técnico a completar sus partes de trabajo"}
4. Si piden un borrador de parte o jornada, genera un JSON estructurado en un bloque de código
5. Si no tienes el dato exacto, dilo claramente y sugiere dónde encontrarlo en la app`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AIChat({ user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextText, setContextText] = useState("");
  const [contextLoaded, setContextLoaded] = useState(false);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const initChat = async () => {
    if (contextLoaded) return;
    setLoadingCtx(true);
    const ctx = await loadContext(user);
    setContextText(ctx);
    setContextLoaded(true);
    setLoadingCtx(false);
    setMessages([{
      role: "assistant",
      content: `¡Hola, ${user?.full_name?.split(" ")[0] || ""}! Soy el asistente de FRIGEST. Acabo de cargar los datos actuales de la app.\n\nPuedo ayudarte con:\n- **Consultas de stock**: "¿Cuánto R449A queda?"\n- **Guía de la app**: "¿Cómo añado un ayudante?"\n- **Datos de clientes y obras**: "¿Qué obras están activas?"\n\n¿En qué puedo ayudarte?`
    }]);
  };

  useEffect(() => {
    if (open) {
      initChat();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    const systemPrompt = buildSystemPrompt(user, contextText);
    const history = newMessages.map(m =>
      `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`
    ).join("\n\n");

    const fullPrompt = `${systemPrompt}

═══════════════════════════════════
CONVERSACIÓN:
═══════════════════════════════════
${history}

Asistente:`;

    try {
      const response = await appApi.ai.invoke({ prompt: fullPrompt });
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      console.error("[AIChat] Error al invocar la IA:", err);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "⚠️ El servicio con IA no está disponible en estos momentos. Inténtelo de nuevo más tarde.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const refreshContext = async () => {
    setContextLoaded(false);
    setLoadingCtx(true);
    const ctx = await loadContext(user);
    setContextText(ctx);
    setContextLoaded(true);
    setLoadingCtx(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed top-20 right-4 lg:top-auto lg:bottom-6 lg:right-6 z-40 h-12 w-12 lg:h-14 lg:w-14 rounded-full bg-primary shadow-xl flex items-center justify-center text-white hover:bg-primary/90 transition-all duration-200 hover:scale-105"
        title="Asistente IA FRIGEST"
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed top-36 right-4 lg:bottom-24 lg:top-auto lg:right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-10rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Asistente FRIGEST</p>
              <p className="text-xs text-white/70">
                {loadingCtx ? "Cargando datos..." : contextLoaded ? "✓ Datos cargados" : "IA · Solo lectura"}
              </p>
            </div>
            <button onClick={refreshContext} disabled={loadingCtx} className="text-white/70 hover:text-white mr-1" title="Actualizar datos">
              <RefreshCw className={`h-4 w-4 ${loadingCtx ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingCtx && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Cargando datos de la app...</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {msg.role === "assistant" ? (
                    <ReactMarkdown
                      className="prose prose-sm max-w-none [&>p]:my-0.5 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-sm [&>h2]:text-sm [&>h3]:text-xs"
                      components={{
                        code: ({ children, className }) => {
                          const isBlock = className?.includes("language-");
                          return isBlock
                            ? <pre className="bg-background border rounded-lg p-2 text-xs overflow-x-auto my-2 whitespace-pre-wrap"><code>{children}</code></pre>
                            : <code className="bg-background px-1 rounded text-xs font-mono">{children}</code>;
                        },
                      }}
                    >{msg.content}</ReactMarkdown>
                  ) : msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick suggestions */}
          {messages.length <= 1 && !loading && contextLoaded && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {[
                "¿Cuánto stock de R449A queda?",
                "¿Cómo creo un parte nuevo?",
                "¿Qué obras están activas?",
                "¿Cómo añado un ayudante?"
              ].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-xs bg-primary/10 text-primary rounded-full px-3 py-1 hover:bg-primary/20 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3 flex gap-2 shrink-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escribe tu consulta..."
              rows={1}
              disabled={loadingCtx}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring max-h-24 overflow-auto disabled:opacity-50"
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim() || loadingCtx}
              size="icon"
              className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

