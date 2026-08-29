import { type AnalysisV2Result } from "@/hooks/usePlayerAnalysisV2";
import { unwrapDnaContent } from "@/lib/reports/reportItems";
import type { AnalysisReport } from "./types";

// ── Bridge: mapea V2 reports al shape legacy que usa el panel de resultados ──
export function mapV2ToReport(result: AnalysisV2Result): AnalysisReport | null {
  if (!result.reports || result.reports.length === 0) return null;
  const get = (type: string) =>
    (result.reports!.find((r) => r.report_type === type)?.content ?? {}) as Record<string, unknown>;

  const pr  = get("player-report");
  const dna = unwrapDnaContent(get("dna-profile")); // content dna-profile viene envuelto {data:{…,dna}}
  const bm  = get("best-match");
  const pj  = get("projection");
  const dp  = get("development-plan");

  const vsiScore = (result.vsi?.vsi as number) ?? 50;
  const strengths   = (pr.strengths as Array<{ title: string }> | undefined) ?? [];
  const areasRaw    = (pr.areas_to_improve as Array<{ title: string }> | undefined) ?? [];
  const defaultDim  = { score: 0.5, observacion: "Estimado por IA" };

  return {
    estadoActual: {
      resumenEjecutivo:  (pr.executive_summary as string) ?? "Análisis completado · pipeline GPU + MediaPipe.",
      nivelActual:       (pr.tier_label as string) ?? (result.vsi?.tierLabel as string) ?? "talent",
      fortalezasPrimarias: strengths.map((s) => s.title),
      areasDesarrollo:   areasRaw.map((a) => a.title),
      dimensiones: {
        velocidadDecision:   defaultDim,
        tecnicaConBalon:     defaultDim,
        inteligenciaTactica: defaultDim,
        capacidadFisica:     defaultDim,
        liderazgoPresencia:  defaultDim,
        eficaciaCompetitiva: defaultDim,
      },
      ajusteVSIVideoScore: Math.round(vsiScore - 50),
    },
    adnFutbolistico: {
      // Campos REALES del agente (_dna-profile.ts): primary_style/style_summary,
      // natural_role, pressure_behavior. Nombres antiguos (playing_style, archetype,
      // mentality) nunca existieron en el schema → daban siempre defaults.
      estiloJuego:      (dna.primary_style as string) ?? (dna.style_summary as string) ?? (dna.estiloJuego as string) ?? "Perfil táctico calculado por IA",
      arquetipoTactico: (dna.natural_role as string) ?? (dna.arquetipoTactico as string) ?? "DNA Análisis",
      patrones:         [],
      mentalidad:       (dna.pressure_behavior as string) ?? (dna.mentalidad as string) ?? "Determinado y competitivo",
    },
    jugadorReferencia: {
      bestMatch: (bm.nombre as string) ? {
        nombre:   bm.nombre as string,
        posicion: (bm.posicion as string) ?? "",
        club:     (bm.club as string) ?? "",
        score:    (bm.score as number) ?? 70,
        narrativa:(bm.narrativa as string) ?? "",
      } : null as never,
    },
    proyeccionCarrera: {
      escenarioOptimista: {
        descripcion:   ((pj.optimistic as Record<string,unknown>)?.description as string) ?? (pj.escenarioOptimista as Record<string,unknown>)?.descripcion as string ?? "Progresión favorable según análisis biomecánico",
        nivelProyecto: ((pj.optimistic as Record<string,unknown>)?.level as string) ?? (pj.escenarioOptimista as Record<string,unknown>)?.nivelProyecto as string ?? "Semi-pro",
      },
      escenarioRealista: {
        descripcion:   ((pj.realistic as Record<string,unknown>)?.description as string) ?? (pj.escenarioRealista as Record<string,unknown>)?.descripcion as string ?? "Desarrollo consistente con dedicación sostenida",
        nivelProyecto: ((pj.realistic as Record<string,unknown>)?.level as string) ?? (pj.escenarioRealista as Record<string,unknown>)?.nivelProyecto as string ?? "Amateur alto",
      },
      factoresClave: (pj.key_factors as string[]) ?? (pj.factoresClave as string[]) ?? [],
      riesgos:       (pj.risks as string[]) ?? (pj.riesgos as string[]) ?? [],
    },
    planDesarrollo: {
      objetivo6meses:  (dp.goal_6months as string) ?? (dp.objetivo6meses as string) ?? "Consolidar fundamentos técnicos",
      objetivo18meses: (dp.goal_18months as string) ?? (dp.objetivo18meses as string) ?? "Transición a nivel competitivo superior",
      pilaresTrabajo:  (dp.pillars as Array<{ pilar: string; acciones: string[]; prioridad: string }>) ?? (dp.pilaresTrabajo as Array<{ pilar: string; acciones: string[]; prioridad: string }>) ?? [],
    },
    confianza: Math.min(1, Math.max(0.3, vsiScore / 100)),
  };
}
