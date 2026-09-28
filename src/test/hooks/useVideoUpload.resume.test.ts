/**
 * useVideoUpload — subidas reanudables (fase 0 partido completo)
 *
 *  - la sesión TUS {videoId, uploadUrl, authSignature, authExpire, libraryId} se guarda
 *    por huella del fichero; al reintentar el MISMO fichero NO se llama a video-init otra
 *    vez y se reanuda con findPreviousUploads/resumeFromPreviousUpload;
 *  - sesión caducada → init nuevo;
 *  - onUploaded se dispara tras el éxito TUS y ANTES del poll de codificación;
 *  - poll agotado → done con encodeStatus "processing" (no error, sin URL de servidor);
 *  - Bunny RECHAZA la sesión guardada (4xx definitivo) → se descarta y se reintenta UNA
 *    vez con video-init; un corte de red / 409 / 423 / 5xx la conservan.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_CONFIGURED: false }));
vi.mock("@/services/real/supabaseVideoService", () => ({
  SupabaseVideoService: { pushOne: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn(async () => ({ "Content-Type": "application/json", Authorization: "Bearer jwt" })),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/services/errorDiagnosticService", () => ({
  getErrorDetails: () => ({ title: "Error", description: "desc" }),
}));

type TusOpts = {
  endpoint: string;
  retryDelays: number[];
  headers: Record<string, string>;
  fingerprint: () => Promise<string>;
  onError?: (e: Error) => void;
  onSuccess?: () => void;
  onProgress?: (a: number, b: number) => void;
  onUploadUrlAvailable?: () => void;
};

/**
 * Comportamiento de la PRÓXIMA instancia tus.Upload creada:
 *  - "fail"    → corte de red (error SIN respuesta HTTP, como tras agotar retryDelays)
 *  - "succeed" → subida completa
 *  - número    → Bunny responde ese código (p. ej. 401): DetailedError con originalResponse,
 *                que tus-js-client v4 NO reintenta y entrega a onError.
 */
const tusScript: Array<"fail" | "succeed" | number> = [];
const instances: Array<{
  opts: TusOpts;
  resumeFromPreviousUpload: ReturnType<typeof vi.fn>;
  findPreviousUploads: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("tus-js-client", () => ({
  // `function` (no arrow): se instancia con `new tus.Upload(...)`.
  Upload: vi.fn(function MockUpload(_file: File, opts: TusOpts) {
    const behaviour = tusScript.shift() ?? "succeed";
    const inst = {
      url: null as string | null,
      options: { urlStorage: { removeUpload: vi.fn(async () => undefined) } },
      findPreviousUploads: vi.fn(async () => [
        { uploadUrl: "https://video.bunnycdn.com/tusupload/other", urlStorageKey: "k0", size: 1, metadata: {}, creationTime: "", parallelUploadUrls: null },
        { uploadUrl: "https://video.bunnycdn.com/tusupload/abc", urlStorageKey: "k1", size: 1, metadata: {}, creationTime: "", parallelUploadUrls: null },
      ]),
      resumeFromPreviousUpload: vi.fn(),
      start: () => {
        inst.url = "https://video.bunnycdn.com/tusupload/abc";
        opts.onUploadUrlAvailable?.();
        if (behaviour === "fail") opts.onError?.(new Error("network down"));
        else if (typeof behaviour === "number") {
          opts.onError?.(
            Object.assign(new Error(`tus: unexpected response while creating upload (${behaviour})`), {
              originalRequest: {},
              originalResponse: { getStatus: () => behaviour },
            }),
          );
        } else {
          opts.onProgress?.(100, 100);
          opts.onSuccess?.();
        }
      },
      abort: vi.fn(),
    };
    instances.push({ opts, resumeFromPreviousUpload: inst.resumeFromPreviousUpload, findPreviousUploads: inst.findPreviousUploads });
    return inst;
  }),
}));

const fetchMock = vi.fn();

import { useVideoUpload, TUS_RETRY_DELAYS } from "@/hooks/useVideoUpload";
import { TUS_SESSIONS_STORAGE_KEY } from "@/lib/tusUploadSession";

function initOk(guid = "guid-1", expire = Math.floor(Date.now() / 1000) + 86400) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        videoId: guid,
        uploadUrl: `https://video.bunnycdn.com/library/42/videos/${guid}`,
        authSignature: "sig-abc",
        authExpire: expire,
        libraryId: 42,
      },
    }),
  };
}

function statusReady(duration = 240) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        status: "finished", encodeProgress: 100, isReady: true, thumbnailUrl: null,
        embedUrl: "https://iframe.mediadelivery.net/embed/42/guid-1",
        streamUrl: "https://vz.b-cdn.net/guid-1/playlist.m3u8",
        duration, width: 1920, height: 1080, fps: 25, storageSize: 1000,
      },
    }),
  };
}

function statusEncoding() {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        status: "processing", encodeProgress: 30, isReady: false, thumbnailUrl: null,
        embedUrl: "", streamUrl: null, duration: 0, width: 0, height: 0, fps: 0, storageSize: 0,
      },
    }),
  };
}

const file = new File(["video-bytes"], "partido.mp4", { type: "video/mp4", lastModified: 1_700_000_000_000 });
const initCalls = () => fetchMock.mock.calls.filter(([u]) => u === "/api/upload/video-init");

const origCreate = URL.createObjectURL;
const origRevoke = URL.revokeObjectURL;

describe("useVideoUpload · reanudación TUS", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = () => "blob:test-video";
    URL.revokeObjectURL = () => undefined;
    localStorage.clear();
    tusScript.length = 0;
    instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it("persiste la sesión en el init y al reintentar NO vuelve a llamar a video-init; reanuda la subida previa", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload/video-init") return initOk();
      if (url.startsWith("/api/videos/status")) return statusReady();
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useVideoUpload());

    // 1) Primera subida: la red cae a mitad (onError) → error, pero la sesión queda guardada.
    tusScript.push("fail");
    await act(async () => {
      await result.current.upload(file, { title: "Final" });
    });
    expect(result.current.state.phase).toBe("error");
    expect(initCalls()).toHaveLength(1);
    const stored = JSON.parse(localStorage.getItem(TUS_SESSIONS_STORAGE_KEY) ?? "{}");
    const [session] = Object.values(stored) as Array<Record<string, unknown>>;
    expect(session).toMatchObject({
      videoId: "guid-1",
      uploadUrl: "https://video.bunnycdn.com/library/42/videos/guid-1",
      authSignature: "sig-abc",
      libraryId: 42,
      tusUploadUrl: "https://video.bunnycdn.com/tusupload/abc",
    });
    // Reintentos con rampa larga (redes de campo)
    expect(instances[0].opts.retryDelays).toEqual(TUS_RETRY_DELAYS);
    expect(TUS_RETRY_DELAYS).toEqual([0, 3000, 10000, 30000, 60000, 120000]);

    // 2) "Recarga" (hook nuevo) + mismo fichero → reanuda: sin segundo video-init.
    const { result: result2 } = renderHook(() => useVideoUpload());
    const onUploaded = vi.fn();
    tusScript.push("succeed");
    let returned: string | null = null;
    await act(async () => {
      const p = result2.current.upload(file, { title: "Final", onUploaded });
      await vi.advanceTimersByTimeAsync(5000);
      returned = await p;
    });

    expect(initCalls()).toHaveLength(1); // ← NO se volvió a llamar
    const resumed = instances[1];
    expect(resumed.opts.headers).toMatchObject({
      AuthorizationSignature: "sig-abc",
      VideoId: "guid-1",
      LibraryId: "42",
    });
    expect(resumed.findPreviousUploads).toHaveBeenCalledTimes(1);
    // Elige la subida cuya URL TUS guardamos (no la primera de la lista)
    expect(resumed.resumeFromPreviousUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadUrl: "https://video.bunnycdn.com/tusupload/abc" }),
    );
    expect(onUploaded).toHaveBeenCalledWith({ videoId: "guid-1", libraryId: 42 });
    expect(returned).toBe("guid-1");
    expect(result2.current.state.phase).toBe("done");
    expect(result2.current.state.encodeStatus).toBe("ready");
    // Subida completa → la sesión se borra
    expect(localStorage.getItem(TUS_SESSIONS_STORAGE_KEY)).toBeNull();
  });

  it("sesión caducada → se descarta y se hace un init nuevo", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload/video-init") return initOk("guid-2");
      if (url.startsWith("/api/videos/status")) return statusReady();
      throw new Error(`unexpected fetch ${url}`);
    });
    // Sesión previa ya caducada para el mismo fichero
    const { uploadFingerprint } = await import("@/lib/tusUploadSession");
    const { BUNNY_TUS_ENDPOINT } = await import("@/hooks/useVideoUpload");
    localStorage.setItem(
      TUS_SESSIONS_STORAGE_KEY,
      JSON.stringify({
        [uploadFingerprint(file, BUNNY_TUS_ENDPOINT)]: {
          videoId: "guid-old", uploadUrl: "u", authSignature: "s", libraryId: 42,
          authExpire: Math.floor(Date.now() / 1000) - 10, playerId: null, savedAt: 0,
        },
      }),
    );

    const { result } = renderHook(() => useVideoUpload());
    await act(async () => {
      const p = result.current.upload(file);
      await vi.advanceTimersByTimeAsync(5000);
      await p;
    });
    expect(initCalls()).toHaveLength(1);
    expect(instances[0].opts.headers.VideoId).toBe("guid-2");
    expect(instances[0].resumeFromPreviousUpload).not.toHaveBeenCalled();
  });

  it("no reanuda la sesión de OTRO jugador (misma huella, distinto playerId)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload/video-init") return initOk("guid-p2");
      if (url.startsWith("/api/videos/status")) return statusReady();
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result: r1 } = renderHook(() => useVideoUpload("p1"));
    tusScript.push("fail");
    fetchMock.mockImplementationOnce(async () => initOk("guid-p1"));
    await act(async () => { await r1.current.upload(file); });

    const { result: r2 } = renderHook(() => useVideoUpload("p2"));
    await act(async () => {
      const p = r2.current.upload(file);
      await vi.advanceTimersByTimeAsync(5000);
      await p;
    });
    expect(initCalls()).toHaveLength(2);
    expect(instances[1].opts.headers.VideoId).toBe("guid-p2");
  });

  it("poll agotado → done con encodeStatus 'processing' (no error) y onUploaded antes del poll", async () => {
    const order: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload/video-init") return initOk("guid-long");
      if (url.startsWith("/api/videos/status")) {
        order.push("poll");
        return statusEncoding();
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useVideoUpload());
    let returned: string | null = null;
    await act(async () => {
      const p = result.current.upload(file, { onUploaded: () => order.push("uploaded") });
      // 150 intentos × 4 s + margen
      await vi.advanceTimersByTimeAsync(4000 * 152);
      returned = await p;
    });

    expect(returned).toBe("guid-long");
    expect(result.current.state.phase).toBe("done");
    expect(result.current.state.encodeStatus).toBe("processing");
    expect(result.current.state.error).toBeNull();
    expect(order[0]).toBe("uploaded");
    expect(order.filter((o) => o === "poll").length).toBe(150);
  });

  it("pasa la duración del navegador a video-init solo si se conoce", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload/video-init") return initOk("guid-d");
      if (url.startsWith("/api/videos/status")) return statusReady(5400);
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useVideoUpload("p9"));
    await act(async () => {
      const p = result.current.upload(file, { title: "T", durationSec: 5400 });
      await vi.advanceTimersByTimeAsync(5000);
      await p;
    });
    const body = JSON.parse(initCalls()[0][1].body as string);
    expect(body).toEqual({ title: "T", playerId: "p9", durationSec: 5400 });
    // Partido completo con jugador: la cola de clips cortos NO lo encola → no se promete
    // un análisis que no va a llegar; se informa la duración real que lo dejó fuera.
    expect(result.current.state.analysisQueued).toBe(false);
    expect(result.current.state.syncGateDurationSec).toBe(5400);
  });

  it("sin duración conocida no se envía durationSec (no se inventa)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload/video-init") return initOk("guid-n");
      if (url.startsWith("/api/videos/status")) return statusReady(0);
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useVideoUpload("p9"));
    await act(async () => {
      const p = result.current.upload(file, { title: "T", durationSec: null });
      await vi.advanceTimersByTimeAsync(5000);
      await p;
    });
    expect(JSON.parse(initCalls()[0][1].body as string)).toEqual({ title: "T", playerId: "p9" });
    expect(result.current.state.analysisQueued).toBe(true); // clip de duración desconocida: no se bloquea
    expect(result.current.state.syncGateDurationSec).toBeNull();
  });
});

// ── Sesión rechazada por Bunny (4xx definitivo) ─────────────────────────────
// Antes: la sesión solo se borraba tras un éxito TUS. Si Bunny rechazaba el
// {VideoId, AuthorizationSignature} guardado (vídeo borrado en Bunny, clave rotada)
// cada reintento con el mismo fichero volvía a usar la sesión muerta → nunca se
// llamaba a video-init y el fichero no se podía subir durante ~24 h.
describe("useVideoUpload · sesión TUS rechazada por Bunny", () => {
  /** Guarda directamente una sesión VIGENTE (como la dejaría un corte a mitad). */
  async function storeLiveSession(videoId = "guid-dead") {
    const { uploadFingerprint } = await import("@/lib/tusUploadSession");
    const { BUNNY_TUS_ENDPOINT } = await import("@/hooks/useVideoUpload");
    localStorage.setItem(
      TUS_SESSIONS_STORAGE_KEY,
      JSON.stringify({
        [uploadFingerprint(file, BUNNY_TUS_ENDPOINT)]: {
          videoId, uploadUrl: `https://video.bunnycdn.com/library/42/videos/${videoId}`,
          authSignature: "sig-dead", libraryId: 42,
          authExpire: Math.floor(Date.now() / 1000) + 20 * 3600, playerId: null,
          tusUploadUrl: "https://video.bunnycdn.com/tusupload/abc", savedAt: 0,
        },
      }),
    );
  }
  const storedSessions = () =>
    JSON.parse(localStorage.getItem(TUS_SESSIONS_STORAGE_KEY) ?? "{}") as Record<string, { videoId: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = () => "blob:test-video";
    URL.revokeObjectURL = () => undefined;
    localStorage.clear();
    tusScript.length = 0;
    instances.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  /** video-init devuelve un GUID nuevo en cada llamada (guid-new-1, guid-new-2…). */
  function mockInitSequence() {
    let n = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload/video-init") return initOk(`guid-new-${++n}`);
      if (url.startsWith("/api/videos/status")) return statusReady();
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  it("sesión guardada + Bunny responde 4xx → se descarta y se reintenta UNA vez con video-init nuevo", async () => {
    mockInitSequence();
    // 1) Subida a medias (corte de red) → sesión guid-new-1 + stub local "created".
    const { result } = renderHook(() => useVideoUpload());
    tusScript.push("fail");
    await act(async () => { await result.current.upload(file); });
    expect(result.current.state.phase).toBe("error");
    expect(initCalls()).toHaveLength(1);

    // 2) Mismo fichero: la sesión guardada se intenta reanudar, pero Bunny ya no la acepta
    //    (p. ej. se borró el vídeo o se rotó la clave) → 401. Reintento con init nuevo → OK.
    const { VideoService } = await import("@/services/real/videoService");
    const { result: r2 } = renderHook(() => useVideoUpload());
    tusScript.push(401, "succeed");
    let returned: string | null = null;
    await act(async () => {
      const p = r2.current.upload(file);
      await vi.advanceTimersByTimeAsync(5000);
      returned = await p;
    });

    expect(initCalls()).toHaveLength(2); // ← ahora SÍ se vuelve a llamar a video-init
    expect(instances[1].opts.headers.VideoId).toBe("guid-new-1"); // intento de reanudar
    expect(instances[1].resumeFromPreviousUpload).toHaveBeenCalled();
    expect(instances[2].opts.headers.VideoId).toBe("guid-new-2"); // sesión nueva
    expect(instances[2].resumeFromPreviousUpload).not.toHaveBeenCalled();
    expect(returned).toBe("guid-new-2");
    expect(r2.current.state.phase).toBe("done");
    expect(r2.current.state.videoId).toBe("guid-new-2");
    expect(localStorage.getItem(TUS_SESSIONS_STORAGE_KEY)).toBeNull();
    // El vídeo de la sesión rechazada no se completará nunca → deja de figurar "en subida".
    expect(VideoService.getById("guid-new-1")?.status).toBe("upload-failed");
    expect(VideoService.getById("guid-new-1")?.localPath).toBeUndefined();
  });

  it("sesión guardada + 4xx también en el reintento → error, sesión borrada y la siguiente upload() llama a video-init", async () => {
    mockInitSequence();
    await storeLiveSession("guid-dead");
    const { result } = renderHook(() => useVideoUpload());

    tusScript.push(403, 403);
    await act(async () => { await result.current.upload(file); });
    expect(result.current.state.phase).toBe("error");
    expect(instances[0].opts.headers.VideoId).toBe("guid-dead");
    expect(initCalls()).toHaveLength(1); // un único reintento, no un bucle
    expect(instances).toHaveLength(2);
    expect(storedSessions()).toEqual({}); // ninguna sesión muerta queda guardada

    // Siguiente intento con el MISMO fichero: ya no hay sesión que reanudar → video-init.
    tusScript.push("succeed");
    await act(async () => {
      const p = result.current.upload(file);
      await vi.advanceTimersByTimeAsync(5000);
      await p;
    });
    expect(initCalls()).toHaveLength(2);
    expect(instances[2].opts.headers.VideoId).toBe("guid-new-2");
    expect(instances[2].resumeFromPreviousUpload).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe("done");
  });

  it("sesión NUEVA rechazada con 4xx → se borra (sin reintento en la misma llamada); la siguiente upload() llama a video-init", async () => {
    mockInitSequence();
    const { result } = renderHook(() => useVideoUpload());
    tusScript.push(400);
    await act(async () => { await result.current.upload(file); });
    expect(result.current.state.phase).toBe("error");
    expect(initCalls()).toHaveLength(1);
    expect(instances).toHaveLength(1);
    expect(storedSessions()).toEqual({});

    tusScript.push("succeed");
    await act(async () => {
      const p = result.current.upload(file);
      await vi.advanceTimersByTimeAsync(5000);
      await p;
    });
    expect(initCalls()).toHaveLength(2);
    expect(instances[1].opts.headers.VideoId).toBe("guid-new-2");
  });

  it("corte de red al reanudar (sin respuesta HTTP) → la sesión se CONSERVA y no hay video-init", async () => {
    mockInitSequence();
    await storeLiveSession("guid-live");
    const { result } = renderHook(() => useVideoUpload());
    tusScript.push("fail");
    await act(async () => { await result.current.upload(file); });
    expect(result.current.state.phase).toBe("error");
    expect(initCalls()).toHaveLength(0);
    expect(Object.values(storedSessions()).map((s) => s.videoId)).toEqual(["guid-live"]);
  });

  it.each([409, 423, 500, 503])(
    "HTTP %i (transitorio para tus) al reanudar → la sesión se conserva",
    async (status) => {
      mockInitSequence();
      await storeLiveSession("guid-live");
      const { result } = renderHook(() => useVideoUpload());
      tusScript.push(status);
      await act(async () => { await result.current.upload(file); });
      expect(result.current.state.phase).toBe("error");
      expect(initCalls()).toHaveLength(0);
      expect(Object.values(storedSessions()).map((s) => s.videoId)).toEqual(["guid-live"]);
    },
  );
});
