/**
 * Match video job UI (PR-C) — pure logic: fixtures, demo fixture, kit colour
 * distance, evidence embed URL, video-time labels, availability flag, possession
 * reliability gate and the UI config file.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  matchJobStatusResponseSchema,
  matchObservationSchema,
  matchReportV2Schema,
  mentionsIndividual,
} from "@/lib/shared/matchJob/contract";
import {
  assessPossessionReliability,
  isSegmentPossessionLowConfidence,
} from "@/lib/shared/matchJob/possessionReliability";
import { buildDemoMatchJob } from "@/lib/demo/demoMatchJob";
import {
  assessKitSimilarity,
  deltaE2000,
  EMPTY_KIT_DRAFT,
  hexToLab,
  kitDraftToTeamKit,
  type KitDraft,
} from "@/lib/match/kitColour";
import { buildEvidenceEmbedUrl } from "@/lib/match/evidenceEmbed";
import { formatVideoRange, formatVideoTime } from "@/lib/match/videoTime";
import {
  isMatchVideoClientFlagOn,
  isMatchVideoFlagOn,
  resolveMatchVideoAvailability,
} from "@/lib/match/matchVideoAvailability";
import { MATCH_UI_CONFIG, matchUiConfigSource } from "@/lib/match/matchUiConfig";
import uiConfigRaw from "../../../config/matchVideoUi.json";
import { buildObservation, buildReport, buildStatus, EMBED_URL } from "../fixtures/matchJob";

// ─── fixtures are contract-valid ──────────────────────────────────────────────

describe("match UI test fixtures", () => {
  it("build status / observation / report objects that the contract accepts", () => {
    const obs = buildObservation([{ status: "done" }, { status: "failed" }], { durationSec: 1500 });
    expect(matchObservationSchema.safeParse(obs).success).toBe(true);
    const rep = buildReport(obs);
    expect(matchReportV2Schema.safeParse(rep).success).toBe(true);
    for (const status of ["awaiting_encode", "observing", "completed", "failed"] as const) {
      const r = matchJobStatusResponseSchema.safeParse(buildStatus({ status, observation: obs, report: status === "completed" ? rep : null }));
      expect(r.success, `${status}: ${r.success ? "" : JSON.stringify(r.error.issues.slice(0, 2))}`).toBe(true);
    }
  });
});

// ─── demo fixture (IS_DEMO) ───────────────────────────────────────────────────

describe("demo match job fixture", () => {
  const demo = buildDemoMatchJob({ homeName: "Cantera", awayName: "Barrio", locale: "es" });

  it("validates against the same status schema as a real response", () => {
    const r = matchJobStatusResponseSchema.safeParse(demo);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues.slice(0, 3))).toBe(true);
  });

  it("is MOCK everywhere (never presented as an AI estimate or a calculation)", () => {
    const provenances: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (k === "provenance" && typeof x === "string") provenances.push(x);
          walk(x);
        }
      }
    };
    walk(demo);
    expect(provenances.length).toBeGreaterThan(20);
    expect(new Set(provenances)).toEqual(new Set(["MOCK"]));
    expect(demo.report?.source.kind).toBe("mock");
    expect(demo.playback).toBeNull(); // no real video in the demo
  });

  it("never mentions a shirt number or an individual, and never claims full coverage", () => {
    const texts = [
      ...(demo.observation?.evidence ?? []).map((e) => e.text),
      ...(demo.report?.claims ?? []).map((c) => c.text),
      ...(demo.report?.not_evaluated ?? []),
    ];
    expect(texts.length).toBeGreaterThan(5);
    for (const t of texts) expect(mentionsIndividual(t), t).toBe(false);
    expect(demo.coverage?.analysed_fraction.value).toBeLessThan(1);
  });
});

// ─── kit colour (CIEDE2000) ──────────────────────────────────────────────────

describe("kit colour distance", () => {
  // Sharma, Wu & Dalal (2005) CIEDE2000 test data (Lab pairs → ΔE00).
  const SHARMA: [number[], number[], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ];
  it.each(SHARMA)("matches the published CIEDE2000 value %#", (p, q, expected) => {
    const d = deltaE2000({ L: p[0], a: p[1], b: p[2] }, { L: q[0], a: q[1], b: q[2] });
    expect(d).toBeCloseTo(expected, 3);
  });

  it("converts sRGB hex to CIELAB (D65)", () => {
    const white = hexToLab("#FFFFFF");
    expect(white.L).toBeCloseTo(100, 1);
    expect(Math.abs(white.a)).toBeLessThan(0.05);
    expect(hexToLab("#000000").L).toBeCloseTo(0, 5);
    const red = hexToLab("#FF0000");
    expect(red.L).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 0);
    expect(() => hexToLab("red")).toThrow();
  });

  const kit = (shirt: string, shorts?: string): KitDraft => ({
    shirt: { hex: shirt },
    shorts: shorts ? { hex: shorts } : null,
    gk: null,
  });

  it("warns when the shirts are closer than the configured threshold", () => {
    const s = assessKitSimilarity(kit("#D32F2F"), kit("#7B1F2B")); // red vs maroon
    expect(s?.shirtsClose).toBe(true);
    expect(s?.tooSimilar).toBe(true);
  });

  it("does not warn for clearly different shirts", () => {
    expect(assessKitSimilarity(kit("#D32F2F"), kit("#1565C0"))?.tooSimilar).toBe(false); // red vs blue
  });

  it("does not warn when distinct shorts separate similar shirts", () => {
    const s = assessKitSimilarity(kit("#D32F2F", "#FFFFFF"), kit("#7B1F2B", "#000000"));
    expect(s?.shirtsClose).toBe(true);
    expect(s?.shortsSeparate).toBe(true);
    expect(s?.tooSimilar).toBe(false);
  });

  it("returns null (nothing to compare) while a shirt is missing — never a default colour", () => {
    expect(assessKitSimilarity(EMPTY_KIT_DRAFT, kit("#D32F2F"))).toBeNull();
    expect(kitDraftToTeamKit(EMPTY_KIT_DRAFT)).toBeUndefined();
  });

  it("maps a draft to the contract kit (upper-case hex, trimmed labels, empty label omitted)", () => {
    expect(kitDraftToTeamKit({ shirt: { hex: "#d32f2f", label: "  roja " }, shorts: { hex: "#ffffff", label: " " }, gk: null })).toEqual({
      shirt: { hex: "#D32F2F", label: "roja" },
      shorts: { hex: "#FFFFFF" },
    });
  });
});

// ─── evidence embed URL + video time ──────────────────────────────────────────

describe("evidence embed URL", () => {
  it("appends Bunny's t start-time (whole seconds) and keeps the signed token", () => {
    const url = new URL(buildEvidenceEmbedUrl(EMBED_URL, 312.7) as string);
    expect(url.hostname).toBe("player.mediadelivery.net");
    expect(url.searchParams.get("t")).toBe("312");
    expect(url.searchParams.get("token")).toBe("abc");
    expect(url.searchParams.get("expires")).toBe("1790000000");
  });

  it("replaces an existing t and accepts the deprecated iframe host", () => {
    const url = buildEvidenceEmbedUrl("https://iframe.mediadelivery.net/embed/1/abc?t=5", 90);
    expect(new URL(url as string).searchParams.getAll("t")).toEqual(["90"]);
  });

  it.each([
    ["no embed", null],
    ["http", "http://player.mediadelivery.net/embed/1/abc"],
    ["other host", "https://evil.example.com/embed/1/abc"],
    ["look-alike host", "https://player.mediadelivery.net.evil.com/embed/1/abc"],
    ["not an embed path", "https://player.mediadelivery.net/play/1/abc"],
    ["garbage", "not a url"],
  ])("refuses to frame %s", (_label, embed) => {
    expect(buildEvidenceEmbedUrl(embed, 10)).toBeNull();
  });

  it("refuses a negative or non-finite time", () => {
    expect(buildEvidenceEmbedUrl(EMBED_URL, -1)).toBeNull();
    expect(buildEvidenceEmbedUrl(EMBED_URL, Number.NaN)).toBeNull();
  });

  it("formats video time as m:ss without wrapping hours", () => {
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(312)).toBe("5:12");
    expect(formatVideoTime(5652)).toBe("94:12");
    expect(formatVideoTime(7530)).toBe("125:30");
    expect(formatVideoRange(900, 1800)).toBe("15:00–30:00");
  });
});

// ─── availability (owner decision 29-sep) ────────────────────────────────────

describe("match video availability", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("only the exact string 'true' turns the flag on", () => {
    expect(isMatchVideoFlagOn("true")).toBe(true);
    for (const v of ["TRUE", "True", "1", "yes", "", " true", undefined, null, true]) {
      expect(isMatchVideoFlagOn(v), String(v)).toBe(false);
    }
  });

  it("is OFF by default (no VITE_MATCH_VIDEO_ENABLED in the build)", () => {
    vi.stubEnv("VITE_MATCH_VIDEO_ENABLED", "");
    expect(isMatchVideoClientFlagOn()).toBe(false);
    vi.stubEnv("VITE_MATCH_VIDEO_ENABLED", "true");
    expect(isMatchVideoClientFlagOn()).toBe(true);
  });

  it("is available only with the client flag, outside the demo, and without a server refusal", () => {
    expect(resolveMatchVideoAvailability({ clientFlag: true, isDemo: false, serverDisabled: false })).toBe("available");
    expect(resolveMatchVideoAvailability({ clientFlag: false, isDemo: false, serverDisabled: false })).toBe("in_validation");
    expect(resolveMatchVideoAvailability({ clientFlag: true, isDemo: true, serverDisabled: false })).toBe("in_validation");
    expect(resolveMatchVideoAvailability({ clientFlag: true, isDemo: false, serverDisabled: true })).toBe("in_validation");
  });
});

// ─── possession reliability gate ─────────────────────────────────────────────

describe("possession reliability", () => {
  const segs = (specs: Parameters<typeof buildObservation>[0]) => buildObservation(specs).segments;

  it("flags the flat 50/50 + balanced-everywhere pattern (the spike's no-visual-basis answer)", () => {
    const r = assessPossessionReliability(segs([
      { status: "done", homePct: 50, dominance: "balanced" },
      { status: "done", homePct: 50, dominance: "balanced" },
    ]));
    expect(r.flags).toEqual(["uniform_balanced"]);
    expect(r.lowConfidence).toBe(true);
  });

  it("flags a single 50/50 balanced segment and ignores gated segments", () => {
    const r = assessPossessionReliability(segs([{ status: "done", homePct: 50, dominance: "balanced" }, { status: "failed" }]));
    expect(r.flags).toContain("uniform_balanced");
    expect(isSegmentPossessionLowConfidence(r, 0)).toBe(true);
    expect(isSegmentPossessionLowConfidence(r, 1)).toBe(false); // no value to flag
  });

  it("does not flag when any segment reports a dominance or the split varies", () => {
    expect(assessPossessionReliability(segs([
      { status: "done", homePct: 50, dominance: "balanced" },
      { status: "done", homePct: 50, dominance: "home" },
    ])).lowConfidence).toBe(false);
    expect(assessPossessionReliability(segs([
      { status: "done", homePct: 60, dominance: "balanced" },
      { status: "done", homePct: 40, dominance: "balanced" },
    ])).lowConfidence).toBe(false);
  });

  it("flags a value without a stated basis, only for that segment", () => {
    const r = assessPossessionReliability(segs([
      { status: "done", homePct: 58, dominance: "home", basis: "ball_control_observed" },
      { status: "done", homePct: 61, dominance: "home", basis: null },
    ]));
    expect(r.flags).toEqual(["no_stated_basis"]);
    expect(r.segmentsWithoutBasis).toEqual([1]);
    expect(isSegmentPossessionLowConfidence(r, 0)).toBe(false);
    expect(isSegmentPossessionLowConfidence(r, 1)).toBe(true);
  });

  it("has nothing to flag when no segment has an estimate", () => {
    const r = assessPossessionReliability(segs([{ status: "failed" }, { status: "done", homePct: null }]));
    expect(r).toMatchObject({ lowConfidence: false, flags: [], segmentsWithEstimate: [] });
  });
});

// ─── UI config (config/matchVideoUi.json) ────────────────────────────────────

describe("config/matchVideoUi.json", () => {
  it("gives every value a source, and marks unvalidated thresholds as such", () => {
    const raw = uiConfigRaw as unknown as Record<string, { value?: unknown; _source?: unknown }>;
    for (const [k, e] of Object.entries(raw)) {
      if (k.startsWith("$")) continue;
      expect(typeof e.value, k).toBe("number");
      expect(typeof e._source === "string" && e._source.trim().length > 0, k).toBe(true);
    }
    expect(matchUiConfigSource("kitDeltaEWarn")).toMatch(/pendiente de validar/);
    expect(matchUiConfigSource("notesOnlyReportConfidence")).toMatch(/pendiente de validar/);
    expect(MATCH_UI_CONFIG.statusPollInitialSec).toBeLessThan(MATCH_UI_CONFIG.statusPollMaxSec);
  });
});
