import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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

// ── Fetch insights from API ───────────────────────────────────────────────────

async function fetchInsights(filters: InsightsFilters = {}): Promise<InsightsResponse> {
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
  const headers = await getAuthHeaders();
  const res = await fetch("/api/scout/generate", {
    method: "POST",
    headers,
    body: JSON.stringify({ playerId }),
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
