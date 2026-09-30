/**
 * VITAS · "Tiempo de vídeo" labels for the match job.
 *
 * Every time on the match path is VIDEO time (pre-kickoff and half-time included),
 * never a match minute (docs/diseno-partido-completo.md §8). Minutes are not
 * wrapped into hours so a 150-min video reads "125:30", matching the coverage
 * banner wording ("Analizado 0:00–90:00 de 94:12").
 */

const SECONDS_PER_MINUTE = 60;

/** 312 → "5:12"; 5652 → "94:12". Fractions are floored; negatives clamp to 0. */
export function formatVideoTime(sec: number): string {
  const whole = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const m = Math.floor(whole / SECONDS_PER_MINUTE);
  const s = whole % SECONDS_PER_MINUTE;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "15:00–30:00" (en dash). */
export function formatVideoRange(startSec: number, endSec: number): string {
  return `${formatVideoTime(startSec)}–${formatVideoTime(endSec)}`;
}
