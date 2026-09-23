/**
 * VITAS · Tests del acceso a la Messages API (migración Opus 5.5)
 * Run: npm run test:api -- anthropic
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMessages, responseText, MESSAGES_URL } from "../anthropic";
import {
  MODELS,
  modelParams,
  REASONING_EFFORT,
  REASONING_FALLBACK_MODEL,
  REASONING_THINKING_HEADROOM,
} from "../models";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function request(model: string) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 100, messages: [{ role: "user", content: "hola" }] }),
  };
}

function sentModel(call: unknown[]): string {
  return JSON.parse((call[1] as RequestInit).body as string).model;
}

describe("responseText", () => {
  it("lee el texto por tipo aunque la respuesta empiece por bloques thinking", () => {
    const data = {
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: '{"ok":' },
        { type: "text", text: "true}" },
      ],
    };
    expect(responseText(data)).toBe('{"ok":true}');
  });

  it('devuelve "" si no hay bloques text (refusal previo a la salida, cuerpo raro)', () => {
    expect(responseText({ content: [] })).toBe("");
    expect(responseText({ content: [{ type: "thinking", thinking: "" }] })).toBe("");
    expect(responseText(null)).toBe("");
    expect(responseText({})).toBe("");
  });
});

describe("modelParams", () => {
  it("reasoning: suma margen de thinking y fija effort", () => {
    expect(modelParams(MODELS.reasoning, 2500)).toEqual({
      model: MODELS.reasoning,
      max_tokens: 2500 + REASONING_THINKING_HEADROOM,
      output_config: { effort: REASONING_EFFORT },
    });
  });

  it("fast (Haiku 4.5): sin effort (lo rechaza) y max_tokens intacto", () => {
    expect(modelParams(MODELS.fast, 1024)).toEqual({ model: MODELS.fast, max_tokens: 1024 });
  });
});

describe("fetchMessages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("respuesta normal del tier reasoning: una sola llamada y el body sigue legible", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchMessages(request(MODELS.reasoning));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(MESSAGES_URL);
    expect(responseText(await res.json())).toBe("{}");
  });

  it("404 (cuenta sin acceso al modelo) → reintenta en el modelo de respaldo", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ type: "error", error: { type: "not_found_error" } }, 404))
      .mockResolvedValueOnce(jsonResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchMessages(request(MODELS.reasoning));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentModel(fetchMock.mock.calls[1])).toBe(REASONING_FALLBACK_MODEL);
    expect(res.status).toBe(200);
  });

  it('stop_reason "refusal" → reintenta en el modelo de respaldo', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ stop_reason: "refusal", stop_details: { category: "bio" }, content: [] }))
      .mockResolvedValueOnce(jsonResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchMessages(request(MODELS.reasoning));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentModel(fetchMock.mock.calls[1])).toBe(REASONING_FALLBACK_MODEL);
    expect(responseText(await res.json())).toBe("ok");
  });

  it("otros errores (p. ej. 400/529) no se enmascaran con un reintento", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ type: "error" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchMessages(request(MODELS.reasoning));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400);
  });

  it("el tier fast nunca reintenta en otro modelo", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ type: "error" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchMessages(request(MODELS.fast));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });
});
