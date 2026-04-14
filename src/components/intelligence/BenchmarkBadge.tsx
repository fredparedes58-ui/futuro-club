/**
 * BenchmarkBadge — Shows percentile ranking for a dimension.
 * Color-coded: green (≥75), blue (≥50), amber (≥25), red (<25).
 */

interface BenchmarkBadgeProps {
  percentile: number;
  isSmallSample?: boolean;
}

export default function BenchmarkBadge({ percentile, isSmallSample }: BenchmarkBadgeProps) {
  const color =
    percentile >= 75 ? "text-green-400 bg-green-500/10 border-green-500/20" :
    percentile >= 50 ? "text-blue-400 bg-blue-500/10 border-blue-500/20" :
    percentile >= 25 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                       "text-red-400 bg-red-500/10 border-red-500/20";

  return (
    <span
      className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${color}`}
      title={
        isSmallSample
          ? `Percentil ${percentile} (muestra < 5 jugadores)`
          : `Percentil ${percentile} vs grupo de edad/posición`
      }
    >
      P{percentile}{isSmallSample ? "*" : ""}
    </span>
  );
}
