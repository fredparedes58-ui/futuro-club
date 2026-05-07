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

interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  date?: string;
}

const PHV_LABELS: Record<string, string> = {
  early: "🌱 Pre-estirón",
  ontime: "🚀 En estirón",
  late: "🏆 Post-estirón",
};

export default function ParentDashboardPage() {
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
          <p className="text-sm text-muted-foreground">Jugador no encontrado</p>
          <button onClick={() => navigate("/")} className="text-xs text-primary font-bold">← Inicio</button>
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
      title: "Primera medición",
      description: "Has registrado las primeras medidas antropométricas",
      unlocked: !!rawPlayer?.height && !!rawPlayer?.weight,
    },
    {
      id: "phv-tracked",
      emoji: "🧬",
      title: "PHV calculado",
      description: "Tu hijo tiene su edad biológica medida",
      unlocked: !!rawPlayer?.phvCategory,
    },
    {
      id: "first-report",
      emoji: "📋",
      title: "Primer informe",
      description: "Has generado tu primer reporte de análisis",
      unlocked: totalReports >= 1,
    },
    {
      id: "consistent",
      emoji: "🔥",
      title: "Constancia",
      description: "5 o más informes generados",
      unlocked: totalReports >= 5,
    },
    {
      id: "improving",
      emoji: "📈",
      title: "Subiendo",
      description: "El VSI ha subido +2 o más puntos",
      unlocked: vsiDelta >= 2,
    },
    {
      id: "elite",
      emoji: "👑",
      title: "Talento",
      description: "VSI alcanzó 70+",
      unlocked: vsiCurrent >= 70,
    },
  ];

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  // ─── Compartir ─────────────────────────────────────────────────
  async function handleShare() {
    if (!latestAnalysis?.id || sharing) {
      toast.info("Sin reportes aún · genera el primero para compartir");
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
        throw new Error(data?.error?.message ?? "No se pudo generar link");
      }
      const fullUrl = `${window.location.origin}${data.data.url}`;
      const text = `¡Mira el progreso de ${player.name}! 🏆\n\nVSI: ${vsiCurrent}${vsiDelta >= 0 ? " (↗ +" : " (↘ "}${Math.abs(vsiDelta)} pts)\n${unlockedCount}/${badges.length} logros desbloqueados\n\nVer análisis completo:\n${fullUrl}\n\n_Compartido desde VITAS · Football Intelligence_`;

      if (navigator.share) {
        try { await navigator.share({ title: `${player.name} · VITAS`, text, url: fullUrl }); toast.success("Compartido"); return; } catch { /* canceled */ }
      }
      await navigator.clipboard.writeText(text);
      toast.success("Texto WhatsApp copiado · pega en grupo familia");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
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
            <p className="text-[10px] text-muted-foreground">Vista familia · progreso</p>
          </div>
          <Heart size={16} className="text-pink-400" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-md mx-auto">
        {/* VSI hero · grande, claro */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-6 text-center bg-gradient-to-br from-primary/15 via-electric/10 to-transparent"
        >
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
            Su nivel actual
          </div>
          <div className="font-display font-bold text-6xl text-foreground leading-none">
            {Math.round(vsiCurrent)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">de 100 · VSI Score</div>

          {vsiHistory.length >= 2 && (
            <div className={`mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-display font-bold ${
              vsiDelta > 0 ? "bg-green-400/15 text-green-400"
              : vsiDelta < 0 ? "bg-red-400/15 text-red-400"
              : "bg-secondary text-muted-foreground"
            }`}>
              {vsiDelta > 0 ? <TrendingUp size={12} /> : vsiDelta < 0 ? <TrendingDown size={12} /> : null}
              {vsiDelta >= 0 ? "+" : ""}{vsiDelta} pts vs hace 1 mes
            </div>
          )}

          {rawPlayer?.phvCategory && (
            <div className="mt-3 text-[11px] text-foreground">
              Fase: <span className="font-display font-bold">{PHV_LABELS[rawPlayer.phvCategory] ?? rawPlayer.phvCategory}</span>
            </div>
          )}
        </motion.div>

        {/* Quick stats simples */}
        <div className="grid grid-cols-3 gap-2">
          <SimpleStat label="Edad" value={`${rawPlayer?.age ?? "—"}a`} Icon={Calendar} />
          <SimpleStat label="Posición" value={rawPlayer?.position?.split(" ")[0] ?? "—"} Icon={Activity} />
          <SimpleStat label="Reportes" value={String(totalReports)} Icon={Star} />
        </div>

        {/* Logros · gamification */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award size={14} className="text-gold" />
              <span className="text-xs font-display font-bold text-foreground">Logros</span>
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
                Resumen del último análisis
              </span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {latestReport.estadoActual.resumenEjecutivo}
            </p>
            <button
              onClick={() => navigate(`/players/${playerId}/reports`)}
              className="mt-3 text-xs text-primary font-bold hover:text-primary/80"
            >
              Ver todos los reportes →
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
            <div className="text-sm font-display font-bold text-foreground">Compartir progreso</div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              Mensaje listo para WhatsApp grupo familia
            </div>
          </div>
        </motion.button>

        {/* CTAs secundarios */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate(`/player/${playerId}`)}
            className="rounded-xl bg-secondary/30 border border-border p-3 hover:bg-secondary/50 text-center transition-colors"
          >
            <Activity size={14} className="text-electric mx-auto mb-1" />
            <div className="text-[11px] font-display font-bold text-foreground">Perfil completo</div>
          </button>
          <button
            onClick={() => navigate(`/players/${playerId}/evolution`)}
            className="rounded-xl bg-secondary/30 border border-border p-3 hover:bg-secondary/50 text-center transition-colors"
          >
            <TrendingUp size={14} className="text-green-400 mx-auto mb-1" />
            <div className="text-[11px] font-display font-bold text-foreground">Evolución</div>
          </button>
        </div>

        {/* Empty state si no hay análisis */}
        {totalReports === 0 && (
          <div className="glass rounded-2xl p-5 text-center space-y-2">
            <Trophy size={28} className="text-muted-foreground mx-auto" />
            <p className="text-xs font-display font-bold text-foreground">
              Aún no hay análisis
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Cuando el coach genere el primer reporte, aparecerá aquí su resumen y se desbloquearán logros.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleStat({
  label, value, Icon,
}: { label: string; value: string; Icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-xl bg-secondary/30 border border-border p-3 text-center">
      <Icon size={11} className="text-muted-foreground mx-auto mb-1" />
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className="text-sm font-display font-bold text-foreground">{value}</div>
    </div>
  );
}
