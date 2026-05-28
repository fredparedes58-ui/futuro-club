/**
 * VITAS · PitchView — SVG pitch with set piece player positions
 */

import { motion } from "framer-motion";
import type { PlayerOnSetPiece, PitchPosition } from "@/lib/setPiece/types";

interface PitchViewProps {
  players: PlayerOnSetPiece[];
  origin?: PitchPosition;
  endPoint?: PitchPosition;
  showLabels?: boolean;
  height?: number;
}

const ROLE_COLORS: Record<PlayerOnSetPiece["role"], { fill: string; stroke: string }> = {
  taker: { fill: "#a855f7", stroke: "#7e22ce" },
  target: { fill: "#10b981", stroke: "#047857" },
  screener: { fill: "#3b82f6", stroke: "#1d4ed8" },
  decoy: { fill: "#f59e0b", stroke: "#b45309" },
  defender: { fill: "#ef4444", stroke: "#b91c1c" },
};

export default function PitchView({
  players,
  origin,
  endPoint,
  showLabels = true,
  height = 280,
}: PitchViewProps) {
  // Pitch dimensions normalized: x = 0-100 (length), y = 0-100 (width)
  // Show only attacking third (x = 60-100)
  const viewBoxX = 60;
  const viewBoxWidth = 40;

  const xToSvg = (x: number) => ((x - viewBoxX) / viewBoxWidth) * 600;
  const yToSvg = (y: number) => (y / 100) * 400;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox="0 0 600 400"
        className="w-full h-full rounded-xl"
        style={{ background: "linear-gradient(135deg, #0f5132 0%, #14532d 50%, #0f5132 100%)" }}
      >
        {/* Pitch stripes */}
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={i * 150}
            y={0}
            width={150}
            height={400}
            fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.04)"}
          />
        ))}

        {/* Penalty area (16-meter box): x=83-100, y=20-80 */}
        <rect
          x={xToSvg(83)}
          y={yToSvg(20)}
          width={xToSvg(100) - xToSvg(83)}
          height={yToSvg(80) - yToSvg(20)}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="2"
        />

        {/* Small box (6-yard): x=94-100, y=37-63 */}
        <rect
          x={xToSvg(94)}
          y={yToSvg(37)}
          width={xToSvg(100) - xToSvg(94)}
          height={yToSvg(63) - yToSvg(37)}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="2"
        />

        {/* Penalty spot */}
        <circle cx={xToSvg(89)} cy={yToSvg(50)} r={3} fill="rgba(255,255,255,0.7)" />

        {/* Goal */}
        <rect
          x={xToSvg(100) - 2}
          y={yToSvg(43)}
          width={6}
          height={yToSvg(57) - yToSvg(43)}
          fill="rgba(255,255,255,0.9)"
        />

        {/* Goal area arc */}
        <path
          d={`M ${xToSvg(83)} ${yToSvg(38)} A 30 30 0 0 1 ${xToSvg(83)} ${yToSvg(62)}`}
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
        />

        {/* Half line at left edge */}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={400}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="2"
        />

        {/* Origin → endpoint arrow */}
        {origin && endPoint && (
          <>
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#fbbf24" />
              </marker>
            </defs>
            <motion.line
              x1={xToSvg(origin.x)}
              y1={yToSvg(origin.y)}
              x2={xToSvg(endPoint.x)}
              y2={yToSvg(endPoint.y)}
              stroke="#fbbf24"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              markerEnd="url(#arrowhead)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.85 }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />
            {/* Ball at origin */}
            <motion.circle
              cx={xToSvg(origin.x)}
              cy={yToSvg(origin.y)}
              r={5}
              fill="white"
              stroke="black"
              strokeWidth={1}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
            />
          </>
        )}

        {/* Players */}
        {players.map((p, i) => {
          const colors = ROLE_COLORS[p.role];
          return (
            <motion.g
              key={`${p.playerId}-${i}`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.08 }}
            >
              <circle
                cx={xToSvg(p.position.x)}
                cy={yToSvg(p.position.y)}
                r={14}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={2}
              />
              <text
                x={xToSvg(p.position.x)}
                y={yToSvg(p.position.y) + 4}
                textAnchor="middle"
                fill="white"
                fontSize="12"
                fontWeight="bold"
              >
                {p.shirtNumber}
              </text>
              {showLabels && (
                <text
                  x={xToSvg(p.position.x)}
                  y={yToSvg(p.position.y) + 26}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.85)"
                  fontSize="9"
                  fontWeight="600"
                >
                  {p.playerName.split(" ")[0]}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 text-[9px] text-white/90 bg-black/40 backdrop-blur-sm rounded px-2 py-1">
        {Object.entries(ROLE_COLORS).map(([role, colors]) => (
          <div key={role} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: colors.fill }}
            />
            <span className="capitalize">{role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
