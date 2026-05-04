/**
 * VITAS · useSubscription hook
 *
 * Estado del plan activo del usuario actual.
 * Consulta vista user_active_subscription.
 */

import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "@/lib/apiAuth";

export type PlanTier = "personal" | "pro" | "academia" | "agencia" | null;

export interface SubscriptionState {
  loading: boolean;
  isActive: boolean;
  planTier: PlanTier;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  videosPerMonth: number;
  maxPlayers: number;
  whiteLabel: boolean;
  userPersona: string | null;
}

const INITIAL: SubscriptionState = {
  loading: true,
  isActive: false,
  planTier: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  videosPerMonth: 0,
  maxPlayers: 0,
  whiteLabel: false,
  userPersona: null,
};

export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>(INITIAL);

  const refresh = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/billing/status", { headers, credentials: "include" });
      if (!res.ok) {
        setState({ ...INITIAL, loading: false });
        return;
      }
      const data = await res.json();
      const sub = data?.data?.subscription;
      if (!sub) {
        setState({ ...INITIAL, loading: false });
        return;
      }
      setState({
        loading: false,
        isActive: sub.status === "active" || sub.status === "trialing",
        planTier: sub.plan_tier,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        videosPerMonth: sub.videos_per_month ?? 0,
        maxPlayers: sub.max_players ?? 0,
        whiteLabel: sub.white_label ?? false,
        userPersona: sub.user_persona,
      });
    } catch {
      setState({ ...INITIAL, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
