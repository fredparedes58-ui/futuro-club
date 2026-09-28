/**
 * Tests for useTeamIntelligence hook — initial states, Gemini observation
 * forwarding (response contract) and the no-visual-input gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
  SUPABASE_CONFIGURED: false,
}));

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn(async () => ({ "Content-Type": "application/json" })),
}));

vi.mock("@/lib/localVideoUtils", () => ({
  isLocalSrc: vi.fn(() => false),
  readVideoAsBase64: vi.fn(async () => null),
  extractKeyframesFromVideo: vi.fn(async () => []),
  getOptimalFrameCount: vi.fn(() => 8),
}));

import { useTeamIntelligence } from "@/hooks/useTeamIntelligence";
import { isLocalSrc, readVideoAsBase64, extractKeyframesFromVideo } from "@/lib/localVideoUtils";
import { NO_VISUAL_INPUT } from "@/lib/shared/teamVisualInput";
import i18n from "@/i18n";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTeamIntelligence", () => {
  it("initializes with idle state", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(result.current.state.step).toBe("idle");
    expect(result.current.state.progress).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("report starts as null", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(result.current.analysisResult).toBeNull();
  });

  it("exposes runTeamAnalysis function", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.runAnalysis).toBe("function");
  });

  it("exposes reset function", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.reset).toBe("function");
  });

  it("reset returns to idle", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    result.current.reset();
    expect(result.current.state.step).toBe("idle");
    expect(result.current.analysisResult).toBeNull();
  });
});

// ── Network fakes ────────────────────────────────────────────────────────────

const REPORT = { videoId: "v1", formacion: { sistema: "4-3-3", variantes: [], rigidez: 5 }, confianza: 0.6 };
const OBSERVATIONS = { formacionDetectada: "4-3-3", resumenGeneral: "Bloque medio" };

/** Minimal fetch Response whose body streams the given SSE text. */
function sseResponse(sse: string) {
  const bytes = new TextEncoder().encode(sse);
  let sent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes })),
        releaseLock: () => {},
      }),
    },
    text: async () => sse,
    json: async () => ({}),
  };
}

function jsonResponse(payload: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => payload, text: async () => JSON.stringify(payload) };
}

const COMPLETE_SSE = `event: complete\ndata: ${JSON.stringify({ report: REPORT })}\n\n`;

type FetchCall = [string, { body?: string }];

describe("useTeamIntelligence · data flow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(isLocalSrc).mockReturnValue(false);
    vi.mocked(readVideoAsBase64).mockResolvedValue(null);
    vi.mocked(extractKeyframesFromVideo).mockResolvedValue([]);
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes("team-observation")) {
        // Real contract: successResponse → { ok, success, data: { observations } }
        return jsonResponse({ ok: true, success: true, data: { observations: OBSERVATIONS } });
      }
      return sseResponse(COMPLETE_SSE);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(isLocalSrc).mockReset();
    vi.mocked(readVideoAsBase64).mockReset();
    vi.mocked(extractKeyframesFromVideo).mockReset();
  });

  function intelligenceCalls(): FetchCall[] {
    return (fetchMock.mock.calls as FetchCall[]).filter(([u]) => u.includes("team-intelligence"));
  }

  it("forwards the Gemini observation read from data.observations (was always dropped)", async () => {
    vi.mocked(isLocalSrc).mockReturnValue(true);
    vi.mocked(readVideoAsBase64).mockResolvedValue({ base64: "AAAA", mediaType: "video/mp4" } as never);

    const { result } = renderHook(() => useTeamIntelligence(), { wrapper: createWrapper() });
    let out: unknown;
    await act(async () => {
      out = await result.current.runAnalysis({ videoId: "v1", teamColor: "rojo", localVideoSrc: "blob:local" });
    });

    expect(out).toEqual(REPORT);
    const calls = intelligenceCalls();
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body ?? "{}");
    expect(body.geminiObservations).toEqual(OBSERVATIONS);
    expect(body.keyframes).toEqual([]);
    // With a real observation there is no need to fall back to frames.
    expect(extractKeyframesFromVideo).not.toHaveBeenCalled();
  });

  it("blocks a cloud-only (Bunny) video: no request, no report, a gate reason", async () => {
    const { result } = renderHook(() => useTeamIntelligence(), { wrapper: createWrapper() });
    let out: unknown = "unset";
    await act(async () => {
      out = await result.current.runAnalysis({ videoId: "v1", teamColor: "rojo", localVideoSrc: undefined });
    });

    expect(out).toBeNull();
    expect(intelligenceCalls()).toHaveLength(0);
    expect(result.current.analysisResult).toBeNull();
    expect(result.current.state.step).toBe("blocked");
    expect(result.current.state.gateReason).toBe(i18n.t("teamAnalysisPage.noVisualInputCloud"));
    expect(result.current.state.gateReason).toBeTruthy();
  });

  it("maps the server refusal (SSE error code NO_VISUAL_INPUT) to the gate, not to an error", async () => {
    vi.mocked(isLocalSrc).mockReturnValue(true);
    vi.mocked(extractKeyframesFromVideo).mockResolvedValue([
      { url: "blob:not-readable-by-the-server", timestamp: 0, frameIndex: 0 },
    ] as never);
    fetchMock.mockImplementation(async () =>
      sseResponse(`event: error\ndata: ${JSON.stringify({ message: "Sin entrada visual", code: NO_VISUAL_INPUT })}\n\n`),
    );

    const { result } = renderHook(() => useTeamIntelligence(), { wrapper: createWrapper() });
    let out: unknown = "unset";
    await act(async () => {
      out = await result.current.runAnalysis({ videoId: "v1", teamColor: "rojo", localVideoSrc: "blob:local" });
    });

    expect(out).toBeNull();
    expect(result.current.state.step).toBe("blocked");
    expect(result.current.state.gateReason).toBe(i18n.t("teamAnalysisPage.noVisualInputReason"));
    expect(result.current.analysisResult).toBeNull();
  });

  it("other server errors still surface as errors", async () => {
    vi.mocked(isLocalSrc).mockReturnValue(true);
    vi.mocked(extractKeyframesFromVideo).mockResolvedValue([
      { url: "data:image/jpeg;base64,AAAA", timestamp: 0, frameIndex: 0 },
    ] as never);
    fetchMock.mockImplementation(async () =>
      sseResponse(`event: error\ndata: ${JSON.stringify({ message: "Error de Claude API: 500" })}\n\n`),
    );

    const { result } = renderHook(() => useTeamIntelligence(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(
        result.current.runAnalysis({ videoId: "v1", teamColor: "rojo", localVideoSrc: "blob:local" }),
      ).rejects.toThrow("Error de Claude API: 500");
    });
    expect(result.current.state.step).toBe("error");
  });
});
