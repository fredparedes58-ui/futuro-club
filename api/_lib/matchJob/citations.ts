/**
 * VITAS · Match job — validador DETERMINISTA de citas del informe (team-report.v2)
 *
 * Cada afirmación de Claude debe citar ≥1 id de evidencia que EXISTA en el índice
 * agregado (cuyos tiempos ya están dentro de su tramo, ver aggregate.ts). Se descartan
 * y se cuentan:
 *   - missing_evidence: la afirmación no cita nada;
 *   - unknown_evidence_id: ninguno de sus ids existe (los ids inexistentes se quitan);
 *   - identity_guard: el texto menciona un dorsal/número/nombre (identidad.md).
 * El validador comprueba EXISTENCIA y rango, no significado: una cita real puede estar
 * mal descrita → los chips de evidencia permiten verificarla a mano.
 *
 * `dropped_claims.total` es DERIVADA (conteo determinista sobre el estado del informe).
 */
import { makeMetric } from "../../../src/lib/metrics/MetricResult";
import type { MatchReportLlmOutput, ReportClaim } from "../../../src/lib/shared/matchJob/contract";
import { textMentionsIndividual, type NameGuard } from "./identityGuard";

export interface DroppedCounts {
  missing_evidence: number;
  unknown_evidence_id: number;
  identity_guard: number;
}

export interface ValidatedClaims {
  claims: ReportClaim[];
  teams: Record<"home" | "away", Record<keyof MatchReportLlmOutput["teams"]["home"], ReportClaim[]>>;
  not_evaluated: string[];
  dropped: DroppedCounts;
}

type ClaimIn = MatchReportLlmOutput["claims"][number];

function validateList(list: readonly ClaimIn[], ids: ReadonlySet<string>, names: NameGuard, dropped: DroppedCounts): ReportClaim[] {
  const out: ReportClaim[] = [];
  for (const c of list) {
    if (textMentionsIndividual(c.text, names)) {
      dropped.identity_guard++;
      continue;
    }
    if (c.evidence_ids.length === 0) {
      dropped.missing_evidence++;
      continue;
    }
    const valid = [...new Set(c.evidence_ids.filter((id) => ids.has(id)))];
    if (valid.length === 0) {
      dropped.unknown_evidence_id++;
      continue;
    }
    out.push({ text: c.text, evidence_ids: valid });
  }
  return out;
}

export function validateReportCitations(output: MatchReportLlmOutput, evidenceIds: ReadonlySet<string>, names: NameGuard): ValidatedClaims {
  const dropped: DroppedCounts = { missing_evidence: 0, unknown_evidence_id: 0, identity_guard: 0 };
  const claims = validateList(output.claims, evidenceIds, names, dropped);
  const section = (side: "home" | "away") => {
    const t = output.teams[side];
    return {
      in_possession: validateList(t.in_possession, evidenceIds, names, dropped),
      out_of_possession: validateList(t.out_of_possession, evidenceIds, names, dropped),
      transitions: validateList(t.transitions, evidenceIds, names, dropped),
      set_pieces: validateList(t.set_pieces, evidenceIds, names, dropped),
      strengths: validateList(t.strengths, evidenceIds, names, dropped),
      areas_to_improve: validateList(t.areas_to_improve, evidenceIds, names, dropped),
      recommendations: validateList(t.recommendations, evidenceIds, names, dropped),
    };
  };
  const notEvaluated = output.not_evaluated.filter((t) => {
    const bad = textMentionsIndividual(t, names);
    if (bad) dropped.identity_guard++;
    return !bad;
  });
  return { claims, teams: { home: section("home"), away: section("away") }, not_evaluated: notEvaluated, dropped };
}

/** `dropped_claims` del informe almacenado (total DERIVADA + desglose interno). */
export function droppedClaimsBlock(dropped: DroppedCounts) {
  const total = dropped.missing_evidence + dropped.unknown_evidence_id + dropped.identity_guard;
  const m = makeMetric({
    value: total,
    provenance: "DERIVADA",
    confidence: 1,
    units: null,
    calibrated: false,
    gate_reason: null,
  });
  return { total: { ...m, calibrated: false as const, gate_code: null }, by_reason: { ...dropped } };
}
