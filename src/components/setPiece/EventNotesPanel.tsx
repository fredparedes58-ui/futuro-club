/**
 * VITAS · EventNotesPanel — Blog-style notes attached to an event
 *
 * Allows the user to:
 * - Add notes with optional tag (idea/observation/todo/warning/highlight)
 * - Edit existing notes inline
 * - Delete notes
 * - See timestamps and relative times
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  StickyNote,
  Plus,
  Trash2,
  Pencil,
  Lightbulb,
  Eye,
  CheckSquare,
  AlertTriangle,
  Star,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  EventNotesStorage,
  type EventNote,
} from "@/services/real/eventNotesStorage";

interface Props {
  eventId: string;
  eventLabel?: string;
  /** Called whenever notes are added/edited/deleted — used by parent to refresh badges */
  onChange?: () => void;
}

type TagKey = NonNullable<EventNote["tag"]>;

const TAG_META: Record<
  TagKey,
  { labelKey: string; icon: React.ElementType; color: string; bg: string }
> = {
  idea: {
    labelKey: "eventNotesPanel.tagIdea",
    icon: Lightbulb,
    color: "text-amber-500",
    bg: "bg-amber-500/15 border-amber-500/30",
  },
  observation: {
    labelKey: "eventNotesPanel.tagObservation",
    icon: Eye,
    color: "text-blue-500",
    bg: "bg-blue-500/15 border-blue-500/30",
  },
  todo: {
    labelKey: "eventNotesPanel.tagTodo",
    icon: CheckSquare,
    color: "text-purple-500",
    bg: "bg-purple-500/15 border-purple-500/30",
  },
  warning: {
    labelKey: "eventNotesPanel.tagWarning",
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-500/15 border-red-500/30",
  },
  highlight: {
    labelKey: "eventNotesPanel.tagHighlight",
    icon: Star,
    color: "text-emerald-500",
    bg: "bg-emerald-500/15 border-emerald-500/30",
  },
};

const ALL_TAGS: TagKey[] = ["idea", "observation", "todo", "warning", "highlight"];

function formatRelative(
  iso: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return t("eventNotesPanel.relativeNow");
  if (diff < hour)
    return t("eventNotesPanel.relativeMinutes", {
      count: Math.floor(diff / minute),
    });
  if (diff < day)
    return t("eventNotesPanel.relativeHours", {
      count: Math.floor(diff / hour),
    });
  if (diff < 7 * day)
    return t("eventNotesPanel.relativeDays", {
      count: Math.floor(diff / day),
    });
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function EventNotesPanel({ eventId, eventLabel, onChange }: Props) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<EventNote[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContent, setComposerContent] = useState("");
  const [composerTag, setComposerTag] = useState<TagKey | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingTag, setEditingTag] = useState<TagKey | undefined>(undefined);
  const [filter, setFilter] = useState<TagKey | "all">("all");

  // Reload notes when eventId changes (no onChange — parent already knows about the event switch)
  useEffect(() => {
    setNotes(EventNotesStorage.getByEvent(eventId));
    setComposerOpen(false);
    setEditingId(null);
  }, [eventId]);

  const filteredNotes = useMemo(() => {
    if (filter === "all") return notes;
    return notes.filter((n) => n.tag === filter);
  }, [notes, filter]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { all: notes.length };
    for (const t of ALL_TAGS) counts[t] = 0;
    for (const n of notes) {
      if (n.tag) counts[n.tag] = (counts[n.tag] || 0) + 1;
    }
    return counts;
  }, [notes]);

  const handleSaveNew = () => {
    const trimmed = composerContent.trim();
    if (!trimmed) {
      toast.error(t("eventNotesPanel.errorEmptyNote"));
      return;
    }
    EventNotesStorage.add(eventId, trimmed, composerTag);
    setNotes(EventNotesStorage.getByEvent(eventId));
    onChange?.();
    setComposerContent("");
    setComposerTag(undefined);
    setComposerOpen(false);
    toast.success(t("eventNotesPanel.toastNoteSaved"));
  };

  const startEdit = (note: EventNote) => {
    setEditingId(note.id);
    setEditingContent(note.content);
    setEditingTag(note.tag);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const trimmed = editingContent.trim();
    if (!trimmed) {
      toast.error(t("eventNotesPanel.errorEmptyNote"));
      return;
    }
    EventNotesStorage.update(editingId, { content: trimmed, tag: editingTag });
    setNotes(EventNotesStorage.getByEvent(eventId));
    onChange?.();
    setEditingId(null);
    toast.success(t("eventNotesPanel.toastNoteUpdated"));
  };

  const handleDelete = (noteId: string) => {
    if (!window.confirm(t("eventNotesPanel.confirmDelete"))) return;
    EventNotesStorage.delete(noteId);
    setNotes(EventNotesStorage.getByEvent(eventId));
    onChange?.();
    toast.success(t("eventNotesPanel.toastNoteDeleted"));
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <StickyNote size={14} className="text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-display font-bold text-foreground">
              {t("eventNotesPanel.title")}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {notes.length === 0
                ? t("eventNotesPanel.noNotesYet")
                : `${t("eventNotesPanel.notesCount", { count: notes.length })} · ${eventLabel ?? ""}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setComposerOpen(!composerOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-display font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus size={12} />
          {composerOpen ? t("eventNotesPanel.close") : t("eventNotesPanel.newNote")}
        </button>
      </div>

      {/* Composer */}
      <AnimatePresence>
        {composerOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-xl p-3 space-y-2 border border-primary/30 bg-primary/5">
              <textarea
                autoFocus
                value={composerContent}
                onChange={(e) => setComposerContent(e.target.value)}
                placeholder={t("eventNotesPanel.composerPlaceholder")}
                rows={3}
                className="w-full bg-background/60 rounded-md px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleSaveNew();
                  }
                }}
              />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-muted-foreground mr-1">
                    {t("eventNotesPanel.typeLabel")}
                  </span>
                  {ALL_TAGS.map((tk) => {
                    const meta = TAG_META[tk];
                    const Icon = meta.icon;
                    const active = composerTag === tk;
                    return (
                      <button
                        key={tk}
                        onClick={() => setComposerTag(active ? undefined : tk)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${
                          active
                            ? `${meta.bg} ${meta.color}`
                            : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon size={9} />
                        {t(meta.labelKey)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setComposerOpen(false);
                      setComposerContent("");
                      setComposerTag(undefined);
                    }}
                    className="px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    {t("eventNotesPanel.cancel")}
                  </button>
                  <button
                    onClick={handleSaveNew}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Save size={11} />
                    {t("eventNotesPanel.save")}
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground/70">
                {t("eventNotesPanel.tipPrefix")} <kbd className="px-1 py-0.5 rounded bg-secondary text-foreground">⌘/Ctrl + Enter</kbd> {t("eventNotesPanel.tipSuffix")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter pills */}
      {notes.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all ${
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("eventNotesPanel.filterAll")} ({tagCounts.all})
          </button>
          {ALL_TAGS.filter((tk) => tagCounts[tk] > 0).map((tk) => {
            const meta = TAG_META[tk];
            const Icon = meta.icon;
            const active = filter === tk;
            return (
              <button
                key={tk}
                onClick={() => setFilter(tk)}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all border ${
                  active
                    ? `${meta.bg} ${meta.color}`
                    : "bg-secondary/50 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={9} />
                {t(meta.labelKey)} ({tagCounts[tk]})
              </button>
            );
          })}
        </div>
      )}

      {/* Notes list */}
      <div className="space-y-2">
        {filteredNotes.length === 0 && notes.length === 0 && (
          <div className="glass rounded-xl p-6 text-center border border-dashed border-border">
            <StickyNote
              size={24}
              className="mx-auto text-muted-foreground/60 mb-2"
            />
            <p className="text-xs font-display font-semibold text-foreground">
              {t("eventNotesPanel.emptyTitle")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {t("eventNotesPanel.emptyDescription")}
            </p>
            <button
              onClick={() => setComposerOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-display font-semibold hover:bg-primary/20 transition-colors"
            >
              <Plus size={11} />
              {t("eventNotesPanel.writeFirstNote")}
            </button>
          </div>
        )}

        {filteredNotes.length === 0 && notes.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-3">
            {t("eventNotesPanel.noNotesForFilter")}
          </p>
        )}

        <AnimatePresence initial={false}>
          {filteredNotes.map((note) => {
            const meta = note.tag ? TAG_META[note.tag] : null;
            const Icon = meta?.icon;
            const isEditing = editingId === note.id;

            return (
              <motion.div
                key={note.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
                className={`glass rounded-xl p-3 border ${
                  meta ? meta.bg.replace("/15", "/5") : "border-border"
                } group`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full bg-background/60 rounded-md px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none resize-none"
                    />
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {ALL_TAGS.map((tk) => {
                          const m = TAG_META[tk];
                          const TIcon = m.icon;
                          const active = editingTag === tk;
                          return (
                            <button
                              key={tk}
                              onClick={() =>
                                setEditingTag(active ? undefined : tk)
                              }
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${
                                active
                                  ? `${m.bg} ${m.color}`
                                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <TIcon size={9} />
                              {t(m.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
                        >
                          <X size={12} />
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90"
                        >
                          <Save size={10} />
                          {t("eventNotesPanel.save")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {meta && Icon && (
                          <span
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} text-[9px] font-bold uppercase tracking-wider`}
                          >
                            <Icon size={8} />
                            {t(meta.labelKey)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelative(note.createdAt, t)}
                          {note.updatedAt !== note.createdAt &&
                            ` · ${t("eventNotesPanel.edited")}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(note)}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                          title={t("eventNotesPanel.edit")}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          title={t("eventNotesPanel.delete")}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[12px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
