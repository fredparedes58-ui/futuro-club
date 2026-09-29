/**
 * Match video job components (PR-C): KitColourPicker (+ ΔE warning), AttestationCheckbox,
 * CoverageBanner, EvidenceLink, PossessionEstimate, MatchJobProgress and the
 * "En validación" notice.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import i18n from "@/i18n";
import es from "@/i18n/es.json";
import en from "@/i18n/en.json";
import it_ from "@/i18n/it.json";
import fr from "@/i18n/fr.json";
import de from "@/i18n/de.json";
import nl from "@/i18n/nl.json";
import es419 from "@/i18n/es-419.json";
import { provenanceLabel } from "@/components/metrics/MetricValue";
import KitColourPicker, { KitSimilarityWarning } from "@/components/match/KitColourPicker";
import AttestationCheckbox, { ATTESTATION_TEXT_KEYS, buildAttestation } from "@/components/match/AttestationCheckbox";
import CoverageBanner, { coveragePercentForDisplay } from "@/components/match/CoverageBanner";
import EvidenceLink, { EvidencePlayerDialog } from "@/components/match/EvidenceLink";
import PossessionEstimate from "@/components/match/PossessionEstimate";
import MatchJobProgress from "@/components/match/MatchJobProgress";
import MatchVideoValidationNotice from "@/components/match/MatchVideoValidationNotice";
import { EMPTY_KIT_DRAFT, type KitDraft } from "@/lib/match/kitColour";
import { MATCH_ATTESTATION_TEXT_ES, MATCH_ATTESTATION_VERSION } from "@/lib/shared/matchJob/contract";
import { buildEvidence, buildObservation, buildStatus, der, EMBED_URL, gatedLlm, llm } from "../../fixtures/matchJob";

const LLM_LABEL = provenanceLabel("ESTIMADA_LLM") as string;
const DERIVED_LABEL = provenanceLabel("DERIVADA") as string;

// ─── KitColourPicker ─────────────────────────────────────────────────────────

function KitHarness() {
  const [home, setHome] = useState<KitDraft>(EMPTY_KIT_DRAFT);
  const [away, setAway] = useState<KitDraft>(EMPTY_KIT_DRAFT);
  return (
    <>
      <KitColourPicker idPrefix="home" title="Local" value={home} onChange={setHome} required />
      <KitColourPicker idPrefix="away" title="Visitante" value={away} onChange={setAway} required />
      <KitSimilarityWarning home={home} away={away} />
    </>
  );
}

const swatch = (team: "home" | "away", slot: "shirt" | "shorts", colour: string) =>
  within(screen.getByTestId(`kit-picker-${team}`)).getByRole("button", {
    name: `${i18n.t(`matchJob.kit.${slot}`)}: ${i18n.t(`matchJob.kit.colour.${colour}`)}`,
  });

describe("KitColourPicker", () => {
  it("requires the shirt colour (no default) and never pre-selects one", () => {
    render(<KitHarness />);
    expect(screen.getAllByText(i18n.t("matchJob.kit.shirtRequired"))).toHaveLength(2);
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("warns (ΔE below the configured threshold) when the two shirts are too similar", () => {
    render(<KitHarness />);
    fireEvent.click(swatch("home", "shirt", "red"));
    fireEvent.click(swatch("away", "shirt", "maroon"));
    expect(swatch("home", "shirt", "red")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("kit-similarity-warning")).toHaveTextContent(i18n.t("matchJob.kit.similarWarning"));
  });

  it("does not warn for clearly different shirts", () => {
    render(<KitHarness />);
    fireEvent.click(swatch("home", "shirt", "red"));
    fireEvent.click(swatch("away", "shirt", "blue"));
    expect(screen.queryByTestId("kit-similarity-warning")).toBeNull();
  });

  it("drops the warning when distinct shorts separate similar shirts", () => {
    render(<KitHarness />);
    fireEvent.click(swatch("home", "shirt", "red"));
    fireEvent.click(swatch("away", "shirt", "maroon"));
    expect(screen.getByTestId("kit-similarity-warning")).toBeInTheDocument();
    fireEvent.click(swatch("home", "shorts", "white"));
    fireEvent.click(swatch("away", "shorts", "black"));
    expect(screen.queryByTestId("kit-similarity-warning")).toBeNull();
  });
});

// ─── AttestationCheckbox ─────────────────────────────────────────────────────

describe("AttestationCheckbox", () => {
  it("is a required checkbox showing the versioned declaration text", () => {
    const onChange = vi.fn();
    render(<AttestationCheckbox id="att" checked={false} onChange={onChange} />);
    const box = screen.getByRole("checkbox");
    expect(box).toBeRequired();
    expect(box).not.toBeChecked();
    expect(screen.getByText(i18n.t(ATTESTATION_TEXT_KEYS[MATCH_ATTESTATION_VERSION]), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("matchJob.attestation.required"))).toBeInTheDocument();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("builds the start fragment only when ticked, with the contract version", () => {
    expect(buildAttestation(false)).toBeNull();
    expect(buildAttestation(true)).toEqual({ accepted: true, version: MATCH_ATTESTATION_VERSION });
  });

  it("the Spanish text IS the canonical legal wording, and all 7 locales translate that version", () => {
    const key = ATTESTATION_TEXT_KEYS[MATCH_ATTESTATION_VERSION].split(".").pop() as string;
    expect((es.matchJob.attestation as Record<string, string>)[key]).toBe(MATCH_ATTESTATION_TEXT_ES);
    for (const loc of [es, es419, en, it_, fr, de, nl]) {
      const text = (loc.matchJob.attestation as Record<string, string>)[key];
      expect(typeof text === "string" && text.length > 20).toBe(true);
    }
  });
});

// ─── CoverageBanner ──────────────────────────────────────────────────────────

describe("CoverageBanner", () => {
  it("never shows 100 % when a segment failed, even if rounding would say so", () => {
    const obs = buildObservation([{ status: "done" }, { status: "failed" }]);
    const coverage = { ...obs.coverage, analysed_fraction: der(0.9995) };
    render(<CoverageBanner coverage={coverage} />);
    const summary = screen.getByTestId("coverage-summary");
    expect(summary).toHaveTextContent("99 %");
    expect(summary).not.toHaveTextContent("100 %");
    expect(screen.getByText(i18n.t("matchJob.coverage.partialNote"), { exact: false })).toBeInTheDocument();
  });

  it("caps the display at 99 % while anything is not done; 100 % only when all segments are done", () => {
    expect(coveragePercentForDisplay(1, false)).toBe(99);
    expect(coveragePercentForDisplay(0.996, true)).toBe(99);
    expect(coveragePercentForDisplay(1, true)).toBe(100);
    expect(coveragePercentForDisplay(0.6, false)).toBe(60);
  });

  it("lists every non-analysed segment and ambiguous interval with its reason and provenance", () => {
    const obs = buildObservation([{ status: "done" }, { status: "failed" }], { ambiguousSec: 240 });
    render(<CoverageBanner coverage={obs.coverage} />);
    const gaps = screen.getByTestId("coverage-gaps");
    expect(gaps).toHaveTextContent(i18n.t("matchJob.coverage.gapSegment", { range: "15:00–30:00", reason: "MAX_TOKENS tras 2 intentos" }));
    expect(gaps).toHaveTextContent(i18n.t("matchJob.coverage.gapAmbiguous", { range: "5:00–9:00", reason: "Camisetas parecidas a contraluz" }));
    // Not-analysed segment = DERIVADA (job state); ambiguous = model self-report = ESTIMADA_LLM.
    expect(within(gaps).getByText(DERIVED_LABEL)).toBeInTheDocument();
    expect(within(gaps).getByText(LLM_LABEL)).toBeInTheDocument();
    // Analysed of total in video time, DERIVADA.
    expect(screen.getByTestId("coverage-summary")).toHaveTextContent("15:00");
    expect(screen.getByTestId("coverage-summary")).toHaveTextContent("30:00");
  });

  it("shows 100 % and 'complete' only when every segment is done", () => {
    const obs = buildObservation([{ status: "done" }, { status: "done" }]);
    render(<CoverageBanner coverage={obs.coverage} />);
    expect(screen.getByTestId("coverage-summary")).toHaveTextContent("100 %");
    expect(screen.getByText(i18n.t("matchJob.coverage.complete"), { exact: false })).toBeInTheDocument();
  });
});

// ─── EvidenceLink ────────────────────────────────────────────────────────────

describe("EvidenceLink", () => {
  const item = buildEvidence(0, 1, 312, "El local presiona alto.");

  it("shows mm:ss and opens the Bunny embed at that second (t=312)", () => {
    const onOpen = vi.fn();
    render(<EvidenceLink item={item} embedUrl={EMBED_URL} onOpen={onOpen} />);
    const chip = screen.getByRole("button", { name: i18n.t("matchJob.evidence.chipTitle", { time: "5:12" }) });
    expect(chip).toHaveTextContent("5:12");
    fireEvent.click(chip);
    const target = onOpen.mock.calls[0][0];
    const url = new URL(target.url);
    expect(url.origin).toBe("https://player.mediadelivery.net");
    expect(url.searchParams.get("t")).toBe("312");
    expect(url.searchParams.get("token")).toBe("abc");
    expect(target).toMatchObject({ seconds: 312, evidenceId: "s0-e1" });
  });

  it("falls back to a new tab (noopener) without an in-app player", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<EvidenceLink item={item} embedUrl={EMBED_URL} />);
    fireEvent.click(screen.getByRole("button"));
    expect(open).toHaveBeenCalledWith(expect.stringContaining("t=312"), "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("is disabled and says why when there is no playable embed", () => {
    render(<EvidenceLink item={item} embedUrl={null} />);
    const chip = screen.getByRole("button", { name: i18n.t("matchJob.evidence.unavailable") });
    expect(chip).toBeDisabled();
  });

  it("the player dialog frames exactly the built URL", () => {
    const url = `${EMBED_URL}&t=312`;
    render(<EvidencePlayerDialog target={{ url, seconds: 312, evidenceId: "s0-e1" }} onClose={() => {}} />);
    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(url);
    expect(screen.getByText(i18n.t("matchJob.evidence.dialogNote"))).toBeInTheDocument();
  });
});

// ─── PossessionEstimate ──────────────────────────────────────────────────────

describe("PossessionEstimate", () => {
  it("renders the AI estimate through the canonical ProvenanceBadge ('Estimado por IA'), never 'Medido'", () => {
    render(<PossessionEstimate possession={{ home: llm(58, "%"), away: llm(42, "%") }} homeName="Cantera" awayName="Barrio" />);
    const box = screen.getByTestId("possession-estimate");
    expect(box).toHaveTextContent("58 %");
    expect(box).toHaveTextContent("42 %");
    expect(within(box).getAllByText(LLM_LABEL)).toHaveLength(2);
    expect(within(box).queryByText(provenanceLabel("MEDIDA") as string)).toBeNull();
    expect(box).toHaveTextContent(i18n.t("matchJob.possession.note"));
  });

  it("a gated value shows its gate_reason once — never 0, never a dash", () => {
    const g = gatedLlm("no_usable_segments", "Ningún tramo con posesión utilizable.");
    render(<PossessionEstimate possession={{ home: g, away: g }} homeName="Cantera" awayName="Barrio" />);
    const box = screen.getByTestId("possession-estimate");
    expect(within(box).getAllByText("Ningún tramo con posesión utilizable.")).toHaveLength(1);
    expect(box.textContent).not.toMatch(/\b0 %|—|--/);
  });

  it("labels a no-visual-basis estimate as low confidence (values still shown, never as a confident figure)", () => {
    render(
      <PossessionEstimate
        possession={{ home: llm(50, "%"), away: llm(50, "%") }}
        homeName="Cantera"
        awayName="Barrio"
        lowConfidence
        reliabilityFlags={["uniform_balanced"]}
      />,
    );
    expect(screen.getByTestId("possession-low-confidence-tag")).toHaveTextContent(i18n.t("matchJob.possession.lowConfidenceTag"));
    expect(screen.getByTestId("possession-low-confidence")).toHaveTextContent(i18n.t("matchJob.possession.lowConfidence.uniform_balanced"));
    expect(screen.getByTestId("possession-estimate")).toHaveTextContent("50 %");
  });
});

// ─── MatchJobProgress ────────────────────────────────────────────────────────

describe("MatchJobProgress", () => {
  it("while Bunny encodes: 'Bunny procesando (puede tardar horas)' and no invented %", () => {
    render(<MatchJobProgress data={buildStatus({ status: "awaiting_encode", encodePct: null })} />);
    expect(screen.getByTestId("match-job-stage")).toHaveTextContent(i18n.t("matchJob.stage.encoding"));
    expect(screen.getByText(i18n.t("matchJob.progress.encodeHint"))).toBeInTheDocument();
    expect(screen.getByTestId("match-job-progress").textContent).not.toMatch(/\d+ ?%/);
  });

  it("shows the Bunny encode % only when Bunny reports it", () => {
    render(<MatchJobProgress data={buildStatus({ status: "awaiting_encode", encodePct: 40 })} />);
    expect(screen.getByText(i18n.t("matchJob.progress.encodeProgress", { pct: 40 }))).toBeInTheDocument();
  });

  it("while observing: segment k/n with its video-time range", () => {
    const obs = buildObservation([{ status: "done" }, { status: "done" }, { status: "running" }, { status: "pending" }]);
    const data = buildStatus({ status: "observing", segmentsDone: 2, segmentsTotal: 4, currentSegmentIdx: 2, observation: obs });
    render(<MatchJobProgress data={data} />);
    const expected = `${i18n.t("matchJob.progress.segment", { k: 3, n: 4 })} · ${i18n.t("matchJob.progress.segmentRange", { range: "30:00–45:00" })}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("before segments are planned, no invented total", () => {
    render(<MatchJobProgress data={buildStatus({ status: "observing", segmentsTotal: null })} />);
    expect(screen.getByText(i18n.t("matchJob.progress.segmentsPending"))).toBeInTheDocument();
  });

  it("a failed job shows the server message and code", () => {
    render(<MatchJobProgress data={buildStatus({ status: "failed", error: { code: "encode_failed", message: "Bunny no pudo codificar el vídeo." } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Bunny no pudo codificar el vídeo.");
    expect(screen.getByRole("alert")).toHaveTextContent("encode_failed");
  });

  it("team_baseline has no written report in the job: its last stage is aggregation", () => {
    render(<MatchJobProgress data={buildStatus({ status: "aggregating", purpose: "team_baseline", focusTeam: "home" })} />);
    expect(screen.getByTestId("match-job-stage")).toHaveTextContent(i18n.t("matchJob.stage.aggregating"));
  });
});

// ─── MatchVideoValidationNotice ──────────────────────────────────────────────

describe("MatchVideoValidationNotice", () => {
  it("explains why the path is not offered and points to the notes-only report", () => {
    const onUseNotes = vi.fn();
    render(<MatchVideoValidationNotice onUseNotes={onUseNotes} />);
    const box = screen.getByTestId("match-video-in-validation");
    expect(box).toHaveTextContent(i18n.t("matchJob.validation.badge"));
    expect(box).toHaveTextContent(i18n.t("matchJob.validation.reason"));
    expect(screen.queryByRole("button", { name: i18n.t("matchJob.validation.demoPreview") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("matchJob.validation.useNotes") }));
    expect(onUseNotes).toHaveBeenCalled();
  });

  it("says so when the server refused, and offers the example only in the demo", () => {
    const onDemo = vi.fn();
    render(<MatchVideoValidationNotice serverRefused onDemoPreview={onDemo} />);
    expect(screen.getByText(i18n.t("matchJob.validation.serverRefused"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("matchJob.validation.demoPreview") }));
    expect(onDemo).toHaveBeenCalled();
  });
});
