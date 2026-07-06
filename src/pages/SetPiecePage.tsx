/**
 * VITAS · Set Piece Intelligence Page
 * /set-pieces
 *
 * Dashboard de análisis de jugadas a balón parado.
 * 3 tabs: Eventos · Estadísticas · Recomendaciones
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Crosshair, BarChart3, Lightbulb, Filter, Plus, Pencil, Sparkles, Save, X, Edit3, Cpu, Video, Wand2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  getAllSetPieces,
  getAggregateStats,
  getRecommendations,
} from "@/services/real/setPieceService";
import { SetPieceCustomStorage, type CustomSetPieceEvent } from "@/services/real/setPieceCustomStorage";
// PitchView is rendered inside the SetPieceCard detail panel below
import PitchView from "@/components/setPiece/PitchView";
import SetPieceCard from "@/components/setPiece/SetPieceCard";
import SetPieceStats from "@/components/setPiece/SetPieceStats";
import RecommendationCard from "@/components/setPiece/RecommendationCard";
import EventNotesPanel from "@/components/setPiece/EventNotesPanel";
import TacticalBoardEditor, { type Drawing, type TextNote } from "@/components/setPiece/TacticalBoardEditor";
import FolderPicker from "@/components/setPiece/FolderPicker";
import VideoAnalyzerDialog from "@/components/setPiece/VideoAnalyzerDialog";
import VideoUploadDialog from "@/components/setPiece/VideoUploadDialog";
import {
  SetPieceVideoEvents,
  SetPieceVideoRecommendations,
  generateRecommendationsFromEvents,
} from "@/services/real/setPieceVideoDetector";
import { EventNotesStorage } from "@/services/real/eventNotesStorage";
import {
  SetPieceFolderStorage,
  type Folder,
} from "@/services/real/setPieceFolderStorage";
import {
  SET_PIECE_TYPE_LABELS,
  PATTERN_LABELS,
} from "@/services/real/setPieceService";
import type {
  SetPieceEvent,
  SetPieceRecommendation,
  PlayerOnSetPiece,
  SetPieceType,
  AttackingPattern,
  SetPieceOutcome,
  SetPieceSide,
} from "@/lib/setPiece/types";

type Tab = "events" | "stats" | "recommendations";
type SideFilter = "all" | "offensive" | "defensive";

const TABS: Array<{ key: Tab; labelKey: string; icon: React.ElementType }> = [
  { key: "events", labelKey: "setPiecePage.tabEvents", icon: Crosshair },
  { key: "stats", labelKey: "setPiecePage.tabStats", icon: BarChart3 },
  { key: "recommendations", labelKey: "setPiecePage.tabRecommendations", icon: Lightbulb },
];

export default function SetPiecePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("events");
  const [filter, setFilter] = useState<SideFilter>("all");
  const [selectedEvent, setSelectedEvent] = useState<SetPieceEvent | null>(null);

  // Custom items state (reloaded when page mounts and on navigation)
  const [customEvents, setCustomEvents] = useState(() => SetPieceCustomStorage.getCustomEvents());
  const [customRecs, setCustomRecs] = useState(() => SetPieceCustomStorage.getCustomRecommendations());

  // Video-driven detection state (declared early so the memos below can read it)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [videoRecs, setVideoRecs] = useState(() => SetPieceVideoRecommendations.getAll());
  const [generatingRecs, setGeneratingRecs] = useState(false);

  // Folder state (also declared early so memos can read it)
  const [folders, setFolders] = useState<Folder[]>(() => SetPieceFolderStorage.getAll());
  const [activeFolderId, setActiveFolderId] = useState<string | "all">("all");
  const [folderVersion, setFolderVersion] = useState(0);
  const refreshFolders = () => {
    setFolders(SetPieceFolderStorage.getAll());
    setFolderVersion((v) => v + 1);
  };

  // Notes versioning (for the badge counts)
  const [notesVersion, setNotesVersion] = useState(0);

  // Refresh when window regains focus (after navigating back from editor)
  useEffect(() => {
    const handleFocus = () => {
      setCustomEvents(SetPieceCustomStorage.getCustomEvents());
      setCustomRecs(SetPieceCustomStorage.getCustomRecommendations());
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const allEvents = useMemo(() => {
    // Custom events first (most recent at top), then generated mock events
    return [...(customEvents as SetPieceEvent[]), ...getAllSetPieces()];
  }, [customEvents]);

  const filteredEvents = useMemo(() => {
    void folderVersion; // recompute when folders change
    let result = allEvents;
    if (filter === "offensive") result = result.filter((e) => e.isOffensive);
    if (filter === "defensive") result = result.filter((e) => !e.isOffensive);
    if (activeFolderId !== "all") {
      result = result.filter((e) =>
        SetPieceFolderStorage.isInFolder(activeFolderId, e.id, "event"),
      );
    }
    return result;
  }, [allEvents, filter, activeFolderId, folderVersion]);

  const stats = useMemo(() => getAggregateStats(allEvents), [allEvents]);
  const recommendations = useMemo<SetPieceRecommendation[]>(
    () => [...customRecs, ...videoRecs, ...getRecommendations()],
    [customRecs, videoRecs],
  );

  const isVideoRec = (r: SetPieceRecommendation) =>
    videoRecs.some((vr) => vr.id === r.id);

  const isCustomEvent = (e: SetPieceEvent) =>
    customEvents.some((c) => c.id === e.id);
  const isCustomRec = (r: SetPieceRecommendation) =>
    customRecs.some((c) => c.id === r.id);

  // ── Inline tactical editor state ──────────────────────────────────────
  // When `editingEvent` is set, the detail panel shows the editor instead of PitchView.
  const [editingEvent, setEditingEvent] = useState<SetPieceEvent | null>(null);
  const [editPlayers, setEditPlayers] = useState<PlayerOnSetPiece[]>([]);
  const [editDrawings, setEditDrawings] = useState<Drawing[]>([]);
  const [editTexts, setEditTexts] = useState<TextNote[]>([]);

  // Editable metadata while in edit mode
  const [editMeta, setEditMeta] = useState<{
    type: SetPieceType;
    pattern: AttackingPattern;
    matchLabel: string;
    minute: number;
    side: SetPieceSide;
    outcome: SetPieceOutcome;
    tacticalNotes: string;
  }>({
    type: "corner",
    pattern: "near_post",
    matchLabel: "",
    minute: 0,
    side: "right",
    outcome: "shot_on_target",
    tacticalNotes: "",
  });

  // ── Video-driven detection handlers ─────────────────────────────────
  const isVideoEvent = (id: string) => SetPieceVideoEvents.isVideoEvent(id);

  const handleVideoDetectionCompleted = () => {
    // Reload custom events so the detected ones appear in the list
    setCustomEvents(SetPieceCustomStorage.getCustomEvents());
  };

  const handleGenerateRecsFromEvents = async () => {
    setGeneratingRecs(true);
    try {
      const allDetected = SetPieceVideoEvents.getAll();
      if (allDetected.length < 3) {
        toast.error(t("setPiecePage.toastNeedThreeDetected"));
        return;
      }
      // Small delay so the spinner shows
      await new Promise((r) => setTimeout(r, 800));
      const recs = generateRecommendationsFromEvents(allDetected);
      SetPieceVideoRecommendations.set(recs);
      setVideoRecs(recs);
      toast.success(t("setPiecePage.toastRecsGenerated", { count: recs.length }));
    } finally {
      setGeneratingRecs(false);
    }
  };

  useEffect(() => {
    void folderVersion; // dependency to refresh memos
  }, [folderVersion]);

  const startEditing = (event: SetPieceEvent) => {
    setEditingEvent(event);
    setEditPlayers(event.players);
    // Custom events may already carry drawings/texts
    const customEvent = event as CustomSetPieceEvent;
    setEditDrawings(customEvent.drawings ?? []);
    setEditTexts(customEvent.texts ?? []);
    setEditMeta({
      type: event.type,
      pattern: event.pattern,
      matchLabel: event.matchLabel,
      minute: event.minute,
      side: event.side,
      outcome: event.outcome,
      tacticalNotes: event.tacticalNotes.join("\n"),
    });
  };

  const cancelEditing = () => {
    setEditingEvent(null);
    setEditPlayers([]);
    setEditDrawings([]);
    setEditTexts([]);
  };

  const saveEditing = () => {
    if (!editingEvent) return;
    const existingCustom = editingEvent as CustomSetPieceEvent;
    const isAlreadyCustom = customEvents.some((c) => c.id === editingEvent.id);

    const metaPatch = {
      type: editMeta.type,
      pattern: editMeta.pattern,
      matchLabel: editMeta.matchLabel.trim() || editingEvent.matchLabel,
      minute: editMeta.minute,
      side: editMeta.side,
      outcome: editMeta.outcome,
      tacticalNotes: editMeta.tacticalNotes
        .split(/\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    };

    if (isAlreadyCustom) {
      // Update existing custom event in place
      const updated: CustomSetPieceEvent = {
        ...existingCustom,
        ...metaPatch,
        players: editPlayers,
        drawings: editDrawings,
        texts: editTexts,
        isCustom: true,
        createdAt: existingCustom.createdAt ?? new Date().toISOString(),
      };
      SetPieceCustomStorage.saveCustomEvent(updated);
      toast.success(t("setPiecePage.toastEventUpdated"));
    } else {
      // Mock event → save as new custom copy keeping all metadata
      const newCustom: CustomSetPieceEvent = {
        ...editingEvent,
        ...metaPatch,
        // Generate fresh id to avoid clashing with the mock one and so the
        // mock keeps existing for everyone else; notes carry over via same id ideally
        id: `event_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        players: editPlayers,
        drawings: editDrawings,
        texts: editTexts,
        isCustom: true,
        confidence: 1.0,
        createdAt: new Date().toISOString(),
      };
      SetPieceCustomStorage.saveCustomEvent(newCustom);
      toast.success(t("setPiecePage.toastEventSavedAsCopy"));
      // Refresh custom events list and select the new one
      const refreshed = SetPieceCustomStorage.getCustomEvents();
      setCustomEvents(refreshed);
      setSelectedEvent(newCustom);
    }
    cancelEditing();
    setCustomEvents(SetPieceCustomStorage.getCustomEvents());
  };

  // Cancel editing if the user navigates to a different event
  useEffect(() => {
    if (editingEvent && selectedEvent && editingEvent.id !== selectedEvent.id) {
      cancelEditing();
    }
  }, [selectedEvent, editingEvent]);

  // Default selection
  const activeEvent =
    selectedEvent ?? filteredEvents.find((e) => e.outcome === "goal") ?? filteredEvents[0];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
              <Crosshair size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-base text-foreground">
                Set Piece Intelligence
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {t("setPiecePage.headerSubtitle", { count: allEvents.length })}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-amber-500/20 text-primary font-bold border border-primary/30">
              ✨ {t("setPiecePage.badgeNew")}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((tabItem) => {
              const Icon = tabItem.icon;
              const active = tab === tabItem.key;
              return (
                <button
                  key={tabItem.key}
                  onClick={() => setTab(tabItem.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-all whitespace-nowrap ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon size={12} />
                  {t(tabItem.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        <AnimatePresence mode="wait">
          {tab === "events" && (
            <motion.div
              key="events"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Filter pills + Create button */}
              <div className="flex items-center gap-2 flex-wrap">
                <Filter size={14} className="text-muted-foreground" />
                {[
                  { key: "all" as const, label: t("setPiecePage.filterAll") },
                  { key: "offensive" as const, label: t("setPiecePage.filterOffensive") },
                  { key: "defensive" as const, label: t("setPiecePage.filterDefensive") },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1 rounded-full text-[11px] font-display font-semibold transition-all ${
                      filter === f.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <span className="text-[11px] text-muted-foreground font-mono">
                  {t("setPiecePage.playsCount", { count: filteredEvents.length })}
                </span>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setUploadDialogOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-display font-semibold hover:opacity-90 transition-all shadow-md"
                    title={t("setPiecePage.uploadVideoTitle")}
                  >
                    <Upload size={14} />
                    {t("setPiecePage.uploadVideo")}
                  </button>
                  <button
                    onClick={() => setVideoDialogOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-primary text-white text-xs font-display font-semibold hover:opacity-90 transition-all shadow-md"
                  >
                    <Cpu size={14} />
                    {t("setPiecePage.analyzeVideo")}
                  </button>
                  <button
                    onClick={() => navigate("/set-pieces/new")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-all"
                  >
                    <Plus size={14} />
                    {t("setPiecePage.newPlay")}
                  </button>
                </div>
              </div>

              {/* Folder filter bar */}
              {folders.length > 0 && (
                <div className="glass rounded-xl p-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1 shrink-0">
                    {t("setPiecePage.foldersLabel")}
                  </span>
                  <button
                    onClick={() => setActiveFolderId("all")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-display font-semibold whitespace-nowrap transition-all ${
                      activeFolderId === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("setPiecePage.filterAll")}
                  </button>
                  {folders.map((f) => {
                    const count = SetPieceFolderStorage.countByFolder(f.id, "event");
                    return (
                      <div key={f.id} className="flex items-center group">
                        <button
                          onClick={() => setActiveFolderId(f.id)}
                          onDoubleClick={() => navigate(`/set-pieces/folder/${f.id}`)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-l-md text-[11px] font-display font-semibold whitespace-nowrap transition-all border ${
                            activeFolderId === f.id
                              ? "border-primary text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground bg-secondary"
                          }`}
                          style={
                            activeFolderId === f.id
                              ? { background: `${f.color}25`, borderColor: f.color }
                              : undefined
                          }
                          title={t("setPiecePage.doubleClickToOpenFolder")}
                        >
                          <span>{f.icon}</span>
                          <span>{f.name}</span>
                          <span className="text-muted-foreground/70 font-mono">({count})</span>
                        </button>
                        <button
                          onClick={() => navigate(`/set-pieces/folder/${f.id}`)}
                          className={`px-1.5 py-1 rounded-r-md text-[11px] border-l-0 border transition-all ${
                            activeFolderId === f.id
                              ? "border-primary text-foreground"
                              : "border-transparent text-muted-foreground hover:text-primary bg-secondary opacity-60 group-hover:opacity-100"
                          }`}
                          style={
                            activeFolderId === f.id
                              ? { background: `${f.color}25`, borderColor: f.color }
                              : undefined
                          }
                          title={t("setPiecePage.openDedicatedFolder")}
                        >
                          ↗
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Two-column: list + detail */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.2fr] gap-4">
                {/* List */}
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1 lg:pr-2">
                  {filteredEvents.map((event) => {
                    const isCustom = isCustomEvent(event);
                    // intentionally include notesVersion to refresh counter
                    void notesVersion;
                    void folderVersion;
                    const noteCount = EventNotesStorage.count(event.id);
                    return (
                      <div key={event.id} className="relative group">
                        <SetPieceCard
                          event={event}
                          onClick={() => setSelectedEvent(event)}
                          active={activeEvent?.id === event.id}
                        />
                        {noteCount > 0 && (
                          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 text-[9px] font-bold border border-amber-500/30">
                            📝 {noteCount}
                          </span>
                        )}
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {isVideoEvent(event.id) ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 text-[8px] uppercase tracking-wider font-bold border border-purple-500/30">
                              <Video size={8} /> {t("setPiecePage.badgeFromVideo")}
                            </span>
                          ) : isCustom ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[8px] uppercase tracking-wider font-bold">
                              <Sparkles size={8} /> {t("setPiecePage.badgeCustom")}
                            </span>
                          ) : null}
                          <div onClick={(e) => e.stopPropagation()}>
                            <FolderPicker
                              itemId={event.id}
                              itemType="event"
                              onChange={refreshFolders}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Detail */}
                {activeEvent && (
                  <div className="space-y-3 lg:sticky lg:top-32 self-start max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">
                    <div className="glass rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-sm font-display font-bold text-foreground">
                          {editingEvent ? t("setPiecePage.editingBoard") : t("setPiecePage.tacticalDetail")}
                        </h3>
                        <div className="flex items-center gap-2">
                          {!editingEvent && (
                            <button
                              onClick={() => startEditing(activeEvent)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-display font-semibold bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                              title={t("setPiecePage.editBoardTitle")}
                            >
                              <Edit3 size={11} />
                              {t("setPiecePage.editBoard")}
                            </button>
                          )}
                          {editingEvent && (
                            <>
                              <button
                                onClick={cancelEditing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-display font-semibold text-muted-foreground hover:bg-secondary transition-colors"
                              >
                                <X size={11} />
                                {t("setPiecePage.cancel")}
                              </button>
                              <button
                                onClick={saveEditing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-display font-semibold hover:bg-primary/90 transition-colors"
                              >
                                <Save size={11} />
                                {t("setPiecePage.save")}
                              </button>
                            </>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {activeEvent.matchLabel}
                          </span>
                        </div>
                      </div>

                      {editingEvent && editingEvent.id === activeEvent.id ? (
                        <>
                          {!isCustomEvent(editingEvent) && (
                            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                              <strong>{t("setPiecePage.editingOriginalWarningTitle")}</strong> {t("setPiecePage.editingOriginalWarningBody")}
                            </div>
                          )}

                          {/* Metadata editor */}
                          <div className="glass rounded-xl p-3 space-y-2 border border-border bg-secondary/10">
                            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                              {t("setPiecePage.eventData")}
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <MetaField label={t("setPiecePage.fieldType")}>
                                <select
                                  value={editMeta.type}
                                  onChange={(e) =>
                                    setEditMeta({ ...editMeta, type: e.target.value as SetPieceType })
                                  }
                                  className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-primary focus:outline-none"
                                >
                                  {Object.entries(SET_PIECE_TYPE_LABELS).map(([k, label]) => (
                                    <option key={k} value={k}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </MetaField>
                              <MetaField label={t("setPiecePage.fieldPattern")}>
                                <select
                                  value={editMeta.pattern}
                                  onChange={(e) =>
                                    setEditMeta({ ...editMeta, pattern: e.target.value as AttackingPattern })
                                  }
                                  className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-primary focus:outline-none"
                                >
                                  {Object.entries(PATTERN_LABELS).map(([k, label]) => (
                                    <option key={k} value={k}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </MetaField>
                              <MetaField label={t("setPiecePage.fieldMatch")}>
                                <input
                                  type="text"
                                  value={editMeta.matchLabel}
                                  onChange={(e) =>
                                    setEditMeta({ ...editMeta, matchLabel: e.target.value })
                                  }
                                  placeholder={t("setPiecePage.matchPlaceholder")}
                                  className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-primary focus:outline-none"
                                />
                              </MetaField>
                              <div className="grid grid-cols-2 gap-2">
                                <MetaField label={t("setPiecePage.fieldMinute")}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={120}
                                    value={editMeta.minute}
                                    onChange={(e) =>
                                      setEditMeta({
                                        ...editMeta,
                                        minute: parseInt(e.target.value, 10) || 0,
                                      })
                                    }
                                    className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-primary focus:outline-none"
                                  />
                                </MetaField>
                                <MetaField label={t("setPiecePage.fieldSide")}>
                                  <select
                                    value={editMeta.side}
                                    onChange={(e) =>
                                      setEditMeta({ ...editMeta, side: e.target.value as SetPieceSide })
                                    }
                                    className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-primary focus:outline-none"
                                  >
                                    <option value="left">{t("setPiecePage.sideLeft")}</option>
                                    <option value="right">{t("setPiecePage.sideRight")}</option>
                                    <option value="center">{t("setPiecePage.sideCenter")}</option>
                                  </select>
                                </MetaField>
                              </div>
                              <MetaField label={t("setPiecePage.fieldOutcome")}>
                                <select
                                  value={editMeta.outcome}
                                  onChange={(e) =>
                                    setEditMeta({ ...editMeta, outcome: e.target.value as SetPieceOutcome })
                                  }
                                  className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-primary focus:outline-none"
                                >
                                  <option value="goal">{t("setPiecePage.outcomeGoal")}</option>
                                  <option value="shot_on_target">{t("setPiecePage.outcomeShotOnTarget")}</option>
                                  <option value="shot_off_target">{t("setPiecePage.outcomeShotOffTarget")}</option>
                                  <option value="blocked">{t("setPiecePage.outcomeBlocked")}</option>
                                  <option value="cleared">{t("setPiecePage.outcomeCleared")}</option>
                                  <option value="retained">{t("setPiecePage.outcomeRetained")}</option>
                                  <option value="lost">{t("setPiecePage.outcomeLost")}</option>
                                </select>
                              </MetaField>
                              <MetaField label={t("setPiecePage.fieldTacticalNotes")}>
                                <textarea
                                  value={editMeta.tacticalNotes}
                                  onChange={(e) =>
                                    setEditMeta({ ...editMeta, tacticalNotes: e.target.value })
                                  }
                                  rows={2}
                                  placeholder={t("setPiecePage.tacticalNotesPlaceholder")}
                                  className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-primary focus:outline-none resize-none"
                                />
                              </MetaField>
                            </div>
                          </div>

                          <TacticalBoardEditor
                            players={editPlayers}
                            drawings={editDrawings}
                            texts={editTexts}
                            onPlayersChange={setEditPlayers}
                            onDrawingsChange={setEditDrawings}
                            onTextsChange={setEditTexts}
                            editable
                            height={360}
                          />
                        </>
                      ) : (
                        <>
                          {isCustomEvent(activeEvent) &&
                          ((activeEvent as CustomSetPieceEvent).drawings?.length > 0 ||
                            (activeEvent as CustomSetPieceEvent).texts?.length > 0) ? (
                            // Custom event with annotations → show read-only board with drawings & texts
                            <TacticalBoardEditor
                              players={activeEvent.players}
                              drawings={(activeEvent as CustomSetPieceEvent).drawings ?? []}
                              texts={(activeEvent as CustomSetPieceEvent).texts ?? []}
                              onPlayersChange={() => {}}
                              onDrawingsChange={() => {}}
                              onTextsChange={() => {}}
                              editable={false}
                              height={320}
                            />
                          ) : (
                            <PitchView
                              players={activeEvent.players}
                              origin={activeEvent.origin}
                              endPoint={activeEvent.endPoint}
                              height={320}
                            />
                          )}
                        </>
                      )}

                      {activeEvent.tacticalNotes.length > 0 && !editingEvent && (
                        <div className="space-y-1.5 pt-2 border-t border-border">
                          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                            {t("setPiecePage.aiAnalysisNotes")}
                          </h4>
                          {activeEvent.tacticalNotes.map((note, i) => (
                            <p
                              key={i}
                              className="text-[12px] text-foreground/90 flex items-start gap-2"
                            >
                              <span className="text-primary mt-0.5">▸</span>
                              {note}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* User notes blog */}
                    <div className="glass rounded-2xl p-4">
                      <EventNotesPanel
                        key={activeEvent.id}
                        eventId={activeEvent.id}
                        eventLabel={activeEvent.matchLabel}
                        onChange={() => setNotesVersion((v) => v + 1)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {tab === "stats" && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <SetPieceStats stats={stats} />
            </motion.div>
          )}

          {tab === "recommendations" && (
            <motion.div
              key="recommendations"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="glass rounded-xl p-4 border-l-4 border-primary/60 bg-primary/5 flex-1 min-w-[260px]">
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    <strong className="text-primary">{t("setPiecePage.recsIntroTitle")}</strong> {t("setPiecePage.recsIntroBody")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleGenerateRecsFromEvents}
                    disabled={generatingRecs}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-primary text-white text-xs font-display font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t("setPiecePage.generateRecsTitle")}
                  >
                    <Wand2 size={14} className={generatingRecs ? "animate-pulse" : ""} />
                    {generatingRecs ? t("setPiecePage.generating") : t("setPiecePage.generateAi")}
                  </button>
                  <button
                    onClick={() => navigate("/set-pieces/new?type=recommendation")}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-all"
                  >
                    <Plus size={14} />
                    {t("setPiecePage.newRec")}
                  </button>
                </div>
              </div>
              {recommendations.map((rec) => {
                const isCustom = isCustomRec(rec);
                const isVideo = isVideoRec(rec);
                void folderVersion;
                return (
                  <div key={rec.id} className="relative group">
                    <RecommendationCard rec={rec} />
                    <div className="absolute top-3 right-12 flex items-center gap-1">
                      {isVideo && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 text-[8px] uppercase tracking-wider font-bold border border-purple-500/30">
                          <Wand2 size={8} /> {t("setPiecePage.badgeAiVideo")}
                        </span>
                      )}
                      {!isVideo && isCustom && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[8px] uppercase tracking-wider font-bold">
                          <Sparkles size={8} /> {t("setPiecePage.badgeCustom")}
                        </span>
                      )}
                      <div onClick={(e) => e.stopPropagation()}>
                        <FolderPicker
                          itemId={rec.id}
                          itemType="recommendation"
                          onChange={refreshFolders}
                        />
                      </div>
                      {isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/set-pieces/edit/${rec.id}?type=recommendation`);
                          }}
                          className="p-1.5 rounded-md bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                          title={t("setPiecePage.editRec")}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Video analyzer modal */}
      <VideoAnalyzerDialog
        open={videoDialogOpen}
        onClose={() => setVideoDialogOpen(false)}
        onCompleted={handleVideoDetectionCompleted}
      />

      {/* Video upload modal */}
      <VideoUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploaded={() => {
          // Close upload and chain into the analyzer
          setUploadDialogOpen(false);
          // Slight delay so the success card stays visible briefly
          setTimeout(() => setVideoDialogOpen(true), 600);
        }}
      />
    </div>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold block">
        {label}
      </label>
      {children}
    </div>
  );
}
