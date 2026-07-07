/**
 * VITAS · BurnoutReportView
 *
 * Renderer dedicado para el reporte `burnout-report` (agente de riesgo de
 * abandono / bienestar). Pinta la estructura del prompt:
 *   headline (+ badge escalación) · summary · primaryConcern ·
 *   positiveSignals[] · interventionPlan · loadAdjustment · followUpDate
 *
 * Todos los campos son opcionales (el reporte puede venir parcial o de
 * fallback) — se leen con guards de tipo. Las etiquetas fijas van por i18n
 * (namespace burnoutReport); los VALORES del reporte se pintan tal cual
 * (ya vienen en español del agente). La confianza la pinta ReportConfidenceChip.
 */

import { useTranslation } from "react-i18next";
import { HeartPulse, ShieldAlert, AlertTriangle, Sparkles, ClipboardList, Activity, CalendarClock } from "lucide-react";
import ReportConfidenceChip from "@/components/analysis/reports/ReportConfidenceChip";

export default function BurnoutReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  const headline = typeof report.headline === "string" ? report.headline : "";
  const summary = typeof report.summary === "string" ? report.summary : "";
  const primaryConcern = typeof report.primaryConcern === "string" ? report.primaryConcern : "";
  const positiveSignals = Array.isArray(report.positiveSignals)
    ? (report.positiveSignals as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const interventionPlan = typeof report.interventionPlan === "string" ? report.interventionPlan : "";
  const loadAdjustment = typeof report.loadAdjustment === "string" ? report.loadAdjustment : "";
  const followUpDate = typeof report.followUpDate === "string" ? report.followUpDate : "";
  const escalationNeeded = report.escalationNeeded === true;

  const isEmpty =
    !headline &&
    !summary &&
    !primaryConcern &&
    positiveSignals.length === 0 &&
    !interventionPlan &&
    !loadAdjustment &&
    !followUpDate;

  if (isEmpty) {
    return <p className="text-xs text-muted-foreground italic">{t("burnoutReport.noContent")}</p>;
  }

  return (
    <div className="space-y-4">
      <ReportConfidenceChip report={report} />

      {/* Titular · tono de alerta si hay escalación */}
      {(headline || escalationNeeded) && (
        <div
          className={`glass rounded-xl p-4 border ${
            escalationNeeded
              ? "bg-gradient-to-br from-rose-500/15 via-red-500/5 to-transparent border-rose-500/30"
              : "bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border-primary/20"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <HeartPulse size={13} className={escalationNeeded ? "text-rose-400" : "text-primary"} />
            <span
              className={`text-[10px] uppercase tracking-wider font-bold ${
                escalationNeeded ? "text-rose-400" : "text-primary"
              }`}
            >
              {t("burnoutReport.title")}
            </span>
          </div>
          {headline && (
            <p className="text-xs text-foreground font-semibold leading-relaxed">{headline}</p>
          )}
          {escalationNeeded && (
            <span className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/15 text-rose-400 text-[9px] uppercase tracking-wider font-bold">
              <ShieldAlert size={10} />
              {t("burnoutReport.escalation")}
            </span>
          )}
        </div>
      )}

      {/* Situación global */}
      {summary && (
        <div className="rounded-xl bg-secondary/30 border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
            {t("burnoutReport.summary")}
          </div>
          <p className="text-xs text-foreground leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Preocupación principal */}
      {primaryConcern && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={13} className="text-amber-400" />
            <h5 className="font-display font-bold text-xs text-amber-400">{t("burnoutReport.primaryConcern")}</h5>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{primaryConcern}</p>
        </div>
      )}

      {/* Señales positivas · card verde */}
      {positiveSignals.length > 0 && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={13} className="text-green-400" />
            <h5 className="font-display font-bold text-xs text-green-400">{t("burnoutReport.positiveSignals")}</h5>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
            {positiveSignals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Plan de intervención · 2 semanas */}
      {interventionPlan && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardList size={13} className="text-primary" />
            <h5 className="font-display font-bold text-xs text-primary">{t("burnoutReport.interventionPlan")}</h5>
          </div>
          <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
            <p className="text-xs text-foreground leading-relaxed">{interventionPlan}</p>
          </div>
        </section>
      )}

      {/* Ajuste de carga + próxima revisión */}
      {(loadAdjustment || followUpDate) && (
        <div className="grid gap-2">
          {loadAdjustment && (
            <div className="rounded-xl bg-secondary/30 border border-border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={12} className="text-electric" />
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                  {t("burnoutReport.loadAdjustment")}
                </div>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{loadAdjustment}</p>
            </div>
          )}
          {followUpDate && (
            <div className="rounded-xl bg-secondary/30 border border-border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarClock size={12} className="text-electric" />
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                  {t("burnoutReport.followUp")}
                </div>
              </div>
              <p className="text-xs text-foreground font-semibold leading-relaxed">{followUpDate}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
