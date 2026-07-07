/**
 * VITAS · ReportConfidenceChip (FASE 4 · report pipeline)
 *
 * Muestra la confianza que el agente YA emite (confidence_score/data_completeness/
 * not_evaluated, o overallConfidence 0-1) — antes existía en el código pero la UI
 * no la pintaba. Diferenciador VITAS: mostrar incertidumbre, no vender scores como
 * verdades absolutas. Se renderiza SOLO si el reporte trae confianza (fail-safe).
 */
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

interface Props {
  report: Record<string, unknown>;
}

export default function ReportConfidenceChip({ report }: Props) {
  const { t } = useTranslation();
  if (!report) return null;

  // Acepta confidence_score (0-100) o overallConfidence (0-1)
  const raw =
    typeof report.confidence_score === "number"
      ? (report.confidence_score as number)
      : typeof report.overallConfidence === "number"
        ? (report.overallConfidence as number) * 100
        : undefined;
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
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
      >
        <Icon size={12} /> {t("reportConfidence.label")} {score}%
      </span>
      {completeness != null && (
        <span className="text-muted-foreground">{t("reportConfidence.completeness", { pct: completeness })}</span>
      )}
      {notEval.length > 0 && (
        <span className="text-muted-foreground">· {t("reportConfidence.notEvaluatedShort", { count: notEval.length })}</span>
      )}
    </div>
  );
}
