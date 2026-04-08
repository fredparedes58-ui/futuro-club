/**
 * VITAS · VoronoiOverlay
 *
 * Canvas overlay que dibuja los polígonos de Voronoi sobre el video de tracking.
 * Cada jugador detectado tiene una zona de control coloreada semi-transparente.
 *
 * Se renderiza como <canvas> absolutamente posicionado sobre el contenedor padre.
 */

import { useEffect, useRef } from "react";
import type { VoronoiRegion } from "@/lib/yolo/types";

interface Props {
  /** Regiones de Voronoi calculadas por el engine */
  regions: VoronoiRegion[];
  /** Ancho del contenedor en píxeles */
  width: number;
  /** Alto del contenedor en píxeles */
  height: number;
  /** Track ID enfocado (se resalta su zona) */
  focusTrackId?: number | null;
}

// Colores alternos para jugadores (semi-transparentes)
const COLORS = [
  "rgba(59,130,246,0.18)",   // azul
  "rgba(239,68,68,0.18)",    // rojo
  "rgba(34,197,94,0.18)",    // verde
  "rgba(168,85,247,0.18)",   // morado
  "rgba(234,179,8,0.18)",    // amarillo
  "rgba(236,72,153,0.18)",   // rosa
  "rgba(20,184,166,0.18)",   // teal
  "rgba(249,115,22,0.18)",   // naranja
];

const FOCUS_COLOR  = "rgba(99,102,241,0.35)"; // indigo más opaco para el enfocado
const STROKE_COLOR = "rgba(255,255,255,0.4)";
const STROKE_WIDTH = 1;

export default function VoronoiOverlay({ regions, width, height, focusTrackId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || regions.length === 0) return;

    canvas.width  = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      if (region.pixelPolygon.length < 3) continue;

      const isFocused = focusTrackId != null && region.trackId === focusTrackId;
      const fillColor = isFocused ? FOCUS_COLOR : COLORS[i % COLORS.length];

      // Dibujar polígono relleno
      ctx.beginPath();
      ctx.moveTo(region.pixelPolygon[0][0], region.pixelPolygon[0][1]);
      for (let j = 1; j < region.pixelPolygon.length; j++) {
        ctx.lineTo(region.pixelPolygon[j][0], region.pixelPolygon[j][1]);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Dibujar borde
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth   = STROKE_WIDTH;
      ctx.stroke();

      // Label con ID del track en el centroide
      const cx = region.pixelPolygon.reduce((s, p) => s + p[0], 0) / region.pixelPolygon.length;
      const cy = region.pixelPolygon.reduce((s, p) => s + p[1], 0) / region.pixelPolygon.length;

      ctx.font      = "bold 10px system-ui";
      ctx.textAlign  = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(`#${region.trackId}`, cx, cy - 6);

      // Área m²
      ctx.font      = "9px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(`${region.areaM2.toFixed(0)}m²`, cx, cy + 6);
    }
  }, [regions, width, height, focusTrackId]);

  if (regions.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
}
