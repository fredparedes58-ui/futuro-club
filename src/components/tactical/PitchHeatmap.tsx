/**
 * VITAS · PitchHeatmap
 *
 * SVG cancha de fútbol con grid de heatmap superpuesto. El color sigue
 * un gradiente azul→cyan→amarillo→rojo según el peso del bin.
 *
 * Coords 0-100 (sistema VITAS): X = largo, Y = ancho.
 * El renderer hace fit aspect 1.5:1 (cancha real ~105×68m).
 */

import { useMemo } from "react";
import { GRID_COLS, GRID_ROWS } from "@/lib/tactical/pitchGeometry";
import type { HeatmapBin, HotZone } from "@/lib/tactical/tacticalTypes";

interface Props {
  bins: HeatmapBin[];
  hotZones?: HotZone[];
  /** Show centroides + circles of hot zones */
  showHotZones?: boolean;
  /** Pitch height in px (width is 1.5×) */
  height?: number;
  /** Lock the colour scale to this max so multiple heatmaps are comparable */
  maxWeight?: number;
  /** Title overlay (e.g. phase name) */
  title?: string;
}

/** Lerp colour stops with `t` in [0, 1]. */
function colorFor(t: number): string {
  // Stops: deep blue → cyan → yellow → red
  if (t <= 0) return "rgba(15, 23, 42, 0)"; // transparent
  if (t < 0.25) return `rgba(56, 189, 248, ${0.3 + t * 1.4})`;        // sky-400
  if (t < 0.5)  return `rgba(34, 211, 238, ${0.5 + (t - 0.25) * 1.6})`; // cyan-400
  if (t < 0.75) return `rgba(250, 204, 21, ${0.7 + (t - 0.5) * 1.0})`;  // yellow-400
  return `rgba(244, 63, 94, ${Math.min(1, 0.85 + (t - 0.75) * 0.6)})`;  // rose-500
}

export function PitchHeatmap({
  bins,
  hotZones = [],
  showHotZones = true,
  height = 280,
  maxWeight,
  title,
}: Props) {
  const width = height * 1.5;
  const cellW = width / GRID_COLS;
  const cellH = height / GRID_ROWS;

  const max = useMemo(() => {
    if (maxWeight) return maxWeight;
    return bins.reduce((m, b) => Math.max(m, b.weight), 0) || 1;
  }, [bins, maxWeight]);

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="rounded-lg overflow-hidden bg-emerald-900/30"
      >
        {/* Pitch background */}
        <rect x={0} y={0} width={width} height={height} fill="rgba(6, 78, 59, 0.5)" />

        {/* Field lines (simplified) */}
        <g stroke="rgba(255,255,255,0.25)" strokeWidth={1} fill="none">
          <rect x={1} y={1} width={width - 2} height={height - 2} />
          <line x1={width / 2} y1={1} x2={width / 2} y2={height - 1} />
          <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) / 8} />
          <rect x={1} y={height * 0.25} width={width * 0.12} height={height * 0.5} />
          <rect x={width * 0.88 - 1} y={height * 0.25} width={width * 0.12} height={height * 0.5} />
        </g>

        {/* Heatmap cells */}
        {bins.map((b) => {
          const t = b.weight / max;
          return (
            <rect
              key={`${b.x}-${b.y}`}
              x={b.x * cellW}
              y={b.y * cellH}
              width={cellW}
              height={cellH}
              fill={colorFor(t)}
              opacity={0.85}
            />
          );
        })}

        {/* Hot zones overlay */}
        {showHotZones &&
          hotZones.map((z, i) => {
            // coords in 0-100 → svg coords
            const cx = (z.centroidX / 100) * width;
            const cy = (z.centroidY / 100) * height;
            const r = Math.max(8, (z.radius / 100) * Math.min(width, height));
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.9}
                />
                <circle cx={cx} cy={cy} r={3} fill="white" />
                <text
                  x={cx + r + 4}
                  y={cy + 4}
                  fill="white"
                  fontSize={10}
                  fontWeight={600}
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                >
                  {Math.round(z.share * 100)}%
                </text>
              </g>
            );
          })}
      </svg>

      {title && (
        <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider text-white/80 font-medium bg-black/40 px-2 py-0.5 rounded">
          {title}
        </div>
      )}
    </div>
  );
}
