/**
 * VITAS · Behavioral Profile Hooks (Sprint 19)
 *
 * TanStack Query hooks for the Behavioral Profiling Engine.
 * Pattern: identical to useRoleProfile.ts
 *
 * Queries:
 *   useBehavioralProfile(playerId) — get stored behavioral profile
 *
 * Mutations:
 *   useComputeBehavioralProfile() — trigger profile computation
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const STALE_TIME = 1000 * 60 * 10; // 10 minutes (profiles don't change often)

// ─── Types ────────────────────────────────────────────────────────────────

interface BehavioralScores {
  decisionSpeed: number;
  scanningIntelligence: number;
  resilience: number;
  clutchFactor: number;
  leadership: number;
  mentalFatigue: number;
  unpredictability: number;
  mentalComposite: number;
  archetype: string;
}

interface BehavioralProfileData {
  playerId: string;
  playerName: string;
  playerAge: number;
  scores: BehavioralScores;
  strengths: string[];
  developmentAreas: string[];
  confidence: number;
  videosAnalyzed: number;
  modelVersion: string;
  source: string;
}

interface ComputeProfileInput {
  playerId: string;
  playerName?: string;
  playerAge?: number;
  videoIds: string[];
}

// ─── API Helpers ──────────────────────────────────────────────────────────

const API_BASE = "/api/behavioral";

async function fetchBehavioralProfile(playerId: string): Promise<BehavioralProfileData | null> {
  // Try the Supabase-backed service first (graceful fallback to mock)
  try {
    const { BehavioralProfileService } = await import(
      "@/services/real/behavioralProfileService"
    );
    const profile = await BehavioralProfileService.getLatest(playerId);
    if (profile) {
      return {
        playerId: profile.playerId,
        playerName: profile.playerName ?? "Jugador",
        playerAge: 0,
        scores: profile.scores,
        strengths: [],
        developmentAreas: [],
        confidence: profile.confidence,
        videosAnalyzed: profile.videosAnalyzed,
        analyzedAt: profile.analyzedAt,
        modelVersion: profile.modelVersion,
      } as BehavioralProfileData;
    }
  } catch (err) {
    console.warn("[useBehavioralProfile] service failed, trying API:", err);
  }

  // Fallback to the existing API endpoint (server-side compute)
  try {
    const res = await fetch(`${API_BASE}/get-profile?playerId=${encodeURIComponent(playerId)}`);
    if (!res.ok) return generateMockProfile(playerId);
    const data = await res.json();
    if (data.data?.status === "not_implemented") return generateMockProfile(playerId);
    return data.data ?? data ?? null;
  } catch {
    return generateMockProfile(playerId);
  }
}

async function computeProfileApi(input: ComputeProfileInput): Promise<BehavioralProfileData> {
  const res = await fetch(`${API_BASE}/compute-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Profile computation failed: ${errText}`);
  }
  const data = await res.json();
  return data.data ?? data;
}

// ─── Hooks ────────────────────────────────────────────────────────────────

/**
 * Get behavioral profile for a player.
 */
export function useBehavioralProfile(playerId: string | undefined) {
  return useQuery({
    queryKey: ["behavioral-profile", playerId],
    queryFn: () => fetchBehavioralProfile(playerId!),
    enabled: !!playerId,
    staleTime: STALE_TIME,
    retry: 2,
  });
}

/**
 * Trigger behavioral profile computation (mutation).
 * Invalidates profile query on success.
 */
export function useComputeBehavioralProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: computeProfileApi,
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["behavioral-profile", data.playerId],
      });
    },
  });
}

// ─── Mock Data ────────────────────────────────────────────────────────────

function generateMockProfile(playerId: string): BehavioralProfileData {
  const scores: BehavioralScores = {
    decisionSpeed: 68,
    scanningIntelligence: 72,
    resilience: 61,
    clutchFactor: 55,
    leadership: 45,
    mentalFatigue: 70,
    unpredictability: 58,
    mentalComposite: 63,
    archetype: "architect",
  };

  return {
    playerId,
    playerName: "Jugador",
    playerAge: 14,
    scores,
    strengths: [
      "Inteligencia de escaneo (72)",
      "Resistencia mental (70)",
      "Velocidad de decisión (68)",
    ],
    developmentAreas: [
      "Liderazgo (45)",
      "Rendimiento bajo presión (55)",
    ],
    confidence: 0.65,
    videosAnalyzed: 3,
    modelVersion: "v1.0.0",
    source: "mock",
  };
}
