/**
 * VITAS · Parent Dashboard (Sprint B4 · día 1-2)
 * /family/:playerId
 *
 * Vista padre/madre · simplificada, sin jerga técnica. Pensada para que
 * cualquier familia entienda el progreso de su hijo en 30 segundos:
 *   - Score VSI grande con delta vs hace 1 mes
 *   - Badges/logros desbloqueados
 *   - Última medición + cuándo toca la próxima
 *   - Botón "Compartir progreso" (genera share-link al último análisis)
 *   - Mini-resumen del último análisis con lenguaje claro
 *
 * Cero rutas técnicas · cero gauges complejos · todo en español llano.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ArrowLeft, Heart, Trophy, Star, TrendingUp, TrendingDown,
  Calendar, Activity, Share2, Loader2, Sparkles, Award,
} from "lucide-react";
import { toast } from "sonner";
import { PlayerService } from "@/services/real/playerService";
import { useSavedAnalysesV2 } from "@/hooks/usePlayerAnalysisV2";
import { useRawPlayerById } from "@/hooks/usePlayers";
import { getAuthHeaders } from "@/lib/apiAuth";
import PeerBenchmark from "@/components/PeerBenchmark";
import DemoDataBanner from "@/components/DemoDataBanner";
import { useDropoutRisk, useEngagementHistory } from "@/hooks/useWellbeing";
import { useCurrentIDP } from "@/hooks/useIDP";
import { IDPParentView } from "@/components/idp/IDPParentView";
import { usePHVProduct } from "@/hooks/usePHVProduct";
import { GrowthSpurtShieldAlert } from "@/components/phv/GrowthSpurtShieldAlert";
import {
  usePlayerConsent,
  useGrantConsent,
} from "@/hooks/useParentalConsent";
import { Shield, CheckCircle2, AlertCircle } from "lucide-react";
import { PlayerTrackingService } from "@/services/real/playerTrackingService";

interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  date?: string;
}

const PHV_EMOJIS: Record<string, string> = {
  early: "🌱",
  ontime: "🚀",
  late: "🏆",
};

export default function ParentDashboardPage() {
  const { t } = useTranslation();
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const player = playerId ? PlayerService.getById(playerId) : null;
  const { data: rawPlayer } = useRawPlayerById(playerId);
  const { data: analyses = [] } = useSavedAnalysesV2(playerId ?? "");
  const [sharing, setSharing] = useState(false);

  if (!player) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <Heart size={32} className="text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">{t("parentDashboardPage.playerNotFound")}</p>
          <button onClick={() => navigate("/")} className="text-xs text-primary font-bold">← {t("parentDashboardPage.home")}</button>
        </div>
      </div>
    );
  }

  // ─── Cálculos ──────────────────────────────────────────────────
  const vsiCurrent = Number(rawPlayer?.vsi ?? 0);
  const vsiHistory = (rawPlayer?.vsiHistory ?? []) as number[];
  const vsiBefore = vsiHistory.length >= 2 ? vsiHistory[Math.max(0, vsiHistory.length - 4)] : vsiCurrent;
  const vsiDelta = Number((vsiCurrent - vsiBefore).toFixed(1));

  const totalReports = analyses.length;
  const latestAnalysis = analyses[0];
  const latestReport = latestAnalysis?.report as { estadoActual?: { resumenEjecutivo?: string; nivelActual?: string } } | undefined;

  // Badges · client-side rules sobre datos ya disponibles
  const badges: Badge[] = [
    {
      id: "first-measurement",
      emoji: "📏",
      title: t("parentDashboardPage.badgeFirstMeasurementTitle"),
      description: t("parentDashboardPage.badgeFirstMeasurementDesc"),
      unlocked: !!rawPlayer?.height && !!rawPlayer?.weight,
    },
    {
      id: "phv-tracked",
      emoji: "🧬",
      title: t("parentDashboardPage.badgePhvTrackedTitle"),
      description: t("parentDashboardPage.badgePhvTrackedDesc"),
      unlocked: !!rawPlayer?.phvCategory,
    },
    {
      id: "first-report",
      emoji: "📋",
      title: t("parentDashboardPage.badgeFirstReportTitle"),
      description: t("parentDashboardPage.badgeFirstReportDesc"),
      unlocked: totalReports >= 1,
    },
    {
      id: "consistent",
      emoji: "🔥",
      title: t("parentDashboardPage.badgeConsistentTitle"),
      description: t("parentDashboardPage.badgeConsistentDesc"),
      unlocked: totalReports >= 5,
    },
    {
      id: "improving",
      emoji: "📈",
      title: t("parentDashboardPage.badgeImprovingTitle"),
      description: t("parentDashboardPage.badgeImprovingDesc"),
      unlocked: vsiDelta >= 2,
    },
    {
      id: "elite",
      emoji: "👑",
      title: t("parentDashboardPage.badgeEliteTitle"),
      description: t("parentDashboardPage.badgeEliteDesc"),
      unlocked: vsiCurrent >= 70,
    },
  ];

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  // ─── Compartir ─────────────────────────────────────────────────
  async function handleShare() {
    if (!latestAnalysis?.id || sharing) {
      toast.info(t("parentDashboardPage.noReportsShareInfo"));
      return;
    }
    setSharing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/analyses/share?analysisId=${latestAnalysis.id}`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message ?? t("parentDashboardPage.linkGenerationError"));
      }
      const fullUrl = `${window.location.origin}${data.data.url}`;
      const deltaLabel = vsiDelta >= 0 ? ` (↗ +${Math.abs(vsiDelta)} pts)` : ` (↘ ${Math.abs(vsiDelta)} pts)`;
      const text = t("parentDashboardPage.shareText", {
        name: player.name,
        vsi: vsiCurrent,
        delta: deltaLabel,
        unlockedCount,
        totalBadges: badges.length,
        url: fullUrl,
      });

      if (navigator.share) {
        try { await navigator.share({ title: `${player.name} · VITAS`, text, url: fullUrl }); toast.success(t("parentDashboardPage.shared")); return; } catch { /* canceled */ }
      }
      await navigator.clipboard.writeText(text);
      toast.success(t("parentDashboardPage.whatsappCopied"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("parentDashboardPage.genericError"));
    } finally {
      setSharing(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header sticky simple */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">
              {player.name}
            </h1>
            <p className="text-[10px] text-muted-foreground">{t("parentDashboardPage.familyViewProgress")}</p>
          </div>
          <Heart size={16} className="text-pink-400" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-md mx-auto">
        {/* Parental Consent banner — RGPD for minors */}
        <ParentalConsentBanner playerId={player.id} playerAge={player.age} playerName={player.name} />

        {/* VSI hero · grande, claro */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-6 text-center bg-gradient-to-br from-primary/15 via-electric/10 to-transparent"
        >
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
            {t("parentDashboardPage.currentLevel")}
          </div>
          <div className="font-display font-bold text-6xl text-foreground leading-none">
            {Math.round(vsiCurrent)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{t("parentDashboardPage.outOf100VsiScore")}</div>

          {vsiHistory.length >= 2 && (
            <div className={`mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-display font-bold ${
              vsiDelta > 0 ? "bg-green-400/15 text-green-400"
              : vsiDelta < 0 ? "bg-red-400/15 text-red-400"
              : "bg-secondary text-muted-foreground"
            }`}>
              {vsiDelta > 0 ? <TrendingUp size={12} /> : vsiDelta < 0 ? <TrendingDown size={12} /> : null}
              {vsiDelta >= 0 ? "+" : ""}{vsiDelta} {t("parentDashboardPage.ptsVsOneMonthAgo")}
            </div>
          )}

          {rawPlayer?.phvCategory && (
            <div className="mt-3 text-[11px] text-foreground">
              {t("parentDashboardPage.phaseLabel")} <span className="font-display font-bold">{PHV_EMOJIS[rawPlayer.phvCategory] ? `${PHV_EMOJIS[rawPlayer.phvCategory]} ${t(`parentDashboardPage.phv_${rawPlayer.phvCategory === "ontme" ? "ontime" : rawPlayer.phvCategory}`)}` : rawPlayer.phvCategory}</span>
            </div>
          )}
        </motion.div>

        {/* Quick stats simples */}
        <div className="grid grid-cols-3 gap-2">
          <SimpleStat label={t("parentDashboardPage.statAge")} value={`${rawPlayer?.age ?? "—"}a`} Icon={Calendar} />
          <SimpleStat label={t("parentDashboardPage.statPosition")} value={rawPlayer?.position?.split(" ")[0] ?? "—"} Icon={Activity} />
          <SimpleStat label={t("parentDashboardPage.statReports")} value={String(totalReports)} Icon={Star} />
        </div>

        {/* Logros · gamification */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award size={14} className="text-gold" />
              <span className="text-xs font-display font-bold text-foreground">{t("parentDashboardPage.achievements")}</span>
            </div>
            <span className="text-[11px] font-display font-bold text-gold">
              {unlockedCount} / {badges.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {badges.map((b) => (
              <div
                key={b.id}
                className={`rounded-xl p-2 text-center transition-all ${
                  b.unlocked
                    ? "bg-gold/10 border-2 border-gold/40"
                    : "bg-secondary/30 border border-border opacity-50 grayscale"
                }`}
                title={b.description}
              >
                <div className="text-2xl mb-0.5">{b.emoji}</div>
                <div className={`text-[9px] font-display font-bold leading-tight ${b.unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                  {b.title}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Escudo de Estirón · versión padre (canal B2C Plan Familia) */}
        <ParentGrowthSpurtSection playerId={playerId!} />

        {/* Plan del mes · IDP versión padre */}
        <ParentIDPSection playerId={playerId!} />

        {/* Estado Físico · para padres (lenguaje simple) */}
        <PhysicalStatusCard playerId={playerId!} />

        {/* Cross-club benchmark · network effect */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="glass rounded-2xl p-4">
          <PeerBenchmark playerId={playerId!} variant="full" />
        </motion.div>

        {/* Último análisis · resumen claro */}
        {latestReport?.estadoActual?.resumenEjecutivo && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                {t("parentDashboardPage.latestAnalysisSummary")}
              </span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {latestReport.estadoActual.resumenEjecutivo}
            </p>
            <button
              onClick={() => navigate(`/players/${playerId}/reports`)}
              className="mt-3 text-xs text-primary font-bold hover:text-primary/80"
            >
              {t("parentDashboardPage.viewAllReports")} →
            </button>
          </motion.div>
        )}

        {/* CTA Compartir */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={handleShare}
          disabled={sharing}
          className="w-full glass rounded-2xl p-4 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left border-2 border-primary/30 disabled:opacity-50"
        >
          <div className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            {sharing ? <Loader2 size={18} className="animate-spin text-primary" /> : <Share2 size={18} className="text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-display font-bold text-foreground">{t("parentDashboardPage.shareProgress")}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              {t("parentDashboardPage.shareProgressSubtitle")}
            </div>
          </div>
        </motion.button>

        {/* CTAs secundarios */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate(`/players/${playerId}`)}
            className="rounded-xl bg-secondary/30 border border-border p-3 hover:bg-secondary/50 text-center transition-colors"
          >
            <Activity size={14} className="text-electric mx-auto mb-1" />
            <div className="text-[11px] font-display font-bold text-foreground">{t("parentDashboardPage.fullProfile")}</div>
          </button>
          <button
            onClick={() => navigate(`/players/${playerId}/evolution`)}
            className="rounded-xl bg-secondary/30 border border-border p-3 hover:bg-secondary/50 text-center transition-colors"
          >
            <TrendingUp size={14} className="text-green-400 mx-auto mb-1" />
            <div className="text-[11px] font-display font-bold text-foreground">{t("parentDashboardPage.evolution")}</div>
          </button>
        </div>

        {/* Wellbeing section (Sprint 23) */}
        <ParentWellbeingSection playerId={playerId ?? ""} />

        {/* Empty state si no hay análisis */}
        {totalReports === 0 && (
          <div className="glass rounded-2xl p-5 text-center space-y-2">
            <Trophy size={28} className="text-muted-foreground mx-auto" />
            <p className="text-xs font-display font-bold text-foreground">
              {t("parentDashboardPage.noAnalysisYet")}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("parentDashboardPage.noAnalysisYetDesc")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wellbeing for parents (Sprint 23) ───────────────────────────
// Exportado para el guard de honestidad (G5): un test verifica que, cuando el
// bienestar es MOCK (`risk.isMock`), esta vista de cliente SIEMPRE muestra el
// DemoDataBanner. Ver src/test/components/G5ProductHonesty.test.tsx.
export function ParentWellbeingSection({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const { data: risk } = useDropoutRisk(playerId || undefined);
  const { data: engagement } = useEngagementHistory(playerId || undefined);

  if (!risk || !playerId) return null;

  const engagementTrend = risk.engagement.trend;
  const tips = [
    t("parentDashboardPage.tip1"),
    t("parentDashboardPage.tip2"),
    t("parentDashboardPage.tip3"),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Heart size={14} className="text-rose-400" />
        <span className="text-[11px] font-display font-bold text-foreground">{t("parentDashboardPage.wellbeing")}</span>
      </div>

      {/* Banner honesto (G5): si el bienestar es MOCK de demostración (aún sin
          cuestionarios/asistencia/engagement reales), el padre debe saberlo. Antes
          salía sin aviso; la vista de equipo sí lo tenía. */}
      {risk?.isMock && <DemoDataBanner messageKey="demoData.wellbeing" />}

      {/* Engagement bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{t("parentDashboardPage.enjoymentLevel")}</span>
          <span className={`text-[10px] font-bold ${
            engagementTrend === "declining" ? "text-amber-400" :
            engagementTrend === "improving" ? "text-emerald-400" :
            "text-muted-foreground"
          }`}>
            {engagementTrend === "declining" ? `↓ ${t("parentDashboardPage.trendDeclining")}` :
             engagementTrend === "improving" ? `↑ ${t("parentDashboardPage.trendImproving")}` :
             `→ ${t("parentDashboardPage.trendStable")}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              risk.engagement.current >= 65 ? "bg-emerald-500" :
              risk.engagement.current >= 40 ? "bg-amber-500" :
              "bg-red-500"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, risk.engagement.current)}%` }}
            transition={{ duration: 0.8 }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {risk.engagement.current >= 65
            ? t("parentDashboardPage.enjoymentHigh")
            : risk.engagement.current >= 40
            ? t("parentDashboardPage.enjoymentMedium")
            : t("parentDashboardPage.enjoymentLow")}
        </p>
      </div>

      {/* Tips */}
      <div className="space-y-1.5">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
          {t("parentDashboardPage.familyTips")}
        </span>
        {tips.map((tip, i) => (
          <p key={i} className="text-[10px] text-muted-foreground/80 flex items-start gap-1.5">
            <span className="text-emerald-400 shrink-0">✓</span>
            {tip}
          </p>
        ))}
      </div>
    </motion.div>
  );
}

// ── Physical Status Card · lenguaje para padres ────────────────────────────
const ACWR_PARENT_COLORS: Record<string, string> = {
  optimal:      "text-green-400",
  caution:      "text-amber-400",
  danger:       "text-red-400",
  undertrained: "text-blue-400",
};

const FATIGUE_PARENT_COLORS: Record<string, string> = {
  normal:   "text-green-400",
  moderate: "text-amber-400",
  high:     "text-orange-400",
  critical: "text-red-400",
};

function PhysicalStatusCard({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const snapshot = PlayerTrackingService.get(playerId);
  const fatigue = snapshot?.fatigueReport;

  if (!fatigue) return null;

  const acwrZone = fatigue.acwr?.zone ?? "optimal";
  const acwrColor = ACWR_PARENT_COLORS[acwrZone] ?? ACWR_PARENT_COLORS.optimal;
  const acwrLabel = t(`parentDashboardPage.acwr_${acwrZone}_label`, t("parentDashboardPage.acwr_optimal_label"));
  const acwrAdvice = t(`parentDashboardPage.acwr_${acwrZone}_advice`, t("parentDashboardPage.acwr_optimal_advice"));
  const fatigueSeverity = fatigue.fatigueIndex?.severity ?? "normal";
  const fatigueColor = FATIGUE_PARENT_COLORS[fatigueSeverity] ?? FATIGUE_PARENT_COLORS.normal;
  const fatigueLabel = t(`parentDashboardPage.fatigue_${fatigueSeverity}_label`, t("parentDashboardPage.fatigue_normal_label"));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.11 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Shield size={14} className="text-primary" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          {t("parentDashboardPage.physicalStatus")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-secondary/30 border border-border p-3">
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{t("parentDashboardPage.weeklyLoad")}</div>
          <div className={`text-sm font-display font-bold ${acwrColor}`}>
            {acwrLabel}
          </div>
        </div>
        <div className="rounded-xl bg-secondary/30 border border-border p-3">
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{t("parentDashboardPage.fatigue")}</div>
          <div className={`text-sm font-display font-bold ${fatigueColor}`}>
            {fatigueLabel}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        {acwrAdvice}
      </p>

      {/* Sprint 11: Injury risk summary for parents */}
      {(acwrZone === "danger" || fatigueSeverity === "critical" || fatigueSeverity === "high") && (
        <div className="mt-3 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
          <p className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
            {acwrZone === "danger"
              ? t("parentDashboardPage.injuryRiskLoadHigh")
              : t("parentDashboardPage.injuryRiskFatigueHigh")}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ── ParentGrowthSpurtSection (Escudo de Estirón, versión padre) ────

function ParentGrowthSpurtSection({ playerId }: { playerId: string }) {
  const phv = usePHVProduct(playerId);
  // Solo mostramos al padre cuando el escudo está activo (evita ruido).
  if (!phv || !phv.shield.active) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}>
      <GrowthSpurtShieldAlert shield={phv.shield} audience="parent" />
    </motion.div>
  );
}

// ── ParentIDPSection ──────────────────────────────────────────────
// Plan de Desarrollo Individual mensual, en vista light para padres.
// Sin terminología técnica, solo emojis + barras de progreso.

function ParentIDPSection({ playerId }: { playerId: string }) {
  const { data: plan } = useCurrentIDP(playerId);
  const player = PlayerService.getById(playerId);

  // Solo renderiza si hay un plan activo. Si no, ocultamos la sección
  // (los padres no generan planes — eso lo hace el coach).
  if (!plan || (plan.status !== "active" && plan.status !== "completed")) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14 }}
      className="glass rounded-2xl p-4"
    >
      <IDPParentView plan={plan} playerName={player?.name} />
    </motion.div>
  );
}

function SimpleStat({
  label, value, Icon,
}: { label: string; value: string; Icon: React.ElementType }) {
  return (
    <div className="rounded-xl bg-secondary/30 border border-border p-3 text-center">
      <Icon size={11} className="text-muted-foreground mx-auto mb-1" />
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className="text-sm font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

// ── Parental Consent Banner (RGPD for <14yo) ────────────────────────────
function ParentalConsentBanner({
  playerId,
  playerAge,
  playerName,
}: {
  playerId: string;
  playerAge?: number;
  playerName: string;
}) {
  const { t } = useTranslation();
  const { data: consent } = usePlayerConsent(playerId);
  const grant = useGrantConsent();
  const [showForm, setShowForm] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");

  // Don't show anything if player is >= 14 (not required)
  if (playerAge !== undefined && playerAge >= 14) return null;
  if (!consent) return null;

  if (consent.status === "granted") {
    return (
      <div className="glass rounded-2xl p-3 border-l-4 border-emerald-500/60 bg-emerald-500/5 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        <p className="text-[11px] text-foreground/80">
          {t("parentDashboardPage.consentParental")} <strong className="text-emerald-500">{t("parentDashboardPage.consentGranted")}</strong>
          {consent.guardianName && ` ${t("parentDashboardPage.consentBy", { name: consent.guardianName })}`}
        </p>
      </div>
    );
  }

  if (consent.status === "denied") {
    return (
      <div className="glass rounded-2xl p-3 border-l-4 border-red-500/60 bg-red-500/5 flex items-center gap-2">
        <AlertCircle size={14} className="text-red-500 shrink-0" />
        <p className="text-[11px] text-foreground/80">
          {t("parentDashboardPage.consentParental")} <strong className="text-red-500">{t("parentDashboardPage.consentDenied")}</strong> {t("parentDashboardPage.consentDeniedNote")}
        </p>
      </div>
    );
  }

  // pending — show grant form
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 border-l-4 border-amber-500/60 bg-amber-500/5 space-y-2"
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-[12px] font-display font-bold text-foreground">
            {t("parentDashboardPage.consentPending")}
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
            {t("parentDashboardPage.consentPendingDesc", { name: playerName })}
          </p>
        </div>
      </div>
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full px-3 py-1.5 rounded-md bg-amber-500 text-white text-[11px] font-display font-semibold hover:bg-amber-600"
        >
          {t("parentDashboardPage.iAmGuardianGrant")}
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            placeholder={t("parentDashboardPage.guardianNamePlaceholder")}
            className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-amber-500 focus:outline-none"
          />
          <input
            type="email"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
            placeholder={t("parentDashboardPage.guardianEmailPlaceholder")}
            className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-xs border border-border focus:border-amber-500 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-secondary"
            >
              {t("parentDashboardPage.cancel")}
            </button>
            <button
              onClick={() =>
                guardianName.trim() &&
                guardianEmail.trim() &&
                grant.mutate({
                  playerId,
                  guardianName: guardianName.trim(),
                  guardianEmail: guardianEmail.trim(),
                })
              }
              disabled={!guardianName.trim() || !guardianEmail.trim() || grant.isPending}
              className="flex-1 px-3 py-1 rounded-md bg-amber-500 text-white text-[11px] font-display font-semibold disabled:opacity-50"
            >
              {grant.isPending ? t("parentDashboardPage.saving") : t("parentDashboardPage.grant")}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
