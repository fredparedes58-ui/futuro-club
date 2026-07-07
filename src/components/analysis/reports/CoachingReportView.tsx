/**
 * VITAS · CoachingReportView
 *
 * Renderer dedicado para el reporte `coaching-assistant` (agente
 * api/agents/_coaching-assistant.ts). Pinta la ESTRUCTURA del prompt:
 *   sessionSummary · whatWorkedWell[] · whatToImprove[] ·
 *   nextSessionPlan{focus,drills[],duration} · weeklyPlan ·
 *   playerSpotlight[]{playerId,reason,action} · phvAlerts[]|null
 *
 * Todos los campos son opcionales (el reporte puede venir parcial o de
 * fallback) — se leen con guards de tipo. Las etiquetas fijas van por i18n
 * (namespace coachingReport); los VALORES del reporte se pintan tal cual (ya
 * vienen en español del agente). Las alertas PHV son el diferenciador VITAS y
 * se resaltan en una card ámbar/eléctrica.
 */

import { useTranslation } from "react-i18next";
import {
  ClipboardList,
  Target,
  Clock,
  CalendarDays,
  Star,
  User,
  AlertTriangle,
} from "lucide-react";
import ReportConfidenceChip from "@/components/analysis/reports/ReportConfidenceChip";

// ── mini <Section> local · replica el patrón de ValuationReportView sin crear
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

// ── helpers de guardas de tipo (schema laxo · todo opcional) ─────────────────
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

export default function CoachingReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  const sessionSummary = typeof report.sessionSummary === "string" ? report.sessionSummary : "";
  const whatWorkedWell = asStringArray(report.whatWorkedWell);
  const whatToImprove = asStringArray(report.whatToImprove);

  const nextSessionPlan = asObject(report.nextSessionPlan);
  const nextFocus = typeof nextSessionPlan.focus === "string" ? nextSessionPlan.focus : "";
  const nextDrills = asStringArray(nextSessionPlan.drills);
  const nextDuration = typeof nextSessionPlan.duration === "string" ? nextSessionPlan.duration : "";
  const hasNextSession = !!(nextFocus || nextDrills.length > 0 || nextDuration);

  const weeklyPlan = typeof report.weeklyPlan === "string" ? report.weeklyPlan : "";

  const spotlight = (Array.isArray(report.playerSpotlight) ? report.playerSpotlight : [])
    .map(asObject)
    .map((s) => ({
      playerId: typeof s.playerId === "string" ? s.playerId : "",
      reason: typeof s.reason === "string" ? s.reason : "",
      action: typeof s.action === "string" ? s.action : "",
    }))
    .filter((s) => s.playerId || s.reason || s.action);

  const phvAlerts = asStringArray(report.phvAlerts);

  const isEmpty =
    !sessionSummary &&
    whatWorkedWell.length === 0 &&
    whatToImprove.length === 0 &&
    !hasNextSession &&
    !weeklyPlan &&
    spotlight.length === 0 &&
    phvAlerts.length === 0;

  if (isEmpty) {
    return <p className="text-xs text-muted-foreground italic">{t("coachingReport.noContent")}</p>;
  }

  return (
    <div className="space-y-4">
      <ReportConfidenceChip report={report} />

      {/* Resumen de la sesión */}
      {sessionSummary && (
        <div className="glass rounded-xl p-4 bg-gradient-to-br from-emerald-500/10 via-primary/5 to-transparent border border-emerald-500/20">
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardList size={13} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
              {t("coachingReport.summary")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{sessionSummary}</p>
        </div>
      )}

      {/* Lo que funcionó / a mejorar · 2 columnas */}
      {(whatWorkedWell.length > 0 || whatToImprove.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {whatWorkedWell.length > 0 && (
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
              <Section heading={t("coachingReport.whatWorkedWell")} color="text-emerald-400">
                {whatWorkedWell.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </Section>
            </div>
          )}
          {whatToImprove.length > 0 && (
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
              <Section heading={t("coachingReport.whatToImprove")} color="text-amber-400">
                {whatToImprove.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </Section>
            </div>
          )}
        </div>
      )}

      {/* Plan próxima sesión */}
      {hasNextSession && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={13} className="text-primary" />
            <h5 className="font-display font-bold text-xs text-primary">{t("coachingReport.nextSession")}</h5>
          </div>
          <div className="rounded-xl bg-secondary/30 border border-border p-3 space-y-2.5">
            {nextFocus && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                  {t("coachingReport.focus")}
                </div>
                <p className="text-xs text-foreground leading-relaxed">{nextFocus}</p>
              </div>
            )}
            {nextDuration && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[9px] uppercase tracking-wider font-bold">
                <Clock size={10} />
                {nextDuration}
              </span>
            )}
            {nextDrills.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                  {t("coachingReport.drills")}
                </div>
                <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
                  {nextDrills.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Plan semanal */}
      {weeklyPlan && (
        <div className="rounded-xl bg-secondary/30 border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CalendarDays size={13} className="text-muted-foreground" />
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              {t("coachingReport.weeklyPlan")}
            </div>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{weeklyPlan}</p>
        </div>
      )}

      {/* Spotlight de jugadores */}
      {spotlight.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Star size={13} className="text-electric" />
            <h5 className="font-display font-bold text-xs text-electric">{t("coachingReport.spotlight")}</h5>
          </div>
          <div className="grid gap-2">
            {spotlight.map((s, i) => (
              <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <User size={12} className="text-electric shrink-0" />
                  <span className="font-display font-bold text-xs text-foreground truncate">
                    {s.playerId || t("coachingReport.player")}
                  </span>
                </div>
                {s.reason && <p className="text-[11px] text-muted-foreground leading-relaxed">{s.reason}</p>}
                {s.action && (
                  <div className="mt-1.5 flex items-start gap-1.5">
                    <span className="shrink-0 mt-px text-[9px] uppercase tracking-wider text-electric font-bold">
                      {t("coachingReport.action")}
                    </span>
                    <span className="text-[11px] text-foreground leading-relaxed">{s.action}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alertas PHV · diferenciador VITAS · card ámbar/eléctrica */}
      {phvAlerts.length > 0 && (
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 via-electric/5 to-transparent border border-amber-500/30 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={13} className="text-amber-400" />
            <h5 className="font-display font-bold text-xs text-amber-400">{t("coachingReport.phvAlerts")}</h5>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
            {phvAlerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
