/**
 * VITAS · Video Uploader
 *
 * Sube un vídeo directamente a Bunny Stream usando TUS protocol
 * (resumable, soporta archivos grandes, no pasa por nuestro servidor).
 *
 * Flujo:
 *   1. Llama /api/videos/create-upload → recibe credenciales TUS
 *   2. Sube archivo a Bunny via TUS (con barra de progreso)
 *   3. Llama /api/videos/finalize → dispara análisis
 *   4. Polling a /api/analyses/[id] hasta status='completed'
 *
 * Requiere: npm install tus-js-client
 *
 * Uso:
 *   <VideoUploader playerId={player.id} onComplete={(analysisId) => navigate(...)} />
 */

import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";

interface Props {
  playerId: string;
  playerName?: string;
  onComplete?: (analysisId: string) => void;
}

type UploadState =
  | "idle"
  | "creating"
  | "uploading"
  | "processing_bunny"
  | "queued"
  | "analyzing"
  | "completed"
  | "error";

interface VideoMeta {
  videoId: string;
  bunnyVideoId: string;
  libraryId: number;
  tusUploadUrl: string;
  authorizationSignature: string;
  authorizationExpire: number;
}

export function VideoUploader({ playerId, playerName, onComplete }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset
  function reset() {
    setState("idle");
    setProgress(0);
    setStatusMessage("");
    setError(null);
    setAnalysisId(null);
    setFile(null);
    setTitle("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Validación cliente del archivo
  function validateFile(f: File): string | null {
    if (f.size > 500 * 1024 * 1024) return "El vídeo supera 500 MB · usa uno más corto";
    if (f.size < 100 * 1024) return "El vídeo es muy pequeño · ¿se grabó bien?";
    if (!f.type.startsWith("video/")) return "El archivo no es un vídeo";
    return null;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const validation = validateFile(selected);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setFile(selected);
    if (!title) {
      // Sugerir título basado en fecha
      const today = new Date().toLocaleDateString("es-ES");
      setTitle(`Análisis ${today}`);
    }
  }

  async function handleUpload() {
    if (!file || !title) return;
    setError(null);
    setState("creating");
    setStatusMessage("Preparando subida...");

    try {
      // 1. Crear video en Bunny + obtener credenciales TUS
      const createRes = await fetch("/api/videos/create-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          playerId,
          title,
          durationSec: undefined,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.success) {
        throw new Error(createData?.error?.message ?? "Error creando upload");
      }

      const meta: VideoMeta = createData.data;

      // 2. Subir con TUS protocol
      setState("uploading");
      setStatusMessage("Subiendo vídeo...");

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: meta.tusUploadUrl,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: meta.authorizationSignature,
            AuthorizationExpire: String(meta.authorizationExpire),
            VideoId: meta.bunnyVideoId,
            LibraryId: String(meta.libraryId),
          },
          metadata: {
            filetype: file.type,
            title,
          },
          onError: (err) => reject(err),
          onProgress: (bytesUploaded, bytesTotal) => {
            const pct = Math.floor((bytesUploaded / bytesTotal) * 100);
            setProgress(pct);
          },
          onSuccess: () => resolve(),
        });

        upload.start();
      });

      // 3. Finalizar (consulta Bunny + dispara webhook)
      setState("processing_bunny");
      setStatusMessage("Bunny procesando vídeo...");
      setProgress(100);

      let attempts = 0;
      let finalized = false;
      while (attempts < 12 && !finalized) {
        attempts++;
        await new Promise((r) => setTimeout(r, 5000));

        const finRes = await fetch("/api/videos/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            videoId: meta.videoId,
            bunnyVideoId: meta.bunnyVideoId,
          }),
        });

        const finData = await finRes.json();
        if (finData?.data?.ready) {
          finalized = true;
          break;
        }
        setStatusMessage(`Bunny procesando... (${attempts}/12)`);
      }

      if (!finalized) throw new Error("Bunny tardó demasiado en procesar");

      // 4. Polling al análisis
      setState("queued");
      setStatusMessage("Análisis encolado...");

      let analysisCompleted = false;
      let pollAttempts = 0;
      while (pollAttempts < 30 && !analysisCompleted) {
        pollAttempts++;
        await new Promise((r) => setTimeout(r, 8000));

        const statusRes = await fetch(
          `/api/analyses/by-video?videoId=${meta.videoId}`,
          { credentials: "include" }
        );
        if (statusRes.ok) {
          const status = await statusRes.json();
          const a = status?.data?.analysis;
          if (a) {
            setAnalysisId(a.id);
            if (a.status === "processing") {
              setState("analyzing");
              setStatusMessage("IA analizando vídeo en GPU...");
            } else if (a.status === "completed") {
              analysisCompleted = true;
              setState("completed");
              setStatusMessage("¡Análisis completo!");
              onComplete?.(a.id);
              break;
            } else if (a.status === "failed") {
              throw new Error(a.status_message ?? "Análisis falló");
            }
          }
        }
      }

      if (!analysisCompleted) {
        setStatusMessage("Análisis tardando · revisa en unos minutos");
      }
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header>
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold mb-1">
          Subir vídeo
        </div>
        <h2 className="font-rajdhani text-2xl font-bold mb-2">
          Análisis de {playerName ?? "jugador"}
        </h2>
        <p className="text-sm text-slate-600">
          Sube un vídeo de 30 seg - 5 min. Ideal: cuerpo entero visible, buena luz, resolución 720p+.
        </p>
      </header>

      {state === "idle" && (
        <>
          <div>
            <label className="block text-sm font-semibold mb-1">Título del análisis</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ej. Entrenamiento técnico - 3 mayo"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Vídeo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-m4v,video/*"
              onChange={handleFileSelect}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-slate-500 mt-1">
              MP4, MOV, M4V · máximo 500 MB
            </p>
          </div>

          {file && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="font-semibold">{file.name}</div>
              <div className="text-slate-600">
                {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || !title}
            className="w-full py-3.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold disabled:opacity-50"
          >
            Subir y analizar
          </button>
        </>
      )}

      {state !== "idle" && (
        <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            {state === "completed" ? (
              <span className="text-3xl">✅</span>
            ) : state === "error" ? (
              <span className="text-3xl">❌</span>
            ) : (
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            )}
            <div className="font-rajdhani font-bold text-lg">{statusMessage}</div>
          </div>

          {(state === "uploading" || state === "processing_bunny") && (
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {state === "completed" && analysisId && (
            <a
              href={`/player/${playerId}/analysis/${analysisId}`}
              className="block text-center w-full py-3 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold"
            >
              Ver reportes →
            </a>
          )}

          {(state === "error" || state === "completed") && (
            <button
              onClick={reset}
              className="w-full py-2.5 rounded-full border border-slate-300 text-sm font-semibold hover:bg-slate-50"
            >
              Subir otro vídeo
            </button>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
