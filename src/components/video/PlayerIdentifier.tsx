/**
 * VITAS · Player Identifier
 *
 * Tras Modal procesar el vídeo, muestra grid de personas detectadas.
 * El padre/coach selecciona "este es mi hijo".
 *
 * Uso:
 *   <PlayerIdentifier
 *     videoId={videoId}
 *     playerName="Pedrito"
 *     onIdentified={() => navigate(`/player/.../analysis/...`)}
 *   />
 */

import { useEffect, useState } from "react";

interface Candidate {
  candidateIdx: number;
  frameIdx: number;
  timestamp: number;
  bbox: { x: number; y: number; w: number; h: number };
  cropBase64: string;
}

interface Props {
  videoId: string;
  playerName?: string;
  onIdentified?: () => void;
}

export function PlayerIdentifier({ videoId, playerName, onIdentified }: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyIdentified, setAlreadyIdentified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let pollAttempts = 0;
    const maxAttempts = 30;

    async function pollCandidates() {
      while (mounted && pollAttempts < maxAttempts) {
        pollAttempts++;
        try {
          const res = await fetch(`/api/videos/candidates?videoId=${videoId}`, {
            credentials: "include",
          });
          const data = await res.json();
          if (!mounted) return;

          if (data?.success && data?.data?.ready) {
            if (data.data.alreadyIdentified) {
              setAlreadyIdentified(true);
              setLoading(false);
              return;
            }
            const cs = data.data.candidates;
            if (Array.isArray(cs) && cs.length > 0) {
              setCandidates(cs);
              setLoading(false);
              return;
            }
          }
        } catch {
          /* reintentar */
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      if (mounted) {
        setError("El análisis está tardando · intenta de nuevo en unos minutos");
        setLoading(false);
      }
    }

    pollCandidates();
    return () => {
      mounted = false;
    };
  }, [videoId]);

  async function handleConfirm() {
    if (selectedIdx === null) return;
    const candidate = candidates[selectedIdx];
    if (!candidate) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/videos/identify-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          videoId,
          candidateIdx: candidate.candidateIdx,
          frameIdx: candidate.frameIdx,
          timestamp: candidate.timestamp,
          bbox: candidate.bbox,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message ?? "Error al guardar");
      }

      onIdentified?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center space-y-4">
        <div className="w-12 h-12 mx-auto border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600">Esperando que Modal extraiga las personas detectadas...</p>
        <p className="text-xs text-slate-400">Este paso puede tardar 1-2 minutos</p>
      </div>
    );
  }

  if (alreadyIdentified) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="font-rajdhani text-2xl font-bold">Jugador ya identificado</h2>
        <p className="text-slate-600">Este vídeo ya tiene un jugador asignado.</p>
        <button
          onClick={() => onIdentified?.()}
          className="px-6 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold"
        >
          Continuar →
        </button>
      </div>
    );
  }

  if (error || candidates.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center space-y-4">
        <div className="text-5xl">⚠️</div>
        <h2 className="font-rajdhani text-2xl font-bold">No se detectaron jugadores</h2>
        <p className="text-slate-600">{error ?? "El vídeo no contenía personas detectables"}</p>
        <p className="text-xs text-slate-500">
          Intenta con un vídeo más cercano al jugador y mejor iluminación
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold mb-1">
          Identificar jugador
        </div>
        <h2 className="font-rajdhani text-2xl font-bold mb-2">
          ¿Cuál es {playerName ?? "tu jugador"}?
        </h2>
        <p className="text-sm text-slate-600">
          Selecciona la persona que quieres analizar. VITAS aprenderá su aspecto y la
          identificará automáticamente en futuros vídeos.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {candidates.map((c, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedIdx(idx)}
            className={`relative rounded-xl overflow-hidden border-4 transition-all ${
              selectedIdx === idx
                ? "border-purple-600 shadow-lg scale-105"
                : "border-transparent hover:border-slate-300"
            }`}
          >
            <img
              src={`data:image/jpeg;base64,${c.cropBase64}`}
              alt={`Candidato ${idx + 1}`}
              className="w-full h-auto aspect-[3/4] object-cover bg-slate-100"
            />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
              <div className="text-white text-xs font-semibold">
                Candidato {idx + 1} · {c.timestamp.toFixed(1)}s
              </div>
            </div>
            {selectedIdx === idx && (
              <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold">
                ✓
              </div>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setSelectedIdx(null)}
          disabled={selectedIdx === null}
          className="flex-1 py-3 rounded-full border border-slate-300 font-semibold disabled:opacity-50 hover:bg-slate-50"
        >
          Limpiar
        </button>
        <button
          onClick={handleConfirm}
          disabled={selectedIdx === null || submitting}
          className="flex-2 py-3 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold disabled:opacity-50"
        >
          {submitting ? "Guardando..." : "Confirmar selección"}
        </button>
      </div>

      <p className="text-xs text-center text-slate-500">
        💡 Si no aparece tu jugador, intenta con un vídeo donde se le vea mejor
      </p>
    </div>
  );
}
