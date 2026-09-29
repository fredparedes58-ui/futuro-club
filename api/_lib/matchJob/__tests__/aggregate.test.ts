/**
 * Agregación pura: procedencia (cobertura DERIVADA, todo lo de Gemini ESTIMADA_LLM),
 * posesión ponderada por segundos analizados, gate de baja confianza de la posesión,
 * huecos con motivo, conteo de eventos citados y paridad de los textos en 7 idiomas.
 */
import { describe, expect, it } from "vitest";
import { matchObservationSchema, type MatchObservation } from "../../../../src/lib/shared/matchJob/contract";
import { SUPPORTED_LOCALES } from "../../../../src/lib/shared/locale";
import { aggregateMatch, buildCoverage, buildEvidenceIndex, hasAnalysedSegments, type SegmentState } from "../aggregate";
import { MESSAGE_CATALOGS_FOR_TEST, availabilityReason } from "../messages";
import { CONF, doneSegment, failedSegment, segObs } from "./fixtures";

const MODEL = "gemini-2.5-flash";
const agg = (segments: SegmentState[], durationSec: number | null = 1800, locale: "es" | "en" = "es") =>
  aggregateMatch({ durationSec, segments, locale, geminiModel: MODEL, confidence: CONF });

/** Recorre todos los MetricResult de la observación. */
function allMetrics(o: MatchObservation): { path: string; m: { provenance: string; calibrated: boolean; value: unknown; gate_reason: string | null; confidence: number; source_ref?: string } }[] {
  const out: ReturnType<typeof allMetrics> = [];
  const walk = (v: unknown, path: string) => {
    if (!v || typeof v !== "object") return;
    if ("provenance" in (v as object) && "calibrated" in (v as object) && "confidence" in (v as object)) {
      out.push({ path, m: v as ReturnType<typeof allMetrics>[number]["m"] });
      return;
    }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}.${k}`);
  };
  walk(o, "$");
  return out;
}

describe("aggregateMatch · provenance", () => {
  it("nothing is MEDIDA, nothing is calibrated, null values always carry a gate_reason, LLM values carry source_ref", () => {
    const o = agg([doneSegment(0, 0, 900), failedSegment(1, 900, 1800)]);
    expect(matchObservationSchema.safeParse(o).success).toBe(true);
    const metrics = allMetrics(o);
    expect(metrics.length).toBeGreaterThan(40);
    for (const { path, m } of metrics) {
      expect(m.provenance, path).not.toBe("MEDIDA");
      expect(m.provenance, path).not.toBe("CONSTANTE");
      expect(m.calibrated, path).toBe(false);
      if (m.value === null) expect(m.gate_reason && m.gate_reason.length > 0, path).toBe(true);
      if (m.provenance === "ESTIMADA_LLM") expect(m.source_ref, path).toBeTruthy();
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });
  it("coverage from job state is DERIVADA; ambiguous / not-evaluable seconds are ESTIMADA_LLM (kept separate)", () => {
    const c = buildCoverage({ durationSec: 1800, segments: [doneSegment(0, 0, 900)], locale: "es", geminiModel: MODEL, confidence: CONF });
    expect(c.duration_sec.provenance).toBe("DERIVADA");
    expect(c.analysed_sec.provenance).toBe("DERIVADA");
    expect(c.analysed_fraction.provenance).toBe("DERIVADA");
    expect(c.failed_segments.provenance).toBe("DERIVADA");
    expect(c.ambiguous_sec.provenance).toBe("ESTIMADA_LLM");
    expect(c.not_evaluable_sec.provenance).toBe("ESTIMADA_LLM");
  });
  it("team descriptors come from config confidence (never the model's self-report), reduced when identification is partial", () => {
    const o = agg([doneSegment(0, 0, 900), doneSegment(1, 900, 1800, { team_identification: "partial" })]);
    expect(o.segments[0].teams.home.formation.confidence).toBe(CONF.llm);
    expect(o.segments[1].teams.home.formation.confidence).toBe(CONF.llm * CONF.partialFactor);
  });
});

describe("coverage", () => {
  it("analysed seconds and fraction from done segments; a failed segment is a DERIVADA gap with its reason", () => {
    const o = agg([doneSegment(0, 0, 900), failedSegment(1, 900, 1800)]);
    expect(o.coverage.analysed_sec.value).toBe(900);
    expect(o.coverage.analysed_fraction.value).toBe(0.5);
    expect(o.coverage.failed_segments.value).toBe(1);
    const gap = o.coverage.gaps.find((g) => g.kind === "segment_not_analysed");
    expect(gap).toMatchObject({ start_sec: 900, end_sec: 1800, provenance: "DERIVADA" });
    expect(gap?.reason).toMatch(/MAX_TOKENS/);
    expect(o.coverage.segments[1]).toMatchObject({ status: "failed", gate_code: "segment_failed" });
  });
  it("unknown duration is gated, never replaced by a default", () => {
    const o = agg([doneSegment(0, 0, 900)], null);
    expect(o.coverage.duration_sec.value).toBeNull();
    expect(o.coverage.duration_sec.gate_code).toBe("duration_unknown");
    expect(o.coverage.analysed_fraction.value).toBeNull();
  });
  it("not-evaluable intervals and ambiguous segments are counted separately (ESTIMADA_LLM gaps)", () => {
    const o = agg([
      doneSegment(0, 0, 900, { not_evaluable_intervals: [{ start: 0, end: 120, reason: "pre_kickoff" }, { start: 100, end: 150, reason: "stoppage" }] }),
      doneSegment(1, 900, 1800, { team_identification: "ambiguous", possession_estimate: null, dominance: null }),
    ]);
    expect(o.coverage.not_evaluable_sec.value).toBe(150); // unión [0,150], sin doble conteo
    expect(o.coverage.ambiguous_sec.value).toBe(900);
    expect(o.coverage.gaps.filter((g) => g.provenance === "ESTIMADA_LLM").length).toBeGreaterThanOrEqual(2);
    // Un tramo ambiguo no aporta descriptores ni dominio ni posesión.
    expect(o.segments[1].dominance.value).toBeNull();
    expect(o.segments[1].dominance.gate_code).toBe("teams_ambiguous");
    expect(o.segments[1].teams.home.pressing.height.gate_code).toBe("teams_ambiguous");
  });
  it("coverage is never 100 % while a segment is not done (contract guard)", () => {
    const pending: SegmentState = { idx: 1, start_sec: 900, end_sec: 900.5, status: "pending", result: null, failure: null };
    const o = agg([doneSegment(0, 0, 900), pending], 900.5);
    expect(o.coverage.analysed_fraction.value).toBeLessThan(1);
    expect(hasAnalysedSegments(o)).toBe(true);
    expect(hasAnalysedSegments(agg([failedSegment(0, 0, 900)], 900))).toBe(false);
  });
});

describe("possession (ESTIMADA_LLM, weighted by analysed seconds)", () => {
  it("weights each segment by its analysed seconds and stays ESTIMADA_LLM with units %", () => {
    const o = agg(
      [
        doneSegment(0, 0, 900, { possession_estimate: { home_pct: 60, away_pct: 40, basis: "ball_control_observed" } }),
        doneSegment(1, 900, 1200, { possession_estimate: { home_pct: 30, away_pct: 70, basis: "mixed" } }),
      ],
      1200,
    );
    // (900·60 + 300·30) / 1200 = 52.5 → 53
    expect(o.possession.home.value).toBe(53);
    expect(o.possession.away.value).toBe(47);
    expect(o.possession.home.provenance).toBe("ESTIMADA_LLM");
    expect(o.possession.home.units).toBe("%");
    expect(o.possession.home.confidence).toBe(CONF.possession);
    expect(o.possession_detail).toMatchObject({ weighting: "analysed_sec", segments_used: [0, 1], segments_excluded: [], low_confidence: [] });
    expect(o.segments[0].possession.home.value).toBe(60);
  });
  it("excludes failed, ambiguous, missing and incoherent segments with their gate code", () => {
    const o = agg(
      [
        doneSegment(0, 0, 900),
        failedSegment(1, 900, 1800),
        doneSegment(2, 1800, 2700, { team_identification: "ambiguous" }),
        doneSegment(3, 2700, 3600, { possession_estimate: null }),
        doneSegment(4, 3600, 4500, { possession_estimate: { home_pct: 70, away_pct: 40, basis: "mixed" } }),
      ],
      4500,
    );
    expect(o.possession.home.value).toBe(60);
    expect(o.possession_detail.segments_used).toEqual([0]);
    expect(o.possession_detail.segments_excluded).toEqual([
      { idx: 1, gate_code: "segment_failed" },
      { idx: 2, gate_code: "teams_ambiguous" },
      { idx: 3, gate_code: "possession_missing" },
      { idx: 4, gate_code: "possession_incoherent" },
    ]);
    expect(o.segments[4].possession.home.value).toBeNull();
  });
  it("no usable segment → null + no_usable_segments (never 50/50)", () => {
    const o = agg([failedSegment(0, 0, 900)], 900);
    expect(o.possession.home.value).toBeNull();
    expect(o.possession.home.gate_code).toBe("no_usable_segments");
  });

  it("LOW CONFIDENCE · no_visual_basis: usage did not confirm video tokens → value kept, confidence drops, reason given", () => {
    const o = agg([doneSegment(0, 0, 900, {}, "unverified"), doneSegment(1, 900, 1800)]);
    expect(o.segments[0].possession_low_confidence).toBe("no_visual_basis");
    expect(o.segments[0].possession.home.value).toBe(60);
    expect(o.segments[0].possession.home.confidence).toBe(CONF.possessionLow);
    expect(o.segments[1].possession_low_confidence).toBeNull();
    // Agregada: la MENOR confianza de los tramos usados.
    expect(o.possession.home.confidence).toBe(CONF.possessionLow);
    const flag = o.possession_detail.low_confidence?.find((f) => f.code === "no_visual_basis");
    expect(flag?.segments).toEqual([0]);
    expect(flag?.reason.length).toBeGreaterThan(10);
  });
  it("LOW CONFIDENCE · no_visual_basis also when the segment cites no evidence at all", () => {
    const o = agg([doneSegment(0, 0, 900, { evidence: [] })], 900);
    expect(o.segments[0].possession_low_confidence).toBe("no_visual_basis");
    expect(o.possession.home.confidence).toBe(CONF.possessionLow);
  });
  it("LOW CONFIDENCE · uniform_output: every usable segment 50/50 + balanced (the spike) is never a confident figure", () => {
    const fifty = { possession_estimate: { home_pct: 50, away_pct: 50, basis: "territorial_proxy" as const }, dominance: "balanced" as const };
    const o = agg([doneSegment(0, 0, 900, fifty), doneSegment(1, 900, 1800, fifty)]);
    expect(o.possession.home.value).toBe(50);
    expect(o.possession.home.confidence).toBe(CONF.possessionLow);
    expect(o.possession_detail.low_confidence?.map((f) => f.code)).toEqual(["uniform_output"]);
    expect(o.segments.every((s) => s.possession_low_confidence === "uniform_output")).toBe(true);
  });
  it("50/50 in one segment only is NOT uniform (the model differentiated elsewhere)", () => {
    const o = agg([
      doneSegment(0, 0, 900, { possession_estimate: { home_pct: 50, away_pct: 50, basis: "mixed" }, dominance: "balanced" }),
      doneSegment(1, 900, 1800),
    ]);
    expect(o.possession_detail.low_confidence).toEqual([]);
    expect(o.possession.home.confidence).toBe(CONF.possession);
  });
});

describe("evidence index and cited events", () => {
  it("ids s{idx}-e{n} in absolute video time; counts per team are ESTIMADA_LLM (not an event statistic)", () => {
    const segs = [
      doneSegment(0, 0, 900, {
        evidence: [
          { t_start: 10, t_end: 20, team: "home", category: "build_up", text: "Salida corta" },
          { t_start: 30, t_end: 40, team: "away", category: "pressing", text: "Presión alta" },
          { t_start: 50, t_end: 55, team: "ambiguous", category: "other", text: "Jugada confusa" },
        ],
      }),
      doneSegment(1, 900, 1800),
    ];
    const ev = buildEvidenceIndex(segs, MODEL);
    expect(ev.map((e) => e.id)).toEqual(["s0-e1", "s0-e2", "s0-e3", "s1-e1"]);
    expect(ev[3]).toMatchObject({ segment_idx: 1, t_start: 910, provenance: "ESTIMADA_LLM" });
    expect(ev[0].source_ref).toBe(`${MODEL}@segment.v1#s0[0-900s]`);
    const o = agg(segs);
    expect(o.cited_events.home).toMatchObject({ value: 2, provenance: "ESTIMADA_LLM" });
    expect(o.cited_events.away.value).toBe(1);
    expect(o.cited_events.ambiguous.value).toBe(1);
  });
  it("identity-guard counters are summed for audit", () => {
    const s = doneSegment(0, 0, 900);
    if (s.result) s.result.guard = { keys_stripped: 2, items_dropped: 3 };
    expect(agg([s], 900).identity_guard).toEqual({ keys_stripped: 2, items_dropped: 3 });
  });
  it("invalid formation strings are gated as invalid_model_value, never shown", () => {
    const o = agg([doneSegment(0, 0, 900, { teams: { home: { ...segObs().teams.home, formation: "four-four-two" }, away: segObs().teams.away } })], 900);
    expect(o.segments[0].teams.home.formation.value).toBeNull();
    expect(o.segments[0].teams.home.formation.gate_code).toBe("invalid_model_value");
    expect(o.segments[0].teams.away.formation.value).toBe("3-5-2");
  });
});

describe("server texts in the job locale (7 locales, key parity)", () => {
  it("every catalogue has the same keys as es and no empty strings", () => {
    const flat = (o: unknown, p = ""): string[] =>
      o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, `${p}.${k}`)) : [p];
    const catalogs = MESSAGE_CATALOGS_FOR_TEST as Record<string, unknown>;
    const esKeys = flat(catalogs.es).sort();
    const codes = [...SUPPORTED_LOCALES];
    expect(codes).toHaveLength(7);
    for (const code of codes) {
      expect(flat(catalogs[code]).sort(), code).toEqual(esKeys);
      const values = (o: unknown): string[] => (o && typeof o === "object" ? Object.values(o as Record<string, unknown>).flatMap(values) : [String(o)]);
      for (const v of values(catalogs[code])) expect(v.trim().length, code).toBeGreaterThan(0);
    }
  });
  it("the disabled reason says the feature is in validation", () => {
    expect(availabilityReason("es", "match_video_disabled")).toMatch(/en validación/i);
    expect(availabilityReason("en", "match_video_disabled")).toMatch(/validat/i);
  });
  it("gate reasons follow the job locale", () => {
    const es = agg([failedSegment(0, 0, 900)], 900, "es");
    const en = agg([failedSegment(0, 0, 900)], 900, "en");
    expect(es.possession.home.gate_reason).not.toBe(en.possession.home.gate_reason);
  });
});
