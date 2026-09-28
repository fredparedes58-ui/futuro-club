/**
 * VITAS · ReportConfidenceChip (FASE 4 · report pipeline)
 *
 * Muestra la confianza que el agente YA emite (confidence_score/data_completeness/
 * not_evaluated, o overallConfidence 0-1) — antes existía en el código pero la UI
 * no la pintaba. Diferenciador VITAS: mostrar incertidumbre, no vender scores como
 * verdades absolutas. Se renderiza SOLO si el reporte trae confianza (fail-safe).
 */
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { IdentityCaveatContext } from "@/components/analysis/reports/identityCaveatContext";

interface Props {
  report: Record<string, unknown>;
  /**
   * Multiplicador 0..1 por identidad del jugador NO verificada por una persona
   * (src/lib/reports/analysisIdentity.ts · identidad.md: identidad por debajo del
   * umbral ⇒ confianza reducida en lo derivado + la UI lo indica). Omitido ⇒ el del
   * IdentityCaveatContext del análisis (AnalysisDashboard); sin contexto ⇒ 1.
   */
  identityFactor?: number;
}

export default function ReportConfidenceChip({ report, identityFactor }: Props) {
  const { t } = useTranslation();
  const identityCaveat = useContext(IdentityCaveatContext);
  if (!report) return null;
  const factorInput = identityFactor ?? identityCaveat?.confidenceFactor;

  // Acepta confidence_score (0-100) o overallConfidence (0-1)
  const raw =
    typeof report.confidence_score === "number"
      ? (report.confidence_score as number)
      : typeof report.overallConfidence === "number"
        ? (report.overallConfidence as number) * 100
        : undefined;
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;

  const factor =
    typeof factorInput === "number" && Number.isFinite(factorInput)
      ? Math.max(0, Math.min(1, factorInput))
      : 1;
  const reduced = factor < 1;
  const score = Math.max(0, Math.min(100, Math.round(raw * factor)));
  const completeness =
    typeof report.data_completeness === "number" ? Math.round(report.data_completeness as number) : undefined;
  const notEval = Array.isArray(report.not_evaluated) ? (report.not_evaluated as string[]) : [];

  const { Icon, color } =
    score >= 75 ? { Icon: ShieldCheck, color: "#22c55e" }
    : score >= 50 ? { Icon: ShieldAlert, color: "#f59e0b" }
    : { Icon: ShieldX, color: "#ef4444" };

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-[11px]"
      title={notEval.length ? `${t("reportConfidence.notEvaluated")}: ${notEval.join(", ")}` : undefined}
    >
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-semibold"
        style={{ backgroundColor: `${color}1e`, color }}
        data-testid="report-confidence-score"
      >
        <Icon size={12} /> {t("reportConfidence.label")} {score}%
      </span>
      {reduced && (
        <span className="text-amber-600" data-testid="report-confidence-identity-reduced">
          {t("reportConfidence.reducedByIdentity")}
        </span>
      )}
      {completeness != null && (
        <span className="text-muted-foreground">{t("reportConfidence.completeness", { pct: completeness })}</span>
      )}
      {notEval.length > 0 && (
        <span className="text-muted-foreground">· {t("reportConfidence.notEvaluatedShort", { count: notEval.length })}</span>
      )}
    </div>
  );
}
