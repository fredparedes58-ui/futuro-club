/**
 * VITAS · DevelopmentPlanReportView
 *
 * Renderer dedicado para el reporte `development-plan` (agente
 * api/agents/_development-plan.ts). Pinta la ESTRUCTURA OBLIGATORIA del prompt:
 *   title · duration_weeks · primary_focus · phv_consideration ·
 *   blocks[]{ block_number, weeks, theme, objectives[], weekly_sessions,
 *             drills[]{ name, frequency, duration_min, description } } ·
 *   metrics_to_track[] · review_checkpoints[]
 *
 * MOAT (lo que el renderer genérico dejaba caer):
 *   - drills[] por bloque con TODO su detalle (frecuencia, duración, descripción)
 *   - objectives por bloque
 *   - weaknessesDetected / ragDrillsUsed del envelope (por qué existe el plan)
 *
 * Todos los campos son opcionales (el reporte puede venir parcial, envuelto o de
 * fallback) — se leen con ?? y condicionales. Las etiquetas fijas van por i18n
 * (namespace developmentPlanReport); los VALORES del reporte se pintan tal cual
 * (ya vienen en español del agente).
 */

import { useTranslation } from "react-i18next";
import {
  ClipboardList, Target, Dumbbell, CalendarClock, Gauge, LineChart,
  CheckCircle2, AlertTriangle, Database, ListChecks,
} from "lucide-react";

// ── mini <Section> local · replica el patrón de AnalysisDashboard sin crear
//    ciclo de import ────────────────────────────────────────────────────────
function Section({
  heading,
  color,
  Icon,
  children,
}: {
  heading: string;
  color: string;
  Icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon size={13} className={color} />}
        <h5 className={`font-display font-bold text-xs ${color}`}>{heading}</h5>
      </div>
      <ul className="list-disc list-inside space-y-1 text-xs text-foreground">{children}</ul>
    </section>
  );
}

// ── tipos laxos del schema (todo opcional) ──────────────────────────────────
interface Drill {
  name?: string;
  nombre?: string;
  frequency?: string;
  frecuencia?: string;
  duration_min?: number;
  duracion_min?: number;
  description?: string;
  descripcion?: string;
}

interface Block {
  block_number?: number;
  numero?: number;
  weeks?: string;
  semanas?: string;
  theme?: string;
  tema?: string;
  objectives?: Array<string | { title?: string }>;
  objetivos?: Array<string | { title?: string }>;
  weekly_sessions?: number;
  sesiones_semanales?: number;
  drills?: Drill[];
}

interface Pillar {
  pilar?: string;
  prioridad?: string;
  acciones?: string[];
}

const FOCUS_META: Record<string, string> = {
  technique: "text-electric",
  physical: "text-green-400",
  tactical: "text-amber-400",
  mixed: "text-primary",
};

const asText = (v: string | { title?: string }) => (typeof v === "string" ? v : v?.title ?? "");

export default function DevelopmentPlanReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  // Unwrap tolerante: content puede venir como el `plan`, como el envelope
  // {plan,...}, o como {data:{plan,...}}. Buscamos el objeto que contiene el plan.
  const root =
    (report.data && typeof report.data === "object" && !Array.isArray(report.data)
      ? (report.data as Record<string, unknown>)
      : report) ?? report;
  const plan =
    root.plan && typeof root.plan === "object" && !Array.isArray(root.plan)
      ? (root.plan as Record<string, unknown>)
      : root;

  const title = (plan.title as string | undefined) ?? undefined;
  const durationWeeks = (plan.duration_weeks as number | undefined) ?? undefined;
  const primaryFocus = (plan.primary_focus as string | undefined) ?? undefined;
  const phvConsideration = (plan.phv_consideration as string | undefined) ?? undefined;
  const blocks = (plan.blocks as Block[] | undefined) ?? [];
  const metricsToTrack = (plan.metrics_to_track as Array<string | { title?: string }> | undefined) ?? [];
  const reviewCheckpoints = (plan.review_checkpoints as Array<string | { title?: string }> | undefined) ?? [];
  const pillars = (plan.pillars as Pillar[] | undefined) ?? [];

  // Moat del envelope: por qué se generó el plan y cuánto RAG lo alimentó.
  const weaknesses = (root.weaknessesDetected as string[] | undefined) ?? [];
  const ragDrillsUsed =
    typeof root.ragDrillsUsed === "number" ? (root.ragDrillsUsed as number) : undefined;

  const isEmpty =
    !title &&
    !durationWeeks &&
    !primaryFocus &&
    !phvConsideration &&
    blocks.length === 0 &&
    metricsToTrack.length === 0 &&
    reviewCheckpoints.length === 0 &&
    pillars.length === 0 &&
    weaknesses.length === 0;

  if (isEmpty) {
    return <p className="text-xs text-muted-foreground italic">{t("developmentPlanReport.noContent")}</p>;
  }

  const focusColor = (primaryFocus && FOCUS_META[primaryFocus]) || "text-primary";
  const focusLabel = primaryFocus
    ? t(`developmentPlanReport.focus.${primaryFocus}`, { defaultValue: primaryFocus })
    : "";

  return (
    <div className="space-y-4">
      {/* Cabecera del plan · título + duración + foco principal */}
      {(title || durationWeeks || primaryFocus) && (
        <div className="glass rounded-xl p-4 bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border border-primary/20">
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardList size={13} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              {t("developmentPlanReport.planTitle")}
            </span>
          </div>
          {title && <p className="font-display font-bold text-sm text-foreground leading-snug">{title}</p>}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {durationWeeks !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-secondary/30 text-[10px] font-bold text-foreground">
                <CalendarClock size={10} className="text-muted-foreground" />
                {durationWeeks} {t("developmentPlanReport.weeksUnit")}
              </span>
            )}
            {primaryFocus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-secondary/30 text-[10px] uppercase tracking-wider font-bold">
                <Gauge size={10} className={focusColor} />
                <span className="text-muted-foreground">{t("developmentPlanReport.primaryFocus")}</span>
                <span className={`${focusColor}`}>{focusLabel}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Consideración PHV · moat: respeta la ventana de maduración biológica */}
      {phvConsideration && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
              {t("developmentPlanReport.phvConsideration")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{phvConsideration}</p>
        </div>
      )}

      {/* Debilidades detectadas + drills RAG · por qué existe este plan */}
      {(weaknesses.length > 0 || ragDrillsUsed !== undefined) && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-secondary/30 border border-border p-3 flex-wrap">
          {weaknesses.length > 0 && (
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                {t("developmentPlanReport.weaknesses")}
              </div>
              <div className="flex flex-wrap gap-1">
                {weaknesses.map((w, i) => (
                  <span
                    key={i}
                    className="inline-flex px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-400"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ragDrillsUsed !== undefined && (
            <div className="shrink-0 text-right">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1 flex items-center gap-1 justify-end">
                <Database size={10} /> {t("developmentPlanReport.ragDrills")}
              </div>
              <div className="font-display font-bold text-lg text-electric leading-none">{ragDrillsUsed}</div>
            </div>
          )}
        </div>
      )}

      {/* Bloques · núcleo del plan. Cada bloque con objetivos + drills detallados */}
      {blocks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <ListChecks size={13} className="text-primary" />
            <h5 className="font-display font-bold text-xs text-primary">{t("developmentPlanReport.blocks")}</h5>
          </div>
          {blocks.map((b, i) => {
            const blockNum = b.block_number ?? b.numero ?? i + 1;
            const weeks = b.weeks ?? b.semanas;
            const theme = b.theme ?? b.tema;
            const objectives = b.objectives ?? b.objetivos ?? [];
            const weeklySessions = b.weekly_sessions ?? b.sesiones_semanales;
            const drills = b.drills ?? [];
            return (
              <div key={i} className="rounded-xl bg-secondary/30 border-l-2 border-electric border-y border-r border-border p-3">
                {/* Encabezado del bloque */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[10px] uppercase tracking-wider text-electric font-bold">
                    {t("developmentPlanReport.block", { number: blockNum })}
                    {weeks && <span className="ml-2 text-muted-foreground normal-case tracking-normal">· {weeks}</span>}
                  </div>
                  {weeklySessions !== undefined && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-background/40 text-[9px] font-bold text-muted-foreground">
                      <CalendarClock size={9} />
                      {weeklySessions} {t("developmentPlanReport.sessionsPerWeek")}
                    </span>
                  )}
                </div>
                {theme && <p className="text-xs text-foreground font-semibold mt-1.5">{theme}</p>}

                {/* Objetivos del bloque */}
                {objectives.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                      <Target size={10} /> {t("developmentPlanReport.objectives")}
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-foreground/90">
                      {objectives.map((o, j) => (
                        <li key={j}>{asText(o)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Drills · MOAT: cada ejercicio con su detalle completo */}
                {drills.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-green-400 font-bold mb-1.5">
                      <Dumbbell size={10} /> {t("developmentPlanReport.drills")}
                    </div>
                    <div className="grid gap-1.5">
                      {drills.map((d, j) => {
                        const name = d.name ?? d.nombre;
                        const frequency = d.frequency ?? d.frecuencia;
                        const durationMin = d.duration_min ?? d.duracion_min;
                        const description = d.description ?? d.descripcion;
                        return (
                          <div key={j} className="rounded-lg bg-background/40 border border-border p-2.5">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <span className="font-semibold text-xs text-foreground min-w-0">{name ?? "—"}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                {frequency && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-green-500/30 bg-green-500/10 text-[9px] font-bold text-green-400">
                                    <CalendarClock size={9} />
                                    {frequency}
                                  </span>
                                )}
                                {durationMin !== undefined && (
                                  <span className="inline-flex px-1.5 py-0.5 rounded-full border border-border bg-secondary/40 text-[9px] font-bold text-muted-foreground">
                                    {durationMin} {t("developmentPlanReport.minUnit")}
                                  </span>
                                )}
                              </div>
                            </div>
                            {description && (
                              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{description}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Pilares de trabajo · presente en algunos fallbacks */}
      {pillars.length > 0 && (
        <Section heading={t("developmentPlanReport.pillars")} color="text-primary" Icon={ListChecks}>
          {pillars.map((p, i) => (
            <li key={i}>
              <span className="font-semibold text-foreground">{p.pilar}</span>
              {p.prioridad && (
                <span className="ml-2 text-[9px] uppercase tracking-wider text-muted-foreground">({p.prioridad})</span>
              )}
              {Array.isArray(p.acciones) && p.acciones.length > 0 && (
                <ul className="ml-4 mt-1 list-[circle] list-inside text-muted-foreground">
                  {p.acciones.map((a, j) => (
                    <li key={j}>{a}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </Section>
      )}

      {/* Métricas a seguir */}
      {metricsToTrack.length > 0 && (
        <Section heading={t("developmentPlanReport.metricsToTrack")} color="text-electric" Icon={LineChart}>
          {metricsToTrack.map((m, i) => (
            <li key={i}>{asText(m)}</li>
          ))}
        </Section>
      )}

      {/* Puntos de revisión */}
      {reviewCheckpoints.length > 0 && (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckCircle2 size={13} className="text-primary" />
            <h5 className="font-display font-bold text-xs text-primary">
              {t("developmentPlanReport.reviewCheckpoints")}
            </h5>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
            {reviewCheckpoints.map((c, i) => (
              <li key={i}>{asText(c)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
