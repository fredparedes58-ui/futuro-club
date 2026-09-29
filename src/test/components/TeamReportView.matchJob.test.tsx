/**
 * TeamReportView — v2 (full-match video job) and v1 (notes-only) rendering rules.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import i18n from "@/i18n";
import TeamReportView, { scrubIndividualTexts } from "@/components/analysis/reports/TeamReportView";
import { provenanceLabel } from "@/components/metrics/MetricValue";
import type { MatchObservation, MatchReportV2 } from "@/lib/shared/matchJob/contract";
import { buildEvidence, buildObservation, buildReport, EMBED_URL } from "../fixtures/matchJob";

const ctx = (observation: MatchObservation | null, extra: Partial<Parameters<typeof TeamReportView>[0]["match"]> = {}) => ({
  observation,
  coverage: observation?.coverage ?? null,
  reportGate: null,
  embedUrl: EMBED_URL,
  homeName: "CD Cantera",
  awayName: "Atlético Barrio",
  ...extra,
});

describe("TeamReportView · v2 (video job)", () => {
  it("puts the coverage banner at the very top, before any conclusion", () => {
    const obs = buildObservation([{ status: "done" }, { status: "failed" }]);
    render(<TeamReportView report={buildReport(obs)} match={ctx(obs)} />);
    const root = screen.getByTestId("team-report-v2");
    expect(root.firstElementChild).toBe(screen.getByTestId("coverage-banner"));
  });

  it("renders each claim with its mm:ss evidence chip (Bunny embed at that second)", () => {
    const obs = buildObservation([{ status: "done" }]);
    render(<TeamReportView report={buildReport(obs)} match={ctx(obs)} />);
    expect(screen.getByText("El local dominó el primer tramo con presión alta.")).toBeInTheDocument();
    const chip = screen.getAllByRole("button", { name: i18n.t("matchJob.evidence.chipTitle", { time: "5:12" }) })[0];
    expect(chip).toHaveAttribute("data-evidence-id", "s0-e1");
  });

  it("shows no overall rating and no LLM self-reported confidence chip", () => {
    const obs = buildObservation([{ status: "done" }]);
    render(<TeamReportView report={buildReport(obs)} match={ctx(obs)} />);
    expect(screen.queryByText(i18n.t("teamReport.overallRating"))).toBeNull();
    expect(screen.queryByText(new RegExp(`^${i18n.t("reportConfidence.label")}`))).toBeNull();
  });

  it("refuses to render a report that carries an overall_rating (contract violation)", () => {
    const obs = buildObservation([{ status: "done" }]);
    const bad = { ...buildReport(obs), overall_rating: { home: 8, away: 6 } } as unknown as MatchReportV2;
    render(<TeamReportView report={bad} match={ctx(obs)} />);
    expect(screen.getByTestId("report-invalid")).toHaveTextContent(i18n.t("matchJob.errors.invalid_response"));
    expect(screen.queryByText("El local dominó el primer tramo con presión alta.")).toBeNull();
  });

  it("a gated value renders its gate_reason, never a dash or a 0", () => {
    const obs = buildObservation([{ status: "done" }, { status: "failed" }]);
    render(<TeamReportView report={buildReport(obs)} match={ctx(obs)} />);
    const breakdown = screen.getByTestId("segment-breakdown");
    expect(within(breakdown).getAllByText("Tramo 2 no analizado: MAX_TOKENS tras 2 intentos.").length).toBeGreaterThan(0);
    expect(breakdown.textContent).not.toMatch(/—|--/);
  });

  it("labels values by provenance: possession 'Estimado por IA', dropped claims 'Calculado'", () => {
    const obs = buildObservation([{ status: "done", homePct: 58 }]);
    render(<TeamReportView report={buildReport(obs)} match={ctx(obs)} />);
    const possession = screen.getAllByTestId("possession-estimate")[0];
    expect(within(possession).getAllByText(provenanceLabel("ESTIMADA_LLM") as string).length).toBeGreaterThan(0);
    expect(screen.getByText(i18n.t("matchJob.report.droppedClaims")).parentElement).toHaveTextContent(provenanceLabel("DERIVADA") as string);
  });

  it("hides any text that still names a shirt number or an individual, and says how many", () => {
    const evidence = [
      buildEvidence(0, 1, 312, "El local presiona alto tras la pérdida."),
      buildEvidence(0, 2, 400, "El #11 del visitante recibe entre líneas.", "away"),
    ];
    const obs = buildObservation([{ status: "done", homeNote: "El dorsal 10 organiza la salida." }], { evidence });
    const report = buildReport(obs, [
      { text: "El local presionó alto.", evidence_ids: ["s0-e1"] },
      { text: "El visitante buscó entre líneas.", evidence_ids: ["s0-e2"] }, // only cites the hidden evidence
      { text: "El jugador 9 fue el más peligroso.", evidence_ids: ["s0-e1"] }, // names an individual
    ]);
    report.teams.away.transitions = [];
    render(<TeamReportView report={report} match={ctx(obs)} />);
    expect(screen.getByText("El local presionó alto.")).toBeInTheDocument();
    expect(screen.queryByText("El visitante buscó entre líneas.")).toBeNull();
    expect(screen.queryByText("El jugador 9 fue el más peligroso.")).toBeNull();
    expect(document.body.textContent).not.toMatch(/#11|dorsal 10/);
    // 1 evidence + 2 claims + 1 segment note
    expect(screen.getByTestId("identity-scrubbed")).toHaveTextContent(i18n.t("matchJob.report.identityScrubbed", { n: 4 }));
  });

  it("marks the flat 50/50 + balanced pattern as low confidence (possession and per segment)", () => {
    const obs = buildObservation([
      { status: "done", homePct: 50, dominance: "balanced" },
      { status: "done", homePct: 50, dominance: "balanced" },
    ]);
    render(<TeamReportView report={buildReport(obs)} match={ctx(obs)} />);
    expect(screen.getByTestId("possession-low-confidence")).toHaveTextContent(i18n.t("matchJob.possession.lowConfidence.uniform_balanced"));
    expect(screen.getByTestId("segments-uniform-warning")).toBeInTheDocument();
    expect(screen.getAllByTestId("possession-low-confidence-tag").length).toBe(3); // aggregate + 2 segments
  });

  it("does not flag a varied possession", () => {
    const obs = buildObservation([{ status: "done", homePct: 62, dominance: "home" }, { status: "done", homePct: 45, dominance: "away" }]);
    render(<TeamReportView report={buildReport(obs)} match={ctx(obs)} />);
    expect(screen.queryByTestId("possession-low-confidence")).toBeNull();
    expect(screen.queryByTestId("possession-low-confidence-tag")).toBeNull();
  });

  it("without a written report, shows the gate reason and still the observation", () => {
    const obs = buildObservation([{ status: "done" }]);
    render(
      <TeamReportView
        report={null}
        match={ctx(obs, { reportGate: { code: "report_engine_unavailable", reason: "El motor de informes no está configurado." } })}
      />,
    );
    expect(screen.getByTestId("report-gate")).toHaveTextContent("El motor de informes no está configurado.");
    expect(screen.getByTestId("coverage-banner")).toBeInTheDocument();
    expect(screen.getByTestId("segment-breakdown")).toBeInTheDocument();
  });

  it("scrubIndividualTexts never keeps a claim without a visible evidence chip", () => {
    const obs = buildObservation([{ status: "done" }]);
    const report = buildReport(obs, [{ text: "Claim limpio", evidence_ids: ["s0-e2"] }]);
    const scrubbed = scrubIndividualTexts(report, obs.evidence.filter((e) => e.id !== "s0-e2"), obs.segments);
    expect(scrubbed.claims).toEqual([]);
    expect(scrubbed.hidden).toBeGreaterThanOrEqual(1);
  });
});

describe("TeamReportView · v1 (notes-only)", () => {
  const legacy = {
    executive_summary: "Partido igualado con dominio local en la primera parte.",
    tactical_overview: { home: { style: "Presión alta", strengths: ["Salida limpia"], weaknesses: [] }, away: { style: "Bloque bajo", strengths: [], weaknesses: [] } },
    key_battles: [],
    momentum_shifts: [],
    recommendations: { home: ["Atacar la espalda"], away: [] },
    overall_rating: { home: 7, away: 6 },
    confidence_score: 70,
  };

  it("mock_fallback: says it is not an analysis and never shows a '0 %' confidence chip", () => {
    const fallback = { executive_summary: "No disponible.", overall_rating: {}, confidence_score: 0, data_completeness: 0 };
    render(<TeamReportView report={fallback} source="mock_fallback" />);
    expect(screen.getByTestId("report-fallback-banner")).toHaveTextContent(i18n.t("matchJob.fallback.mock"));
    expect(screen.queryByText(new RegExp(`${i18n.t("reportConfidence.label")} 0%`))).toBeNull();
  });

  it("error_fallback and fallback_schema_error show their banners", () => {
    const { unmount } = render(<TeamReportView report={{ executive_summary: "Error." }} source="error_fallback" />);
    expect(screen.getByTestId("report-fallback-banner")).toHaveTextContent(i18n.t("matchJob.fallback.error"));
    unmount();
    render(<TeamReportView report={{ executive_summary: "Inválido." }} source="fallback_schema_error" />);
    expect(screen.getByTestId("report-fallback-banner")).toHaveTextContent(i18n.t("matchJob.fallback.schema"));
  });

  it("a real notes-only report has no fallback banner and its rating is an AI estimate, never a bare number", () => {
    render(<TeamReportView report={legacy} source="claude_haiku" />);
    expect(screen.queryByTestId("report-fallback-banner")).toBeNull();
    const ratingSection = screen.getByText(i18n.t("teamReport.overallRating")).closest("section") as HTMLElement;
    expect(within(ratingSection).getAllByText(provenanceLabel("ESTIMADA_LLM") as string)).toHaveLength(2);
    expect(screen.getByTestId("team-report-v1")).toBeInTheDocument();
  });
});
