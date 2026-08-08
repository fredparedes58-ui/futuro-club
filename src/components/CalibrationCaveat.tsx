/**
 * VITAS · CalibrationCaveat
 *
 * Aviso honesto reutilizable: cuando el campo NO está calibrado de forma fiable,
 * las métricas físicas en metros (velocidad, distancia, sprints, zonas) son
 * píxeles disfrazados → orientativas, no medidas. Se muestra SIEMPRE que
 * metricsTrustworthy(calibrationConfidence) sea false.
 *
 * Fail-closed: sin prop → "none" → se muestra (mejor avisar de más que mentir).
 * Cuando el gate de calibración (T1-T3) pase a fiable, el aviso desaparece solo.
 */
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { metricsTrustworthy, type CalibrationConfidence } from "@/lib/yolo/fieldRegistration";

interface Props {
  calibrationConfidence?: CalibrationConfidence;
  className?: string;
}

export default function CalibrationCaveat({ calibrationConfidence = "none", className = "" }: Props) {
  const { t } = useTranslation();
  if (metricsTrustworthy(calibrationConfidence)) return null;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 ${className}`}
      role="note"
    >
      <FlaskConical size={12} className="text-amber-400 mt-0.5 shrink-0" />
      <p className="text-[10px] leading-relaxed text-foreground/70">
        {t("calibrationCaveat.text")}
      </p>
    </div>
  );
}
