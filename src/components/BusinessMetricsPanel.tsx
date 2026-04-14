/**
 * BusinessMetricsPanel — Business analytics cards for Director Dashboard
 *
 * Shows: AI usage by endpoint, growth vs previous month,
 * team composition, recent analyses, subscription status.
 */

import { motion } from "framer-motion";
import {
  Cpu, TrendingUp, TrendingDown, Minus,
  Users, Shield, BarChart3, Clock,
  Loader2,
} from "lucide-react";
import {
  useBusinessAnalytics,
  topEndpoints,
  endpointLabel,
} from "@/hooks/useBusinessAnalytics";
import { useTranslation } from "react-i18next";

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ── Endpoint bar ─────────────────────────────────────────────────────────────

function EndpointBar({ name, count, maxCount }: { name: string; count: number; maxCount: number }) {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground truncate">{endpointLabel(name)}</span>
        <span className="font-mono tabular-nums text-foreground">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/70 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Growth indicator ─────────────────────────────────────────────────────────

function GrowthBadge({ percent }: { percent: number }) {
  if (percent > 0) {
    return (
      <span className="flex items-center gap-0.5 text-emerald-500 text-[10px] font-mono">
        <TrendingUp size={10} /> +{percent}%
      </span>
    );
  }
  if (percent < 0) {
    return (
      <span className="flex items-center gap-0.5 text-red-500 text-[10px] font-mono">
        <TrendingDown size={10} /> {percent}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-[10px] font-mono">
      <Minus size={10} /> 0%
    </span>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function BusinessMetricsPanel() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useBusinessAnalytics();

  if (isLoading) {
    return (
      <motion.div variants={item} className="flex items-center justify-center py-8">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </motion.div>
    );
  }

  if (isError || !data) {
    return (
      <motion.div variants={item} className="glass rounded-xl p-4 text-center">
        <p className="text-xs text-muted-foreground">
          {t("director.business.unavailable", "Metricas de negocio no disponibles")}
        </p>
      </motion.div>
    );
  }

  const endpoints = topEndpoints(data.usage.byEndpoint);
  const maxCount = endpoints.length > 0 ? endpoints[0].count : 1;

  return (
    <div className="space-y-4">
      {/* Section title */}
      <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
        {t("director.business.title", "Metricas de Negocio")}
      </h2>

      {/* AI Usage overview */}
      <motion.div variants={item} className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-primary" />
            <span className="text-xs font-display font-semibold text-foreground">
              {t("director.business.aiUsage", "Uso de IA este mes")}
            </span>
          </div>
          <GrowthBadge percent={data.usage.growthPercent} />
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-display font-bold text-3xl text-foreground">
            {data.usage.thisMonth}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("director.business.calls", "llamadas")}
          </span>
        </div>

        <p className="text-[10px] text-muted-foreground">
          {t("director.business.prevMonth", "Mes anterior")}: {data.usage.previousMonth}
        </p>
      </motion.div>

      {/* Usage by endpoint */}
      {endpoints.length > 0 && (
        <motion.div variants={item} className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-electric" />
            <span className="text-xs font-display font-semibold text-foreground">
              {t("director.business.byEndpoint", "Uso por agente")}
            </span>
          </div>
          <div className="space-y-2.5">
            {endpoints.map((ep) => (
              <EndpointBar key={ep.name} name={ep.name} count={ep.count} maxCount={maxCount} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Team composition */}
      {data.team.total > 0 && (
        <motion.div variants={item} className="glass rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-gold" />
            <span className="text-xs font-display font-semibold text-foreground">
              {t("director.business.team", "Equipo")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.team.byRole).map(([role, count]) => (
              <div key={role} className="flex items-center gap-1.5 text-[11px]">
                <Shield size={10} className="text-muted-foreground" />
                <span className="text-muted-foreground capitalize">{role}</span>
                <span className="font-mono text-foreground ml-auto">{count}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {data.team.total} {t("director.business.totalMembers", "miembros totales")}
          </p>
        </motion.div>
      )}

      {/* Recent analyses */}
      {data.analyses.total > 0 && (
        <motion.div variants={item} className="glass rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-green-500" />
            <span className="text-xs font-display font-semibold text-foreground">
              {t("director.business.recentAnalyses", "Analisis recientes (30 dias)")}
            </span>
          </div>
          <p className="font-display font-bold text-2xl text-foreground">
            {data.analyses.total}
          </p>
          {Object.entries(data.analyses.byAgent).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.analyses.byAgent).map(([agent, count]) => (
                <span
                  key={agent}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
                >
                  {agent}: {count}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Subscription status */}
      {data.subscription && (
        <motion.div variants={item} className="glass rounded-xl p-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Shield size={14} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-display font-semibold text-foreground capitalize">
              Plan {data.subscription.plan}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {data.subscription.status === "active"
                ? t("director.business.activeSub", "Activa")
                : data.subscription.status}
              {data.subscription.current_period_end && (
                <> · {t("director.business.renewsOn", "Renueva")}: {new Date(data.subscription.current_period_end).toLocaleDateString("es-ES")}</>
              )}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
