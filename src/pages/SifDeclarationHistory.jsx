import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DECLARATION_HISTORY,
  SIGNATURE,
  SIGNED,
  buildAnnexSections,
  buildDeclarationSections,
  buildDeclarationSnapshot,
} from "@/lib/sifDeclaration";

/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

/**
 * Histórico de declaraciones responsables (art. 13.3 RD 1007/2023).
 *
 * "deberá guardar y conservar las declaraciones responsables de todas las
 * versiones de los sistemas informáticos producidos o comercializados"
 *
 * Accesible para cualquier usuario autenticado: el cliente puede pedirla.
 */
export default function SifDeclarationHistory() {
  const [copiado, setCopiado] = useState(false);

  const actual = {
    version: APP_VERSION,
    firmada: SIGNED,
    fecha: SIGNATURE.fecha,
    lugar: SIGNATURE.lugar,
    apartados: buildDeclarationSections(APP_VERSION),
    anexo: buildAnnexSections(),
    esActual: true,
  };

  const versiones = [actual, ...DECLARATION_HISTORY];

  const copiarInstantanea = async () => {
    const texto = JSON.stringify(buildDeclarationSnapshot(APP_VERSION), null, 2);
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="space-y-2">
        <Link
          to="/declaracion-responsable"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Declaración responsable vigente
        </Link>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Archive className="h-5 w-5 text-accent" />
          Histórico de declaraciones responsables
        </h1>
        <p className="text-sm text-muted-foreground">
          Real Decreto 1007/2023, artículo 13.3. La declaración responsable es por
          versión concreta del sistema; aquí se conservan todas las publicadas.
        </p>
      </header>

      <section className="space-y-3">
        {versiones.map((v) => (
          <details
            key={v.version}
            className="bg-card rounded-2xl border border-border overflow-hidden"
            open={v.esActual}
          >
            <summary className="p-4 cursor-pointer flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm font-semibold">v{v.version}</span>
              {v.esActual && (
                <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">
                  Vigente
                </span>
              )}
              {v.firmada ? (
                <span className="text-xs text-muted-foreground">
                  Suscrita {v.fecha ? `el ${v.fecha}` : ""} {v.lugar ? `en ${v.lugar}` : ""}
                </span>
              ) : (
                <span className="text-xs text-amber-700">Sin suscribir</span>
              )}
            </summary>

            <div className="border-t border-border divide-y divide-border">
              {[...v.apartados, ...(v.anexo || [])].map((item) => (
                <article key={item.id} className="p-4 space-y-1.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="font-mono mr-2">{item.id})</span>
                    {item.label}
                  </h2>
                  {item.value ? (
                    <p className="text-sm whitespace-pre-line">{item.value}</p>
                  ) : (
                    <p className="text-sm italic text-amber-700">Pendiente de completar</p>
                  )}
                </article>
              ))}
            </div>
          </details>
        ))}
      </section>

      {DECLARATION_HISTORY.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Todavía no hay versiones anteriores archivadas: {APP_VERSION} es la primera
          publicada.
        </p>
      )}

      <div className="pt-2 border-t border-border space-y-2">
        <p className="text-xs text-muted-foreground">
          Al publicar una versión nueva, archiva la actual antes de sustituirla: copia
          su instantánea y pégala en <span className="font-mono">DECLARATION_HISTORY</span>{" "}
          de <span className="font-mono">src/lib/sifDeclaration.js</span>.
        </p>
        <Button variant="outline" className="rounded-xl" onClick={copiarInstantanea}>
          {copiado ? (
            <>
              <Check className="h-4 w-4 mr-2" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" /> Copiar instantánea de v{APP_VERSION}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
