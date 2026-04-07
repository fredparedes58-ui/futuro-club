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

// Emails de administradores con acceso ilimitado (sin restricción de plan).
// También se puede definir via VITE_ADMIN_EMAILS="a@b.com,c@d.com"
const ENV_ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "").split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAILS = new Set([
  ...ENV_ADMIN_EMAILS,
  // Hardcoded fallback — owner siempre tiene acceso total
  "fredparedes58@gmail.com",
]);

export function usePlan(): PlanState & { isAdmin: boolean } {
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

  const isAdmin = ADMIN_EMAILS.has((user?.email ?? "").toLowerCase());
  const plan = data?.plan ?? "free";
  // Admin siempre tiene límites de club (ilimitado)
  const effectiveLimits = isAdmin ? PLAN_LIMITS["club"] : PLAN_LIMITS[plan];
  const playerCount = PlayerService.getAll().length;
  const analysesUsed = SubscriptionService.getAnalysesUsedThisMonth();

  return {
    plan: isAdmin ? "club" : plan,
    limits: effectiveLimits,
    playerCount,
    analysesUsed,
    canAddPlayer: isAdmin || playerCount < effectiveLimits.players,
    canRunAnalysis: isAdmin || analysesUsed < effectiveLimits.analyses,
    canUseVAEP: isAdmin || effectiveLimits.vaep,
    canExportPDF: isAdmin || effectiveLimits.pdf,
    canManageRoles: isAdmin || effectiveLimits.roles,
    canUsePush: isAdmin || effectiveLimits.pushNotifications,
    isPro: isAdmin || plan === "pro" || plan === "club",
    isClub: isAdmin || plan === "club",
    isAdmin,
    stripeCustomerId: data?.stripeCustomerId ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
  };
}
