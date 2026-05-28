/**
 * VITAS · Set Piece Intelligence Page
 * /set-pieces
 *
 * Dashboard de análisis de jugadas a balón parado.
 * 3 tabs: Eventos · Estadísticas · Recomendaciones
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Crosshair, BarChart3, Lightbulb, Filter, Plus, Pencil, Sparkles } from "lucide-react";
import {
  getAllSetPieces,
  getAggregateStats,
  getRecommendations,
} from "@/services/real/setPieceService";
import { SetPieceCustomStorage } from "@/services/real/setPieceCustomStorage";
// PitchView is rendered inside the SetPieceCard detail panel below
import PitchView from "@/components/setPiece/PitchView";
import SetPieceCard from "@/components/setPiece/SetPieceCard";
import SetPieceStats from "@/components/setPiece/SetPieceStats";
import RecommendationCard from "@/components/setPiece/RecommendationCard";
import type { SetPieceEvent, SetPieceRecommendation } from "@/lib/setPiece/types";

type Tab = "events" | "stats" | "recommendations";
type SideFilter = "all" | "offensive" | "defensive";

const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
  { key: "events", label: "Eventos", icon: Crosshair },
  { key: "stats", label: "Estadísticas", icon: BarChart3 },
  { key: "recommendations", label: "Recomendaciones", icon: Lightbulb },
];

export default function SetPiecePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("events");
  const [filter, setFilter] = useState<SideFilter>("all");
  const [selectedEvent, setSelectedEvent] = useState<SetPieceEvent | null>(null);

  // Custom items state (reloaded when page mounts and on navigation)
  const [customEvents, setCustomEvents] = useState(() => SetPieceCustomStorage.getCustomEvents());
  const [customRecs, setCustomRecs] = useState(() => SetPieceCustomStorage.getCustomRecommendations());

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
    if (filter === "offensive") return allEvents.filter((e) => e.isOffensive);
    if (filter === "defensive") return allEvents.filter((e) => !e.isOffensive);
    return allEvents;
  }, [allEvents, filter]);

  const stats = useMemo(() => getAggregateStats(allEvents), [allEvents]);
  const recommendations = useMemo<SetPieceRecommendation[]>(
    () => [...customRecs, ...getRecommendations()],
    [customRecs],
  );

  const isCustomEvent = (e: SetPieceEvent) =>
    customEvents.some((c) => c.id === e.id);
  const isCustomRec = (r: SetPieceRecommendation) =>
    customRecs.some((c) => c.id === r.id);

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
                Análisis táctico de balón parado · {allEvents.length} jugadas detectadas
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-amber-500/20 text-primary font-bold border border-primary/30">
              ✨ Nuevo
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-all whitespace-nowrap ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon size={12} />
                  {t.label}
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
                  { key: "all" as const, label: "Todas" },
                  { key: "offensive" as const, label: "Ofensivas" },
                  { key: "defensive" as const, label: "Defensivas" },
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
                  {filteredEvents.length} jugadas
                </span>
                <button
                  onClick={() => navigate("/set-pieces/new")}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-all"
                >
                  <Plus size={14} />
                  Nueva jugada
                </button>
              </div>

              {/* Two-column: list + detail */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.2fr] gap-4">
                {/* List */}
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1 lg:pr-2">
                  {filteredEvents.map((event) => {
                    const isCustom = isCustomEvent(event);
                    return (
                      <div key={event.id} className="relative group">
                        <SetPieceCard
                          event={event}
                          onClick={() => setSelectedEvent(event)}
                          active={activeEvent?.id === event.id}
                        />
                        {isCustom && (
                          <>
                            <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[8px] uppercase tracking-wider font-bold">
                              <Sparkles size={8} /> Custom
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/set-pieces/edit/${event.id}`);
                              }}
                              className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                              title="Editar"
                            >
                              <Pencil size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Detail */}
                {activeEvent && (
                  <div className="space-y-3 lg:sticky lg:top-32 self-start">
                    <div className="glass rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-display font-bold text-foreground">
                          Detalle táctico
                        </h3>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {activeEvent.matchLabel}
                        </span>
                      </div>
                      <PitchView
                        players={activeEvent.players}
                        origin={activeEvent.origin}
                        endPoint={activeEvent.endPoint}
                        height={320}
                      />
                      {activeEvent.tacticalNotes.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-border">
                          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                            Notas del análisis IA
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
              <div className="flex items-center justify-between gap-3">
                <div className="glass rounded-xl p-4 border-l-4 border-primary/60 bg-primary/5 flex-1">
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    <strong className="text-primary">Recomendaciones generadas por IA</strong> basadas en el análisis
                    de jugadas detectadas en tus videos y patrones defensivos de los rivales. Despliega cada una para ver el diagrama y los puntos clave.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/set-pieces/new?type=recommendation")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-all shrink-0"
                >
                  <Plus size={14} />
                  Nueva
                </button>
              </div>
              {recommendations.map((rec) => {
                const isCustom = isCustomRec(rec);
                return (
                  <div key={rec.id} className="relative group">
                    <RecommendationCard rec={rec} />
                    {isCustom && (
                      <>
                        <span className="absolute top-3 right-12 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[8px] uppercase tracking-wider font-bold">
                          <Sparkles size={8} /> Custom
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/set-pieces/edit/${rec.id}?type=recommendation`);
                          }}
                          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                          title="Editar"
                        >
                          <Pencil size={11} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
