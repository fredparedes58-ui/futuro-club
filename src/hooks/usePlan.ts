/**
 * usePlan — Estado del plan de suscripcion del usuario
 * Devuelve plan actual, limites, contadores de uso y feature flags.
 *
 * Fase 3: Added teamMemberCount, canInviteMembers, teamMemberLimit.
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
  teamMemberCount: number;
  teamMemberLimit: number;
  canAddPlayer: boolean;
  canRunAnalysis: boolean;
  canInviteMembers: boolean;
  canUseVAEP: boolean;
  canExportPDF: boolean;
  canManageRoles: boolean;
  canUsePush: boolean;
  canUseBehavioral: boolean;
  canUseWellbeing: boolean;
  canUseTeamWellbeing: boolean;
  canUseIDP: boolean;
  canUseInjuryPrediction: boolean;
  canUseValuation: boolean;
  canUseMultiVideoAggregation: boolean;
  isPro: boolean;
  isClub: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
}

// Emails de administradores con acceso ilimitado (sin restriccion de plan).
// Tambien se puede definir via VITE_ADMIN_EMAILS="a@b.com,c@d.com"
const ENV_ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "").split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAILS = new Set([
  ...ENV_ADMIN_EMAILS,
  // Hardcoded fallback — owner siempre tiene acceso total
  "fredparedes58@gmail.com",
]);

/** Read team member count from localStorage (cached by TeamService) */
function getTeamMemberCount(): number {
  try {
    const raw = localStorage.getItem("vitas_team_members");
    if (raw) {
      const members = JSON.parse(raw);
      return Array.isArray(members) ? members.length : 0;
    }
  } catch { /* ignore */ }
  return 0;
}

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
  // Admin siempre tiene limites de club (ilimitado)
  const effectiveLimits = isAdmin ? PLAN_LIMITS["club"] : PLAN_LIMITS[plan];
  const playerCount = PlayerService.getAll().length;
  const analysesUsed = SubscriptionService.getAnalysesUsedThisMonth();
  const teamMemberCount = getTeamMemberCount();

  return {
    plan: isAdmin ? "club" : plan,
    limits: effectiveLimits,
    playerCount,
    analysesUsed,
    teamMemberCount,
    teamMemberLimit: effectiveLimits.teamMembers,
    canAddPlayer: isAdmin || playerCount < effectiveLimits.players,
    canRunAnalysis: isAdmin || analysesUsed < effectiveLimits.analyses,
    canInviteMembers: isAdmin || teamMemberCount < effectiveLimits.teamMembers,
    canUseVAEP: isAdmin || effectiveLimits.vaep,
    canExportPDF: isAdmin || effectiveLimits.pdf,
    canManageRoles: isAdmin || effectiveLimits.roles,
    canUsePush: isAdmin || effectiveLimits.pushNotifications,
    canUseBehavioral: isAdmin || plan === "pro" || plan === "club",
    canUseWellbeing: isAdmin || plan === "pro" || plan === "club",
    canUseTeamWellbeing: isAdmin || plan === "club",
    canUseIDP: isAdmin || plan === "pro" || plan === "club",
    canUseInjuryPrediction: isAdmin || effectiveLimits.injuryPrediction,
    canUseValuation: isAdmin || effectiveLimits.valuation,
    canUseMultiVideoAggregation: isAdmin || effectiveLimits.multiVideoAggregation,
    isPro: isAdmin || plan === "pro" || plan === "club",
    isClub: isAdmin || plan === "club",
    isAdmin,
    stripeCustomerId: data?.stripeCustomerId ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
  };
}
