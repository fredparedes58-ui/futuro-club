/**
 * UsageMeter — Visual bar showing AI analysis usage vs. plan limit
 *
 * Compact component for Dashboard, sidebar, or any page that triggers AI.
 * Shows: used/limit, progress bar with color coding, plan badge.
 */

import { Gauge, Zap, AlertTriangle, Infinity as InfinityIcon } from "lucide-react";
import { useUsageMeter, type UsageStatus } from "@/hooks/useUsageMeter";
import { useTranslation } from "react-i18next";

// ── Color mapping ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<UsageStatus, { bar: string; text: string; bg: string }> = {
  ok:       { bar: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-500/10" },
  warning:  { bar: "bg-amber-500",   text: "text-amber-600",   bg: "bg-amber-500/10" },
  critical: { bar: "bg-orange-500",  text: "text-orange-600",  bg: "bg-orange-500/10" },
  exceeded: { bar: "bg-red-500",     text: "text-red-600",     bg: "bg-red-500/10" },
};

// ── Component ────────────────────────────────────────────────────────────────

interface UsageMeterProps {
  /** Compact mode: single line, no labels. Default false. */
  compact?: boolean;
  /** Custom CSS class for wrapper */
  className?: string;
}

export default function UsageMeter({ compact = false, className = "" }: UsageMeterProps) {
  const { t } = useTranslation();
  const meter = useUsageMeter();
  const colors = STATUS_COLORS[meter.status];

  // ── Unlimited plan ──────────────────────────────────────────
  if (meter.isUnlimited) {
    if (compact) {
      return (
        <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
          <InfinityIcon size={12} />
          <span>{t("usage.unlimited", "Ilimitado")}</span>
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 ${className}`}>
        <InfinityIcon size={14} className="text-primary" />
        <span className="text-xs text-muted-foreground">
          {t("usage.unlimitedPlan", "Plan {{plan}} - Anlisis ilimitados", { plan: meter.plan })}
        </span>
      </div>
    );
  }

  // ── Compact mode ────────────────────────────────────────────
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`} title={`${meter.used}/${meter.limit} anlisis`}>
        <Gauge size={12} className={colors.text} />
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-[40px]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${colors.bar}`}
            style={{ width: `${meter.percent}%` }}
          />
        </div>
        <span className={`text-[10px] font-mono tabular-nums ${colors.text}`}>
          {meter.used}/{meter.limit}
        </span>
      </div>
    );
  }

  // ── Full mode ───────────────────────────────────────────────
  return (
    <div className={`rounded-xl border border-border/50 bg-card p-3 space-y-2 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge size={14} className={colors.text} />
          <span className="text-xs font-medium text-foreground">
            {t("usage.aiAnalyses", "Anlisis IA")}
          </span>
        </div>
        <span className={`text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
          {meter.plan}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${colors.bar}`}
          style={{ width: `${meter.percent}%` }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {meter.used} / {meter.limit} {t("usage.thisMonth", "este mes")}
        </span>
        {meter.status === "exceeded" ? (
          <div className="flex items-center gap-1 text-red-500">
            <AlertTriangle size={10} />
            <span className="text-[10px] font-medium">
              {t("usage.limitReached", "Lmite alcanzado")}
            </span>
          </div>
        ) : meter.status === "critical" ? (
          <div className="flex items-center gap-1 text-orange-500">
            <Zap size={10} />
            <span className="text-[10px]">
              {meter.remaining} {t("usage.remaining", "restantes")}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {meter.remaining} {t("usage.remaining", "restantes")}
          </span>
        )}
      </div>
    </div>
  );
}
