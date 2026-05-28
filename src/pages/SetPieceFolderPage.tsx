/**
 * VITAS · Set Piece Folder Page
 * /set-pieces/folder/:id
 *
 * Dedicated view for a single folder:
 * - Header with folder icon, name, color, item counts
 * - Inline rename, change icon/color, delete folder
 * - Grid of events + recommendations in the folder
 * - Remove items individually or move to another folder
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Folder as FolderIcon,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
  Crosshair,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  SetPieceFolderStorage,
  type Folder,
  FOLDER_COLORS,
  FOLDER_ICONS,
} from "@/services/real/setPieceFolderStorage";
import { SetPieceCustomStorage } from "@/services/real/setPieceCustomStorage";
import {
  getAllSetPieces,
  getRecommendations,
  SET_PIECE_TYPE_LABELS,
  PATTERN_LABELS,
  OUTCOME_LABELS,
} from "@/services/real/setPieceService";
import { SetPieceVideoEvents, SetPieceVideoRecommendations } from "@/services/real/setPieceVideoDetector";
import type { SetPieceEvent, SetPieceRecommendation } from "@/lib/setPiece/types";

export default function SetPieceFolderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [folder, setFolder] = useState<Folder | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState(FOLDER_ICONS[0]);
  const [draftColor, setDraftColor] = useState(FOLDER_COLORS[0]);
  const [version, setVersion] = useState(0);

  // Load folder on mount
  useEffect(() => {
    if (!id) return;
    const f = SetPieceFolderStorage.get(id);
    if (!f) {
      toast.error("Carpeta no encontrada");
      navigate("/set-pieces");
      return;
    }
    setFolder(f);
    setDraftName(f.name);
    setDraftIcon(f.icon);
    setDraftColor(f.color);
  }, [id, navigate, version]);

  // Combined catalog (all known events + recommendations)
  const allEvents = useMemo<SetPieceEvent[]>(() => {
    return [
      ...SetPieceCustomStorage.getCustomEvents(),
      ...getAllSetPieces(),
    ];
  }, []);
  const allRecs = useMemo<SetPieceRecommendation[]>(() => {
    return [
      ...SetPieceCustomStorage.getCustomRecommendations(),
      ...SetPieceVideoRecommendations.getAll(),
      ...getRecommendations(),
    ];
  }, []);

  // Items in this folder
  const folderEvents = useMemo(() => {
    if (!id) return [];
    void version;
    const items = SetPieceFolderStorage.getItems(id).filter((it) => it.itemType === "event");
    const order = new Map(items.map((it, idx) => [it.itemId, idx]));
    return allEvents
      .filter((e) => order.has(e.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [id, allEvents, version]);

  const folderRecs = useMemo(() => {
    if (!id) return [];
    void version;
    const items = SetPieceFolderStorage.getItems(id).filter(
      (it) => it.itemType === "recommendation",
    );
    const order = new Map(items.map((it, idx) => [it.itemId, idx]));
    return allRecs
      .filter((r) => order.has(r.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [id, allRecs, version]);

  if (!folder) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando carpeta…
      </div>
    );
  }

  const handleSaveMeta = () => {
    if (!draftName.trim()) {
      toast.error("La carpeta necesita un nombre");
      return;
    }
    SetPieceFolderStorage.update(folder.id, {
      name: draftName.trim(),
      icon: draftIcon,
      color: draftColor,
    });
    setEditingMeta(false);
    setVersion((v) => v + 1);
    toast.success("Carpeta actualizada");
  };

  const handleCancelMeta = () => {
    setEditingMeta(false);
    setDraftName(folder.name);
    setDraftIcon(folder.icon);
    setDraftColor(folder.color);
  };

  const handleDeleteFolder = () => {
    if (
      !window.confirm(
        `¿Eliminar la carpeta "${folder.name}"? Los eventos y recomendaciones NO se borran, solo se quitan de esta carpeta.`,
      )
    )
      return;
    SetPieceFolderStorage.delete(folder.id);
    toast.success(`Carpeta "${folder.name}" eliminada`);
    navigate("/set-pieces");
  };

  const handleRemoveItem = (itemId: string, itemType: "event" | "recommendation") => {
    SetPieceFolderStorage.removeItem(folder.id, itemId, itemType);
    setVersion((v) => v + 1);
    toast.success("Eliminado de la carpeta");
  };

  const isVideoEvent = (id: string) => SetPieceVideoEvents.isVideoEvent(id);
  const isCustomEvent = (id: string) =>
    SetPieceCustomStorage.getCustomEvents().some((c) => c.id === id);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/set-pieces")}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft size={16} />
            </button>

            {!editingMeta ? (
              <>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{
                    background: `${folder.color}25`,
                    border: `2px solid ${folder.color}66`,
                  }}
                >
                  {folder.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-display font-bold text-base text-foreground truncate">
                    {folder.name}
                  </h1>
                  <p className="text-[11px] text-muted-foreground">
                    {folderEvents.length} {folderEvents.length === 1 ? "evento" : "eventos"} ·{" "}
                    {folderRecs.length} {folderRecs.length === 1 ? "recomendación" : "recomendaciones"}
                  </p>
                </div>
                <button
                  onClick={() => setEditingMeta(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-display font-semibold bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Renombrar / cambiar icono"
                >
                  <Pencil size={11} />
                  Editar
                </button>
                <button
                  onClick={handleDeleteFolder}
                  className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10 transition-colors"
                  title="Eliminar carpeta"
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{
                    background: `${draftColor}25`,
                    border: `2px solid ${draftColor}66`,
                  }}
                >
                  {draftIcon}
                </div>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveMeta();
                    if (e.key === "Escape") handleCancelMeta();
                  }}
                  autoFocus
                  className="flex-1 bg-secondary/40 rounded-md px-3 py-1.5 text-sm border border-border focus:border-primary focus:outline-none"
                />
                <button
                  onClick={handleCancelMeta}
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={handleSaveMeta}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold"
                >
                  <Check size={11} />
                  Guardar
                </button>
              </>
            )}
          </div>

          {/* Icon + color picker when editing meta */}
          {editingMeta && (
            <div className="mt-2 space-y-1.5 px-12">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mr-1">
                  Icono:
                </span>
                {FOLDER_ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setDraftIcon(ic)}
                    className={`w-6 h-6 rounded-md text-[12px] flex items-center justify-center border transition-all ${
                      draftIcon === ic
                        ? "border-primary bg-primary/15 scale-105"
                        : "border-border bg-secondary/40"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mr-1">
                  Color:
                </span>
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraftColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      draftColor === c ? "border-foreground scale-110" : "border-border"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">
        {/* Notes section */}
        {folder.notes && (
          <div className="glass rounded-xl p-4 border-l-4 border-primary/60 bg-primary/5">
            <p className="text-xs text-foreground/80 whitespace-pre-wrap">{folder.notes}</p>
          </div>
        )}

        {/* Events section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
              <Crosshair size={14} className="text-amber-500" />
              Eventos ({folderEvents.length})
            </h2>
            <button
              onClick={() => navigate("/set-pieces")}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus size={11} />
              Añadir más desde la lista
            </button>
          </div>

          {folderEvents.length === 0 ? (
            <EmptyState
              message="Aún no has guardado eventos en esta carpeta"
              ctaLabel="Ir a la lista de eventos"
              onCta={() => navigate("/set-pieces")}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AnimatePresence>
                {folderEvents.map((event) => (
                  <FolderEventCard
                    key={event.id}
                    event={event}
                    isCustom={isCustomEvent(event.id)}
                    isVideo={isVideoEvent(event.id)}
                    onOpen={() => navigate(`/set-pieces?event=${event.id}`)}
                    onRemove={() => handleRemoveItem(event.id, "event")}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* Recommendations section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
              <Lightbulb size={14} className="text-purple-500" />
              Recomendaciones ({folderRecs.length})
            </h2>
            <button
              onClick={() => navigate("/set-pieces")}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus size={11} />
              Añadir más desde la lista
            </button>
          </div>

          {folderRecs.length === 0 ? (
            <EmptyState
              message="Aún no has guardado recomendaciones en esta carpeta"
              ctaLabel="Ir a la lista de recomendaciones"
              onCta={() => navigate("/set-pieces")}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AnimatePresence>
                {folderRecs.map((rec) => (
                  <FolderRecCard
                    key={rec.id}
                    rec={rec}
                    onOpen={() => navigate(`/set-pieces`)}
                    onRemove={() => handleRemoveItem(rec.id, "recommendation")}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FolderEventCard({
  event,
  isCustom,
  isVideo,
  onOpen,
  onRemove,
}: {
  event: SetPieceEvent;
  isCustom: boolean;
  isVideo: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const outcome = OUTCOME_LABELS[event.outcome];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass rounded-xl p-3 border border-border hover:border-primary/40 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full ${
              event.isOffensive
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-red-500/15 text-red-600"
            }`}
          >
            {event.isOffensive ? "OFENSIVA" : "DEFENSIVA"}
          </span>
          {isVideo && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600 text-[8px] uppercase tracking-wider font-bold border border-purple-500/30">
              🎥 video
            </span>
          )}
          {!isVideo && isCustom && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[8px] uppercase tracking-wider font-bold">
              ✨ custom
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
          title="Quitar de la carpeta"
        >
          <X size={12} />
        </button>
      </div>
      <h4 className="text-sm font-display font-bold text-foreground">
        {SET_PIECE_TYPE_LABELS[event.type]}
        <span className="text-muted-foreground/70 font-normal ml-1.5 text-[11px]">
          · {PATTERN_LABELS[event.pattern]}
        </span>
      </h4>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        Min {event.minute}' · {event.matchLabel}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-border">
        <span className={`text-[10px] font-bold ${outcome.color}`}>{outcome.label}</span>
        <button
          onClick={onOpen}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          Ver detalle <ExternalLink size={9} />
        </button>
      </div>
    </motion.div>
  );
}

function FolderRecCard({
  rec,
  onOpen,
  onRemove,
}: {
  rec: SetPieceRecommendation;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass rounded-xl p-3 border border-border hover:border-primary/40 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600">
            {SET_PIECE_TYPE_LABELS[rec.type]}
          </span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              rec.successProbability >= 35
                ? "bg-emerald-500/15 text-emerald-600"
                : rec.successProbability >= 20
                ? "bg-amber-500/15 text-amber-600"
                : "bg-red-500/15 text-red-500"
            }`}
          >
            {rec.successProbability}% éxito
          </span>
        </div>
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
          title="Quitar de la carpeta"
        >
          <X size={12} />
        </button>
      </div>
      <h4 className="text-sm font-display font-bold text-foreground">{rec.title}</h4>
      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
        {rec.description}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-border">
        <span className="text-[9px] text-muted-foreground">{rec.basedOn}</span>
        <button
          onClick={onOpen}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          Ver detalle <ExternalLink size={9} />
        </button>
      </div>
    </motion.div>
  );
}

function EmptyState({
  message,
  ctaLabel,
  onCta,
}: {
  message: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div className="glass rounded-xl p-6 text-center border border-dashed border-border">
      <FolderIcon size={28} className="mx-auto text-muted-foreground/50 mb-2" />
      <p className="text-[11px] text-muted-foreground">{message}</p>
      <button
        onClick={onCta}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-display font-semibold hover:bg-primary/20 transition-colors"
      >
        <Plus size={11} />
        {ctaLabel}
      </button>
    </div>
  );
}
