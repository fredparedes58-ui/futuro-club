/**
 * useBusinessAnalytics — Server-side business metrics for Director Dashboard
 *
 * Fetches aggregated data from /api/admin/analytics:
 * - AI usage by endpoint (this month vs previous)
 * - Team members by role/status
 * - Player analyses by agent
 * - Subscription status
 * - Recent scout insights
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/apiAuth";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BusinessAnalytics {
  generatedAt: string;
  month: string;
  usage: {
    thisMonth: number;
    previousMonth: number;
    growthPercent: number;
    byEndpoint: Record<string, number>;
  };
  players: {
    total: number;
  };
  team: {
    total: number;
    byRole: Record<string, number>;
    byStatus: Record<string, number>;
  };
  analyses: {
    total: number;
    byAgent: Record<string, number>;
  };
  subscription: {
    plan: string;
    status: string;
    current_period_end: string;
  } | null;
  recentInsights: Array<{
    id: string;
    type: string;
    headline: string;
    urgency: string;
    created_at: string;
  }>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBusinessAnalytics() {
  const { user } = useAuth();

  return useQuery<BusinessAnalytics>({
    queryKey: ["business-analytics", user?.id],
    queryFn: async (): Promise<BusinessAnalytics> => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/analytics", { headers });

      if (!res.ok) {
        throw new Error(`Analytics API error: ${res.status}`);
      }

      const json = await res.json() as { data?: BusinessAnalytics } & BusinessAnalytics;
      return json.data ?? json;
    },
    staleTime: 2 * 60 * 1000, // 2 min
    enabled: !!user,
    retry: 1,
  });
}

// ── Derived helpers ──────────────────────────────────────────────────────────

/** Sort endpoints by usage count, descending. */
export function topEndpoints(byEndpoint: Record<string, number>): Array<{ name: string; count: number }> {
  return Object.entries(byEndpoint)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Friendly label for endpoint names. */
const ENDPOINT_LABELS: Record<string, string> = {
  "scout-insight": "Scout Insight",
  "video-intelligence": "Video Intelligence",
  "team-intelligence": "Team Intelligence",
  "role-profile": "Role Profile",
  "phv-calculator": "PHV Calculator",
};

export function endpointLabel(name: string): string {
  return ENDPOINT_LABELS[name] ?? name;
}
