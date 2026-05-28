/**
 * VITAS · CoachDashboard (Sprint 16)
 *
 * Main coaching panel with 4 tabs:
 *   1. Última Sesión — timeline + balance + heatmap + engagement
 *   2. Planificación — week planner + next session recommender
 *   3. Progresión — session-over-session trends (placeholder for charts)
 *   4. Reportes Padres — parent report view
 *
 * Pattern: identical to PlayerHubPage tabs (URL-synced, AnimatePresence).
 */
import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Calendar, TrendingUp, Users, Loader2, AlertCircle,
  BarChart3, Activity,
} from "lucide-react";

import {
  useCoachingSessions,
  useSessionAnalysis,
  useSessionRecommendation,
} from "@/hooks/useCoachingSession";

import SessionTimelineView from "./SessionTimelineView";
import SessionBalanceChart from "./SessionBalanceChart";
import ParticipationHeatmap from "./ParticipationHeatmap";
import EngagementMiniCard from "./EngagementMiniCard";
import WeekPlannerView from "./WeekPlannerView";
import NextSessionRecommender from "./NextSessionRecommender";
import ParentReportView from "./ParentReportView";

import type {
  TrainingSegment, SessionBalance, PlayerDrillMetrics,
  SessionRecommendation, ParentReport, EngagementSnapshot,
} from "@/lib/shared/sessionTypes";

// ─── Types ────────────────────────────────────────────────────────────────

type TabKey = "sesion" | "planificacion" | "progresion" | "reportes";

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "sesion",        label: "Última Sesión",   icon: ClipboardList },
  { key: "planificacion", label: "Planificación",   icon: Calendar },
  { key: "progresion",    label: "Progresión",      icon: TrendingUp },
  { key: "reportes",      label: "Reportes Padres", icon: Users },
];

interface Props {
  teamId: string;
  teamName?: string;
}

// ─── Mock data generators ─────────────────────────────────────────────────

function generateMockSegments(): TrainingSegment[] {
  return [
    { segmentIndex: 0, startMs: 0, endMs: 600000, durationMin: 10, type: "warmup", signals: { playerSpread: 8, avgSpeed: 1.5, ballTouchFrequency: 2, playerCount: 16, movementPattern: "free", intensityLevel: "low" }, confidence: 0.9 },
    { segmentIndex: 1, startMs: 600000, endMs: 1500000, durationMin: 15, type: "technical", signals: { playerSpread: 5, avgSpeed: 2.0, ballTouchFrequency: 12, playerCount: 16, movementPattern: "circular", intensityLevel: "medium" }, confidence: 0.85 },
    { segmentIndex: 2, startMs: 1500000, endMs: 2700000, durationMin: 20, type: "tactical", signals: { playerSpread: 18, avgSpeed: 2.8, ballTouchFrequency: 6, playerCount: 16, movementPattern: "grid", intensityLevel: "medium" }, confidence: 0.8 },
    { segmentIndex: 3, startMs: 2700000, endMs: 4200000, durationMin: 25, type: "game_small_sided", signals: { playerSpread: 22, avgSpeed: 3.5, ballTouchFrequency: 4, playerCount: 16, movementPattern: "free", intensityLevel: "high" }, confidence: 0.88 },
    { segmentIndex: 4, startMs: 4200000, endMs: 4500000, durationMin: 5, type: "cooldown", signals: { playerSpread: 6, avgSpeed: 0.8, ballTouchFrequency: 0, playerCount: 16, movementPattern: "static", intensityLevel: "low" }, confidence: 0.95 },
  ];
}

function generateMockBalance(): SessionBalance {
  return {
    actual: { technical: 20, tactical: 27, physical: 7, game: 33, warmupCooldown: 13 },
    ideal: { technical: 30, tactical: 25, physical: 10, game: 25, warmupCooldown: 10, label: "Sub-14 (Train to Train)" },
    deviations: { technical: -10, tactical: 2, physical: -3, game: 8, warmupCooldown: 3 },
    overallScore: 72,
  };
}

function generateMockMetrics(): PlayerDrillMetrics[] {
  const players = Array.from({ length: 14 }, (_, i) => `player-${i + 1}`);
  const drills = [0, 1, 2, 3];
  const types: Array<"rondo" | "possession" | "pressing_drill" | "small_sided_game"> = [
    "rondo", "possession", "pressing_drill", "small_sided_game",
  ];
  const metrics: PlayerDrillMetrics[] = [];
  for (const pid of players) {
    for (const di of drills) {
      metrics.push({
        playerId: pid,
        drillIndex: di,
        drillType: types[di],
        touches: 8 + Math.round(Math.random() * 20),
        distanceM: 100 + Math.round(Math.random() * 300),
        avgSpeedMs: 1.5 + Math.random() * 2,
        avgIntensity: 30 + Math.round(Math.random() * 50),
        idlePct: 5 + Math.round(Math.random() * 30),
        participationScore: 25 + Math.round(Math.random() * 70),
        distanceToCentroidM: 1 + Math.random() * 5,
        scanCount: Math.round(Math.random() * 8),
      });
    }
  }
  return metrics;
}

function generateMockEngagement(): EngagementSnapshot {
  return {
    playerId: "team-avg",
    sessionId: "mock",
    date: new Date().toISOString().split("T")[0],
    physicalEngagement: 62,
    socialEngagement: 55,
    emotionalEngagement: 58,
    engagementScore: 59,
    engagementTrend: "stable",
    weeklyAvg: 57,
  };
}

function generateMockRecommendation(): SessionRecommendation {
  return {
    areasToImprove: [
      "Aumentar el componente técnico — 10% por debajo del ideal para esta fase LTAD",
      "Incluir ejercicios de pressing estructurado para mejorar la presión post-pérdida",
      "Dedicar más tiempo a ejercicios de transición ataque-defensa",
    ],
    nextSessionDrills: [
      { drillId: "TEC-001", drillName: "Rondo 4v2 con transición", reason: "Mejora circulación y velocidad de decisión", addressesGap: "Técnica -10%", durationMin: 15, priority: "high" },
      { drillId: "TAC-001", drillName: "Pressing 3 zonas", reason: "Trabaja recuperación alta y cobertura", addressesGap: "Pressing estructurado", durationMin: 20, priority: "medium" },
      { drillId: "TAC-004", drillName: "Transición 4v4+2", reason: "Consolidar cambios ataque↔defensa", addressesGap: "Transiciones", durationMin: 15, priority: "medium" },
    ],
    weeklyPlan: [
      { dayOfWeek: 1, focus: "Técnica + rondos", suggestedDrills: [{ drillId: "TEC-001", drillName: "Rondo 4v2", reason: "Base técnica", addressesGap: "Técnica", durationMin: 15, priority: "high" }], totalMinutes: 75, intensityLevel: "medium" },
      { dayOfWeek: 3, focus: "Táctica + juego posicional", suggestedDrills: [{ drillId: "TAC-003", drillName: "Posesión 6v6+3", reason: "Juego posicional", addressesGap: "Táctica", durationMin: 20, priority: "high" }], totalMinutes: 75, intensityLevel: "high" },
      { dayOfWeek: 5, focus: "Partido + transiciones", suggestedDrills: [{ drillId: "TAC-004", drillName: "Transición 4v4+2", reason: "Consolidar conceptos", addressesGap: "Juego", durationMin: 25, priority: "medium" }], totalMinutes: 80, intensityLevel: "high" },
    ],
    loadAdjustment: "Carga actual dentro de rango óptimo. Mantener intensidad media-alta en días de partido.",
    phvNotes: null,
  };
}

function generateMockParentReport(): ParentReport {
  return {
    playerId: "player-1",
    playerName: "Lucas García",
    reportMonth: new Date().toISOString().slice(0, 7) + "-01",
    summary: {
      sessionsAttended: 11,
      totalTrainingMinutes: 825,
      avgParticipationScore: 68,
      avgEngagementScore: 62,
    },
    trends: {
      participation: "improving",
      technique: "stable",
      physical: "improving",
      social: "stable",
    },
    growthContext: "Tu hijo está pasando por un periodo de crecimiento rápido (estirón). Es normal que durante esta fase su coordinación cambie temporalmente y que necesite más descanso. Esto NO significa que esté perdiendo habilidades — su cuerpo está adaptándose a nuevas proporciones.",
    positives: [
      "Muestra una participación activa y constante en los entrenamientos",
      "Ha mejorado su contacto con el balón en las últimas sesiones",
      "Entrena con buena intensidad y esfuerzo",
    ],
    developmentAreas: [
      "Puede beneficiarse de más práctica individual para ganar confianza en los ejercicios grupales",
    ],
    coachNote: "Lucas está teniendo un buen mes de entrenamiento. Sigue mostrando compromiso con el equipo y el proceso de mejora.",
  };
}

// ─── Component ────────────────────────────────────────────────────────────

export default function CoachDashboard({ teamId, teamName }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") as TabKey) || "sesion";
  const [tab, setTab] = useState<TabKey>(tabParam);

  useEffect(() => {
    if (tab !== tabParam) setSearchParams({ tab }, { replace: true });
  }, [tab, tabParam, setSearchParams]);

  // Queries
  const sessionsQ = useCoachingSessions(teamId);
  const latestSessionId = sessionsQ.data?.[0]?.id;
  const analysisQ = useSessionAnalysis(latestSessionId);
  const recommendationQ = useSessionRecommendation(teamId);

  // Mock fallback data
  const segments = useMemo(() => generateMockSegments(), []);
  const balance = useMemo(() => generateMockBalance(), []);
  const metrics = useMemo(() => generateMockMetrics(), []);
  const engagement = useMemo(() => generateMockEngagement(), []);
  const recommendation = useMemo(() => generateMockRecommendation(), []);
  const parentReport = useMemo(() => generateMockParentReport(), []);

  const playerNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (let i = 1; i <= 14; i++) names[`player-${i}`] = `Jugador ${i}`;
    return names;
  }, []);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold
                whitespace-nowrap transition-all shrink-0
                ${active
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                }
              `}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "sesion" && (
            <TabSesion
              segments={segments}
              balance={balance}
              metrics={metrics}
              engagement={engagement}
              playerNames={playerNames}
            />
          )}
          {tab === "planificacion" && (
            <TabPlanificacion recommendation={recommendation} />
          )}
          {tab === "progresion" && (
            <TabProgresion />
          )}
          {tab === "reportes" && (
            <TabReportes report={parentReport} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Tab: Última Sesión ──────────────────────────────────────────────────

function TabSesion({
  segments, balance, metrics, engagement, playerNames,
}: {
  segments: TrainingSegment[];
  balance: SessionBalance;
  metrics: PlayerDrillMetrics[];
  engagement: EngagementSnapshot;
  playerNames: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      {/* Top row: timeline + balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SessionTimelineView segments={segments} />
        <SessionBalanceChart balance={balance} showRadar />
      </div>

      {/* Heatmap */}
      <ParticipationHeatmap metrics={metrics} playerNames={playerNames} />

      {/* Engagement overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <EngagementMiniCard
          physical={engagement.physicalEngagement}
          social={engagement.socialEngagement}
          emotional={engagement.emotionalEngagement}
          composite={engagement.engagementScore}
          trend={engagement.engagementTrend}
        />

        {/* Load indicator */}
        <div className="glass rounded-xl p-4 space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Carga de Sesión
          </span>
          <div className="text-2xl font-black font-mono text-foreground">
            278 <span className="text-xs text-muted-foreground font-normal">AU</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: "68%" }}
              transition={{ duration: 0.8 }}
            />
          </div>
          <div className="text-[9px] text-emerald-400">Óptima — 68% del máximo</div>
        </div>

        {/* Session stats */}
        <div className="glass rounded-xl p-4 space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Estadísticas
          </span>
          <div className="space-y-1">
            {[
              { label: "Jugadores", value: "16" },
              { label: "Ejercicios", value: "4" },
              { label: "Duración", value: "75′" },
              { label: "Balance", value: `${balance.overallScore}/100` },
            ].map(s => (
              <div key={s.label} className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-mono font-bold text-foreground">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="glass rounded-xl p-4 space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Alertas
          </span>
          <div className="space-y-1.5">
            <div className="flex items-start gap-1.5 text-[10px]">
              <AlertCircle size={10} className="text-amber-400 mt-0.5 shrink-0" />
              <span className="text-foreground/70">2 jugadores con baja participación en táctica</span>
            </div>
            <div className="flex items-start gap-1.5 text-[10px]">
              <Activity size={10} className="text-blue-400 mt-0.5 shrink-0" />
              <span className="text-foreground/70">Técnica 10% bajo el ideal LTAD</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Planificación ──────────────────────────────────────────────────

function TabPlanificacion({ recommendation }: { recommendation: SessionRecommendation }) {
  return (
    <div className="space-y-4">
      <NextSessionRecommender
        areasToImprove={recommendation.areasToImprove}
        nextSessionDrills={recommendation.nextSessionDrills}
        phvNotes={recommendation.phvNotes}
      />
      <WeekPlannerView
        weeklyPlan={recommendation.weeklyPlan}
        loadAdjustment={recommendation.loadAdjustment}
      />
    </div>
  );
}

// ─── Tab: Progresión ─────────────────────────────────────────────────────

function TabProgresion() {
  // Session-over-session trends — charts will be enriched in future iterations
  const weeks = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (7 - i) * 7);
      return {
        week: `S${i + 1}`,
        balance: 55 + Math.round(Math.random() * 30),
        load: 200 + Math.round(Math.random() * 150),
        engagement: 45 + Math.round(Math.random() * 35),
        participation: 50 + Math.round(Math.random() * 40),
      };
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4 space-y-3">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Evolución Semanal
        </span>

        {/* Simple table-based progression */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal pb-2">Semana</th>
                <th className="text-center font-normal pb-2">Balance</th>
                <th className="text-center font-normal pb-2">Carga</th>
                <th className="text-center font-normal pb-2">Engagement</th>
                <th className="text-center font-normal pb-2">Participación</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <motion.tr
                  key={w.week}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-t border-white/5"
                >
                  <td className="py-1.5 font-bold text-foreground">{w.week}</td>
                  <td className="py-1.5 text-center">
                    <span className="font-mono font-bold text-foreground">{w.balance}</span>
                  </td>
                  <td className="py-1.5 text-center">
                    <span className="font-mono font-bold text-foreground">{w.load}</span>
                  </td>
                  <td className="py-1.5 text-center">
                    <span className="font-mono font-bold text-foreground">{w.engagement}</span>
                  </td>
                  <td className="py-1.5 text-center">
                    <div className="inline-flex items-center gap-1">
                      <span className="font-mono font-bold text-foreground">{w.participation}</span>
                      <div className="w-12 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
                          style={{ width: `${w.participation}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Balance Promedio", value: "72", unit: "/100", color: "text-violet-400" },
          { label: "Carga Media", value: "285", unit: "AU", color: "text-blue-400" },
          { label: "Engagement", value: "61", unit: "/100", color: "text-rose-400" },
          { label: "Sesiones", value: "8", unit: "semanas", color: "text-emerald-400" },
        ].map(c => (
          <div key={c.label} className="glass rounded-xl p-3 text-center space-y-1">
            <div className={`text-xl font-black font-mono ${c.color}`}>
              {c.value}
              <span className="text-[9px] text-muted-foreground font-normal ml-0.5">{c.unit}</span>
            </div>
            <div className="text-[9px] text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Reportes Padres ────────────────────────────────────────────────

function TabReportes({ report }: { report: ParentReport }) {
  const [selectedPlayer, setSelectedPlayer] = useState("player-1");

  return (
    <div className="space-y-4">
      {/* Player selector */}
      <div className="glass rounded-xl p-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Jugador:</span>
          {Array.from({ length: 5 }, (_, i) => {
            const pid = `player-${i + 1}`;
            const active = selectedPlayer === pid;
            return (
              <button
                key={pid}
                onClick={() => setSelectedPlayer(pid)}
                className={`
                  px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-all
                  ${active
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                  }
                `}
              >
                Jugador {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <ParentReportView report={report} />
    </div>
  );
}
