/**
 * VITAS · Set Piece Intelligence Page
 * /set-pieces
 *
 * Dashboard de análisis de jugadas a balón parado.
 * 3 tabs: Eventos · Estadísticas · Recomendaciones
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Crosshair, BarChart3, Lightbulb, Filter } from "lucide-react";
import {
  getAllSetPieces,
  getAggregateStats,
  getRecommendations,
} from "@/services/real/setPieceService";
import PitchView from "@/components/setPiece/PitchView";
import SetPieceCard from "@/components/setPiece/SetPieceCard";
import SetPieceStats from "@/components/setPiece/SetPieceStats";
import RecommendationCard from "@/components/setPiece/RecommendationCard";
import type { SetPieceEvent } from "@/lib/setPiece/types";

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

  const allEvents = useMemo(() => getAllSetPieces(), []);
  const filteredEvents = useMemo(() => {
    if (filter === "offensive") return allEvents.filter((e) => e.isOffensive);
    if (filter === "defensive") return allEvents.filter((e) => !e.isOffensive);
    return allEvents;
  }, [allEvents, filter]);

  const stats = useMemo(() => getAggregateStats(allEvents), [allEvents]);
  const recommendations = useMemo(() => getRecommendations(), []);

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
              {/* Filter pills */}
              <div className="flex items-center gap-2">
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
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                  {filteredEvents.length} jugadas
                </span>
              </div>

              {/* Two-column: list + detail */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.2fr] gap-4">
                {/* List */}
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1 lg:pr-2">
                  {filteredEvents.map((event) => (
                    <SetPieceCard
                      key={event.id}
                      event={event}
                      onClick={() => setSelectedEvent(event)}
                      active={activeEvent?.id === event.id}
                    />
                  ))}
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
              <div className="glass rounded-xl p-4 border-l-4 border-primary/60 bg-primary/5">
                <p className="text-xs text-foreground/80 leading-relaxed">
                  <strong className="text-primary">Recomendaciones generadas por IA</strong> basadas en el análisis
                  de jugadas detectadas en tus videos y patrones defensivos de los rivales. Despliega cada una para ver el diagrama y los puntos clave.
                </p>
              </div>
              {recommendations.map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
