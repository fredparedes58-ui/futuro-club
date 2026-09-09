import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { IS_DEMO } from "@/lib/demoMode";
import { PlayerService } from "@/services/real/playerService";
import { playerMaturity } from "@/lib/phv/playerMaturity";
import i18n from "@/i18n";
import { normalizeLocale } from "@/lib/shared/locale";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoutInsightRow {
  id: string;
  user_id: string;
  player_id: string;
  player_name: string;
  insight_type: "breakout" | "comparison" | "phv-alert" | "drill-record" | "regression" | "milestone";
  title: string;
  description: string;
  metric: string | null;
  metric_value: string | null;
  urgency: "high" | "medium" | "low";
  tags: string[];
  context_data: Record<string, unknown>;
  rag_drills: Array<{ name: string; reason: string }>;
  action_items: string[];
  benchmark: string | null;
  is_read: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface InsightsResponse {
  insights: ScoutInsightRow[];
  total: number;
  unread: number;
  limit: number;
  offset: number;
}

export interface InsightsFilters {
  type?: string;
  urgency?: string;
  playerId?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

// ── Auth header helper ────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers["Authorization"] = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // no session
  }
  return headers;
}

// ── DEMO: insights de ejemplo (sin red) ───────────────────────────────────────
const METRIC_ES: Record<string, string> = {
  speed: "Velocidad", technique: "Técnica", vision: "Visión",
  stamina: "Resistencia", shooting: "Definición", defending: "Defensa",
};

function buildDemoInsights(filters: InsightsFilters = {}): InsightsResponse {
  let players = PlayerService.getAll();
  if (filters.playerId) players = players.filter((p) => p.id === filters.playerId);
  const rows: ScoutInsightRow[] = players.slice(0, 12).map((p) => {
    const m = (p.metrics ?? {}) as Record<string, number>;
    const topKey = Object.keys(METRIC_ES).sort((a, b) => (m[b] ?? 0) - (m[a] ?? 0))[0] ?? "technique";
    const mat = playerMaturity(p as unknown as Parameters<typeof playerMaturity>[0]);
    const isLate = mat.timing === "late";
    const type: ScoutInsightRow["insight_type"] =
      isLate ? "phv-alert" : (p.vsi ?? 0) >= 70 ? "breakout" : "comparison";
    const first = p.name.split(" ")[0];
    return {
      id: `demo-insight-${p.id}`,
      user_id: "demo",
      player_id: p.id,
      player_name: p.name,
      insight_type: type,
      title: isLate
        ? `${first}: joya oculta (madurador tardío)`
        : `${first} destaca en ${METRIC_ES[topKey].toLowerCase()}`,
      description: isLate
        ? `${first} madura por detrás de sus pares; su percentil está frenado por el crecimiento y proyecta al alza. Talento a menudo infravalorado — datos de ejemplo del demo.`
        : `${first} muestra un nivel destacado en ${METRIC_ES[topKey].toLowerCase()} (${Math.round(m[topKey] ?? 0)}). Insight de ejemplo del demo.`,
      metric: METRIC_ES[topKey],
      metric_value: `${Math.round(m[topKey] ?? 0)}`,
      urgency: isLate ? "high" : "low",
      tags: ["ejemplo", type],
      context_data: {},
      rag_drills: [],
      action_items: ["Dar continuidad de minutos"],
      benchmark: "Referencia de ejemplo para su categoría",
      is_read: false,
      is_archived: false,
      created_at: "2026-09-01T10:00:00.000Z",
    };
  });
  return { insights: rows, total: rows.length, unread: rows.length, limit: filters.limit ?? 20, offset: filters.offset ?? 0 };
}

// ── Fetch insights from API ───────────────────────────────────────────────────

async function fetchInsights(filters: InsightsFilters = {}): Promise<InsightsResponse> {
  if (IS_DEMO) return buildDemoInsights(filters);
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.urgency) params.set("urgency", filters.urgency);
  if (filters.playerId) params.set("playerId", filters.playerId);
  if (filters.archived) params.set("archived", "true");
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const headers = await getAuthHeaders();
  const res = await fetch(`/api/scout/insights?${params}`, { headers });

  if (!res.ok) {
    throw new Error(`Failed to fetch insights: ${res.status}`);
  }

  const json = await res.json() as { data?: InsightsResponse };
  return json.data ?? { insights: [], total: 0, unread: 0, limit: 20, offset: 0 };
}

// ── Generate insights ─────────────────────────────────────────────────────────

async function generateInsights(playerId?: string): Promise<{ generated: number }> {
  if (IS_DEMO) {
    // En demo los insights ya están "generados" (buildDemoInsights); devolvemos
    // el conteo para que la UI muestre el éxito y refresque la lista.
    const n = playerId ? 1 : PlayerService.getAll().length;
    return { generated: n };
  }
  const headers = await getAuthHeaders();
  const res = await fetch("/api/scout/generate", {
    method: "POST",
    headers,
    // locale = idioma actual de la UI → el insight se redacta en ese idioma
    // (el endpoint lo pasa a languageDirective; sin él caería al idioma por defecto).
    body: JSON.stringify({ playerId, locale: normalizeLocale(i18n.language) }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to generate: ${errText.slice(0, 200)}`);
  }

  const json = await res.json() as { data?: { generated: number } };
  return json.data ?? { generated: 0 };
}

// ── Update insight (read/archive) ─────────────────────────────────────────────

async function updateInsight(id: string, updates: { is_read?: boolean; is_archived?: boolean }) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/scout/insights", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) throw new Error("Failed to update insight");
  return res.json();
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useScoutInsights(filters: InsightsFilters = {}) {
  return useQuery({
    queryKey: ["scout-insights", filters],
    queryFn: () => fetchInsights(filters),
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
}

export function useGenerateInsights() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playerId?: string) => generateInsights(playerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scout-insights"] });
    },
  });
}

export function useUpdateInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string; is_read?: boolean; is_archived?: boolean }) =>
      updateInsight(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scout-insights"] });
    },
  });
}
