/**
 * useAllTeamAnalyses / useSavedTeamAnalyses — identity on READ (identidad.md, P0 minors).
 *
 * `team_analyses` rows saved before the identity guard still hold `jugadores[]`
 * (a shirt number GUESSED by the LLM + per-player figures). The data-access hooks
 * return them team level only, for any consumer, not only for TeamAnalysisPage.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const OLD_ROW = {
  id: "row-1",
  video_id: "v-old",
  created_at: "2026-07-01T10:00:00.000Z",
  report: {
    videoId: "v-old",
    resumenEjecutivo: "El #47 desborda por la derecha.",
    formacion: { sistema: "4-3-3", variantes: [], rigidez: 5 },
    jugadores: [
      { dorsalEstimado: "47", posicion: "extremo derecho", pases: { completados: 8, fallados: 2 }, recuperaciones: 4 },
      { dorsalEstimado: "86", posicion: "pivote", pases: { completados: 19, fallados: 1 }, recuperaciones: 7 },
    ],
    confianza: 0.5,
  },
};
const NULL_REPORT_ROW = { id: "row-2", video_id: "v-x", created_at: "2026-07-02T10:00:00.000Z", report: null };

vi.mock("@/lib/supabase", () => {
  const rows = () => [OLD_ROW, NULL_REPORT_ROW];
  const limit = vi.fn(async () => ({ data: rows(), error: null }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  return {
    supabase: {
      auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq, order })) })),
    },
    SUPABASE_CONFIGURED: true,
  };
});

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn(async () => ({ "Content-Type": "application/json" })),
}));

import { useAllTeamAnalyses, useSavedTeamAnalyses, teamLevelRows } from "@/hooks/useTeamIntelligence";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function expectTeamLevel(rows: unknown[] | undefined) {
  expect(rows).toHaveLength(2);
  const [old, empty] = rows as Array<{ id: string; report: Record<string, unknown> | null }>;
  expect(old.id).toBe("row-1");
  expect(old.report?.jugadores).toBeUndefined();
  const serialized = JSON.stringify(old.report);
  expect(serialized).not.toContain("dorsalEstimado");
  expect(serialized).not.toContain("47");
  expect(serialized).not.toContain("86");
  expect(old.report?.identityWithheld).toEqual({ perPlayerRows: 2, texts: 1 });
  // Team-level content is kept.
  expect((old.report?.formacion as { sistema: string }).sistema).toBe("4-3-3");
  // A row without a report is returned unchanged (no invented report).
  expect(empty).toEqual(NULL_REPORT_ROW);
}

describe("team analyses history · team level on read", () => {
  it("useAllTeamAnalyses strips per-player rows and texts naming a player", async () => {
    const { result } = renderHook(() => useAllTeamAnalyses(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectTeamLevel(result.current.data);
  });

  it("useSavedTeamAnalyses strips them too", async () => {
    const { result } = renderHook(() => useSavedTeamAnalyses("v-old"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectTeamLevel(result.current.data);
  });

  it("teamLevelRows does not mutate the stored rows and tolerates null input", () => {
    const before = JSON.stringify(OLD_ROW);
    teamLevelRows([OLD_ROW]);
    expect(JSON.stringify(OLD_ROW)).toBe(before);
    expect(teamLevelRows(null)).toEqual([]);
    expect(teamLevelRows(undefined)).toEqual([]);
  });
});
