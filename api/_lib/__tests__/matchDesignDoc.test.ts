/**
 * Guard for docs/diseno-partido-completo.md (PR-0 review, 2026-09-29): the design doc
 * is the operator's single source of truth for Phase 1, so it must carry the owner
 * decision "analysis OFF until the validation harness passes". A spike showed Gemini
 * fabricating team events, so any sentence telling the operator to turn
 * MATCH_VIDEO_ENABLED on must also require the §20 validation harness.
 * The doc also has to name the contract pieces behind that decision.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MATCH_API_ROUTES,
  MATCH_AVAILABILITY_CODES,
  MATCH_JOB_ERROR_CODES,
  POSSESSION_LOW_CONFIDENCE_CODES,
} from "../../../src/lib/shared/matchJob/contract";

const DOC = readFileSync(resolve(__dirname, "../../../docs/diseno-partido-completo.md"), "utf8").replace(/\r\n/g, "\n");

/** Markdown list items / paragraphs, joined into one line each (hard wraps removed). */
const BLOCKS = DOC.split(/\n(?=\s*(?:\d+\.|-|>\s*-)\s)|\n\s*\n/).map((b) => b.replace(/\s*\n\s*>?\s*/g, " "));

function section(heading: RegExp): string {
  const start = DOC.search(heading);
  expect(start, `missing section ${heading}`).toBeGreaterThanOrEqual(0);
  const rest = DOC.slice(start + 1);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("match design doc · owner decision 2026-09-29 (analysis OFF until validated)", () => {
  it("§0 states that the analysis stays off until it passes the validation", () => {
    const s0 = section(/^## 0\. /m).replace(/\s*\n\s*>?\s*/g, " ");
    expect(s0).toContain("Actualización 2026-09-29");
    expect(s0).toContain("el análisis queda APAGADO hasta que pase una validación");
  });

  it("the old 'se activa ya' wording never appears without its substitution note", () => {
    const hits = BLOCKS.filter((b) => /se activa ya/i.test(b));
    expect(hits.length).toBeGreaterThan(0);
    for (const b of hits) expect(b, b).toContain("se activa solo tras la validación");
  });

  it("every instruction to turn MATCH_VIDEO_ENABLED on requires the §20 validation harness", () => {
    const hits = BLOCKS.filter((b) => /MATCH_VIDEO_ENABLED\s*=\s*true/.test(b));
    expect(hits.length).toBeGreaterThan(0);
    for (const b of hits) expect(b, b).toMatch(/arnés de validación \(§20\)/);
  });

  it("§20 defines the validation harness as the activation condition", () => {
    const s20 = section(/^## 20\. /m);
    expect(s20).toMatch(/condición para activar/);
    expect(s20).toContain("scripts/validate-match-observation.mjs");
  });

  it("the doc names the contract pieces behind the decision (availability, kill switch, low-confidence possession)", () => {
    expect(DOC).toContain(MATCH_API_ROUTES.availability);
    for (const code of MATCH_AVAILABILITY_CODES) expect(DOC).toContain(code);
    expect(MATCH_JOB_ERROR_CODES).toContain("analysis_disabled");
    expect(DOC).toContain("analysis_disabled");
    for (const code of POSSESSION_LOW_CONFIDENCE_CODES) expect(DOC).toContain(code);
  });
});
