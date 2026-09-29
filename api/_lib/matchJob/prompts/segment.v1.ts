/**
 * VITAS · Prompt Gemini por tramo — segment.v1
 *
 * Un tramo (videoMetadata start/end offsets) sobre el MISMO fichero, AMBOS equipos en
 * una sola llamada (los tokens de vídeo se pagan una vez). Instrucciones en un solo
 * idioma base (convención del repo): el idioma de SALIDA de los textos libres lo fija
 * `languageDirective(locale)`; los enums del schema se quedan tal cual.
 *
 * Identidad: los equipos se identifican SOLO por los colores de equipación que declaró
 * el usuario. Prohibido dorsal, número, nombre, cara o destacar a un individuo. Ni las
 * notas del entrenador ni la plantilla ni los nombres de equipo se envían a Gemini
 * (minimización: no ayudan a ver nada y son datos del club).
 *
 * Categoría: solo si el job la declara (nunca resolveCategory con su "youth" por defecto).
 */
import { languageDirective, type ReportLocale } from "../../../../src/lib/shared/locale";
import { categoryDirective, type PlayerCategory } from "../../../../src/lib/shared/category";
import {
  SEGMENT_OUTPUT_BOUNDS,
  SEGMENT_PROMPT_VERSION,
  type TeamKit,
} from "../../../../src/lib/shared/matchJob/contract";

export const SEGMENT_PROMPT_ID = SEGMENT_PROMPT_VERSION;

export interface SegmentPromptInput {
  locale: ReportLocale;
  category: PlayerCategory | null;
  homeKit: TeamKit | null;
  awayKit: TeamKit | null;
  attackingDir1h: "left_to_right" | "right_to_left" | null;
  segment: { idx: number; start_sec: number; end_sec: number };
  totalSegments: number;
}

function colour(c: { hex: string; label?: string }): string {
  return c.label ? `${c.label} (${c.hex})` : c.hex;
}

function describeKit(side: "HOME" | "AWAY", kit: TeamKit | null, other: TeamKit | null): string {
  if (!kit) {
    return other
      ? `${side}: kit not declared by the coach — it is the team that is NOT wearing the ${side === "HOME" ? "AWAY" : "HOME"} kit. If you cannot tell it apart reliably, treat the segment as ambiguous.`
      : `${side}: kit not declared.`;
  }
  const parts = [`shirt ${colour(kit.shirt)}`];
  if (kit.shorts) parts.push(`shorts ${colour(kit.shorts)}`);
  if (kit.gk) parts.push(`goalkeeper ${colour(kit.gk)}`);
  return `${side}: ${parts.join(", ")}.`;
}

export function buildSegmentPrompt(input: SegmentPromptInput): string {
  const { start_sec: start, end_sec: end, idx } = input.segment;
  const dir =
    input.attackingDir1h === null
      ? ""
      : `\nCoach-declared (NOT observed, may be wrong): in the first half HOME attacks ${input.attackingDir1h === "left_to_right" ? "left to right" : "right to left"} as seen on screen. If the video contradicts it, trust the video.`;
  const category = input.category ? `\n${categoryDirective(input.category, input.locale)}` : "";

  return `You are a football (soccer) tactical observer for VITAS. You watch ONE segment of a longer match video and describe what BOTH teams do, at TEAM level only.

SEGMENT: #${idx + 1} of ${input.totalSegments}, video time ${start}s to ${end}s (the attached video part is clipped to this range).
TIME BASE: every time you return (evidence t_start/t_end, not_evaluable_intervals start/end) is an INTEGER number of ABSOLUTE seconds since the start of the full video file, so it must lie between ${start} and ${end}. "Video time" includes pre-kick-off, half-time and stoppages; it is not the match clock.

TEAMS (identified ONLY by the kit colours declared by the coach):
${describeKit("HOME", input.homeKit, input.awayKit)}
${describeKit("AWAY", input.awayKit, input.homeKit)}${dir}

IDENTITY RULES (mandatory):
- Never mention shirt numbers, dorsals, names, faces or any individual player. Never write things like "number 10", "#11", "the 7 of the away team" or a person's name — not even when you believe you can read a number (many youth kits have none). Never single out one player by role either ("the goalkeeper", "the striker", "the captain", "a player"): describe teams, lines and collective behaviour only ("the home back line", "the away front three"). Any text that mentions an individual is discarded automatically.
- If you cannot tell the two teams apart by the declared kits for most of the segment, set team_identification = "ambiguous", set dominance, possession_estimate and every team descriptor to null, and use team = "ambiguous" in evidence. If you can tell them apart only for part of the segment, use "partial". Do not guess.

WHAT TO RETURN (JSON matching the response schema exactly):
- not_evaluable_intervals: parts of this segment where play cannot be evaluated (pre_kickoff, half_time, post_match, stoppage, camera_off_play, replay_or_graphics, poor_visibility, teams_indistinguishable, other). At most ${SEGMENT_OUTPUT_BOUNDS.maxNotEvaluableIntervals}.
- possession_estimate: your ESTIMATE of the share of evaluable time each team had the ball, as integers home_pct + away_pct = 100, with basis ball_control_observed | territorial_proxy | mixed. It is an estimate, not a statistic. If you cannot follow the ball well enough to estimate it, return null — never 50/50 as a placeholder.
- dominance: which team dominated territorially in this segment: home | balanced | away, or null.
- teams.home and teams.away: formation (e.g. "4-4-2", outfield lines only), predominant phase, build-up style, pressing height and intensity (low | mid | high), defensive block height and compactness, attacking and defensive transition style, set-piece threat, and one short note. Use null for anything you could not observe in this segment — null is correct and expected; never fill a value to complete the object.
- evidence: up to ${SEGMENT_OUTPUT_BOUNDS.maxEvidence} time-stamped observations that support the above (t_start, t_end, team home | away | ambiguous, category, text). Each text at most 200 characters, team-level, concrete and verifiable by watching that moment. Prefer fewer, clear items over many vague ones. Timestamps must be the real second where the action happens — never evenly spaced guesses; an item you cannot place in time must be left out.
- Only describe what you SEE in this segment. No invented events, no statistics, no ratings. An empty evidence list and null values are correct answers when you cannot see clearly; they will be checked against human annotations.${category}

${languageDirective(input.locale)}
Exception to the language rule: enum fields must use exactly the English values defined in the response schema; only the free-text fields (evidence text, team note) follow the language instruction.
Return only valid JSON.`;
}

/** source_ref de una métrica de este tramo: `${model}@segment.v1#s{idx}[{start}-{end}s]`. */
export function segmentSourceRef(model: string, seg: { idx: number; start_sec: number; end_sec: number }): string {
  return `${model}@${SEGMENT_PROMPT_VERSION}#s${seg.idx}[${seg.start_sec}-${seg.end_sec}s]`;
}
