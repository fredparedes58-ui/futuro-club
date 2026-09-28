/**
 * VITAS · AnalysisIdentityBadge — advertencia determinista de identidad del jugador
 *
 * Se pinta en la vista de un análisis por jugador, SIN scroll (identidad.md). Deriva
 * SOLO de lo guardado en `analyses.biomechanics` (resolveAnalysisIdentity): qué dorsal
 * y color dice Gemini haber visto y con qué confianza declarada. Es una estimación de
 * IA no validada con ground truth humano → siempre se avisa, y la confianza de lo
 * derivado se reduce (ReportConfidenceChip vía IdentityCaveatContext).
 *
 * Identidad solo por dorsal + color de equipación: aquí no hay, ni puede haber, nada
 * basado en la cara.
 */
import { useTranslation } from "react-i18next";
import { ScanLine, UserRound, ShieldQuestion } from "lucide-react";
import type { AnalysisIdentityCaveat } from "@/lib/reports/analysisIdentity";
import { findKitColor } from "@/lib/shared/playerReference";

interface Props {
  caveat: AnalysisIdentityCaveat;
}

export default function AnalysisIdentityBadge({ caveat }: Props) {
  const { t } = useTranslation();

  const colorLabel = (() => {
    if (!caveat.color) return null;
    const known = findKitColor(caveat.color);
    return known ? t(`playerReference.colors.${known.key}`) : caveat.color;
  })();
  const confidencePart = caveat.confidence
    ? t("analysisIdentity.confidence", { level: t(`analysisIdentity.level.${caveat.confidence}`) })
    : null;

  let Icon = ShieldQuestion;
  let headline: string;
  let detail: string;
  if (caveat.kind === "dorsal_llm") {
    Icon = ScanLine;
    const parts = [
      caveat.dorsal ? t("analysisIdentity.dorsal", { value: caveat.dorsal }) : null,
      colorLabel ? t("analysisIdentity.kitColor", { value: colorLabel }) : null,
      confidencePart,
    ].filter((p): p is string => !!p);
    headline = parts.length > 0
      ? `${t("analysisIdentity.estimatedByAi")}: ${parts.join(" · ")}`
      : t("analysisIdentity.estimatedByAi");
    detail = t("analysisIdentity.estimatedDetail");
  } else if (caveat.kind === "single_player") {
    Icon = UserRound;
    headline = t("analysisIdentity.singlePlayer");
    detail = t("analysisIdentity.singlePlayerDetail");
  } else {
    headline = t("analysisIdentity.unverified");
    detail = t("analysisIdentity.unverifiedDetail");
  }

  return (
    <div
      role="note"
      data-testid="analysis-identity-badge"
      data-kind={caveat.kind}
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 break-inside-avoid"
    >
      <div className="flex items-start gap-1.5 font-semibold">
        <Icon size={13} className="shrink-0 mt-px" aria-hidden />
        <span>{headline}</span>
      </div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-amber-700/80">{detail}</p>
    </div>
  );
}
