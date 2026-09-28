/**
 * VITAS · Tests — useVideos no ofrece los registros «solo enlace» con metadatos
 * inventados de la antigua pestaña URL (90 min · 1920×1080 · 30 fps · 0 bytes).
 * Esos registros llegaban al selector del Lab / Reportes como si fueran vídeos
 * analizables.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: { id: "u1" }, session: null, loading: false, configured: true })),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
  SUPABASE_CONFIGURED: true,
}));
vi.mock("@/lib/apiAuth", () => ({ getAuthHeaders: vi.fn(async () => ({})) }));
vi.mock("@/lib/localVideoUtils", () => ({
  isLocalSrc: vi.fn(() => false),
  clearStaleBlobUrls: vi.fn((v: unknown) => v),
}));
vi.mock("@/services/real/supabaseVideoService", () => ({ SupabaseVideoService: {} }));
vi.mock("@/services/real/pushNotificationService", () => ({ PushNotificationService: { showLocal: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Registro EXACTO que escribía la pestaña URL retirada (VideoUploadDialog.handleSubmitUrl).
const LEGACY_URL_RECORD = {
  id: "video_1700000000000_abc123",
  title: "Video de YouTube",
  playerId: null,
  status: "finished",
  statusCode: 4,
  encodeProgress: 100,
  duration: 90 * 60,
  width: 1920,
  height: 1080,
  fps: 30,
  storageSize: 0,
  thumbnailUrl: null,
  embedUrl: "https://www.youtube.com/embed/xyz",
  streamUrl: "https://www.youtube.com/embed/xyz",
  dateUploaded: "2026-05-01T00:00:00Z",
};
// Vídeo real subido a Bunny (mismos 90 min/1080p: el filtro NO puede confundirlo).
const BUNNY_RECORD = {
  ...LEGACY_URL_RECORD,
  id: "video_bunny",
  title: "Partido real",
  storageSize: 123_456_789,
  embedUrl: "https://iframe.mediadelivery.net/embed/1/guid",
  streamUrl: "https://vz-abc.b-cdn.net/guid/play_720p.mp4",
};

vi.mock("@/services/real/videoService", () => ({
  VideoService: {
    getAll: vi.fn(() => [LEGACY_URL_RECORD, BUNNY_RECORD]),
    getByPlayerId: vi.fn(() => []),
    save: vi.fn(),
  },
}));

import { useVideos, isLinkOnlyVideo } from "@/hooks/useVideos";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useVideos · registros «solo enlace» de la antigua pestaña URL", () => {
  it("no los devuelve como vídeos analizables (sí devuelve el vídeo real)", async () => {
    const { result } = renderHook(() => useVideos(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = (result.current.data ?? []).map((v) => v.id);
    expect(ids).toContain("video_bunny");
    expect(ids).not.toContain(LEGACY_URL_RECORD.id);
  });

  it("isLinkOnlyVideo reconoce solo la huella exacta de la pestaña URL", () => {
    expect(isLinkOnlyVideo(LEGACY_URL_RECORD as never)).toBe(true);
    expect(isLinkOnlyVideo(BUNNY_RECORD as never)).toBe(false);
    // Un enlace externo con metadatos reales (no inventados) no es la huella → no se oculta.
    expect(isLinkOnlyVideo({ ...LEGACY_URL_RECORD, duration: 61 } as never)).toBe(false);
    // Un fichero local nunca es «solo enlace».
    expect(isLinkOnlyVideo({ ...LEGACY_URL_RECORD, localPath: "blob:x" } as never)).toBe(false);
  });
});
