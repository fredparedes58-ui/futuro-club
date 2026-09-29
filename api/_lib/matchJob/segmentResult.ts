/**
 * VITAS · Match job — normalización PURA de la salida de Gemini de un tramo
 *
 * Orden (docs/diseno-partido-completo.md §7):
 *   1. identityGuard: quita claves individuales; la evidencia que las llevaba se descarta.
 *   2. zod estricto (contrato). Ítems sueltos mal formados se descartan y se cuentan;
 *      si el objeto entero no cumple el contrato → tramo inválido (nunca parseo parcial).
 *   3. Tiempos a «tiempo de vídeo» ABSOLUTO. Regla única por tramo: si TODOS los tiempos
 *      caben en [0, duración del tramo] y alguno cae antes del inicio del tramo, el modelo
 *      respondió relativo al clip → se desplazan todos una vez. Evidencias fuera de
 *      [inicio, fin] tras eso → descartadas (la regla definitiva sale del spike (d)).
 *   4. Texto: dorsal/número/nombre → el ítem se descarta (nota de equipo → null).
 */
import {
  SEGMENT_OUTPUT_BOUNDS,
  notEvaluableIntervalSchema,
  segmentEvidenceSchema,
  segmentObservationSchema,
  type SegmentObservation,
} from "../../../src/lib/shared/matchJob/contract";
import { stripIndividualKeys, textMentionsIndividual, type NameGuard } from "./identityGuard";
import type { GeminiUsage } from "./costing";

/**
 * ¿Consta que Gemini recibió imagen del tramo? (usageMetadata.promptTokensDetails)
 *   - confirmed:  hay tokens VIDEO (o IMAGE) > 0 en el prompt;
 *   - absent:     el desglose existe y NO trae tokens visuales → respondió sin ver nada:
 *                 el tramo se trata como fallido (nada de él se usa);
 *   - unverified: sin desglose → no se puede afirmar ni negar (la posesión baja a
 *                 confianza "baja", nunca se presenta como cifra segura).
 */
export type VisualBasis = "confirmed" | "absent" | "unverified";

const VISUAL_MODALITIES = new Set(["VIDEO", "IMAGE"]);

export function visualBasisFromUsage(usage: GeminiUsage | null | undefined): VisualBasis {
  const details = usage?.promptTokensDetails;
  if (!Array.isArray(details) || details.length === 0) return "unverified";
  const visual = details
    .filter((d) => VISUAL_MODALITIES.has(String(d.modality ?? "").toUpperCase()))
    .reduce((acc, d) => acc + (typeof d.tokenCount === "number" && d.tokenCount > 0 ? d.tokenCount : 0), 0);
  return visual > 0 ? "confirmed" : "absent";
}

export interface NormalizedSegment {
  observation: SegmentObservation;
  /** Lo fija advance.ts desde usageMetadata (ausente en filas antiguas ⇒ "unverified"). */
  visual_basis?: VisualBasis;
  time_base_applied: "absolute" | "clip_relative";
  /** identityGuard: claves quitadas / ítems descartados por identidad. */
  guard: { keys_stripped: number; items_dropped: number };
  /** Ítems descartados por forma (no por identidad) o por caer fuera del tramo. */
  malformed_dropped: number;
  out_of_range_dropped: number;
}

export type NormalizeResult = { ok: true; value: NormalizedSegment } | { ok: false; issues: string };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

export function normalizeSegmentOutput(
  raw: unknown,
  seg: { start_sec: number; end_sec: number },
  names: NameGuard,
): NormalizeResult {
  const stripped = stripIndividualKeys(raw);
  if (!isRec(stripped.value)) return { ok: false, issues: "la respuesta no es un objeto JSON" };
  const obj: Rec = { ...stripped.value };
  let itemsDropped = 0;
  let malformed = 0;

  // 1-2 · evidencias: fuera las que llevaban claves individuales, fuera las mal formadas.
  if (Array.isArray(obj.evidence)) {
    const kept: unknown[] = [];
    obj.evidence.forEach((item, i) => {
      if (stripped.strippedPaths.some((p) => p.startsWith(`$.evidence[${i}]`))) {
        itemsDropped++;
        return;
      }
      if (!segmentEvidenceSchema.safeParse(item).success) {
        malformed++;
        return;
      }
      kept.push(item);
    });
    if (kept.length > SEGMENT_OUTPUT_BOUNDS.maxEvidence) malformed += kept.length - SEGMENT_OUTPUT_BOUNDS.maxEvidence;
    obj.evidence = kept.slice(0, SEGMENT_OUTPUT_BOUNDS.maxEvidence);
  }
  if (Array.isArray(obj.not_evaluable_intervals)) {
    const kept = obj.not_evaluable_intervals.filter((iv) => {
      const ok = notEvaluableIntervalSchema.safeParse(iv).success;
      if (!ok) malformed++;
      return ok;
    });
    if (kept.length > SEGMENT_OUTPUT_BOUNDS.maxNotEvaluableIntervals) {
      malformed += kept.length - SEGMENT_OUTPUT_BOUNDS.maxNotEvaluableIntervals;
    }
    obj.not_evaluable_intervals = kept.slice(0, SEGMENT_OUTPUT_BOUNDS.maxNotEvaluableIntervals);
  }
  if (isRec(obj.teams)) {
    const teams: Rec = { ...obj.teams };
    for (const side of ["home", "away"] as const) {
      const t = teams[side];
      if (isRec(t) && typeof t.note === "string" && (t.note.trim() === "" || t.note.length > SEGMENT_OUTPUT_BOUNDS.maxTextChars)) {
        teams[side] = { ...t, note: null };
        malformed++;
      }
    }
    obj.teams = teams;
  }

  const parsed = segmentObservationSchema.safeParse(obj);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  const o = parsed.data;

  // 3 · base temporal (una sola regla por tramo).
  const start = seg.start_sec;
  const end = seg.end_sec;
  const len = end - start;
  const times = [
    ...o.evidence.flatMap((e) => [e.t_start, e.t_end]),
    ...o.not_evaluable_intervals.flatMap((i) => [i.start, i.end]),
  ];
  const relative = start > 0 && times.length > 0 && times.every((t) => t <= len) && times.some((t) => t < start);
  const shift = relative ? start : 0;

  let outOfRange = 0;
  const evidence = o.evidence
    .map((e) => ({ ...e, t_start: e.t_start + shift, t_end: e.t_end + shift }))
    .filter((e) => {
      const ok = e.t_start >= start && e.t_end <= end;
      if (!ok) outOfRange++;
      return ok;
    })
    .filter((e) => {
      const bad = textMentionsIndividual(e.text, names);
      if (bad) itemsDropped++;
      return !bad;
    });

  const intervals = o.not_evaluable_intervals
    .map((i) => ({ ...i, start: Math.max(start, i.start + shift), end: Math.min(end, i.end + shift) }))
    .filter((i) => {
      const ok = i.end > i.start;
      if (!ok) outOfRange++;
      return ok;
    });

  const teams = { ...o.teams };
  for (const side of ["home", "away"] as const) {
    const note = teams[side].note;
    if (note !== null && textMentionsIndividual(note, names)) {
      teams[side] = { ...teams[side], note: null };
      itemsDropped++;
    }
  }

  return {
    ok: true,
    value: {
      observation: { ...o, evidence, not_evaluable_intervals: intervals, teams },
      time_base_applied: relative ? "clip_relative" : "absolute",
      guard: { keys_stripped: stripped.stripped, items_dropped: itemsDropped },
      malformed_dropped: malformed,
      out_of_range_dropped: outOfRange,
    },
  };
}
