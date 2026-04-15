/**
 * AdminDashboardPage — /admin
 *
 * Panel de métricas de plataforma para admin/director. Consume
 * /api/admin/analytics vía useBusinessAnalytics hook.
 *
 * Secciones:
 *   1. KPIs globales (usage, players, team, revenue)
 *   2. Uso de IA por endpoint (gráfico de barras)
 *   3. Composición del equipo (por rol y status)
 *   4. Análisis por agente
 *   5. Insights recientes
 *   6. Suscripción y renovación
 */
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Activity, TrendingUp, TrendingDown, Zap,
  Brain, Shield, Clock, CreditCard, RefreshCw, Loader2, AlertCircle,
} from "lucide-react";
import { useBusinessAnalytics, topEndpoints, endpointLabel } from "@/hooks/useBusinessAnalytics";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "fredparedes58@gmail.com")
  .split(",").map((s: string) => s.trim().toLowerCase());

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, error, refetch, isRefetching } = useBusinessAnalytics();
  const [activeTab, setActiveTab] = useState<"overview" | "usage" | "team" | "insights">("overview");

  if (!isAdmin(user?.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-xl p-6 max-w-md text-center">
          <Shield size={28} className="text-destructive mx-auto mb-2" />
          <h2 className="font-display font-bold text-lg text-foreground mb-1">Acceso restringido</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Este panel solo está disponible para administradores de la plataforma.
          </p>
          <button
            onClick={() => navigate("/")}
            className="text-xs font-display font-semibold text-primary hover:underline"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-background pb-24"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <Shield size={18} className="text-primary" />
          <h1 className="font-display font-bold text-sm uppercase tracking-wider flex-1">
            Admin Dashboard
          </h1>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors disabled:opacity-50"
            aria-label="Refrescar"
          >
            <RefreshCw size={14} className={isRefetching ? "animate-spin text-primary" : "text-muted-foreground"} />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: "overview", label: "Resumen" },
            { id: "usage", label: "Uso IA" },
            { id: "team", label: "Equipo" },
            { id: "insights", label: "Insights" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-4 py-2 text-xs font-display font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {error && !isLoading && (
          <div className="glass rounded-xl p-5 border border-destructive/30">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertCircle size={14} />
              <p className="font-display font-semibold text-sm">Error al cargar analíticas</p>
            </div>
            <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
          </div>
        )}

        {data && !isLoading && (
          <>
            {activeTab === "overview" && <OverviewTab data={data} />}
            {activeTab === "usage" && <UsageTab data={data} />}
            {activeTab === "team" && <TeamTab data={data} />}
            {activeTab === "insights" && <InsightsTab data={data} />}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type DataProps = { data: NonNullable<ReturnType<typeof useBusinessAnalytics>["data"]> };

function OverviewTab({ data }: DataProps) {
  const growth = data.usage.growthPercent;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* KPIs grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Zap}
          label="Análisis IA"
          value={data.usage.thisMonth}
          sublabel={`este mes (${data.month})`}
          trend={growth}
        />
        <KpiCard
          icon={Users}
          label="Jugadores"
          value={data.players.total}
          sublabel="en plataforma"
        />
        <KpiCard
          icon={Shield}
          label="Miembros equipo"
          value={data.team.total}
          sublabel={`${Object.keys(data.team.byRole).length} roles`}
        />
        <KpiCard
          icon={Activity}
          label="Análisis totales"
          value={data.analyses.total}
          sublabel="histórico completo"
        />
      </div>

      {/* Plan actual */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard size={14} className="text-primary" />
            <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
              Suscripción
            </h3>
          </div>
        </div>
        {data.subscription ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Plan</span>
              <span className="font-display font-bold text-sm text-foreground capitalize">
                {data.subscription.plan}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Estado</span>
              <span className={`font-display font-semibold text-xs uppercase tracking-wider ${
                data.subscription.status === "active" ? "text-emerald-500" : "text-amber-500"
              }`}>
                {data.subscription.status}
              </span>
            </div>
            {data.subscription.current_period_end && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Renovación</span>
                <span className="text-xs text-foreground">
                  {new Date(data.subscription.current_period_end).toLocaleDateString("es-ES")}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin suscripción activa (Free tier)</p>
        )}
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock size={10} />
        <span>
          Datos generados: {new Date(data.generatedAt).toLocaleString("es-ES")}
        </span>
      </div>
    </motion.div>
  );
}

function UsageTab({ data }: DataProps) {
  const endpoints = topEndpoints(data.usage.byEndpoint);
  const maxCount = Math.max(1, ...endpoints.map(e => e.count));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Comparativa mes a mes */}
      <div className="glass rounded-xl p-5">
        <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider mb-4">
          Mes actual vs anterior
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Este mes</p>
            <p className="font-display font-bold text-3xl text-primary">{data.usage.thisMonth}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Anterior</p>
            <p className="font-display font-bold text-3xl text-muted-foreground">{data.usage.previousMonth}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/5">
          <TrendBadge growth={data.usage.growthPercent} />
        </div>
      </div>

      {/* Breakdown por endpoint */}
      <div className="glass rounded-xl p-5">
        <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider mb-4">
          Uso por endpoint
        </h3>
        {endpoints.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos de uso este mes.</p>
        ) : (
          <div className="space-y-3">
            {endpoints.map(({ name, count }) => (
              <div key={name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{endpointLabel(name)}</span>
                  <span className="font-display font-semibold text-primary">{count}</span>
                </div>
                <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Análisis por agente */}
      <div className="glass rounded-xl p-5">
        <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider mb-4">
          Análisis por agente
        </h3>
        {Object.entries(data.analyses.byAgent).length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos de análisis.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.analyses.byAgent).map(([agent, count]) => (
              <div key={agent} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                <span className="text-xs text-foreground capitalize">{agent}</span>
                <span className="font-display font-bold text-sm text-primary">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TeamTab({ data }: DataProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="glass rounded-xl p-5">
        <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider mb-4">
          Composición por rol
        </h3>
        {Object.entries(data.team.byRole).length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin miembros adicionales en el equipo.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(data.team.byRole).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <div className="flex items-center gap-2">
                  <Shield size={13} className="text-primary" />
                  <span className="text-xs font-display font-semibold text-foreground capitalize">{role}</span>
                </div>
                <span className="font-display font-bold text-sm text-primary">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass rounded-xl p-5">
        <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider mb-4">
          Estado de miembros
        </h3>
        {Object.entries(data.team.byStatus).length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos de estado.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(data.team.byStatus).map(([status, count]) => (
              <div key={status} className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="font-display font-bold text-lg text-foreground">{count}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{status}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function InsightsTab({ data }: DataProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider px-1">
        Insights recientes ({data.recentInsights.length})
      </h3>
      {data.recentInsights.length === 0 ? (
        <div className="glass rounded-xl p-5 text-center">
          <Brain size={20} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Sin insights generados todavía.</p>
        </div>
      ) : (
        data.recentInsights.map(insight => (
          <div key={insight.id} className="glass rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Brain size={13} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                    {insight.type}
                  </span>
                  <UrgencyBadge urgency={insight.urgency} />
                </div>
                <p className="text-xs text-foreground leading-relaxed">{insight.headline}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(insight.created_at).toLocaleString("es-ES", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </motion.div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sublabel, trend,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sublabel?: string;
  trend?: number;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className="text-primary" />
        <p className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p className="font-display font-bold text-2xl text-foreground">{value}</p>
      {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
      {trend !== undefined && (
        <div className="mt-2">
          <TrendBadge growth={trend} compact />
        </div>
      )}
    </div>
  );
}

function TrendBadge({ growth, compact = false }: { growth: number; compact?: boolean }) {
  const isPositive = growth > 0;
  const isNeutral = growth === 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const color = isNeutral ? "text-muted-foreground" : isPositive ? "text-emerald-500" : "text-red-500";

  return (
    <div className={`inline-flex items-center gap-1 ${color} ${compact ? "text-[10px]" : "text-xs"} font-display font-semibold`}>
      {!isNeutral && <Icon size={compact ? 10 : 12} />}
      <span>{growth > 0 ? "+" : ""}{growth}%</span>
      {!compact && <span className="text-muted-foreground font-normal ml-1">vs mes anterior</span>}
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const color =
    urgency === "high" ? "text-red-500 bg-red-500/10" :
    urgency === "medium" ? "text-amber-500 bg-amber-500/10" :
    "text-emerald-500 bg-emerald-500/10";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-display font-semibold uppercase tracking-wider ${color}`}>
      {urgency}
    </span>
  );
}
