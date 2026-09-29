/**
 * VITAS · Match job — planificador PURO de tramos
 *
 * Tramos de `segmentSec` sobre la duración REAL del vídeo (`length` de la API de
 * Bunny, contrastado con ffprobe). Nunca videos.duration (contaminada con `?? 0` por
 * el cliente). El último tramo es parcial; si queda más corto que
 * `minTrailingSegmentSec` se une al anterior. Tiempos = «tiempo de vídeo».
 */

export interface PlannedSegment {
  idx: number;
  start_sec: number;
  end_sec: number;
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export function planSegments(durationSec: number, segmentSec: number, minTrailingSec = 0): PlannedSegment[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    // Dato ausente → se bloquea, nunca se planifica sobre una duración inventada.
    throw new PlanError(`duración no válida: ${durationSec}`);
  }
  if (!Number.isFinite(segmentSec) || segmentSec <= 0) throw new PlanError(`segmentSec no válido: ${segmentSec}`);

  const out: PlannedSegment[] = [];
  for (let start = 0, idx = 0; start < durationSec; start += segmentSec, idx++) {
    out.push({ idx, start_sec: start, end_sec: Math.min(start + segmentSec, durationSec) });
  }
  const last = out[out.length - 1];
  if (out.length > 1 && last.end_sec - last.start_sec < minTrailingSec) {
    out.pop();
    out[out.length - 1] = { ...out[out.length - 1], end_sec: durationSec };
  }
  return out;
}
