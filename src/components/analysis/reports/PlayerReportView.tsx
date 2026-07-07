/**
 * VITAS · PlayerReportView
 *
 * Renderer dedicado para el reporte `player-report` (agente ancla comercial
 * api/agents/_player-report.ts · Sonnet). Pinta la ESTRUCTURA OBLIGATORIA del
 * prompt:
 *   title · vsi_score · tier · tier_label · executive_summary · phv_summary ·
 *   strengths[]{title,evidence} · areas_to_improve[]{title,evidence,priority} ·
 *   comparable_pro · next_4_weeks_focus · honesty_note
 *
 * MOAT (lo que el renderer genérico dejaba caer y aquí se destaca):
 *   - phv_summary  → maduración biológica PHV, el diferenciador único de VITAS
 *   - honesty_note → matiz realista sobre edad/desarrollo, la honestidad del producto
 *
 * Todos los campos son opcionales (el reporte puede venir parcial o de
 * fallback) — se guardan con ?? y condicionales. Las etiquetas fijas van por
 * i18n (namespace playerReport); los VALORES del reporte se pintan tal cual
 * (ya vienen en español del agente).
 */

import { useTranslation } from "react-i18next";
import {
  Sprout, Trophy, Target, Lightbulb, ShieldCheck, Users, Gauge,
} from "lucide-react";

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
interface Strength {
  title?: string;
  evidence?: string;
}

type Priority = "high" | "medium" | "low" | string;

interface Area {
  title?: string;
  evidence?: string;
  priority?: Priority;
}

// tier → color semántico (el value del tier viene como enum del agente)
const TIER_META: Record<string, string> = {
  elite: "bg-green-500/10 border-green-500/30 text-green-400",
  pro: "bg-electric/10 border-electric/30 text-electric",
  talent: "bg-primary/10 border-primary/30 text-primary",
  develop: "bg-amber-500/10 border-amber-500/30 text-amber-400",
};

// priority → chip color semántico
const PRIORITY_META: Record<string, string> = {
  high: "bg-red-500/10 border-red-500/30 text-red-400",
  medium: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  low: "bg-secondary/30 border-border text-muted-foreground",
};

export default function PlayerReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  const title = (report.title as string | undefined) ?? undefined;
  const vsiScore = (report.vsi_score as number | undefined) ?? undefined;
  const tier = (report.tier as string | undefined) ?? undefined;
  const tierLabel = (report.tier_label as string | undefined) ?? undefined;
  const executiveSummary = (report.executive_summary as string | undefined) ?? undefined;
  const phvSummary = (report.phv_summary as string | undefined) ?? undefined;
  const strengths = (report.strengths as Array<Strength | string> | undefined) ?? [];
  const areas = (report.areas_to_improve as Array<Area | string> | undefined) ?? [];
  const comparablePro = (report.comparable_pro as string | undefined) ?? undefined;
  const nextFocus = (report.next_4_weeks_focus as string | undefined) ?? undefined;
  const honestyNote = (report.honesty_note as string | undefined) ?? undefined;

  const hasScore = typeof vsiScore === "number" || !!tierLabel || !!tier;

  const isEmpty =
    !title &&
    !hasScore &&
    !executiveSummary &&
    !phvSummary &&
    strengths.length === 0 &&
    areas.length === 0 &&
    !comparablePro &&
    !nextFocus &&
    !honestyNote;

  if (isEmpty) {
    return <p className="text-xs text-muted-foreground italic">{t("playerReport.noContent")}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Título del reporte */}
      {title && <h4 className="font-display font-bold text-sm text-foreground">{title}</h4>}

      {/* Resumen ejecutivo · moat comercial: el párrafo ancla para la familia */}
      {executiveSummary && (
        <div className="glass rounded-xl p-4 bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border border-primary/20">
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge size={13} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              {t("playerReport.summary")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{executiveSummary}</p>
        </div>
      )}

      {/* VSI score + tier · compacto (el dashboard ya pinta el header grande) */}
      {hasScore && (
        <div className="flex items-center gap-2 rounded-xl bg-secondary/30 border border-border p-3">
          {typeof vsiScore === "number" && (
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                {t("playerReport.vsiScore")}
              </span>
              <span className="font-display font-bold text-lg text-foreground leading-none">{vsiScore}</span>
            </div>
          )}
          {(tierLabel || tier) && (
            <span
              className={`ml-auto shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] uppercase tracking-wider font-bold ${
                (tier && TIER_META[tier]) || "bg-secondary/30 border-border text-muted-foreground"
              }`}
            >
              {tierLabel ?? tier}
            </span>
          )}
        </div>
      )}

      {/* PHV summary · MOAT: maduración biológica, el diferenciador único de VITAS */}
      {phvSummary && (
        <div className="rounded-xl p-4 bg-gradient-to-br from-electric/10 via-primary/5 to-transparent border border-electric/30">
          <div className="flex items-center gap-1.5 mb-2">
            <Sprout size={14} className="text-electric" />
            <span className="text-[10px] uppercase tracking-wider text-electric font-bold">
              {t("playerReport.phvTitle")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{phvSummary}</p>
        </div>
      )}

      {/* Fortalezas · title + evidence con dato */}
      {strengths.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy size={13} className="text-green-400" />
            <h5 className="font-display font-bold text-xs text-green-400">{t("playerReport.strengths")}</h5>
          </div>
          <div className="space-y-1.5">
            {strengths.map((s, i) => {
              const item = typeof s === "string" ? { title: s } : s;
              return (
                <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                  <span className="font-semibold text-xs text-foreground">{item.title ?? "—"}</span>
                  {item.evidence && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{item.evidence}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Áreas de mejora · chip de prioridad con color semántico (sin endulzar) */}
      {areas.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={13} className="text-amber-400" />
            <h5 className="font-display font-bold text-xs text-amber-400">{t("playerReport.areasToImprove")}</h5>
          </div>
          <div className="space-y-1.5">
            {areas.map((a, i) => {
              const item = typeof a === "string" ? { title: a } : a;
              const prioChip = (item.priority && PRIORITY_META[item.priority]) || PRIORITY_META.low;
              const prioLabel = item.priority
                ? t(`playerReport.priority.${item.priority}`, { defaultValue: item.priority })
                : null;
              return (
                <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-xs text-foreground truncate">{item.title ?? "—"}</span>
                    {prioLabel && (
                      <span
                        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] uppercase tracking-wider font-bold ${prioChip}`}
                      >
                        {prioLabel}
                      </span>
                    )}
                  </div>
                  {item.evidence && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{item.evidence}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Comparable profesional · solo si similarity disponible */}
      {comparablePro && (
        <div className="rounded-xl bg-secondary/30 border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={13} className="text-electric" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              {t("playerReport.comparablePro")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{comparablePro}</p>
        </div>
      )}

      {/* Foco · próximas 4 semanas · la recomendación accionable */}
      {nextFocus && (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb size={13} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              {t("playerReport.nextFocus")}
            </span>
          </div>
          <p className="text-xs text-foreground font-semibold leading-relaxed">{nextFocus}</p>
        </div>
      )}

      {/* Nota de honestidad · MOAT: matiz realista sobre edad y desarrollo */}
      {honestyNote && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ShieldCheck size={13} className="text-amber-400" />
            <h5 className="font-display font-bold text-xs text-amber-400">{t("playerReport.honestyTitle")}</h5>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">{honestyNote}</p>
        </div>
      )}
    </div>
  );
}
