/**
 * VITAS · TeamReportView
 *
 * Renderer dedicado para el reporte `team-report` (agente team-report) de un
 * partido "Local vs Visitante". Pinta los campos del reporte:
 *   executive_summary · tactical_overview{home,away} · key_battles[] ·
 *   momentum_shifts[] · recommendations{home,away} · overall_rating{home,away}
 *
 * Todos los campos son opcionales (el reporte puede venir parcial o de
 * fallback) — se leen con guards de tipo estrictos. Las etiquetas fijas van por
 * i18n (namespace teamReport); los VALORES del reporte se pintan tal cual (ya
 * vienen del agente). La confianza la pinta ReportConfidenceChip, no se repinta.
 */

import { useTranslation } from "react-i18next";
import { Swords, Users, Gauge, Flame, Activity, Lightbulb } from "lucide-react";
import ReportConfidenceChip from "@/components/analysis/reports/ReportConfidenceChip";

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
interface TacticalTeam {
  style: string;
  strengths: string[];
  weaknesses: string[];
}

// ── helpers de guard estrictos ──────────────────────────────────────────────
const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : [];

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

const readTacticalTeam = (v: unknown): TacticalTeam => {
  const o = asObject(v);
  return {
    style: asString(o.style),
    strengths: asStringArray(o.strengths),
    weaknesses: asStringArray(o.weaknesses),
  };
};

export default function TeamReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  const executiveSummary = asString(report.executive_summary);

  const tactical = asObject(report.tactical_overview);
  const tacticalHome = readTacticalTeam(tactical.home);
  const tacticalAway = readTacticalTeam(tactical.away);

  const keyBattles = asStringArray(report.key_battles);
  const momentumShifts = asStringArray(report.momentum_shifts);

  const recommendations = asObject(report.recommendations);
  const recsHome = asStringArray(recommendations.home);
  const recsAway = asStringArray(recommendations.away);

  const rating = asObject(report.overall_rating);
  const ratingHome = typeof rating.home === "number" ? rating.home : undefined;
  const ratingAway = typeof rating.away === "number" ? rating.away : undefined;

  const hasTactical = !!(
    tacticalHome.style ||
    tacticalHome.strengths.length ||
    tacticalHome.weaknesses.length ||
    tacticalAway.style ||
    tacticalAway.strengths.length ||
    tacticalAway.weaknesses.length
  );
  const hasRecs = recsHome.length > 0 || recsAway.length > 0;
  const hasRating = ratingHome != null || ratingAway != null;

  const isEmpty =
    !executiveSummary &&
    !hasTactical &&
    keyBattles.length === 0 &&
    momentumShifts.length === 0 &&
    !hasRecs &&
    !hasRating;

  const ratingTotal = (ratingHome ?? 0) + (ratingAway ?? 0);
  const showRatingBar = ratingHome != null && ratingAway != null && ratingTotal > 0;

  const tacticalColumns = [
    { label: t("teamReport.home"), data: tacticalHome },
    { label: t("teamReport.away"), data: tacticalAway },
  ];
  const recsColumns = [
    { label: t("teamReport.home"), items: recsHome },
    { label: t("teamReport.away"), items: recsAway },
  ];

  return (
    <div className="space-y-4">
      <ReportConfidenceChip report={report} />

      {isEmpty ? (
        <p className="text-xs text-muted-foreground italic">{t("teamReport.noContent")}</p>
      ) : (
        <>
          {/* Resumen ejecutivo · card destacada del partido */}
          {executiveSummary && (
            <div className="glass rounded-xl p-4 bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border border-primary/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Swords size={13} className="text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                  {t("teamReport.executiveSummary")}
                </span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{executiveSummary}</p>
            </div>
          )}

          {/* Valoración global · dos notas enfrentadas */}
          {hasRating && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Gauge size={13} className="text-primary" />
                <h5 className="font-display font-bold text-xs text-primary">{t("teamReport.overallRating")}</h5>
              </div>
              <div className="rounded-xl bg-secondary/30 border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                      {t("teamReport.home")}
                    </div>
                    <div className="font-display font-bold text-2xl text-primary">{ratingHome ?? "—"}</div>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    {t("teamReport.vs")}
                  </span>
                  <div className="flex-1 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                      {t("teamReport.away")}
                    </div>
                    <div className="font-display font-bold text-2xl text-electric">{ratingAway ?? "—"}</div>
                  </div>
                </div>
                {showRatingBar && (
                  <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-secondary/50">
                    <div className="bg-primary" style={{ width: `${((ratingHome ?? 0) / ratingTotal) * 100}%` }} />
                    <div className="bg-electric" style={{ width: `${((ratingAway ?? 0) / ratingTotal) * 100}%` }} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Visión táctica · dos columnas Local / Visitante */}
          {hasTactical && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={13} className="text-primary" />
                <h5 className="font-display font-bold text-xs text-primary">{t("teamReport.tacticalOverview")}</h5>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tacticalColumns.map((col, i) => {
                  const hasCol = col.data.style || col.data.strengths.length || col.data.weaknesses.length;
                  return (
                    <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-primary font-bold">{col.label}</div>
                      {!hasCol && <p className="text-[11px] text-muted-foreground">—</p>}
                      {col.data.style && (
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">
                            {t("teamReport.style")}
                          </div>
                          <p className="text-[11px] text-foreground leading-relaxed">{col.data.style}</p>
                        </div>
                      )}
                      {col.data.strengths.length > 0 && (
                        <Section heading={t("teamReport.strengths")} color="text-green-400">
                          {col.data.strengths.map((s, j) => (
                            <li key={j}>{s}</li>
                          ))}
                        </Section>
                      )}
                      {col.data.weaknesses.length > 0 && (
                        <Section heading={t("teamReport.weaknesses")} color="text-amber-400">
                          {col.data.weaknesses.map((w, j) => (
                            <li key={j}>{w}</li>
                          ))}
                        </Section>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Duelos clave */}
          {keyBattles.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Flame size={13} className="text-electric" />
                <h5 className="font-display font-bold text-xs text-electric">{t("teamReport.keyBattles")}</h5>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
                {keyBattles.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cambios de momentum */}
          {momentumShifts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity size={13} className="text-primary" />
                <h5 className="font-display font-bold text-xs text-primary">{t("teamReport.momentumShifts")}</h5>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
                {momentumShifts.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recomendaciones · dos columnas Local / Visitante */}
          {hasRecs && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb size={13} className="text-electric" />
                <h5 className="font-display font-bold text-xs text-electric">{t("teamReport.recommendations")}</h5>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recsColumns.map((col, i) => (
                  <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                    <div className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1.5">{col.label}</div>
                    {col.items.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-foreground">
                        {col.items.map((r, j) => (
                          <li key={j}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">—</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
