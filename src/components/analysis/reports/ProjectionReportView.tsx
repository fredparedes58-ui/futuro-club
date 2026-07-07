/**
 * VITAS · ProjectionReportView
 *
 * Renderer dedicado para el reporte `projection` (agente
 * api/agents/_projection-report.ts). Pinta la ESTRUCTURA OBLIGATORIA del prompt:
 *   title · headline · current_vsi · year_1_vsi · year_2_vsi · year_3_vsi ·
 *   phv_consideration · key_drivers[] · scenarios{base,with_focused_work}
 * + extensión polivalencia: positionProjections{ [code]: {y1,y2,y3,headline} }
 *
 * MOAT (lo que el renderer genérico dejaba caer):
 *   - scenarios (base vs trabajo enfocado) → dos tarjetas contrastadas
 *   - phv_consideration → tarjeta destacada (la corrección PHV es el diferenciador)
 *   - curva VSI (actual → 3 años) → mini-gráfico SVG inline
 *
 * Todos los campos son opcionales (el reporte puede venir parcial o de
 * fallback) — se leen con ?? y condicionales. El agente además envuelve la
 * narrativa bajo `narrative` y los números bajo `deterministicCurve`, por lo
 * que se desenrolla defensivamente (soporta shape plano, envuelto y envelope).
 * Las etiquetas fijas van por i18n (namespace projectionReport); los VALORES
 * del reporte se pintan tal cual (ya vienen en español del agente).
 */

import { useTranslation } from "react-i18next";
import { TrendingUp, Sparkles, Activity, ArrowRight, Rocket, Target } from "lucide-react";

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
interface Scenarios {
  base?: string;
  with_focused_work?: string;
}

interface PositionProjection {
  y1?: number;
  y2?: number;
  y3?: number;
  headline?: string;
}

interface DeterministicCurve {
  current?: number;
  year1?: number;
  year2?: number;
  year3?: number;
}

const asNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Desenrolla el shape real almacenado en `content`. El pipeline guarda
 * `envelope.report ?? r.data`; como projection no expone `report`, el content
 * puede llegar como { ..., narrative, deterministicCurve } o como el envelope
 * completo { success, data: {...} }. También soporta el shape plano (narrativa
 * directa). Devuelve la narrativa y la curva determinista por separado.
 */
function resolve(report: Record<string, unknown>): {
  n: Record<string, unknown>;
  curve: DeterministicCurve;
} {
  let r = report;
  const inner = r.data as Record<string, unknown> | undefined;
  if (
    inner &&
    typeof inner === "object" &&
    ("narrative" in inner || "deterministicCurve" in inner || "report" in inner)
  ) {
    r = inner;
  }
  const curve = (r.deterministicCurve as DeterministicCurve | undefined) ?? {};
  const n =
    (r.narrative as Record<string, unknown> | undefined) ??
    (r.report as Record<string, unknown> | undefined) ??
    r;
  return { n, curve };
}

// ── mini-gráfico de curva VSI (actual → año 3) · SVG inline, sin recharts ────
function ProjectionCurve({
  points,
  labels,
}: {
  points: number[];
  labels: string[];
}) {
  const { t } = useTranslation();
  if (points.length < 2) return null;

  const w = 300;
  const padX = 14;
  const topY = 24; // espacio para etiqueta de valor sobre el punto más alto
  const botY = 82;
  const plotW = w - padX * 2;
  const plotH = botY - topY;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);

  const x = (i: number) => padX + (i / (points.length - 1)) * plotW;
  const y = (v: number) => botY - ((v - min) / range) * plotH;

  const coords = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const linePath = `M${coords.join(" L")}`;
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${botY} L${x(0).toFixed(1)},${botY} Z`;

  const delta = points[points.length - 1] - points[0];
  const deltaSign = delta > 0 ? "+" : "";
  const deltaColor =
    delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground";

  return (
    <div className="rounded-xl bg-secondary/30 border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Activity size={12} className="text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            {t("projectionReport.curveTitle")}
          </span>
        </div>
        <div className={`text-[11px] font-display font-bold ${deltaColor}`}>
          {deltaSign}
          {delta.toFixed(1)} {t("projectionReport.pts")}
        </div>
      </div>
      <svg viewBox="0 0 300 104" className="w-full h-28 overflow-visible" preserveAspectRatio="none">
        <path d={areaPath} fill="hsl(var(--primary))" fillOpacity={0.14} />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((v, i) => {
          const isLast = i === points.length - 1;
          return (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(v)}
                r={isLast ? 3.5 : 2.5}
                fill={isLast ? "hsl(var(--primary))" : "hsl(var(--electric))"}
                stroke="hsl(var(--background))"
                strokeWidth={isLast ? 1.2 : 0.6}
              />
              <text
                x={x(i)}
                y={y(v) - 8}
                textAnchor="middle"
                className={`text-[9px] font-display font-bold ${isLast ? "fill-primary" : "fill-foreground"}`}
                style={{ fontSize: 10 }}
              >
                {v.toFixed(1)}
              </text>
              <text
                x={x(i)}
                y={98}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 8 }}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ProjectionReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  const { n, curve } = resolve(report ?? {});

  const title = (n.title as string | undefined) ?? undefined;
  const headline = (n.headline as string | undefined) ?? undefined;
  const phvConsideration = (n.phv_consideration as string | undefined) ?? undefined;
  const keyDrivers = (n.key_drivers as string[] | undefined) ?? [];
  const scenarios = (n.scenarios as Scenarios | undefined) ?? {};
  const positionProjections =
    (n.positionProjections as Record<string, PositionProjection> | undefined) ?? {};

  // Números de la curva · narrativa primero, deterministicCurve como respaldo
  const current = asNum(n.current_vsi) ?? asNum(curve.current);
  const y1 = asNum(n.year_1_vsi) ?? asNum(curve.year1);
  const y2 = asNum(n.year_2_vsi) ?? asNum(curve.year2);
  const y3 = asNum(n.year_3_vsi) ?? asNum(curve.year3);

  const curveData: Array<{ value: number; label: string }> = [
    { value: current, label: t("projectionReport.now") },
    { value: y1, label: t("projectionReport.year1") },
    { value: y2, label: t("projectionReport.year2") },
    { value: y3, label: t("projectionReport.year3") },
  ].filter((d): d is { value: number; label: string } => typeof d.value === "number");

  const posEntries = Object.entries(positionProjections);
  const hasScenarios = !!(scenarios.base || scenarios.with_focused_work);

  const isEmpty =
    !title &&
    !headline &&
    !phvConsideration &&
    keyDrivers.length === 0 &&
    !hasScenarios &&
    curveData.length === 0 &&
    posEntries.length === 0;

  if (isEmpty) {
    return <p className="text-xs text-muted-foreground italic">{t("projectionReport.noContent")}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Headline · veredicto de proyección a 3 años */}
      {(headline || title) && (
        <div className="glass rounded-xl p-4 bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border border-primary/20">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={13} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              {t("projectionReport.overview")}
            </span>
          </div>
          {headline && (
            <p className="text-sm text-foreground font-display font-semibold leading-relaxed">
              {headline}
            </p>
          )}
          {title && title !== headline && (
            <p className="text-[11px] text-muted-foreground mt-1">{title}</p>
          )}
        </div>
      )}

      {/* Curva VSI proyectada · moat: visualiza el techo a 3 años */}
      {curveData.length >= 2 && (
        <ProjectionCurve points={curveData.map((d) => d.value)} labels={curveData.map((d) => d.label)} />
      )}

      {/* Consideración PHV · moat: la corrección de maduración biológica */}
      {phvConsideration && (
        <div className="rounded-xl bg-electric/10 border border-electric/30 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={13} className="text-electric" />
            <h5 className="font-display font-bold text-xs text-electric">
              {t("projectionReport.phvConsideration")}
            </h5>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{phvConsideration}</p>
        </div>
      )}

      {/* Escenarios · moat: base vs trabajo enfocado, contrastados */}
      {hasScenarios && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={13} className="text-primary" />
            <h5 className="font-display font-bold text-xs text-primary">
              {t("projectionReport.scenarios")}
            </h5>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {scenarios.base && (
              <div className="rounded-xl bg-secondary/30 border border-border p-3">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">
                  <ArrowRight size={11} />
                  {t("projectionReport.scenarioBase")}
                </div>
                <p className="text-[11px] text-foreground leading-relaxed">{scenarios.base}</p>
              </div>
            )}
            {scenarios.with_focused_work && (
              <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-green-400 font-bold mb-1.5">
                  <Rocket size={11} />
                  {t("projectionReport.scenarioFocused")}
                </div>
                <p className="text-[11px] text-foreground leading-relaxed font-medium">
                  {scenarios.with_focused_work}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Factores clave que impactarán el VSI futuro */}
      {keyDrivers.length > 0 && (
        <Section heading={t("projectionReport.keyDrivers")} color="text-amber-400">
          {keyDrivers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </Section>
      )}

      {/* Proyección por posición · polivalencia (secondaryPositions) */}
      {posEntries.length > 0 && (
        <section>
          <h5 className="font-display font-bold text-xs text-foreground mb-2">
            {t("projectionReport.positionProjections")}
          </h5>
          <div className="grid gap-2">
            {posEntries.map(([code, p]) => {
              const yy1 = asNum(p?.y1);
              const yy2 = asNum(p?.y2);
              const yy3 = asNum(p?.y3);
              const hasYears = yy1 !== undefined || yy2 !== undefined || yy3 !== undefined;
              return (
                <div key={code} className="rounded-xl bg-secondary/30 border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-sm text-foreground uppercase">
                      {code}
                    </span>
                    {hasYears && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="text-muted-foreground">
                          {t("projectionReport.year1")}{" "}
                          <span className="text-foreground font-bold">{yy1 ?? "—"}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {t("projectionReport.year2")}{" "}
                          <span className="text-foreground font-bold">{yy2 ?? "—"}</span>
                        </span>
                        <span className="text-primary">
                          {t("projectionReport.year3")}{" "}
                          <span className="font-bold">{yy3 ?? "—"}</span>
                        </span>
                      </div>
                    )}
                  </div>
                  {p?.headline && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                      {p.headline}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
