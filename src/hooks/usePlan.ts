/**
 * usePlan — Estado del plan de suscripción del usuario
 * Devuelve plan actual, límites, contadores de uso y feature flags.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import {
  SubscriptionService,
  type Plan,
  type PlanLimits,
  PLAN_LIMITS,
} from "@/services/real/subscriptionService";
import { PlayerService } from "@/services/real/playerService";

export interface PlanState {
  plan: Plan;
  limits: PlanLimits;
  playerCount: number;
  analysesUsed: number;
  canAddPlayer: boolean;
  canRunAnalysis: boolean;
  canUseVAEP: boolean;
  canExportPDF: boolean;
  canManageRoles: boolean;
  canUsePush: boolean;
  isPro: boolean;
  isClub: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
}

export function usePlan(): PlanState {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      if (user?.id) {
        await SubscriptionService.syncFromSupabase(user.id);
      }
      return SubscriptionService.getCurrent();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  const plan = data?.plan ?? "free";
  const limits = PLAN_LIMITS[plan];
  const playerCount = PlayerService.getAll().length;
  const analysesUsed = SubscriptionService.getAnalysesUsedThisMonth();

  return {
    plan,
    limits,
    playerCount,
    analysesUsed,
    canAddPlayer: playerCount < limits.players,
    canRunAnalysis: analysesUsed < limits.analyses,
    canUseVAEP: limits.vaep,
    canExportPDF: limits.pdf,
    canManageRoles: limits.roles,
    canUsePush: limits.pushNotifications,
    isPro: plan === "pro" || plan === "club",
    isClub: plan === "club",
    stripeCustomerId: data?.stripeCustomerId ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
  };
}
