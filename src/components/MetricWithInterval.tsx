/**
 * VITAS · MetricWithInterval (Sprint 3.1 · Explicabilidad calibrada)
 *
 * Renderiza una métrica con su banda de incertidumbre: "72 ± 4".
 * El tooltip explica de dónde sale el margen (volumen de datos / fuente).
 */
import { useTranslation } from "react-i18next";
import { computeMetricInterval, type IntervalInput, type MetricInterval } from "@/lib/metrics/confidenceInterval";

interface Props {
  value: number;
  /** Input de calibración (sampleSize, reliability, tipo, fuente). */
  input?: IntervalInput;
  /** Intervalo ya calculado (si se prefiere calcular fuera). Tiene prioridad sobre `input`. */
  interval?: MetricInterval;
  decimals?: number;
  className?: string;
  valueClassName?: string;
  /** Muestra el margen ± junto al valor (default true). */
  showMargin?: boolean;
}

export function MetricWithInterval({
  value,
  input,
  interval,
  decimals = 1,
  className = "",
  valueClassName = "",
  showMargin = true,
}: Props) {
  const { t } = useTranslation();
  const ci = interval ?? computeMetricInterval(value, input);
  const title = t("metricWithInterval.rangeTitle", {
    rangeLabel: ci.rangeLabel,
    confidenceLevel: ci.confidenceLevel,
  });

  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`} title={title}>
      <span className={`font-display font-bold ${valueClassName}`}>{ci.point.toFixed(decimals)}</span>
      {showMargin && (
        <span className="text-[10px] font-mono text-muted-foreground/80 whitespace-nowrap">{ci.label}</span>
      )}
    </span>
  );
}
