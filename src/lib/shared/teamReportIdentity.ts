/**
 * VITAS · Legacy team analysis (/team-analysis) — identity guard (client + server).
 *
 * .claude/rules/identidad.md: a player is identified only by a VALIDATED dorsal
 * (closed roster, >= 98% precision). That layer does not exist yet, so the legacy
 * team analysis (team-observation → team-intelligence → TeamAnalysisPage) is
 * TEAM-LEVEL ONLY: no shirt number guessed by an LLM and no per-player figures,
 * never presented as a specific child. Abstaining is the correct result.
 *
 * The only individual-level fields this legacy contract ever had are the
 * per-player collections below: `jugadores[]` on the report (dorsalEstimado +
 * per-player passes / duels / recoveries / speed / distance / heatmap) and
 * `jugadoresObservados[]` on the Gemini observation (dorsalEstimado + per-player
 * event counts). Reports saved before this guard still hold them in the database,
 * so they are removed here, on every read, not only on new output.
 *
 * Free text (summary, phases, recommendations…) that still names an individual is
 * dropped with the SAME predicate as the match-job identity guard
 * (`mentionsIndividual`, src/lib/shared/matchJob/contract.ts — one implementation,
 * inv #7). Over-scrubbing is the safe direction (identidad.md: abstain more, never
 * attribute). Pure, no network. Idempotent: the counts travel with the report in
 * `identityWithheld`, so a report already guarded on the server keeps its counts
 * when the client guards it again.
 */
import { mentionsIndividual } from "./matchJob/contract";

/** Per-player collections of the legacy team contract (removed whole). */
export const LEGACY_PER_PLAYER_KEYS = ["jugadores", "jugadoresObservados"] as const;

/** Key under which the withheld counts travel with the report. */
export const IDENTITY_WITHHELD_KEY = "identityWithheld" as const;

/** What was withheld from a legacy team report / observation, and why it is not shown. */
export interface IdentityWithheld {
  /** Per-player rows removed (each one carried an LLM-guessed dorsal and/or per-player figures). */
  perPlayerRows: number;
  /** Free-text items dropped because they named an individual (dorsal / number / one player). */
  texts: number;
}

/** Top-level fields that are identifiers or metadata, never narrative text. */
const NON_TEXT_KEYS = new Set<string>(["videoId", "generatedAt", IDENTITY_WITHHELD_KEY]);

function countOf(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

/** Counts already recorded on the input (by an earlier pass), sanitised. */
function previousWithheld(obj: Record<string, unknown>): IdentityWithheld {
  const prev = obj[IDENTITY_WITHHELD_KEY];
  if (!prev || typeof prev !== "object") return { perPlayerRows: 0, texts: 0 };
  const p = prev as Record<string, unknown>;
  return { perPlayerRows: countOf(p.perPlayerRows), texts: countOf(p.texts) };
}

/**
 * Recursively drops text that names an individual: a string item of an array is
 * removed, a string field of an object is blanked. Does not mutate the input.
 */
function scrubTexts(value: unknown, counter: { texts: number }): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      if (typeof item === "string" && mentionsIndividual(item)) {
        counter.texts += 1;
        continue;
      }
      out.push(scrubTexts(item, counter));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" && mentionsIndividual(v)) {
        counter.texts += 1;
        out[k] = "";
        continue;
      }
      out[k] = scrubTexts(v, counter);
    }
    return out;
  }
  return value;
}

/**
 * Removes every individual-level datum from a legacy team report or Gemini team
 * observation: the per-player collections (LEGACY_PER_PLAYER_KEYS) and any text
 * that names an individual. Returns the guarded value and the TOTAL withheld
 * (earlier passes included); when anything was withheld the total is also written
 * to `identityWithheld` on the returned object so the UI can say so.
 * Non-objects are returned unchanged.
 */
export function withholdIndividualData(raw: unknown): { value: unknown; withheld: IdentityWithheld } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { value: raw, withheld: { perPlayerRows: 0, texts: 0 } };
  }
  const input = raw as Record<string, unknown>;
  const prev = previousWithheld(input);
  let perPlayerRows = 0;
  const counter = { texts: 0 };
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(input)) {
    if ((LEGACY_PER_PLAYER_KEYS as readonly string[]).includes(k)) {
      perPlayerRows += Array.isArray(v) ? v.length : v == null ? 0 : 1;
      continue;
    }
    if (NON_TEXT_KEYS.has(k)) {
      if (k !== IDENTITY_WITHHELD_KEY) out[k] = v;
      continue;
    }
    if (typeof v === "string" && mentionsIndividual(v)) {
      counter.texts += 1;
      out[k] = "";
      continue;
    }
    out[k] = scrubTexts(v, counter);
  }

  const withheld: IdentityWithheld = {
    perPlayerRows: prev.perPlayerRows + perPlayerRows,
    texts: prev.texts + counter.texts,
  };
  if (withheld.perPlayerRows > 0 || withheld.texts > 0) out[IDENTITY_WITHHELD_KEY] = withheld;
  return { value: out, withheld };
}
