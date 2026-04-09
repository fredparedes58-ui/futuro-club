/**
 * VideoService — Tests
 * CRUD de videos con localStorage + sync API
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStorage: Record<string, unknown> = {};
vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn((key: string, fallback: unknown) => mockStorage[key] ?? fallback),
    set: vi.fn((key: string, val: unknown) => { mockStorage[key] = val; }),
  },
}));

// Mock fetch for syncFromApi
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { VideoService as videoService } from "@/services/real/videoService";

const makeVideo = (overrides = {}) => ({
  id: "v1",
  title: "Test Video",
  playerId: "p1",
  status: "finished" as const,
  statusCode: 4,
  encodeProgress: 100,
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  storageSize: 50000,
  thumbnailUrl: null,
  embedUrl: "https://embed.test/v1",
  streamUrl: null,
  dateUploaded: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("VideoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    mockStorage["vitas_videos"] = [];
  });

  it("getAll() devuelve array vacío sin datos", () => {
    expect(videoService.getAll()).toEqual([]);
  });

  it("save() persiste un video", () => {
    const v = makeVideo();
    videoService.save(v);
    const all = videoService.getAll();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe("v1");
  });

  it("getById() encuentra video por ID", () => {
    videoService.save(makeVideo({ id: "v1" }));
    videoService.save(makeVideo({ id: "v2", title: "Other" }));
    const found = videoService.getById("v1");
    expect(found).toBeDefined();
    expect(found?.id).toBe("v1");
  });

  it("getById() devuelve null si no existe", () => {
    expect(videoService.getById("nope")).toBeNull();
  });

  it("getByPlayerId() filtra por jugador", () => {
    videoService.save(makeVideo({ id: "v1", playerId: "p1" }));
    videoService.save(makeVideo({ id: "v2", playerId: "p2" }));
    videoService.save(makeVideo({ id: "v3", playerId: "p1" }));
    const results = videoService.getByPlayerId("p1");
    expect(results.length).toBe(2);
  });

  it("getFinished() solo devuelve videos finished", () => {
    videoService.save(makeVideo({ id: "v1", status: "finished" }));
    videoService.save(makeVideo({ id: "v2", status: "processing" }));
    videoService.save(makeVideo({ id: "v3", status: "finished" }));
    expect(videoService.getFinished().length).toBe(2);
  });

  it("updateStatus() cambia status y progress", () => {
    videoService.save(makeVideo({ id: "v1", status: "created" }));
    const updated = videoService.updateStatus("v1", "processing", 50);
    expect(updated?.status).toBe("processing");
    expect(updated?.encodeProgress).toBe(50);
  });

  it("updateStatus() devuelve null si video no existe", () => {
    expect(videoService.updateStatus("nope", "finished")).toBeNull();
  });

  it("delete() elimina video", () => {
    videoService.save(makeVideo({ id: "v1" }));
    videoService.save(makeVideo({ id: "v2" }));
    videoService.delete("v1");
    expect(videoService.getAll().length).toBe(1);
    expect(videoService.getById("v1")).toBeNull();
  });

  it("saveAnalysis() agrega análisis con timestamp", () => {
    videoService.save(makeVideo({ id: "v1" }));
    const analysis = {
      formationHint: "4-3-3",
      pressureZone: "high",
      keyMovements: ["pass", "shot"],
      playerCount: 22,
      ballDetected: true,
      tacticalPhase: "attack" as const,
      confidence: 0.85,
      notes: "Good match",
    };
    const result = videoService.saveAnalysis("v1", analysis);
    expect(result?.analysisResult).toBeDefined();
    expect(result?.analysisResult?.formationHint).toBe("4-3-3");
    expect(result?.analysisResult?.analyzedAt).toBeDefined();
  });

  it("createStub() crea video con status created", () => {
    const stub = videoService.createStub({ id: "new1", title: "New", playerId: "p1" });
    expect(stub.id).toBe("new1");
    expect(stub.status).toBe("created");
    expect(stub.playerId).toBe("p1");
  });

  it("syncFromApi() llama a fetch y merge con local", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        videos: [makeVideo({ id: "api1", title: "From API" })],
      }),
    });
    videoService.save(makeVideo({ id: "local1" }));
    const result = await videoService.syncFromApi("p1");
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/videos/list"));
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("save() hace upsert si video ya existe", () => {
    videoService.save(makeVideo({ id: "v1", title: "Original" }));
    videoService.save(makeVideo({ id: "v1", title: "Updated" }));
    const all = videoService.getAll();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe("Updated");
  });
});
