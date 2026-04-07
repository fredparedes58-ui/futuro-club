/**
 * VITAS · PlayerHeatmap
 *
 * Mapa de calor de un jugador sobre diagrama de campo de fútbol.
 * Recibe posiciones en coordenadas reales (metros, campo FIFA 105×68m)
 * y renderiza un heatmap SVG con gradiente verde→amarillo→rojo.
 *
 * Fuente de datos: track.positions[] del sistema YOLO tracking,
 * o posiciones comprimidas guardadas en el reporte.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

// Campo FIFA standard
const FIELD_W = 105; // metros
const FIELD_H = 68;  // metros

// Grid del heatmap
const GRID_COLS = 21; // ~5m por celda
const GRID_ROWS = 14; // ~4.9m por celda
const CELL_W = FIELD_W / GRID_COLS;
const CELL_H = FIELD_H / GRID_ROWS;

// SVG viewBox — usamos coordenadas normalizadas con padding
const PAD = 4;
const VB_W = FIELD_W + PAD * 2;
const VB_H = FIELD_H + PAD * 2;

interface Position {
  fx: number;
  fy: number;
}

interface Props {
  positions: Position[];
  title?: string;
}

export default function PlayerHeatmap({ positions, title }: Props) {
  // Calcular grid de intensidad
  const { grid, maxCount } = useMemo(() => {
    const g: number[][] = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(0)
    );
    let max = 0;

    for (const pos of positions) {
      const col = Math.min(Math.floor(pos.fx / CELL_W), GRID_COLS - 1);
      const row = Math.min(Math.floor(pos.fy / CELL_H), GRID_ROWS - 1);
      if (col >= 0 && row >= 0) {
        g[row][col]++;
        if (g[row][col] > max) max = g[row][col];
      }
    }

    return { grid: g, maxCount: max };
  }, [positions]);

  if (positions.length === 0) {
    return (
      <div className="glass rounded-2xl p-4 text-center">
        <MapPin size={20} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Sin datos de posición para generar mapa de calor
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
          <MapPin size={14} className="text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-display font-bold text-foreground">
            {title ?? "Mapa de Calor"}
          </h3>
          <p className="text-[9px] text-muted-foreground">
            {positions.length} posiciones registradas
          </p>
        </div>
      </div>

      {/* Campo SVG */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full rounded-xl overflow-hidden"
        style={{ backgroundColor: "#1a472a" }}
      >
        {/* Defs: gradiente para heatmap */}
        <defs>
          <linearGradient id="heatGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
            <stop offset="25%" stopColor="#22c55e" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#eab308" stopOpacity="0.6" />
            <stop offset="75%" stopColor="#f97316" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* Campo base */}
        <g transform={`translate(${PAD}, ${PAD})`}>
          <FieldDiagram />

          {/* Heatmap cells */}
          {grid.map((row, ri) =>
            row.map((count, ci) => {
              if (count === 0) return null;
              const intensity = count / maxCount;
              return (
                <rect
                  key={`${ri}-${ci}`}
                  x={ci * CELL_W}
                  y={ri * CELL_H}
                  width={CELL_W}
                  height={CELL_H}
                  rx={0.8}
                  fill={heatColor(intensity)}
                  opacity={0.15 + intensity * 0.7}
                />
              );
            })
          )}
        </g>
      </svg>

      {/* Leyenda */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <span className="text-[8px] text-muted-foreground">Baja</span>
        <div className="flex h-2 w-24 rounded-full overflow-hidden">
          <div className="flex-1" style={{ backgroundColor: "#22c55e" }} />
          <div className="flex-1" style={{ backgroundColor: "#eab308" }} />
          <div className="flex-1" style={{ backgroundColor: "#f97316" }} />
          <div className="flex-1" style={{ backgroundColor: "#ef4444" }} />
        </div>
        <span className="text-[8px] text-muted-foreground">Alta</span>
      </div>
    </motion.div>
  );
}

// ─── Diagrama del campo de fútbol (SVG) ──────────────────────────────────────

function FieldDiagram() {
  const strokeColor = "rgba(255,255,255,0.35)";
  const strokeWidth = 0.4;

  // Medidas FIFA standard (metros)
  const penW = 16.5;  // ancho área penal
  const penH = 40.3;  // alto área penal (de cada lado: (68-40.3)/2 = 13.85)
  const penTop = (FIELD_H - penH) / 2;
  const goalW = 5.5;  // área pequeña
  const goalH = 18.32;
  const goalTop = (FIELD_H - goalH) / 2;
  const centerR = 9.15; // radio círculo central
  const penSpot = 11;   // punto penal
  const cornerR = 1;    // radio esquina

  return (
    <g stroke={strokeColor} strokeWidth={strokeWidth} fill="none">
      {/* Contorno */}
      <rect x={0} y={0} width={FIELD_W} height={FIELD_H} rx={0.5} />

      {/* Línea central */}
      <line x1={FIELD_W / 2} y1={0} x2={FIELD_W / 2} y2={FIELD_H} />

      {/* Círculo central */}
      <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r={centerR} />
      <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r={0.5} fill={strokeColor} />

      {/* Área penal izquierda */}
      <rect x={0} y={penTop} width={penW} height={penH} />
      {/* Área pequeña izquierda */}
      <rect x={0} y={goalTop} width={goalW} height={goalH} />
      {/* Punto penal izquierdo */}
      <circle cx={penSpot} cy={FIELD_H / 2} r={0.4} fill={strokeColor} />

      {/* Área penal derecha */}
      <rect x={FIELD_W - penW} y={penTop} width={penW} height={penH} />
      {/* Área pequeña derecha */}
      <rect x={FIELD_W - goalW} y={goalTop} width={goalW} height={goalH} />
      {/* Punto penal derecho */}
      <circle cx={FIELD_W - penSpot} cy={FIELD_H / 2} r={0.4} fill={strokeColor} />

      {/* Esquinas */}
      <path d={`M ${cornerR} 0 A ${cornerR} ${cornerR} 0 0 1 0 ${cornerR}`} />
      <path d={`M ${FIELD_W - cornerR} 0 A ${cornerR} ${cornerR} 0 0 0 ${FIELD_W} ${cornerR}`} />
      <path d={`M 0 ${FIELD_H - cornerR} A ${cornerR} ${cornerR} 0 0 1 ${cornerR} ${FIELD_H}`} />
      <path d={`M ${FIELD_W} ${FIELD_H - cornerR} A ${cornerR} ${cornerR} 0 0 0 ${FIELD_W - cornerR} ${FIELD_H}`} />

      {/* Porterías (fuera del campo) */}
      <rect x={-2} y={(FIELD_H - 7.32) / 2} width={2} height={7.32} strokeWidth={0.3} />
      <rect x={FIELD_W} y={(FIELD_H - 7.32) / 2} width={2} height={7.32} strokeWidth={0.3} />
    </g>
  );
}

// ─── Color del heatmap según intensidad (0-1) ───────────────────────────────

function heatColor(intensity: number): string {
  // Verde → Amarillo → Naranja → Rojo
  if (intensity < 0.25) {
    return interpolateColor("#22c55e", "#84cc16", intensity / 0.25);
  } else if (intensity < 0.5) {
    return interpolateColor("#84cc16", "#eab308", (intensity - 0.25) / 0.25);
  } else if (intensity < 0.75) {
    return interpolateColor("#eab308", "#f97316", (intensity - 0.5) / 0.25);
  } else {
    return interpolateColor("#f97316", "#ef4444", (intensity - 0.75) / 0.25);
  }
}

function interpolateColor(c1: string, c2: string, t: number): string {
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `rgb(${r},${g},${b})`;
}
