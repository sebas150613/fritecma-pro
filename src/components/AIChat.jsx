import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Send, Loader2, Bot, User, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";

function buildSystemPrompt(user, contextData) {
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const canSeePrices = isAdmin || user?.role === "oficina";

  const clientList = contextData.clients?.map(c => c.name).join(", ") || "—";
  const materialList = contextData.materials?.map(m =>
    canSeePrices
      ? `${m.name} (stock: ${m.stock_quantity || 0} ${m.unit}, precio: ${m.sell_price || 0}€)`
      : `${m.name} (stock: ${m.stock_quantity || 0} ${m.unit})`
  ).join("; ") || "—";

  const projectList = contextData.projects?.map(p => `${p.name} [${p.status}]`).join(", ") || "—";

  return `Eres el asistente de IA de FRITECMA, empresa de mantenimiento de refrigeración industrial.
Rol del usuario actual: ${user?.role || "desconocido"} — Nombre: ${user?.full_name || "Desconocido"}.

REGLAS DE SEGURIDAD:
- Si el rol es "user" o "tecnico", NO puedes revelar precios, totales económicos ni datos de facturación.
- Siempre responde en español.
- Sé conciso y práctico para técnicos de campo.

DATOS DISPONIBLES (solo lectura):
- Clientes registrados: ${clientList}
- Materiales en stock: ${materialList}
- Obras activas: ${projectList}

NORMATIVA INTERNA BÁSICA:
- Los técnicos deben fichar entrada antes de crear partes de trabajo.
- Los partes finalizados pasan a revisión administrativa.
- El gas refrigerante cargado se descuenta automáticamente de la botella seleccionada.
- Las horas nocturnas son entre 22:00 y 06:00.
- Los técnicos deben registrar su jornada diaria como máximo al final del día.

CAPACIDADES:
- Responde preguntas sobre clientes, materiales, normativa y procedimientos.
- Puedes sugerir borradores de partes de trabajo basándote en descripciones del técnico (responde con JSON si el usuario lo pide explícitamente con "pre-rellenar" o "borrador").
- ${isAdmin ? "Como admin, puedes responder consultas analíticas sobre datos de la empresa." : "No tienes acceso a datos económicos ni analítica avanzada."}

Cuando el usuario pida un borrador de parte o jornada, responde con el JSON correspondiente en un bloque de código.`;
}

export default function AIChat({ user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "¡Hola! Soy el asistente de FRITECMA. Puedo ayudarte con consultas sobre clientes, materiales, normativa y borradores de partes. ¿En qué puedo ayudarte?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextData, setContextData] = useState({ clients: [], materials: [], projects: [] });
  const [contextLoaded, setContextLoaded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && !contextLoaded) {
      Promise.all([
        base44.entities.Client.list("name", 200),
        base44.entities.Material.filter({ is_active: true }, "name", 300),
        base44.entities.Project.filter({ status: "en_curso" }, "name", 100),
      ]).then(([clients, materials, projects]) => {
        setContextData({ clients, materials, projects });
        setContextLoaded(true);
      });
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    // Build conversation history for context
    const history = messages.map(m => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`).join("\n");
    const systemPrompt = buildSystemPrompt(user, contextData);

    const fullPrompt = `${systemPrompt}

HISTORIAL DE CONVERSACIÓN:
${history}

Usuario: ${userMsg}

Responde de forma útil y concisa:`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt: fullPrompt });
    setMessages(prev => [...prev, { role: "assistant", content: response }]);
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary shadow-xl flex items-center justify-center text-white hover:bg-primary/90 transition-all duration-200 hover:scale-105"
        title="Asistente IA"
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Asistente FRITECMA</p>
              <p className="text-xs text-white/70">IA · Solo lectura</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {msg.role === "assistant" ? (
                    <ReactMarkdown
                      className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      components={{
                        code: ({ children, className }) => {
                          const isBlock = className?.includes("language-");
                          return isBlock
                            ? <pre className="bg-background border rounded-lg p-2 text-xs overflow-x-auto my-2"><code>{children}</code></pre>
                            : <code className="bg-background px-1 rounded text-xs">{children}</code>;
                        },
                        p: ({ children }) => <p className="my-0.5">{children}</p>,
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
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escribe tu consulta..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring max-h-24 overflow-auto"
              style={{ fieldSizing: "content" }}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
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