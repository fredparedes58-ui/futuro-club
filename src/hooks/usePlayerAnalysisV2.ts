/**
 * VITAS · usePlayerAnalysisV2 (Sprint 5 migración)
 *
 * Hook moderno para análisis de jugador. REEMPLAZA `usePlayerIntelligence.ts`
 * (que llamaba al deprecated /api/agents/video-intelligence).
 *
 * Nuevo flujo:
 *   1. POST /api/videos/create-upload → recibe credenciales TUS
 *   2. Cliente sube vídeo a Bunny via TUS protocol
 *   3. POST /api/videos/finalize → dispara webhook
 *   4. Webhook encola análisis · Modal procesa con MediaPipe
 *   5. Modal callback → orchestrator dispara 6 reportes Claude
 *   6. Polling /api/analyses/by-video hasta status='completed'
 *   7. GET /api/analyses/reports → devuelve los 6 reportes
 *
 * Diferencias vs usePlayerIntelligence (legacy):
 *   ✅ Pipeline real con GPU (MediaPipe 33 keypoints) en lugar de Claude vision
 *   ✅ 6 reportes especializados (vs 1 monolítico)
 *   ✅ Async con queue (resiste vídeos largos)
 *   ✅ Async upload directo a Bunny (no pasa por Vercel)
 *   ✅ VSI + PHV + scanning rate calculados
 *   ❌ Más latencia total (~90s vs ~30s · pero mejor calidad)
 *
 * Plan: cuando este hook esté validado, migrar `VitasLab.tsx` y borrar
 * `usePlayerIntelligence.ts` + `_video-intelligence.ts`.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import * as tus from "tus-js-client";
import { getAuthHeaders } from "@/lib/apiAuth";

// ── Tipos ─────────────────────────────────────────────────────────

export type AnalysisV2Step =
  | "idle"
  | "creating_upload"
  | "uploading"
  | "bunny_processing"
  | "queued"
  | "modal_processing"
  | "generating_reports"
  | "completed"
  | "error";

export interface AnalysisV2State {
  step: AnalysisV2Step;
  progress: number;       // 0-100
  message: string;
  error: string | null;
}

export interface AnalysisV2Result {
  analysisId: string | null;
  videoId: string | null;
  vsi: { vsi: number; tier: string; tierLabel: string } | null;
  phv: Record<string, unknown> | null;
  similarity: Record<string, unknown> | null;
  scanning: Record<string, unknown> | null;
  biomechanics: Record<string, unknown> | null;
  reports: Array<{
    report_type: string;
    content: Record<string, unknown>;
    model: string;
    prompt_version: string;
  }> | null;
  completedAt: string | null;
}

const INITIAL_STATE: AnalysisV2State = {
  step: "idle",
  progress: 0,
  message: "",
  error: null,
};

const INITIAL_RESULT: AnalysisV2Result = {
  analysisId: null,
  videoId: null,
  vsi: null,
  phv: null,
  similarity: null,
  scanning: null,
  biomechanics: null,
  reports: null,
  completedAt: null,
};

// ── Polling helpers ───────────────────────────────────────────────

async function pollUntil<T>(
  fn: () => Promise<T | null>,
  predicate: (v: T) => boolean,
  maxAttempts: number,
  intervalMs: number,
  abortSignal?: AbortSignal
): Promise<T | null> {
  for (let i = 0; i < maxAttempts; i++) {
    if (abortSignal?.aborted) return null;
    const v = await fn();
    if (v && predicate(v)) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

// ── Hook principal ────────────────────────────────────────────────

export function usePlayerAnalysisV2() {
  const [state, setState] = useState<AnalysisV2State>(INITIAL_STATE);
  const [result, setResult] = useState<AnalysisV2Result>(INITIAL_RESULT);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
    setResult(INITIAL_RESULT);
  }, []);

  /**
   * Análisis completo end-to-end:
   *   file → Bunny → Modal → 6 reports
   */
  const startAnalysis = useCallback(
    async (params: { file: File; playerId: string; title: string }) => {
      const ac = new AbortController();
      abortRef.current = ac;
      setResult(INITIAL_RESULT);

      try {
        // ── 1. Crear upload en Bunny ──────────────────
        setState({ step: "creating_upload", progress: 5, message: "Preparando subida...", error: null });
        const headers = await getAuthHeaders();
        const createRes = await fetch("/api/videos/create-upload", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: params.playerId,
            title: params.title,
            durationSec: undefined,
          }),
          signal: ac.signal,
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData.success) {
          throw new Error(createData?.error?.message ?? "Error creando upload");
        }
        const meta = createData.data as {
          videoId: string;
          bunnyVideoId: string;
          libraryId: number;
          tusUploadUrl: string;
          authorizationSignature: string;
          authorizationExpire: number;
        };

        setResult((r) => ({ ...r, videoId: meta.videoId }));

        // ── 2. Upload TUS directo a Bunny ─────────────
        setState({ step: "uploading", progress: 10, message: "Subiendo a Bunny Stream...", error: null });
        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(params.file, {
            endpoint: meta.tusUploadUrl,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
              AuthorizationSignature: meta.authorizationSignature,
              AuthorizationExpire: String(meta.authorizationExpire),
              VideoId: meta.bunnyVideoId,
              LibraryId: String(meta.libraryId),
            },
            metadata: { filetype: params.file.type, title: params.title },
            onError: (err) => reject(err),
            onProgress: (bytesUploaded, bytesTotal) => {
              const pct = 10 + Math.floor((bytesUploaded / bytesTotal) * 30);
              setState((s) => ({ ...s, progress: pct, message: `Subiendo... ${Math.floor((bytesUploaded / bytesTotal) * 100)}%` }));
            },
            onSuccess: () => resolve(),
          });
          upload.start();
          ac.signal.addEventListener("abort", () => upload.abort());
        });

        // ── 3. Finalizar (esperar a Bunny encoding) ──
        setState({ step: "bunny_processing", progress: 40, message: "Bunny procesando vídeo...", error: null });
        let attempts = 0;
        let finalized = false;
        while (attempts < 12 && !finalized && !ac.signal.aborted) {
          attempts++;
          await new Promise((r) => setTimeout(r, 5000));
          const finRes = await fetch("/api/videos/finalize", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: meta.videoId, bunnyVideoId: meta.bunnyVideoId }),
            signal: ac.signal,
          });
          const finData = await finRes.json();
          if (finData?.data?.ready) {
            finalized = true;
            break;
          }
          setState((s) => ({ ...s, progress: 40 + attempts, message: `Bunny encoding... ${attempts}/12` }));
        }
        if (!finalized) throw new Error("Bunny tardó demasiado");

        // ── 4. Polling análisis ──────────────────────
        setState({ step: "queued", progress: 55, message: "Análisis encolado · cron procesará en <1 min", error: null });

        const analysisStatus = await pollUntil(
          async () => {
            const res = await fetch(`/api/analyses/by-video?videoId=${meta.videoId}`, { headers, signal: ac.signal });
            if (!res.ok) return null;
            const d = await res.json();
            return d?.data?.analysis ?? null;
          },
          (a) => a?.status === "completed" || a?.status === "completed_partial" || a?.status === "failed",
          60, // 60 attempts
          5000, // cada 5 seg = 5 minutos máximo
          ac.signal
        );

        if (!analysisStatus) throw new Error("Análisis no completó en 5 minutos");
        if (analysisStatus.status === "failed") {
          throw new Error(analysisStatus.status_message ?? "Análisis falló");
        }

        setResult((r) => ({ ...r, analysisId: analysisStatus.id }));

        // Ir actualizando estado durante polling para UX
        if (analysisStatus.status === "processing") {
          setState({ step: "modal_processing", progress: 70, message: "Modal procesando con MediaPipe (GPU)...", error: null });
        } else if (analysisStatus.status === "processing_reports") {
          setState({ step: "generating_reports", progress: 85, message: "Claude generando 6 reportes...", error: null });
        }

        // ── 5. Cargar reportes ───────────────────────
        setState({ step: "generating_reports", progress: 90, message: "Cargando reportes...", error: null });

        const reportsRes = await fetch(`/api/analyses/reports?analysisId=${analysisStatus.id}`, {
          headers,
          signal: ac.signal,
        });
        const reportsData = await reportsRes.json();
        if (!reportsRes.ok || !reportsData.success) {
          throw new Error(reportsData?.error?.message ?? "Error cargando reportes");
        }

        const a = reportsData.data.analysis;
        setResult({
          analysisId: a.id,
          videoId: a.video_id,
          vsi: a.vsi,
          phv: a.phv,
          similarity: a.similarity,
          scanning: null, // por ahora no se persiste separado · está en biomechanics
          biomechanics: a.biomechanics,
          reports: reportsData.data.reports,
          completedAt: a.completed_at,
        });

        setState({ step: "completed", progress: 100, message: "✓ 6 reportes generados", error: null });

        return reportsData.data;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error desconocido";
        setState({ step: "error", progress: 0, message: "Error", error: errorMsg });
        throw err;
      }
    },
    []
  );

  /**
   * Recargar reportes de un análisis existente (sin subir vídeo).
   * Útil cuando el padre vuelve a la app y quiere ver el último.
   */
  const loadAnalysis = useCallback(async (analysisId: string) => {
    try {
      setState({ step: "generating_reports", progress: 90, message: "Cargando reportes...", error: null });
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/analyses/reports?analysisId=${analysisId}`, { headers });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? "Not found");

      const a = data.data.analysis;
      setResult({
        analysisId: a.id,
        videoId: a.video_id,
        vsi: a.vsi,
        phv: a.phv,
        similarity: a.similarity,
        scanning: null,
        biomechanics: a.biomechanics,
        reports: data.data.reports,
        completedAt: a.completed_at,
      });
      setState({ step: "completed", progress: 100, message: "Cargado", error: null });
      return data.data;
    } catch (err) {
      setState({
        step: "error",
        progress: 0,
        message: "Error al cargar",
        error: err instanceof Error ? err.message : "unknown",
      });
      throw err;
    }
  }, []);

  // Cleanup al unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    state,
    result,
    isProcessing: state.step !== "idle" && state.step !== "completed" && state.step !== "error",
    isCompleted: state.step === "completed",
    isError: state.step === "error",
    startAnalysis,
    loadAnalysis,
    reset,
  };
}
