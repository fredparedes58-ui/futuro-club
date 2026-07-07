/**
 * VITAS · Coaching Session Hooks (Sprint 15)
 *
 * TanStack Query hooks for the Coaching Assistant module.
 * Pattern: identical to useRoleProfile.ts
 *
 * Queries:
 *   useCoachingSessions(teamId) — list sessions for a team
 *   useSessionAnalysis(sessionId) — get session analysis
 *   useSessionRecommendation(teamId) — get weekly plan
 *
 * Mutations:
 *   useAnalyzeSession() — trigger session analysis
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/apiAuth";

const STALE_TIME = 1000 * 60 * 5; // 5 minutes

// ─── Types ────────────────────────────────────────────────────────────────

interface CoachingSession {
  id: string;
  teamId: string;
  coachId: string;
  videoId: string | null;
  sessionDate: string;
  durationMin: number;
  segments: unknown[];
  drills: unknown[];
  balance: unknown | null;
  totalLoad: number;
  drillCount: number;
  playerCount: number;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
}

interface AnalyzeSessionInput {
  videoId: string;
  teamId: string;
  sessionDate?: string;
  sessionDurationMs?: number;
  trackSnapshots?: Array<{ timestampMs: number; tracks: unknown[] }>;
  ballTrajectory?: Array<{ fx: number; fy: number; timestampMs: number }>;
}

interface AnalyzeSessionResult {
  sessionId: string;
  segmentCount: number;
  drillCount: number;
  playerCount: number;
  segments: unknown[];
  drills: unknown[];
  playerParticipation: unknown[];
}

// ─── API Helpers ──────────────────────────────────────────────────────────

const API_BASE = "/api/coaching";

async function fetchCoachingSessions(teamId: string): Promise<CoachingSession[]> {
  // Try CoachingSessionService first (Supabase + cache)
  try {
    const { CoachingSessionService } = await import(
      "@/services/real/coachingSessionService"
    );
    const sessions = await CoachingSessionService.listSessions(teamId, 30);
    if (sessions.length > 0) {
      return sessions.map((s) => ({
        id: s.id,
        teamId: s.teamId,
        date: s.date,
        durationMin: s.durationMin,
        videoId: s.videoId,
        balance: s.balance,
        load: s.load,
        // Provide reasonable defaults for fields not present in TrainingSession
        segments: s.segments ?? [],
        drills: s.drills ?? [],
      })) as unknown as CoachingSession[];
    }
  } catch (err) {
    console.warn("[useCoachingSession] service failed, trying API:", err);
  }

  // Fallback to API endpoint
  try {
    const res = await fetch(
      `${API_BASE}/sessions?teamId=${encodeURIComponent(teamId)}`,
    );
    if (!res.ok) return generateMockSessions(teamId);
    const data = await res.json();
    return data.data ?? data ?? [];
  } catch {
    return generateMockSessions(teamId);
  }
}

async function fetchSessionAnalysis(sessionId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/session-analysis?sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    return { sessionId, mock: true };
  }
  const data = await res.json();
  return data.data ?? data ?? {};
}

async function fetchSessionRecommendation(teamId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/session-recommendation?teamId=${encodeURIComponent(teamId)}`);
  if (!res.ok) {
    return { teamId, mock: true };
  }
  const data = await res.json();
  return data.data ?? data ?? {};
}

async function analyzeSessionApi(input: AnalyzeSessionInput): Promise<AnalyzeSessionResult> {
  const res = await fetch(`${API_BASE}/analyze-session`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Analysis failed: ${errText}`);
  }
  const data = await res.json();
  return data.data ?? data;
}

// ─── AI Coaching Report (agente coaching-assistant) ─────────────────────────

export interface CoachingReportInput {
  teamId: string;
  teamName?: string;
  sessionAnalysis: Record<string, unknown>;
  recentSessions?: Array<Record<string, unknown>>;
  recommendation?: Record<string, unknown>;
  phvDistribution?: { prePhv?: number; circaPhv?: number; postPhv?: number };
  teamAvgAge?: number;
  playerHighlights?: Array<Record<string, unknown>>;
}

export interface AiReportResult {
  report: Record<string, unknown>;
  source?: string;
  model?: string;
}

async function coachingReportApi(input: CoachingReportInput): Promise<AiReportResult> {
  const res = await fetch(`${API_BASE}/coaching-report`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Coaching report failed: ${errText}`);
  }
  const json = await res.json();
  const payload = json.data ?? json;
  return {
    report: (payload.report ?? {}) as Record<string, unknown>,
    source: payload.source,
    model: payload.model,
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────

/**
 * List coaching sessions for a team.
 */
export function useCoachingSessions(teamId: string | undefined) {
  return useQuery({
    queryKey: ["coaching-sessions", teamId],
    queryFn: () => fetchCoachingSessions(teamId!),
    enabled: !!teamId,
    staleTime: STALE_TIME,
    retry: 2,
  });
}

/**
 * Get detailed analysis for a specific session.
 */
export function useSessionAnalysis(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session-analysis", sessionId],
    queryFn: () => fetchSessionAnalysis(sessionId!),
    enabled: !!sessionId,
    staleTime: STALE_TIME,
    retry: 2,
  });
}

/**
 * Get weekly recommendation for a team.
 */
export function useSessionRecommendation(teamId: string | undefined) {
  return useQuery({
    queryKey: ["session-recommendation", teamId],
    queryFn: () => fetchSessionRecommendation(teamId!),
    enabled: !!teamId,
    staleTime: STALE_TIME,
    retry: 2,
  });
}

/**
 * Trigger session analysis (mutation).
 * Invalidates coaching-sessions query on success.
 */
export function useAnalyzeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: analyzeSessionApi,
    onSuccess: (data) => {
      // Invalidate session list and analysis
      queryClient.invalidateQueries({ queryKey: ["coaching-sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["session-analysis", data.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["session-recommendation"],
      });
    },
  });
}

/**
 * Generate an AI coaching report for the team (mutation).
 * Llama al agente coaching-assistant vía /api/coaching/coaching-report.
 * El agente cae a mock marcado (source:"fallback*") si falta API key o falla,
 * así que la UI nunca se rompe.
 */
export function useCoachingReport() {
  return useMutation({ mutationFn: coachingReportApi });
}

// ─── Mock Data ────────────────────────────────────────────────────────────

function generateMockSessions(teamId: string): CoachingSession[] {
  const now = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 3);
    return {
      id: `mock-session-${i}`,
      teamId,
      coachId: "mock-coach",
      videoId: null,
      sessionDate: date.toISOString().split("T")[0],
      durationMin: 75 + Math.round(Math.random() * 15),
      segments: [],
      drills: [],
      balance: null,
      totalLoad: 200 + Math.round(Math.random() * 100),
      drillCount: 4 + Math.round(Math.random() * 3),
      playerCount: 14 + Math.round(Math.random() * 4),
      status: "completed" as const,
      createdAt: date.toISOString(),
    };
  });
}
