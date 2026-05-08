/**
 * VITAS · Position Rollup Service
 *
 * Agrega los análisis de un jugador y los agrupa por posición jugada,
 * separando declaradas (primary + secondary) vs descubiertas (jugó en
 * una posición no declarada).
 */
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import type { Player } from "./playerService";
import type { PositionRollupRow } from "@/components/PositionRollup";

interface AnalysisRow {
  played_position: string | null;
  report: { vsi?: number | { score?: number } } | null;
  created_at: string;
}

/** Lee todos los análisis del jugador y devuelve filas de rollup por posición. */
export async function getPositionRollup(player: Player): Promise<PositionRollupRow[]> {
  if (!SUPABASE_CONFIGURED) return [];

  const { data, error } = await supabase
    .from("player_analyses")
    .select("played_position, report, created_at")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) return [];

  const rows = data as AnalysisRow[];
  const declared = new Set([player.position, ...(player.secondaryPositions ?? [])].filter(Boolean));

  // Agrupar por played_position (fallback a player.position si null)
  const groups = new Map<string, AnalysisRow[]>();
  for (const r of rows) {
    const pos = r.played_position ?? player.position;
    if (!groups.has(pos)) groups.set(pos, []);
    groups.get(pos)!.push(r);
  }

  const result: PositionRollupRow[] = [];
  for (const [positionName, items] of groups.entries()) {
    const vsis = items
      .map((it) => {
        const v = it.report?.vsi;
        if (typeof v === "number") return v;
        if (v && typeof v === "object" && typeof v.score === "number") return v.score;
        return null;
      })
      .filter((v): v is number => v !== null);
    const avgVsi = vsis.length > 0 ? vsis.reduce((s, n) => s + n, 0) / vsis.length : null;

    result.push({
      positionName,
      videoCount:  items.length,
      avgVsi,
      avgFit:      null,                       // se rellena en F3 cuando esté el fit por posición
      isDeclared:  declared.has(positionName),
      isPrimary:   positionName === player.position,
      lastVideoAt: items[0]?.created_at,
    });
  }

  // Añadir posiciones declaradas SIN videos (para que aparezcan con count 0)
  for (const decl of declared) {
    if (!result.find((r) => r.positionName === decl)) {
      result.push({
        positionName: decl,
        videoCount:   0,
        avgVsi:       null,
        avgFit:       null,
        isDeclared:   true,
        isPrimary:    decl === player.position,
      });
    }
  }

  return result;
}
