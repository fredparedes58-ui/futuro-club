/**
 * ragService — Tests
 * Query, ingest, formatForPrompt
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { ragService } from "@/services/real/ragService";

describe("ragService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("query() llama a /api/rag/query con params correctos", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, results: [], context: "" }),
    });
    await ragService.query("ejercicios velocidad");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/rag/query",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("ejercicios velocidad"),
      }),
    );
  });

  it("query() pasa options de categoría", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, results: [], context: "" }),
    });
    await ragService.query("drills", { category: "drill" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.category).toBe("drill");
  });

  it("query() devuelve resultados vacíos en error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const result = await ragService.query("test");
    expect(result.results).toEqual([]);
  });

  it("query() devuelve resultados vacíos si response no ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await ragService.query("test");
    expect(result.results).toEqual([]);
  });

  it("ingest() envía documentos a /api/rag/ingest", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, indexed: 2, errors: [] }),
    });
    const docs = [
      { content: "Drill 1", category: "drill" as const },
      { content: "Drill 2", category: "drill" as const },
    ];
    const result = await ragService.ingest(docs);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/rag/ingest",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.indexed).toBe(2);
  });

  it("ingest() maneja error de red", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fail"));
    const result = await ragService.ingest([{ content: "x", category: "drill" as const }]);
    expect(result.indexed).toBe(0);
  });

  it("formatForPrompt() genera XML seguro", () => {
    const results = [
      { id: "1", content: "Ejercicio de velocidad", category: "drill", similarity: 0.9, metadata: {} },
      { id: "2", content: "Ejercicio técnico", category: "drill", similarity: 0.8, metadata: {} },
    ];
    const formatted = ragService.formatForPrompt(results);
    expect(formatted).toContain("Ejercicio de velocidad");
    expect(formatted).toContain("Ejercicio técnico");
    // Should be XML-wrapped for LLM safety
    expect(formatted).toContain("<");
  });

  it("formatForPrompt() devuelve string vacío sin resultados", () => {
    const formatted = ragService.formatForPrompt([]);
    expect(formatted.length).toBeLessThanOrEqual(1);
  });

  it("query() pasa limit en options", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, results: [], context: "" }),
    });
    await ragService.query("test", { limit: 10 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.limit).toBe(10);
  });
});
