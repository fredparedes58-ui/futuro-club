/**
 * VITAS · WellbeingDashboard (Sprint 23)
 *
 * Team wellbeing panel with risk traffic lights.
 * Grid of players ordered by dropout risk. Click → detail.
 * Used in /wellbeing page for coaches and directors.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useDropoutRisk, useEngagementHistory, useAttendance } from "@/hooks/useWellbeing";

import TeamRiskOverview from "./TeamRiskOverview";
import DropoutRiskGauge from "./DropoutRiskGauge";
import EngagementTimeline from "./EngagementTimeline";
import EngagementHeatmap from "./EngagementHeatmap";
import AttendanceCalendar from "./AttendanceCalendar";
import OvertrainingAlert from "./OvertrainingAlert";
import InterventionPlanView from "./InterventionPlanView";
import EngagementMiniCard from "@/components/coaching/EngagementMiniCard";

// ─── Mock team data ──────────────────────────────────────────────────────

const MOCK_TEAM_PLAYERS = [
  { id: "p1", name: "Marco López" },
  { id: "p2", name: "Lucas García" },
  { id: "p3", name: "Pablo Martínez" },
  { id: "p4", name: "Diego Fernández" },
  { id: "p5", name: "Andrés Rodríguez" },
  { id: "p6", name: "Tomás Sánchez" },
  { id: "p7", name: "Mateo Ruiz" },
  { id: "p8", name: "Nicolás Torres" },
];

function generateMockTeamRisk() {
  return MOCK_TEAM_PLAYERS.map(p => {
    const seed = p.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const riskScore = 10 + (seed % 70);
    const riskLevel: "low" | "moderate" | "high" | "critical" =
      riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "moderate" : "low";
    const factors = ["engagementDecline", "motivationType", "overtrainingRisk", "attendanceDecline", "vsiStagnation"];
    return {
      playerId: p.id,
      playerName: p.name,
      riskScore,
      riskLevel,
      primaryFactor: factors[seed % factors.length],
      engagementTrend: riskScore > 50 ? "declining" : "stable",
      attendanceRate: 60 + (seed % 35),
    };
  });
}

function generateMockHeatmapData() {
  const weeks = ["S1", "S2", "S3", "S4", "S5", "S6"];
  return MOCK_TEAM_PLAYERS.map(p => ({
    playerId: p.id,
    playerName: p.name,
    weeks: weeks.map((w, i) => ({
      weekLabel: w,
      score: 35 + Math.round(Math.sin(i + p.name.length) * 25 + 25),
    })),
  }));
}

// ─── Player Detail View ──────────────────────────────────────────────────

function PlayerDetail({ playerId, onBack }: { playerId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { data: risk } = useDropoutRisk(playerId);
  const { data: engagement } = useEngagementHistory(playerId);
  const { data: attendance } = useAttendance(playerId);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        {t("wellbeingDashboard.backToTeam")}
      </button>

      {risk && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DropoutRiskGauge
              score={risk.riskScore}
              riskLevel={risk.riskLevel}
              primaryFactor={risk.primaryFactor}
              factors={risk.factors}
            />
            <div className="space-y-4">
              <EngagementMiniCard
                physical={risk.engagement.current}
                social={Math.round(risk.engagement.current * 0.9)}
                emotional={Math.round(risk.engagement.current * 0.85)}
                composite={risk.engagement.current}
                trend={risk.engagement.trend === "declining" ? "declining" : risk.engagement.trend === "improving" ? "rising" : "stable"}
              />
              <OvertrainingAlert
                risk={risk.overtraining.risk}
                riskLevel={risk.overtraining.riskLevel}
                currentLoadAU={risk.overtraining.currentLoadAU}
                recommendedLoadAU={risk.overtraining.recommendedLoadAU}
                adjustmentPct={risk.overtraining.adjustmentPct}
              />
            </div>
          </div>

          {engagement && engagement.length > 0 && (
            <EngagementTimeline
              data={engagement.map(e => ({
                date: e.date,
                engagementScore: e.engagementScore,
                physicalEngagement: e.physicalEngagement,
                socialEngagement: e.socialEngagement,
                emotionalEngagement: e.emotionalEngagement,
              }))}
            />
          )}

          {attendance && (
            <AttendanceCalendar
              records={attendance.records.map(r => ({ date: r.date, status: r.status }))}
              rate={attendance.rate}
            />
          )}

          <InterventionPlanView
            urgency={risk.intervention.urgency}
            actions={risk.intervention.actions}
            followUpDate={risk.intervention.followUpDate}
            escalationNeeded={risk.intervention.escalationNeeded}
            primaryFactor={risk.primaryFactor}
          />
        </>
      )}
    </motion.div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────

export default function WellbeingDashboard() {
  const { t } = useTranslation();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const teamRisk = generateMockTeamRisk();
  const heatmapData = generateMockHeatmapData();

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {selectedPlayerId ? (
          <PlayerDetail
            key="detail"
            playerId={selectedPlayerId}
            onBack={() => setSelectedPlayerId(null)}
          />
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Team risk overview */}
            <div className="glass rounded-xl p-4 space-y-4">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                {t("wellbeingDashboard.teamWellbeingPanel")}
              </span>
              <TeamRiskOverview
                players={teamRisk}
                onPlayerClick={setSelectedPlayerId}
              />
            </div>

            {/* Engagement heatmap */}
            <EngagementHeatmap data={heatmapData} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
