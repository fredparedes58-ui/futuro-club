/**
 * VITAS Subscription Service
 * Gestiona el plan del usuario (free / pro / club) y sus límites.
 * localStorage como cache; Supabase como fuente de verdad.
 */

import { StorageService } from "./storageService";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "club";

export interface PlanLimits {
  players: number;        // max jugadores (-1 = unlimited stored as Infinity)
  analyses: number;       // análisis IA por mes
  vaep: boolean;
  pdf: boolean;
  roles: boolean;
  pushNotifications: boolean;
}

export interface Subscription {
  plan: Plan;
  status: "active" | "canceled" | "past_due" | "trialing";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

// ─── Configuración de planes ──────────────────────────────────────────────────

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    players: 5,
    analyses: 3,
    vaep: false,
    pdf: false,
    roles: false,
    pushNotifications: false,
  },
  pro: {
    players: 25,
    analyses: 20,
    vaep: true,
    pdf: true,
    roles: false,
    pushNotifications: true,
  },
  club: {
    players: 9999,        // efectivamente ilimitado
    analyses: 9999,
    vaep: true,
    pdf: true,
    roles: true,
    pushNotifications: true,
  },
};

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  club: "Club",
};

export const PLAN_PRICES: Record<Plan, { monthly: number; currency: string }> = {
  free:  { monthly: 0,  currency: "EUR" },
  pro:   { monthly: 19, currency: "EUR" },
  club:  { monthly: 79, currency: "EUR" },
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_KEY    = "subscription";
const ANALYSES_KEY   = "analyses_month";

const DEFAULT_SUBSCRIPTION: Subscription = {
  plan: "free",
  status: "active",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  updatedAt: new Date().toISOString(),
};

// ─── SubscriptionService ──────────────────────────────────────────────────────

export const SubscriptionService = {
  // ── Lectura ────────────────────────────────────────────────────────────────

  getCurrent(): Subscription {
    return StorageService.get<Subscription>(STORAGE_KEY, DEFAULT_SUBSCRIPTION);
  },

  getPlan(): Plan {
    return this.getCurrent().plan;
  },

  getLimits(): PlanLimits {
    return PLAN_LIMITS[this.getPlan()];
  },

  // ── Escritura ─────────────────────────────────────────────────────────────

  update(sub: Partial<Subscription>): void {
    const current = this.getCurrent();
    StorageService.set<Subscription>(STORAGE_KEY, {
      ...current,
      ...sub,
      updatedAt: new Date().toISOString(),
    });
  },

  // ── Feature gates ─────────────────────────────────────────────────────────

  canAddPlayer(currentCount: number): boolean {
    return currentCount < this.getLimits().players;
  },

  canRunAnalysis(): boolean {
    return this.getAnalysesUsedThisMonth() < this.getLimits().analyses;
  },

  // ── Uso mensual ───────────────────────────────────────────────────────────

  getAnalysesUsedThisMonth(): number {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const data = StorageService.get<{ month: string; count: number }>(
      ANALYSES_KEY,
      { month: currentMonth, count: 0 }
    );
    return data.month === currentMonth ? data.count : 0;
  },

  incrementAnalysisCount(): void {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const data = StorageService.get<{ month: string; count: number }>(
      ANALYSES_KEY,
      { month: currentMonth, count: 0 }
    );
    const count = data.month === currentMonth ? data.count + 1 : 1;
    StorageService.set(ANALYSES_KEY, { month: currentMonth, count });
  },

  // ── Sync con Supabase ─────────────────────────────────────────────────────

  async syncFromSupabase(userId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (data) {
        this.update({
          plan: data.plan as Plan,
          status: data.status,
          stripeCustomerId: data.stripe_customer_id,
          stripeSubscriptionId: data.stripe_subscription_id,
          currentPeriodEnd: data.current_period_end,
        });
      }
    } catch {
      // Silently fail — usa plan cacheado en localStorage
    }
  },
};
