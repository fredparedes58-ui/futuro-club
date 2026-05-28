/**
 * VITAS · Highlight Detail Page
 * /highlights/:id
 *
 * Reel player + clip list + edit/delete clips.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Film,
  Trash2,
  Pencil,
  Save,
  X,
  Check,
  Plus,
  Share2,
  Download,
  Clock,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { HighlightsStorage } from "@/services/real/highlightsStorage";
import ReelPlayer from "@/components/highlights/ReelPlayer";
import type { HighlightReel, HighlightClip, ClipMoment } from "@/lib/highlights/types";
import { MOMENT_META, ALL_MOMENTS } from "@/lib/highlights/types";

function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function HighlightDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reel, setReel] = useState<HighlightReel | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [clipDraft, setClipDraft] = useState<Partial<HighlightClip>>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!id) return;
    const r = HighlightsStorage.getById(id);
    if (!r) {
      toast.error("Reel no encontrado");
      navigate("/highlights");
      return;
    }
    setReel(r);
    setTitleDraft(r.title);
  }, [id, navigate, version]);

  const reload = () => setVersion((v) => v + 1);

  const sortedClips = useMemo(
    () => (reel ? [...reel.clips].sort((a, b) => a.startMs - b.startMs) : []),
    [reel],
  );

  if (!reel) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando reel…
      </div>
    );
  }

  const handleSaveTitle = () => {
    if (!titleDraft.trim()) {
      toast.error("Título vacío");
      return;
    }
    HighlightsStorage.save({ ...reel, title: titleDraft.trim() });
    setEditingTitle(false);
    reload();
    toast.success("Título actualizado");
  };

  const handleDeleteReel = () => {
    if (!window.confirm(`¿Eliminar el reel "${reel.title}"?`)) return;
    HighlightsStorage.delete(reel.id);
    toast.success("Reel eliminado");
    navigate("/highlights");
  };

  const handleDeleteClip = (clipId: string) => {
    if (!window.confirm("¿Eliminar este clip del reel?")) return;
    HighlightsStorage.removeClip(reel.id, clipId);
    reload();
    toast.success("Clip eliminado");
  };

  const startEditClip = (clip: HighlightClip) => {
    setEditingClipId(clip.id);
    setClipDraft({
      description: clip.description,
      moment: clip.moment,
      playerName: clip.playerName ?? "",
      startMs: clip.startMs,
      endMs: clip.endMs,
    });
  };

  const handleSaveClip = () => {
    if (!editingClipId) return;
    HighlightsStorage.updateClip(reel.id, editingClipId, {
      description: clipDraft.description?.trim() || "Sin descripción",
      moment: clipDraft.moment as ClipMoment,
      playerName: clipDraft.playerName?.trim() || undefined,
      startMs: Math.max(0, clipDraft.startMs ?? 0),
      endMs: Math.max(
        (clipDraft.startMs ?? 0) + 1000,
        clipDraft.endMs ?? (clipDraft.startMs ?? 0) + 5000,
      ),
    });
    setEditingClipId(null);
    reload();
    toast.success("Clip actualizado");
  };

  const handleAddClip = () => {
    const startMs = reel.clips.length > 0
      ? Math.max(...reel.clips.map((c) => c.endMs)) + 5000
      : 0;
    HighlightsStorage.addClip(reel.id, {
      startMs,
      endMs: startMs + 5000,
      moment: "skill",
      description: "Nuevo clip — edita los datos",
      confidence: 1,
      manual: true,
    });
    reload();
    toast.success("Clip añadido — pulsa el lápiz para editarlo");
  };

  const handleShare = () => {
    const text = `Reel "${reel.title}" — ${reel.clips.length} clips · ${Math.round(reel.totalDurationMs / 1000)}s`;
    if (navigator.share) {
      navigator
        .share({ title: reel.title, text })
        .catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${text}\n${window.location.href}`);
      toast.success("Link y resumen copiados al portapapeles");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate("/highlights")}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
            <Film size={18} className="text-white" />
          </div>
          {!editingTitle ? (
            <>
              <div className="flex-1 min-w-0">
                <h1 className="font-display font-bold text-base text-foreground truncate">
                  {reel.title}
                </h1>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <VideoIcon size={9} />
                  <span className="truncate">{reel.sourceVideoTitle}</span>
                  <span>·</span>
                  <Clock size={9} />
                  {Math.round(reel.totalDurationMs / 1000)}s
                </p>
              </div>
              <button
                onClick={() => setEditingTitle(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
                title="Renombrar"
              >
                <Pencil size={13} />
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="flex-1 bg-secondary/40 rounded-md px-3 py-1.5 text-sm border border-border focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => setEditingTitle(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
              >
                <X size={13} />
              </button>
              <button
                onClick={handleSaveTitle}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold"
              >
                <Check size={11} />
                Guardar
              </button>
            </>
          )}
          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-secondary text-foreground hover:bg-primary/10"
            title="Compartir"
          >
            <Share2 size={11} />
            Compartir
          </button>
          <button
            onClick={() => toast.info("Descarga del reel próximamente — Fase 2 con render server-side")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-secondary text-foreground hover:bg-primary/10"
            title="Descargar"
          >
            <Download size={11} />
            Descargar
          </button>
          <button
            onClick={handleDeleteReel}
            className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10"
            title="Eliminar reel"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-5">
        {/* Player */}
        <div className="space-y-3">
          <ReelPlayer
            clips={sortedClips}
            sourceUrl={reel.sourceVideoUrl}
            onClipChange={(i) => setCurrentClipIndex(i)}
          />
          {reel.notes && (
            <div className="glass rounded-xl p-3 border-l-4 border-primary/60 bg-primary/5 text-xs text-foreground/80 whitespace-pre-wrap">
              {reel.notes}
            </div>
          )}
        </div>

        {/* Clip list */}
        <div className="space-y-2 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1 lg:pr-2">
          <div className="flex items-center justify-between sticky top-0 bg-background py-1 z-10">
            <h2 className="text-sm font-display font-bold text-foreground">
              Clips ({sortedClips.length})
            </h2>
            <button
              onClick={handleAddClip}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/15 text-primary text-[11px] font-semibold hover:bg-primary/25"
            >
              <Plus size={11} />
              Añadir
            </button>
          </div>

          <AnimatePresence initial={false}>
            {sortedClips.map((clip, idx) => {
              const meta = MOMENT_META[clip.moment];
              const isCurrent = idx === currentClipIndex;
              const isEditing = editingClipId === clip.id;
              return (
                <motion.div
                  key={clip.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}
                  className={`glass rounded-xl p-2.5 border transition-all ${
                    isCurrent ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  style={isCurrent ? { borderColor: meta.color } : undefined}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {ALL_MOMENTS.map((m) => {
                          const mMeta = MOMENT_META[m];
                          const active = clipDraft.moment === m;
                          return (
                            <button
                              key={m}
                              onClick={() => setClipDraft({ ...clipDraft, moment: m })}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold transition-all ${
                                active ? "" : "border-border bg-secondary/40 text-muted-foreground"
                              }`}
                              style={
                                active
                                  ? {
                                      background: `${mMeta.color}25`,
                                      borderColor: mMeta.color,
                                      color: mMeta.color,
                                    }
                                  : undefined
                              }
                            >
                              <span>{mMeta.emoji}</span>
                              {mMeta.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        value={clipDraft.description ?? ""}
                        onChange={(e) =>
                          setClipDraft({ ...clipDraft, description: e.target.value })
                        }
                        placeholder="Descripción del clip"
                        className="w-full bg-secondary/40 rounded-md px-2 py-1 text-xs border border-border focus:border-primary focus:outline-none"
                      />
                      <input
                        type="text"
                        value={clipDraft.playerName ?? ""}
                        onChange={(e) =>
                          setClipDraft({ ...clipDraft, playerName: e.target.value })
                        }
                        placeholder="Jugador (opcional)"
                        className="w-full bg-secondary/40 rounded-md px-2 py-1 text-xs border border-border focus:border-primary focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-1">
                        <label className="text-[9px] text-muted-foreground">
                          Inicio (segundos)
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={((clipDraft.startMs ?? 0) / 1000).toFixed(1)}
                            onChange={(e) =>
                              setClipDraft({
                                ...clipDraft,
                                startMs: Math.max(0, parseFloat(e.target.value) * 1000),
                              })
                            }
                            className="w-full bg-secondary/40 rounded-md px-2 py-0.5 text-xs border border-border focus:border-primary focus:outline-none mt-0.5"
                          />
                        </label>
                        <label className="text-[9px] text-muted-foreground">
                          Fin (segundos)
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={((clipDraft.endMs ?? 0) / 1000).toFixed(1)}
                            onChange={(e) =>
                              setClipDraft({
                                ...clipDraft,
                                endMs: Math.max(0, parseFloat(e.target.value) * 1000),
                              })
                            }
                            className="w-full bg-secondary/40 rounded-md px-2 py-0.5 text-xs border border-border focus:border-primary focus:outline-none mt-0.5"
                          />
                        </label>
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setEditingClipId(null)}
                          className="px-2 py-0.5 rounded-md text-[10px] text-muted-foreground hover:bg-secondary"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveClip}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold"
                        >
                          <Save size={10} />
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="group/clip">
                      <div className="flex items-start gap-2">
                        <div
                          className="w-9 h-9 rounded-md flex items-center justify-center text-base shrink-0"
                          style={{
                            background: `${meta.color}25`,
                            border: `1px solid ${meta.color}55`,
                          }}
                        >
                          {meta.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: `${meta.color}20`,
                                color: meta.color,
                              }}
                            >
                              {meta.label}
                            </span>
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {formatTimestamp(clip.startMs)} → {formatTimestamp(clip.endMs)}
                            </span>
                            {clip.manual && (
                              <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                                manual
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-foreground mt-1 leading-relaxed">
                            {clip.description}
                          </p>
                          {clip.playerName && (
                            <p className="text-[10px] text-primary mt-0.5">
                              👤 {clip.playerName}
                            </p>
                          )}
                          <p className="text-[9px] text-muted-foreground mt-1">
                            Confianza IA: {Math.round(clip.confidence * 100)}%
                          </p>
                        </div>
                        <div className="opacity-0 group-hover/clip:opacity-100 flex flex-col gap-0.5 transition-opacity">
                          <button
                            onClick={() => startEditClip(clip)}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                            title="Editar"
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            onClick={() => handleDeleteClip(clip.id)}
                            className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                            title="Eliminar clip"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {sortedClips.length === 0 && (
            <div className="glass rounded-xl p-4 text-center border border-dashed border-border">
              <p className="text-[11px] text-muted-foreground">
                Sin clips. Pulsa "Añadir" para crear uno manualmente.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
