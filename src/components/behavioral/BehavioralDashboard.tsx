/**
 * VITAS · BehavioralDashboard (Sprint 20)
 *
 * Main behavioral profiling panel.
 * Renders: radar + archetype card + gauge + decision timeline +
 *          clutch heatmap + mental fatigue curve + trend chart.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Brain, Loader2 } from "lucide-react";
import { useBehavioralProfile } from "@/hooks/useBehavioralProfile";

import BehavioralRadar from "./BehavioralRadar";
import ArchetypeCard from "./ArchetypeCard";
import MentalCompositeGauge from "./MentalCompositeGauge";
import DecisionSpeedTimeline from "./DecisionSpeedTimeline";
import ClutchHeatmap from "./ClutchHeatmap";
import MentalFatigueCurveChart from "./MentalFatigueCurveChart";
import BehavioralTrendChart from "./BehavioralTrendChart";

interface Props {
  playerId: string;
}

export default function BehavioralDashboard({ playerId }: Props) {
  const { data: profile, isLoading } = useBehavioralProfile(playerId);

  // Mock data for visualizations (will be replaced with real data from profile)
  const mockDecisions = useMemo(() =>
    Array.from({ length: 25 }, (_, i) => ({
      decisionTimeMs: 800 + Math.round(Math.random() * 1500),
      pressureLevel: 15 + Math.round(Math.random() * 70),
      outcome: (["successful", "failed", "neutral"] as const)[Math.floor(Math.random() * 3)],
      actionType: "pass_short",
    })), [],
  );

  const mockQuarters = useMemo(() => ([
    { quarter: 1 as const, avgDecisionMs: 1200, successRate: 0.72, eventCount: 8, avgPressure: 35 },
    { quarter: 2 as const, avgDecisionMs: 1350, successRate: 0.65, eventCount: 7, avgPressure: 42 },
    { quarter: 3 as const, avgDecisionMs: 1100, successRate: 0.78, eventCount: 9, avgPressure: 55 },
    { quarter: 4 as const, avgDecisionMs: 1050, successRate: 0.82, eventCount: 6, avgPressure: 68 },
  ]), []);

  const mockFatigueSegments = useMemo(() => ([
    { segmentIndex: 0, physicalPct: 100, cognitivePct: 100 },
    { segmentIndex: 1, physicalPct: 95, cognitivePct: 97 },
    { segmentIndex: 2, physicalPct: 88, cognitivePct: 92 },
    { segmentIndex: 3, physicalPct: 78, cognitivePct: 85 },
    { segmentIndex: 4, physicalPct: 70, cognitivePct: 80 },
    { segmentIndex: 5, physicalPct: 62, cognitivePct: 72 },
  ]), []);

  const mockTrend = useMemo(() => ([
    { date: "Ene", mentalComposite: 52 },
    { date: "Feb", mentalComposite: 55 },
    { date: "Mar", mentalComposite: 58 },
    { date: "Abr", mentalComposite: 61 },
    { date: "May", mentalComposite: 63 },
  ]), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  const scores = profile?.scores ?? {
    decisionSpeed: 68,
    scanningIntelligence: 72,
    resilience: 61,
    clutchFactor: 55,
    leadership: 45,
    mentalFatigue: 70,
    unpredictability: 58,
    mentalComposite: 63,
    archetype: "architect",
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Top row: Archetype + Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ArchetypeCard
          archetype={scores.archetype}
          mentalComposite={scores.mentalComposite}
        />
        <MentalCompositeGauge
          score={scores.mentalComposite}
          dimensions={{
            decisionSpeed: scores.decisionSpeed,
            scanningIntelligence: scores.scanningIntelligence,
            resilience: scores.resilience,
            clutchFactor: scores.clutchFactor,
            leadership: scores.leadership,
            mentalFatigue: scores.mentalFatigue,
            unpredictability: scores.unpredictability,
          }}
        />
      </div>

      {/* Radar */}
      <BehavioralRadar scores={scores} />

      {/* Decision Speed + Clutch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DecisionSpeedTimeline decisions={mockDecisions} />
        <ClutchHeatmap
          quarterPerformance={mockQuarters}
          clutchFactor={scores.clutchFactor / 50} // normalize to ~1.0 center
        />
      </div>

      {/* Mental Fatigue Curve */}
      <MentalFatigueCurveChart
        segments={mockFatigueSegments}
        mentalResistanceRatio={0.85}
      />

      {/* Trend */}
      <BehavioralTrendChart data={mockTrend} />

      {/* Strengths & Development */}
      {profile && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass rounded-xl p-4 space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Fortalezas
            </span>
            {(profile.strengths ?? []).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-foreground/80">
                <span className="text-emerald-400 mt-0.5">✦</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div className="glass rounded-xl p-4 space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Áreas de Desarrollo
            </span>
            {(profile.developmentAreas ?? []).map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-foreground/80">
                <span className="text-amber-400 mt-0.5">→</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data quality */}
      <div className="text-[9px] text-muted-foreground text-center">
        {profile?.videosAnalyzed ?? 0} videos analizados · Confianza: {Math.round((profile?.confidence ?? 0.5) * 100)}% · {profile?.modelVersion ?? "v1.0.0"}
      </div>
    </motion.div>
  );
}
