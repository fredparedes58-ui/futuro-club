/**
 * PlanGuard — Feature gate por plan de suscripción
 * Muestra un overlay de "upgrade" si el plan no incluye la feature.
 */

import { useNavigate } from "react-router-dom";
import { Lock, Zap } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import type { Plan } from "@/services/real/subscriptionService";

export type FeatureKey = "vaep" | "pdf" | "analysis" | "players" | "roles" | "push";

interface FeatureInfo {
  name: string;
  requiredPlan: Plan;
}

const FEATURE_META: Record<FeatureKey, FeatureInfo> = {
  vaep:     { name: "VAEP · Análisis de eventos",    requiredPlan: "pro"  },
  pdf:      { name: "Exportar PDF",                  requiredPlan: "pro"  },
  analysis: { name: "Análisis IA ilimitados",        requiredPlan: "pro"  },
  players:  { name: "Jugadores adicionales",         requiredPlan: "pro"  },
  roles:    { name: "Roles y multi-usuario",         requiredPlan: "club" },
  push:     { name: "Notificaciones push",           requiredPlan: "pro"  },
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
  const info = FEATURE_META[feature];

  if (hasFeature(plan, info.requiredPlan)) return <>{children}</>;

  if (!showLock) return null;

  return (
    <div
      className="relative cursor-pointer"
      onClick={() => navigate("/billing")}
      title={`Requiere plan ${info.requiredPlan === "pro" ? "Pro" : "Club"}`}
    >
      {/* Hijo bloqueado con opacidad */}
      <div className="pointer-events-none opacity-25 select-none">{children}</div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/20 bg-background/70 backdrop-blur-sm">
        <Lock size={18} className="text-primary" />
        <p className="text-xs font-display font-semibold text-foreground text-center px-4 leading-tight">
          {info.name}
        </p>
        <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          <Zap size={10} className="text-primary" />
          <span className="text-[10px] font-display text-primary uppercase tracking-wide">
            Plan {info.requiredPlan === "pro" ? "Pro" : "Club"}
          </span>
        </div>
      </div>
    </div>
  );
}
