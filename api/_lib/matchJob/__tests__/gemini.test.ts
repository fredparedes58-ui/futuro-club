/**
 * Librería Gemini compartida (api/_lib/gemini): la key viaja SOLO en la cabecera
 * x-goog-api-key (nunca `?key=`), la petición de tramo es la del contrato (fileData +
 * videoMetadata {offsets, fps de config} + mediaResolution + responseSchema + thinking
 * acotado) y los fallos se tipan sin parseo parcial.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEGMENT_GEMINI_RESPONSE_SCHEMA } from "../../../../src/lib/shared/matchJob/contract";
import { buildGenerateBody, generateJson, generateUrl } from "../../gemini/generate";
import { deleteFile, getFile, listFilesByDisplayNamePrefix, sha256Base64ToHex, startResumableSession } from "../../gemini/files";
import { buildSegmentGenerateRequest } from "../segmentRequest";
import { MATCH_VIDEO_CONFIG } from "../config";

const KEY = "gm-test-key-123";
type Call = [string, RequestInit | undefined];

function stub(handler: (url: string, init?: RequestInit) => Response) {
  const f = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", f);
  return f;
}
const headersOf = (c: Call) => (c[1]?.headers ?? {}) as Record<string, string>;

beforeEach(() => {
  process.env.GEMINI_API_KEY = KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

const request = () =>
  buildSegmentGenerateRequest({
    model: "gemini-2.5-flash",
    fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
    locale: "es",
    category: null,
    homeKit: { shirt: { hex: "#ffffff", label: "blanco" } },
    awayKit: { shirt: { hex: "#7b1e2b", label: "granate" } },
    attackingDir1h: null,
    segment: { idx: 1, start_sec: 900, end_sec: 1800 },
    totalSegments: 6,
  });

describe("segment request (the exact one the job and the harness send)", () => {
  it("fileData + videoMetadata offsets and fps FROM CONFIG, LOW resolution, contract responseSchema, bounded thinking", () => {
    const body = buildGenerateBody(request()) as {
      contents: { parts: Record<string, unknown>[] }[];
      generationConfig: Record<string, unknown>;
    };
    const [video, text] = body.contents[0].parts;
    expect(video.fileData).toEqual({ fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc123", mimeType: "video/mp4" });
    expect(video.videoMetadata).toEqual({ startOffset: "900s", endOffset: "1800s", fps: MATCH_VIDEO_CONFIG.geminiVideoFps });
    expect(typeof text.text).toBe("string");
    expect(body.generationConfig).toMatchObject({
      temperature: 0,
      responseMimeType: "application/json",
      mediaResolution: MATCH_VIDEO_CONFIG.mediaResolution,
      maxOutputTokens: MATCH_VIDEO_CONFIG.maxOutputTokens,
      thinkingConfig: { thinkingBudget: MATCH_VIDEO_CONFIG.thinkingBudget },
    });
    expect(body.generationConfig.responseSchema).toBe(SEGMENT_GEMINI_RESPONSE_SCHEMA);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
  it("the prompt identifies teams only by declared kits and forbids individuals; no notes/names are sent to Gemini", () => {
    const prompt = request().prompt;
    expect(prompt).toMatch(/blanco \(#ffffff\)/);
    expect(prompt).toMatch(/Never mention shirt numbers, dorsals, names, faces/);
    expect(prompt).toMatch(/never 50\/50 as a placeholder/);
    expect(prompt).toMatch(/between 900 and 1800/);
  });
  it("rejects odd model ids in the URL", () => {
    expect(generateUrl("gemini-2.5-flash")).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(() => generateUrl("x/../../y")).toThrow();
  });
});

describe("generateJson", () => {
  const ok = (text: string, finishReason = "STOP", usage: unknown = { promptTokenCount: 10 }) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "pensando", thought: true }, { text }] }, finishReason }], usageMetadata: usage, modelVersion: "gemini-2.5-flash-001" }));

  it("sends the key only in the x-goog-api-key header and parses the non-thought text", async () => {
    const f = stub(() => ok('{"a":1}'));
    const r = await generateJson(request());
    expect(r).toMatchObject({ ok: true, json: { a: 1 }, finishReason: "STOP", modelVersion: "gemini-2.5-flash-001" });
    const call = f.mock.calls[0] as Call;
    expect(call[0]).not.toContain("key=");
    expect(headersOf(call)["x-goog-api-key"]).toBe(KEY);
  });
  it("MAX_TOKENS, invalid JSON, blocked and timeouts are typed failures (usage kept for billing)", async () => {
    stub(() => ok("{", "MAX_TOKENS", { promptTokenCount: 5 }));
    expect(await generateJson(request())).toMatchObject({ ok: false, kind: "max_tokens", usage: { promptTokenCount: 5 } });
    stub(() => ok("no json"));
    expect(await generateJson(request())).toMatchObject({ ok: false, kind: "invalid_json" });
    stub(() => ok("{}", "SAFETY"));
    expect(await generateJson(request())).toMatchObject({ ok: false, kind: "blocked" });
    stub(() => new Response(JSON.stringify({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } })));
    expect(await generateJson(request())).toMatchObject({ ok: false, kind: "blocked" });
  });
  it("only a file-related 403/404 counts as file_unavailable (a bad key must not trigger a re-dispatch loop)", async () => {
    stub(() => new Response(JSON.stringify({ error: { message: "File abc123 not found or expired" } }), { status: 404 }));
    expect(await generateJson(request())).toMatchObject({ ok: false, kind: "file_unavailable" });
    stub(() => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 403 }));
    expect(await generateJson(request())).toMatchObject({ ok: false, kind: "http", status: 403 });
  });
});

describe("File API", () => {
  it("resumable start: exact byte length, displayName, key in header; rejects an upload URL on another host", async () => {
    const f = stub(
      () =>
        new Response("{}", {
          headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=u1", "x-goog-upload-chunk-granularity": "8388608" },
        }),
    );
    const s = await startResumableSession({ bytes: 123456, mime: "video/mp4", displayName: "vitas-match-x-1" });
    expect(s).toEqual({ uploadUrl: "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=u1", chunkGranularityBytes: 8388608 });
    const call = f.mock.calls[0] as Call;
    expect(call[0]).not.toContain("key=");
    const h = headersOf(call);
    expect(h["x-goog-api-key"]).toBe(KEY);
    expect(h["X-Goog-Upload-Header-Content-Length"]).toBe("123456");
    expect(JSON.parse(call[1]?.body as string)).toEqual({ file: { display_name: "vitas-match-x-1" } });

    stub(() => new Response("{}", { headers: { "x-goog-upload-url": "https://evil.example/upload" } }));
    await expect(startResumableSession({ bytes: 1, mime: "video/mp4", displayName: "d" })).rejects.toThrow(/host/);
  });
  it("get / delete by file name (validated), delete is idempotent on 404", async () => {
    stub((url) => (url.endsWith("/files/abc") ? new Response(JSON.stringify({ name: "files/abc", state: "ACTIVE" })) : new Response("", { status: 404 })));
    expect(await getFile("files/abc")).toMatchObject({ ok: true, file: { state: "ACTIVE" } });
    expect(await getFile("files/zzz")).toEqual({ ok: false, status: 404 });
    expect(await deleteFile("files/zzz")).toBe(true);
    await expect(getFile("../secrets")).rejects.toThrow();
  });
  it("lists by displayName prefix, bounded by maxPages", async () => {
    let page = 0;
    stub(() => {
      page++;
      return new Response(
        JSON.stringify({
          files: [
            { name: `files/a${page}`, displayName: `vitas-match-8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f-${page}` },
            { name: `files/b${page}`, displayName: "someone-else" },
          ],
          nextPageToken: `t${page}`,
        }),
      );
    });
    const r = await listFilesByDisplayNamePrefix("vitas-match-", 2);
    expect(r.files.map((f) => f.name)).toEqual(["files/a1", "files/a2"]);
    expect(r.more).toBe(true);
  });
  it("sha256Hash base64 → lowercase hex", () => {
    expect(sha256Base64ToHex("AAEC/w==")).toBe("000102ff");
  });
});
