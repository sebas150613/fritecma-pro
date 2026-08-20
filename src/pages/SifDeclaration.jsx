import { FileCheck, AlertTriangle } from "lucide-react";
import {
  PRODUCER,
  SIGNED,
  buildAnnexSections,
  buildDeclarationSections,
  isDeclarationComplete,
} from "@/lib/sifDeclaration";

/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

/**
 * Declaración responsable del sistema informático de facturación.
 *
 * Art. 13.2 RD 1007/2023: debe constar "por escrito y de modo visible en el
 * propio sistema informático en cada una de sus versiones". Por eso esta
 * pantalla es accesible para cualquier usuario autenticado, no solo admin.
 */
export default function SifDeclaration() {
  const sections = buildDeclarationSections(APP_VERSION);
  const annex = buildAnnexSections();
  const complete = isDeclarationComplete();

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-accent" />
          Declaración responsable del sistema informático de facturación
        </h1>
        <p className="text-sm text-muted-foreground">
          Real Decreto 1007/2023, de 5 de diciembre, artículo 13. Versión del sistema:{" "}
          <span className="font-mono">{APP_VERSION}</span>
        </p>
      </header>

      {!complete && (
        <div className="flex gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium">
              {SIGNED
                ? "Faltan datos por completar en esta declaración."
                : "Esta declaración todavía no ha sido suscrita."}
            </p>
            <p className="text-amber-700">
              Complétala en <span className="font-mono">src/lib/sifDeclaration.js</span> y
              publica la versión firmada antes de comercializar el sistema.
            </p>
          </div>
        </div>
      )}

      <section className="bg-card rounded-2xl border border-border divide-y divide-border">
        {sections.map((item) => (
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
      </section>

      <h2 className="text-base font-semibold pt-2">Anexo</h2>
      <section className="bg-card rounded-2xl border border-border divide-y divide-border">
        {annex.map((item) => (
          <article key={item.id} className="p-4 space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="font-mono mr-2">{item.id})</span>
              {item.label}
            </h3>
            {item.value ? (
              <p className="text-sm whitespace-pre-line">{item.value}</p>
            ) : (
              <p className="text-sm italic text-amber-700">Pendiente de completar</p>
            )}
          </article>
        ))}
      </section>

      {PRODUCER.historicoUrl && (
        <p className="text-xs text-muted-foreground">
          Histórico de declaraciones responsables de todas las versiones:{" "}
          <a
            href={PRODUCER.historicoUrl}
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            {PRODUCER.historicoUrl}
          </a>
        </p>
      )}
    </div>
  );
}
