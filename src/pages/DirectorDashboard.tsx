/**
 * DirectorDashboard — /director
 * Analytics de uso para el Director Deportivo (plan Club).
 * Muestra: uso del mes, jugadores más activos, alertas, stats globales.
 */

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, BarChart3, Users, Zap, AlertTriangle,
  TrendingUp, Activity, Trophy, ChevronRight,
} from "lucide-react";
import { useUsageAnalytics } from "@/hooks/useUsageAnalytics";
import { useUserProfile } from "@/hooks/useUserProfile";
import { usePlan } from "@/hooks/usePlan";
import { PLAN_LABELS } from "@/services/real/subscriptionService";
import { ROLE_LABELS } from "@/services/real/userProfileService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isWarning = !isUnlimited && pct >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-display">
        <span className="text-muted-foreground">{label}</span>
        <span className={isWarning ? "text-destructive" : "text-foreground"}>
          {used} / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isUnlimited ? "w-0" : isWarning ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: isUnlimited ? "0%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────

const DirectorDashboard = () => {
  const navigate = useNavigate();
  const { data: analytics, isLoading } = useUsageAnalytics();
  const { profile, role } = useUserProfile();
  const { plan } = usePlan();

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-28 space-y-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-2xl text-foreground">
            Director<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            {profile?.organizationName ?? "Mi organización"} · {ROLE_LABELS[role]}
          </p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-electric/10 border border-electric/20">
          <Trophy size={10} className="text-electric" />
          <span className="text-[10px] font-display text-electric uppercase tracking-wide">
            {PLAN_LABELS[plan]}
          </span>
        </div>
      </motion.div>

      {/* Stats globales */}
      {!isLoading && analytics && (
        <>
          <motion.div variants={item} className="grid grid-cols-2 gap-3">
            <div className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-primary" />
                <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                  Jugadores
                </span>
              </div>
              <p className="font-display font-bold text-2xl text-foreground">
                {analytics.playerCount}
              </p>
              <p className="text-[10px] text-muted-foreground">
                / {analytics.playerLimit === -1 ? "∞" : analytics.playerLimit} del plan
              </p>
            </div>

            <div className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={14} className="text-electric" />
                <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                  Análisis IA
                </span>
              </div>
              <p className="font-display font-bold text-2xl text-foreground">
                {analytics.analysesUsed}
              </p>
              <p className="text-[10px] text-muted-foreground">
                este mes / {analytics.analysesLimit === -1 ? "∞" : analytics.analysesLimit}
              </p>
            </div>

            <div className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-gold" />
                <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                  Drills
                </span>
              </div>
              <p className="font-display font-bold text-2xl text-foreground">
                {analytics.drillsCompleted}
              </p>
              <p className="text-[10px] text-muted-foreground">completados</p>
            </div>

            <div className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-green-500" />
                <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                  Activos
                </span>
              </div>
              <p className="font-display font-bold text-2xl text-foreground">
                {analytics.topPlayers.filter((p) => p.visits > 0 || p.eventsCount > 0).length}
              </p>
              <p className="text-[10px] text-muted-foreground">jugadores con datos</p>
            </div>
          </motion.div>

          {/* Uso del mes */}
          <motion.div variants={item} className="glass rounded-xl p-4 space-y-3">
            <h2 className="font-display font-semibold text-sm text-foreground flex items-center gap-2">
              <Zap size={14} className="text-primary" /> Uso del plan
            </h2>
            <UsageBar
              used={analytics.playerCount}
              limit={analytics.playerLimit}
              label="Jugadores"
            />
            <UsageBar
              used={analytics.analysesUsed}
              limit={analytics.analysesLimit}
              label="Análisis IA este mes"
            />
          </motion.div>

          {/* Alertas */}
          {analytics.alerts.length > 0 && (
            <motion.div variants={item} className="glass rounded-xl p-4 border border-yellow-500/20 space-y-2">
              <h2 className="font-display font-semibold text-sm text-yellow-600 flex items-center gap-2">
                <AlertTriangle size={14} /> Alertas
              </h2>
              {analytics.alerts.map((alert, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-yellow-500 mt-0.5">›</span> {alert}
                </p>
              ))}
            </motion.div>
          )}

          {/* Top jugadores */}
          {analytics.topPlayers.length > 0 && (
            <motion.div variants={item} className="space-y-2">
              <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                Top jugadores
              </h2>
              <div className="glass rounded-xl divide-y divide-border">
                {analytics.topPlayers.map((p, i) => (
                  <button
                    key={p.playerId}
                    onClick={() => navigate(`/player/${p.playerId}`)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-primary/5 transition-colors first:rounded-t-xl last:rounded-b-xl text-left"
                  >
                    <span className="w-5 text-center font-display font-bold text-sm text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-semibold text-foreground truncate">
                        {p.playerName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.visits} visitas · {p.eventsCount} eventos
                        {p.lastActivity && (
                          <> · {new Date(p.lastActivity).toLocaleDateString("es-ES")}</>
                        )}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Quick links */}
          <motion.div variants={item} className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/billing")}
              className="glass rounded-xl p-3 text-center hover:border-primary/30 border border-transparent transition-all"
            >
              <Zap size={18} className="text-primary mx-auto mb-1" />
              <p className="text-xs font-display text-foreground">Gestionar plan</p>
            </button>
            <button
              onClick={() => navigate("/master")}
              className="glass rounded-xl p-3 text-center hover:border-primary/30 border border-transparent transition-all"
            >
              <Users size={18} className="text-electric mx-auto mb-1" />
              <p className="text-xs font-display text-foreground">Base de datos</p>
            </button>
          </motion.div>
        </>
      )}

      {isLoading && (
        <motion.div variants={item} className="text-center py-12">
          <p className="text-sm text-muted-foreground font-display">Cargando analytics…</p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default DirectorDashboard;
