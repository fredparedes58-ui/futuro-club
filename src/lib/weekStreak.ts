/**
 * Racha de semanas SEGUIDAS con actividad, contada hacia atrás desde hoy.
 * Buckets de 7 días desde epoch: sin ambigüedad de zona horaria ni semana ISO.
 * Uso: hábito del COACH (subir vídeos/analizar), nunca rachas sobre menores.
 */
const WEEK_MS = 604800000; // 7 días

export function weekStreak(isoDates: string[], now: number = Date.now()): number {
  const buckets = new Set(
    isoDates.map((d) => Math.floor(Date.parse(d) / WEEK_MS)).filter((n) => Number.isFinite(n)),
  );
  if (buckets.size === 0) return 0;
  const current = Math.floor(now / WEEK_MS);
  let streak = 0;
  // La semana en curso cuenta si tiene actividad; si no, arrancamos en la anterior
  // (una semana en blanco recién empezada no rompe una racha del pasado inmediato).
  let cursor = buckets.has(current) ? current : current - 1;
  while (buckets.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}
