/**
 * VITAS · ValuationReportView
 *
 * Renderer dedicado para el reporte `valuation-report` (agente
 * api/agents/_valuation-report.ts). Pinta la ESTRUCTURA OBLIGATORIA del prompt:
 *   evaluacionGeneral · tierAnalisis · comparablesProfesionales[] ·
 *   factoresClave[] · proyeccion{cortoPlaz,medioPlaz,techoEstimado} ·
 *   recomendacionesDesarrollo[] · riesgosValoracion[]
 *
 * Todos los campos son opcionales (el reporte puede venir parcial o de
 * fallback) — se guardan con ?? y condicionales. Las etiquetas fijas van por
 * i18n (namespace valuationReport); los VALORES del reporte se pintan tal cual
 * (ya vienen en español del agente).
 */

import { useTranslation } from "react-i18next";
import { Gauge, TrendingUp, Users, ArrowUpRight, ArrowDownRight, Minus, Lightbulb, ShieldAlert } from "lucide-react";

// ── mini <Section> local · replica el patrón de AnalysisDashboard sin crear
//    ciclo de import ────────────────────────────────────────────────────────
function Section({
  heading,
  color,
  children,
}: {
  heading: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h5 className={`font-display font-bold text-xs ${color} mb-1.5`}>{heading}</h5>
      <ul className="list-disc list-inside space-y-1 text-xs text-foreground">{children}</ul>
    </section>
  );
}

// ── tipos laxos del schema (todo opcional) ──────────────────────────────────
interface Comparable {
  nombre?: string;
  equipo?: string;
  razon?: string;
}

type Impacto = "positivo" | "negativo" | "neutro" | string;

interface Factor {
  factor?: string;
  impacto?: Impacto;
  explicacion?: string;
}

interface Proyeccion {
  cortoPlaz?: string;
  medioPlaz?: string;
  techoEstimado?: string;
}

const IMPACT_META: Record<
  string,
  { color: string; chip: string; Icon: React.ElementType }
> = {
  positivo: { color: "text-green-400", chip: "bg-green-500/10 border-green-500/30 text-green-400", Icon: ArrowUpRight },
  negativo: { color: "text-red-400", chip: "bg-red-500/10 border-red-500/30 text-red-400", Icon: ArrowDownRight },
  neutro: { color: "text-muted-foreground", chip: "bg-secondary/30 border-border text-muted-foreground", Icon: Minus },
};

export default function ValuationReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  const evaluacionGeneral = (report.evaluacionGeneral as string | undefined) ?? undefined;
  const tierAnalisis = (report.tierAnalisis as string | undefined) ?? undefined;
  const comparables = (report.comparablesProfesionales as Comparable[] | undefined) ?? [];
  const factores = (report.factoresClave as Factor[] | undefined) ?? [];
  const proyeccion = (report.proyeccion as Proyeccion | undefined) ?? {};
  const recomendaciones = (report.recomendacionesDesarrollo as Array<string | { title?: string }> | undefined) ?? [];
  const riesgos = (report.riesgosValoracion as Array<string | { title?: string }> | undefined) ?? [];

  const hasProyeccion = !!(proyeccion.cortoPlaz || proyeccion.medioPlaz || proyeccion.techoEstimado);
  const isEmpty =
    !evaluacionGeneral &&
    !tierAnalisis &&
    comparables.length === 0 &&
    factores.length === 0 &&
    !hasProyeccion &&
    recomendaciones.length === 0 &&
    riesgos.length === 0;

  if (isEmpty) {
    return <p className="text-xs text-muted-foreground italic">{t("valuationReport.noContent")}</p>;
  }

  const asText = (v: string | { title?: string }) => (typeof v === "string" ? v : v.title ?? "");

  return (
    <div className="space-y-4">
      {/* Evaluación general · moat: veredicto honesto y equilibrado */}
      {evaluacionGeneral && (
        <div className="glass rounded-xl p-4 bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border border-primary/20">
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge size={13} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              {t("valuationReport.overall")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{evaluacionGeneral}</p>
        </div>
      )}

      {/* Análisis del tier */}
      {tierAnalisis && (
        <div className="rounded-xl bg-secondary/30 border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
            {t("valuationReport.tier")}
          </div>
          <p className="text-xs text-foreground leading-relaxed">{tierAnalisis}</p>
        </div>
      )}

      {/* Comparables profesionales */}
      {comparables.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Users size={13} className="text-electric" />
            <h5 className="font-display font-bold text-xs text-electric">{t("valuationReport.comparables")}</h5>
          </div>
          <div className="grid gap-2">
            {comparables.map((c, i) => (
              <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display font-bold text-sm text-foreground truncate">{c.nombre ?? "—"}</span>
                  {c.equipo && <span className="text-[10px] text-muted-foreground shrink-0">{c.equipo}</span>}
                </div>
                {c.razon && <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{c.razon}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Factores clave · chip de impacto con color semántico */}
      {factores.length > 0 && (
        <section>
          <h5 className="font-display font-bold text-xs text-foreground mb-2">{t("valuationReport.keyFactors")}</h5>
          <div className="space-y-1.5">
            {factores.map((f, i) => {
              const meta = (f.impacto && IMPACT_META[f.impacto]) || IMPACT_META.neutro;
              const ImpIcon = meta.Icon;
              const impactoLabel = f.impacto
                ? t(`valuationReport.impact.${f.impacto}`, { defaultValue: f.impacto })
                : t("valuationReport.impact.neutro");
              return (
                <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-xs text-foreground truncate">{f.factor ?? "—"}</span>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] uppercase tracking-wider font-bold ${meta.chip}`}
                    >
                      <ImpIcon size={10} />
                      {impactoLabel}
                    </span>
                  </div>
                  {f.explicacion && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{f.explicacion}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Proyección · moat: corto / medio / techo */}
      {hasProyeccion && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={13} className="text-primary" />
            <h5 className="font-display font-bold text-xs text-primary">{t("valuationReport.projection")}</h5>
          </div>
          <div className="grid gap-2">
            {proyeccion.cortoPlaz && (
              <div className="rounded-xl bg-secondary/30 border border-border p-3">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                  {t("valuationReport.shortTerm")}
                </div>
                <p className="text-xs text-foreground leading-relaxed">{proyeccion.cortoPlaz}</p>
              </div>
            )}
            {proyeccion.medioPlaz && (
              <div className="rounded-xl bg-secondary/30 border border-border p-3">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                  {t("valuationReport.midTerm")}
                </div>
                <p className="text-xs text-foreground leading-relaxed">{proyeccion.medioPlaz}</p>
              </div>
            )}
            {proyeccion.techoEstimado && (
              <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
                <div className="text-[9px] uppercase tracking-wider text-primary font-bold mb-1">
                  {t("valuationReport.ceiling")}
                </div>
                <p className="text-xs text-foreground font-semibold leading-relaxed">{proyeccion.techoEstimado}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recomendaciones de desarrollo */}
      {recomendaciones.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb size={13} className="text-electric" />
            <h5 className="font-display font-bold text-xs text-electric">{t("valuationReport.recommendations")}</h5>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
            {recomendaciones.map((r, i) => (
              <li key={i}>{asText(r)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Riesgos de valoración · honestidad del moat */}
      {riesgos.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ShieldAlert size={13} className="text-amber-400" />
            <h5 className="font-display font-bold text-xs text-amber-400">{t("valuationReport.risks")}</h5>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
            {riesgos.map((r, i) => (
              <li key={i}>{asText(r)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
