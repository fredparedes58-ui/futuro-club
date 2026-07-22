/**
 * VITAS · Injury Risk Report View
 *
 * Renderer dedicado para report_type="injury-risk-report" (agente
 * api/agents/_injury-risk-report.ts). Pinta la ESTRUCTURA OBLIGATORIA del
 * agente de forma jerárquica y legible:
 *   - evaluacionGeneral (string)
 *   - nivelRiesgo (bajo | moderado | alto | critico)
 *   - factoresRiesgo [{ factor, severidad (baja|media|alta), descripcion }]
 *   - recomendacionesCarga (string[])
 *   - alertaPHV (string | null)  ← moat PHV-aware (ventana de crecimiento)
 *   - protocoloPrevencion (string[])
 *   - seguimiento (string)
 *
 * Todos los campos son opcionales (el reporte puede venir parcial o de
 * fallback), por eso se guardan con ?? y condicionales.
 */

import { useTranslation } from "react-i18next";
import { HeartPulse, ShieldAlert, Activity, Dumbbell, CalendarClock } from "lucide-react";

// ─── Tipos del schema del agente ────────────────────────────────────────────

interface RiskFactor {
  factor?: string;
  severidad?: string;
  descripcion?: string;
}

// ─── Mapeos semánticos de color ─────────────────────────────────────────────

/** Nivel de riesgo global → clases de color del chip destacado. */
const RISK_LEVEL_STYLE: Record<string, string> = {
  bajo:        "text-green-400 bg-green-500/10 border-green-500/30",
  moderado:    "text-amber-400 bg-amber-500/10 border-amber-500/30",
  alto:        "text-orange-400 bg-orange-500/10 border-orange-500/30",
  critico:     "text-red-400 bg-red-500/10 border-red-500/30",
  desconocido: "text-muted-foreground bg-secondary/40 border-border",
};

/** Severidad por factor → clases de color del chip pequeño. */
const SEVERITY_STYLE: Record<string, string> = {
  baja:  "text-green-400 bg-green-500/10 border-green-500/30",
  media: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  alta:  "text-red-400 bg-red-500/10 border-red-500/30",
};

/** Section local · replica el patrón de AnalysisDashboard para evitar ciclos de import. */
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
      <h5 className={`font-display font-bold text-xs ${color} mb-1.5 flex items-center gap-1.5`}>
        {Icon && <Icon size={12} />}
        {heading}
      </h5>
      <ul className="list-disc list-inside space-y-1 text-xs text-foreground">{children}</ul>
    </section>
  );
}

export default function InjuryReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  if (!report || Object.keys(report).length === 0) {
    return <p className="text-xs text-muted-foreground italic">{t("injuryReport.noContent")}</p>;
  }

  const isFallback = report._fallback === true;

  const evaluacionGeneral = report.evaluacionGeneral as string | undefined;
  const nivelRiesgoRaw = (report.nivelRiesgo as string | undefined)?.toLowerCase().trim();
  const factoresRiesgo = Array.isArray(report.factoresRiesgo)
    ? (report.factoresRiesgo as RiskFactor[])
    : [];
  const recomendacionesCarga = Array.isArray(report.recomendacionesCarga)
    ? (report.recomendacionesCarga as string[])
    : [];
  const alertaPHV = report.alertaPHV as string | null | undefined;
  const protocoloPrevencion = Array.isArray(report.protocoloPrevencion)
    ? (report.protocoloPrevencion as string[])
    : [];
  const seguimiento = report.seguimiento as string | undefined;

  const riskStyle = (nivelRiesgoRaw && RISK_LEVEL_STYLE[nivelRiesgoRaw]) ?? RISK_LEVEL_STYLE.desconocido;
  const riskLabel = nivelRiesgoRaw
    ? t(`injuryReport.riskLevels.${nivelRiesgoRaw}`, nivelRiesgoRaw)
    : t("injuryReport.riskLevels.desconocido");

  return (
    <div className="space-y-4">
      {isFallback && (
        <p className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          ⚠ {t("injuryReport.fallbackNotice")}
        </p>
      )}

      {/* Nivel de riesgo global · chip destacado */}
      {nivelRiesgoRaw && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 border border-border p-3">
          <div className="flex items-center gap-2">
            <HeartPulse size={16} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              {t("injuryReport.riskLevel")}
            </span>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-display font-bold uppercase tracking-wide border ${riskStyle}`}
          >
            {riskLabel}
          </span>
        </div>
      )}

      {/* Evaluación general */}
      {evaluacionGeneral && (
        <div>
          <h5 className="font-display font-bold text-xs text-foreground mb-1.5">
            {t("injuryReport.generalAssessment")}
          </h5>
          <p className="text-xs text-foreground leading-relaxed">{evaluacionGeneral}</p>
        </div>
      )}

      {/* Alerta PHV · moat (ventana de crecimiento, riesgo óseo/apofisitis) */}
      {alertaPHV && (
        <div className="rounded-xl bg-electric/10 border border-electric/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-electric font-bold mb-1.5">
            <ShieldAlert size={13} />
            {t("injuryReport.phvAlert")}
          </div>
          <p className="text-xs text-foreground leading-relaxed">{alertaPHV}</p>
        </div>
      )}

      {/* Factores de riesgo · tarjetas con chip de severidad */}
      {factoresRiesgo.length > 0 && (
        <div>
          <h5 className="font-display font-bold text-xs text-amber-400 mb-2 flex items-center gap-1.5">
            <Activity size={12} />
            {t("injuryReport.riskFactors")}
          </h5>
          <div className="grid gap-2">
            {factoresRiesgo.map((f, i) => {
              const sevRaw = f.severidad?.toLowerCase().trim();
              const sevStyle = (sevRaw && SEVERITY_STYLE[sevRaw]) ?? "text-muted-foreground bg-secondary/40 border-border";
              const sevLabel = sevRaw ? t(`injuryReport.severity.${sevRaw}`, sevRaw) : null;
              return (
                <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-xs text-foreground">{f.factor ?? "—"}</span>
                    {sevLabel && (
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${sevStyle}`}
                      >
                        {sevLabel}
                      </span>
                    )}
                  </div>
                  {f.descripcion && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                      {f.descripcion}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recomendaciones de carga */}
      {recomendacionesCarga.length > 0 && (
        <Section heading={t("injuryReport.loadRecommendations")} color="text-electric" Icon={Dumbbell}>
          {recomendacionesCarga.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </Section>
      )}

      {/* Protocolo de prevención */}
      {protocoloPrevencion.length > 0 && (
        <Section heading={t("injuryReport.preventionProtocol")} color="text-green-400" Icon={ShieldAlert}>
          {protocoloPrevencion.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </Section>
      )}

      {/* Seguimiento */}
      {seguimiento && (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary font-bold mb-1">
            <CalendarClock size={13} />
            {t("injuryReport.followUp")}
          </div>
          <p className="text-xs text-foreground leading-relaxed">{seguimiento}</p>
        </div>
      )}

      {/* Fallback duro · nada renderizable */}
      {!evaluacionGeneral &&
        !nivelRiesgoRaw &&
        factoresRiesgo.length === 0 &&
        recomendacionesCarga.length === 0 &&
        !alertaPHV &&
        protocoloPrevencion.length === 0 &&
        !seguimiento && (
          <pre className="bg-secondary/30 rounded-xl p-3 text-[10px] overflow-x-auto whitespace-pre-wrap text-muted-foreground font-mono">
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
    </div>
  );
}
