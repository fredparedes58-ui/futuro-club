/**
 * VITAS · Match job → bloque de prompt para /api/team/baseline-analysis (matchAnalysisId)
 *
 * Construye, en SERVIDOR y desde la observación almacenada del job, la sección de vídeo
 * del equipo FOCO. Sustituye a la observación que antes mandaba el cliente (y al
 * `playerContext {age:13}` inventado). Solo valores evaluados (null ⇒ se omite con su
 * motivo), todo marcado como ESTIMADO POR IA a nivel de equipo; nada por jugador.
 */
import type { MatchObservation, TeamSide } from "../../../src/lib/shared/matchJob/contract";
import { formatRange, formatVideoTime } from "./messages";

/** Evidencias del equipo foco incluidas como máximo (acota tokens del prompt). */
const MAX_EVIDENCE_LINES = 30;

type TeamMetrics = MatchObservation["segments"][number]["teams"]["home"];

function describeTeam(t: TeamMetrics): string {
  const parts: string[] = [];
  const add = (label: string, m: { value: unknown }) => {
    if (m.value !== null && m.value !== undefined) parts.push(`${label} ${String(m.value)}`);
  };
  add("formación", t.formation);
  add("fase", t.phases.predominant);
  add("salida", t.build_up.style);
  add("presión altura", t.pressing.height);
  add("presión intensidad", t.pressing.intensity);
  add("bloque altura", t.block.height);
  add("bloque", t.block.compactness);
  add("transición ofensiva", t.transitions.attacking);
  add("transición defensiva", t.transitions.defensive);
  add("amenaza a balón parado", t.set_pieces.threat);
  return parts.length ? parts.join(" · ") : "sin descriptores evaluados";
}

export function buildMatchObservationSection(o: MatchObservation, focus: TeamSide, kitLabel: string | null): string {
  const c = o.coverage;
  const rival: TeamSide = focus === "home" ? "away" : "home";
  const lines: string[] = [
    "\n─── OBSERVACIÓN DEL PARTIDO POR VÍDEO (job de partido · Gemini · ESTIMADA POR IA · nivel equipo) ───",
    `Equipo foco: ${focus === "home" ? "LOCAL" : "VISITANTE"}${kitLabel ? ` (camiseta ${kitLabel})` : ""}. Rival: ${rival === "home" ? "LOCAL" : "VISITANTE"}.`,
  ];
  const dur = c.duration_sec.value;
  lines.push(
    dur !== null
      ? `Cobertura (tiempo de vídeo, no minutos de partido): analizado ${formatVideoTime(c.analysed_sec.value ?? 0)} de ${formatVideoTime(dur)}.`
      : "Cobertura: duración del vídeo desconocida.",
  );
  for (const g of c.gaps) lines.push(`  hueco ${formatRange(g.start_sec, g.end_sec)}: ${g.reason}`);

  lines.push("Por tramo (solo lo evaluado por la IA):");
  for (const s of o.segments) {
    const range = formatRange(s.start_sec, s.end_sec);
    if (s.status !== "done") {
      lines.push(`  ${range}: no analizado (${s.dominance.gate_reason ?? s.status})`);
      continue;
    }
    if (s.team_identification.value === "ambiguous") {
      lines.push(`  ${range}: equipos no distinguibles (${s.dominance.gate_reason ?? "ambiguo"})`);
      continue;
    }
    const dom = s.dominance.value ? ` · dominio ${s.dominance.value === "balanced" ? "equilibrado" : s.dominance.value === focus ? "equipo foco" : "rival"}` : "";
    const pos = s.possession[focus].value !== null ? ` · posesión estimada por IA ${s.possession[focus].value}%` : "";
    lines.push(`  ${range}: ${describeTeam(s.teams[focus])}${dom}${pos}`);
  }
  if (o.possession[focus].value !== null) {
    lines.push(`Posesión estimada por IA del equipo foco (ponderada por segundos analizados): ${o.possession[focus].value}% — estimación, no estadística oficial.`);
    for (const f of o.possession_detail.low_confidence ?? []) {
      lines.push(`  BAJA CONFIANZA: ${f.reason} No apoyes ninguna conclusión en la posesión.`);
    }
  }
  const ev = o.evidence.filter((e) => e.team === focus).slice(0, MAX_EVIDENCE_LINES);
  if (ev.length) {
    lines.push("Evidencias del equipo foco (punteros de IA con marca de tiempo, no verificados):");
    for (const e of ev) lines.push(`  [${formatRange(e.t_start, e.t_end)}] ${e.category}: ${e.text}`);
  }
  lines.push("REGLA: son estimaciones de un modelo de vídeo sin validación humana; úsalas como indicios, nunca como estadísticas, y no atribuyas nada a jugadores concretos.");
  return lines.join("\n");
}
