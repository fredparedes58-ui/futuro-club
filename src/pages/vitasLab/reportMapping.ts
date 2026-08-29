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

  const strengths   = (pr.strengths as Array<{ title: string }> | undefined) ?? [];
  const areasRaw    = (pr.areas_to_improve as Array<{ title: string }> | undefined) ?? [];
  const defaultDim  = { score: 0.5, observacion: "Estimado por IA" };
  // ¿Hay datos REALES de proyección? El mapeo lee pj.optimistic/realistic (o el legacy
  // escenarioOptimista/Realista); el agente los emite bajo otra forma y el informe se
  // OMITE cuando el VSI-vídeo está bloqueado (hoy siempre) → pj={}. Sin estos campos NO
  // hay proyección que mostrar: se gatea a null en vez de fabricar "Semi-pro" (#40 clase).
  const hasProjection = !!(
    (pj.optimistic as unknown) ?? (pj.escenarioOptimista as unknown) ??
    (pj.realistic as unknown)  ?? (pj.escenarioRealista as unknown)
  );

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
      // null cuando el VSI-vídeo está BLOQUEADO (backend vsi:null, <4/5 dims reales).
      // Antes `?? 50` → 0 → badge "VSI +0 pts" fabricado en cada informe (#40).
      ajusteVSIVideoScore: result.vsi?.vsi == null ? null : Math.round((result.vsi.vsi as number) - 50),
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
    proyeccionCarrera: hasProjection ? {
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
    } : null,
    planDesarrollo: {
      objetivo6meses:  (dp.goal_6months as string) ?? (dp.objetivo6meses as string) ?? "Consolidar fundamentos técnicos",
      objetivo18meses: (dp.goal_18months as string) ?? (dp.objetivo18meses as string) ?? "Transición a nivel competitivo superior",
      pilaresTrabajo:  (dp.pillars as Array<{ pilar: string; acciones: string[]; prioridad: string }>) ?? (dp.pilaresTrabajo as Array<{ pilar: string; acciones: string[]; prioridad: string }>) ?? [],
    },
    // confianza = confidence REAL del VSI compuesto, PERO solo si es > 0. Cuando el
    // compuesto está bloqueado, gateVsiComposite → gated() → confidence:0 (sentinela de
    // "sin base medida"). Un 0 renderizado como "0%" es justo lo que prohíbe el inv #2
    // (un 0 que significa «no se pudo medir»). >0 ⇒ número real; 0 o ausente ⇒ null → la
    // UI oculta el badge. Antes `?? 50` → 0.5 fabricado (#40 clase).
    confianza: (result.vsi?.confidence as number) > 0 ? (result.vsi!.confidence as number) : null,
  };
}
