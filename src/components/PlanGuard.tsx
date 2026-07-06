/**
 * PlanGuard — Feature gate por plan de suscripción
 * Muestra un overlay de "upgrade" si el plan no incluye la feature.
 */

import { useNavigate } from "react-router-dom";
import { Lock, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePlan } from "@/hooks/usePlan";
import type { Plan } from "@/services/real/subscriptionService";

export type FeatureKey = "vaep" | "pdf" | "analysis" | "players" | "roles" | "push";

interface FeatureInfo {
  nameKey: string;
  requiredPlan: Plan;
}

const FEATURE_META: Record<FeatureKey, FeatureInfo> = {
  vaep:     { nameKey: "planGuard.featureVaep",     requiredPlan: "pro"  },
  pdf:      { nameKey: "planGuard.featurePdf",      requiredPlan: "pro"  },
  analysis: { nameKey: "planGuard.featureAnalysis", requiredPlan: "pro"  },
  players:  { nameKey: "planGuard.featurePlayers",  requiredPlan: "pro"  },
  roles:    { nameKey: "planGuard.featureRoles",    requiredPlan: "club" },
  push:     { nameKey: "planGuard.featurePush",     requiredPlan: "pro"  },
};

function hasFeature(plan: Plan, required: Plan): boolean {
  if (required === "free") return true;
  if (required === "pro")  return plan === "pro" || plan === "club";
  if (required === "club") return plan === "club";
  return false;
}

interface PlanGuardProps {
  feature: FeatureKey;
  children: React.ReactNode;
  /** showLock=true: renderiza el hijo con overlay. false: no renderiza nada. */
  showLock?: boolean;
}

export function PlanGuard({ feature, children, showLock = false }: PlanGuardProps) {
  const { plan } = usePlan();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const info = FEATURE_META[feature];

  if (hasFeature(plan, info.requiredPlan)) return <>{children}</>;

  if (!showLock) return null;

  const planLabel = info.requiredPlan === "pro" ? "Pro" : "Club";

  return (
    <div
      className="relative cursor-pointer"
      onClick={() => navigate("/billing")}
      title={t("planGuard.requiresPlan", { plan: planLabel })}
    >
      {/* Hijo bloqueado con opacidad */}
      <div className="pointer-events-none opacity-25 select-none">{children}</div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/20 bg-background/70 backdrop-blur-sm">
        <Lock size={18} className="text-primary" />
        <p className="text-xs font-display font-semibold text-foreground text-center px-4 leading-tight">
          {t(info.nameKey)}
        </p>
        <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          <Zap size={10} className="text-primary" />
          <span className="text-[10px] font-display text-primary uppercase tracking-wide">
            {t("planGuard.planLabel", { plan: planLabel })}
          </span>
        </div>
      </div>
    </div>
  );
}
