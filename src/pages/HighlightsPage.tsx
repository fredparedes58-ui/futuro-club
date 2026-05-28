/**
 * VITAS · Highlights Page
 * /highlights
 *
 * Grid of saved reels + button to generate new ones.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Film,
  Plus,
  Wand2,
  Play,
  Trash2,
  Clock,
  Video as VideoIcon,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { HighlightsStorage } from "@/services/real/highlightsStorage";
import GenerateReelDialog from "@/components/highlights/GenerateReelDialog";
import type { HighlightReel } from "@/lib/highlights/types";
import { MOMENT_META } from "@/lib/highlights/types";

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function HighlightsPage() {
  const navigate = useNavigate();
  const [reels, setReels] = useState<HighlightReel[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  const reload = () => setReels(HighlightsStorage.getAll());

  useEffect(() => {
    reload();
    const handleFocus = () => reload();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`¿Eliminar el reel "${title}"?`)) return;
    HighlightsStorage.delete(id);
    reload();
    toast.success("Reel eliminado");
  };

  const filtered = reels.filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.sourceVideoTitle.toLowerCase().includes(q) ||
      r.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
              <Film size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-base text-foreground">
                Highlights
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Reels automáticos · {reels.length} {reels.length === 1 ? "guardado" : "guardados"}
              </p>
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-primary text-white text-xs font-display font-semibold hover:opacity-90 transition-all shadow-md"
            >
              <Wand2 size={14} />
              Generar reel
            </button>
          </div>

          {reels.length > 0 && (
            <div className="relative">
              <Search
                size={12}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, video o jugador…"
                className="w-full pl-8 pr-3 py-1.5 bg-secondary/40 rounded-lg text-xs border border-border focus:border-primary focus:outline-none"
              />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {reels.length === 0 ? (
          <EmptyState onCreate={() => setDialogOpen(true)} />
        ) : filtered.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ningún reel coincide con "{query}"
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filtered.map((reel) => (
                <ReelCard
                  key={reel.id}
                  reel={reel}
                  onOpen={() => navigate(`/highlights/${reel.id}`)}
                  onDelete={() => handleDelete(reel.id, reel.title)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Generator */}
      <GenerateReelDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(reel) => {
          setDialogOpen(false);
          reload();
          // Navigate after a brief delay so the toast is visible
          setTimeout(() => navigate(`/highlights/${reel.id}`), 350);
        }}
      />
    </div>
  );
}

function ReelCard({
  reel,
  onOpen,
  onDelete,
}: {
  reel: HighlightReel;
  onOpen: () => void;
  onDelete: () => void;
}) {
  // Build a stack of moment chips from clips
  const momentCounts = reel.clips.reduce<Record<string, number>>((acc, c) => {
    acc[c.moment] = (acc[c.moment] || 0) + 1;
    return acc;
  }, {});
  const topMoments = Object.entries(momentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className="glass rounded-2xl overflow-hidden border border-border hover:border-primary/40 transition-all group cursor-pointer"
      onClick={onOpen}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-gradient-to-br from-emerald-700 to-green-900 flex items-center justify-center overflow-hidden">
        {reel.thumbnailUrl ? (
          <img
            src={reel.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Film size={36} className="text-emerald-300/60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-mono">
            <Clock size={9} />
            {formatDuration(reel.totalDurationMs)}
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold">
            {reel.clips.length} clips
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
        >
          <div className="w-12 h-12 rounded-full bg-white/95 flex items-center justify-center">
            <Play size={20} className="text-emerald-600 ml-1" fill="currentColor" />
          </div>
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-display font-bold text-foreground line-clamp-1">
              {reel.title}
            </h3>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <VideoIcon size={9} />
              <span className="truncate">{reel.sourceVideoTitle}</span>
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
            title="Eliminar"
          >
            <Trash2 size={11} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {topMoments.map(([m, count]) => {
            const meta = MOMENT_META[m as keyof typeof MOMENT_META];
            return (
              <span
                key={m}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                style={{
                  background: `${meta.color}20`,
                  color: meta.color,
                  border: `1px solid ${meta.color}40`,
                }}
              >
                <span>{meta.emoji}</span>
                {meta.label} {count > 1 && <span className="opacity-70">·{count}</span>}
              </span>
            );
          })}
          {reel.tags?.slice(0, 2).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-secondary text-muted-foreground"
            >
              #{t}
            </span>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground">{formatDate(reel.createdAt)}</p>
      </div>
    </motion.div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-8 text-center max-w-2xl mx-auto border border-dashed border-border space-y-4"
    >
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/20 to-primary/20 flex items-center justify-center">
        <Film size={28} className="text-emerald-500" />
      </div>
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">
          Genera tu primer reel
        </h2>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-md mx-auto">
          La IA analiza un video del partido y selecciona los mejores momentos (goles, tiros, asistencias,
          regates, paradas, scans). Tú eliges la duración y los tipos de jugada.
        </p>
      </div>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-primary text-white text-xs font-display font-semibold hover:opacity-90 transition-all"
      >
        <Plus size={14} />
        Generar reel
      </button>
    </motion.div>
  );
}
