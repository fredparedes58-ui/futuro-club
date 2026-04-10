/**
 * BillingPage — /billing
 * Plan actual, uso del mes y gestión de suscripción Stripe.
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Check, Zap, Users, BarChart3,
  CreditCard, Shield, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/apiAuth";
import { usePlan } from "@/hooks/usePlan";
import { PLAN_PRICES, PLAN_LABELS, type Plan } from "@/services/real/subscriptionService";
import { useTranslation } from "react-i18next";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_COLOR: Record<Plan, string> = {
  free:  "text-muted-foreground",
  pro:   "text-primary",
  club:  "text-electric",
};

const PLAN_BADGE: Record<Plan, string> = {
  free:  "bg-secondary border-border",
  pro:   "bg-primary/10 border-primary/30",
  club:  "bg-electric/10 border-electric/30",
};

interface PlanFeature {
  label: string;
  free: string | boolean;
  pro: string | boolean;
  club: string | boolean;
}

const FEATURES: PlanFeature[] = [
  { label: "Jugadores",          free: "5",           pro: "25",          club: "Ilimitados"   },
  { label: "Análisis IA / mes",  free: "3",           pro: "20",          club: "Ilimitados"   },
  { label: "VAEP · Eventos",     free: false,         pro: true,          club: true           },
  { label: "Exportar PDF",       free: false,         pro: true,          club: true           },
  { label: "Notif. push",        free: false,         pro: true,          club: true           },
  { label: "Roles / multi-user", free: false,         pro: false,         club: true           },
  { label: "Scout independiente",free: true,          pro: true,          club: true           },
  { label: "Padre / Academia",   free: "Básico",      pro: "Completo",    club: "Completo"     },
  { label: "Club profesional",   free: false,         pro: false,         club: true           },
];

// ─── Componente ───────────────────────────────────────────────────────────────

const BillingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const planState = usePlan();
  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Manejar redirect desde Stripe
  useEffect(() => {
    if (searchParams.get("success")) {
      toast.success(t("toasts.planActivated"));
    }
    if (searchParams.get("canceled")) {
      toast.info(t("toasts.paymentCanceled"));
    }
  }, [searchParams]);

  const handleUpgrade = async (plan: Plan) => {
    if (!user) return;

    const priceId =
      plan === "pro"
        ? import.meta.env.VITE_STRIPE_PRO_PRICE_ID
        : import.meta.env.VITE_STRIPE_CLUB_PRICE_ID;

    if (!priceId) {
      toast.error(t("toasts.stripeNotConfigured"));
      return;
    }

    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          priceId,
          userId: user.id,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(t("toasts.checkoutError"));
      }
    } catch {
      toast.error(t("toasts.stripeError"));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManage = async () => {
    if (!planState.stripeCustomerId) return;
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ customerId: planState.stripeCustomerId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error(t("toasts.billingPortalError"));
    } finally {
      setPortalLoading(false);
    }
  };

  const playerPct = Math.min(
    100,
    planState.limits.players >= 9999
      ? 0
      : Math.round((planState.playerCount / planState.limits.players) * 100)
  );
  const analysesPct = Math.min(
    100,
    planState.limits.analyses >= 9999
      ? 0
      : Math.round((planState.analysesUsed / planState.limits.analyses) * 100)
  );

  // Detect if Stripe is configured (price IDs exist and aren't placeholders)
  const stripeConfigured = (() => {
    const proId = import.meta.env.VITE_STRIPE_PRO_PRICE_ID ?? "";
    const clubId = import.meta.env.VITE_STRIPE_CLUB_PRICE_ID ?? "";
    return proId && !proId.includes("REEMPLAZA") && clubId && !clubId.includes("REEMPLAZA");
  })();

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-28 space-y-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-foreground">
            Plan<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground">{t("billing.subtitle")}</p>
        </div>
      </motion.div>

      {/* Plan actual */}
      <motion.div
        variants={item}
        className={`glass rounded-xl p-4 border ${PLAN_BADGE[planState.plan]}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
              {t("billing.currentPlan")}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Zap size={16} className={PLAN_COLOR[planState.plan]} />
              <span className={`font-display font-bold text-2xl ${PLAN_COLOR[planState.plan]}`}>
                {PLAN_LABELS[planState.plan]}
              </span>
              {planState.plan !== "free" && planState.currentPeriodEnd && (
                <span className="text-[10px] text-muted-foreground">
                  · {t("billing.expires", { date: new Date(planState.currentPeriodEnd).toLocaleDateString("es-ES") })}
                </span>
              )}
            </div>
          </div>
          {planState.plan !== "free" && (
            <p className={`font-display font-bold text-xl ${PLAN_COLOR[planState.plan]}`}>
              €{PLAN_PRICES[planState.plan].monthly}
              <span className="text-xs font-normal text-muted-foreground">/mes</span>
            </p>
          )}
        </div>

        {/* Uso: jugadores */}
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center justify-between text-xs font-display">
            <span className="text-muted-foreground flex items-center gap-1">
              <Users size={11} /> {t("billing.usagePlayers")}
            </span>
            <span className="text-foreground">
              {planState.playerCount} / {planState.limits.players >= 9999 ? "∞" : planState.limits.players}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${playerPct >= 90 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${playerPct}%` }}
            />
          </div>
        </div>

        {/* Uso: análisis */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-display">
            <span className="text-muted-foreground flex items-center gap-1">
              <BarChart3 size={11} /> {t("billing.usageAnalyses")}
            </span>
            <span className="text-foreground">
              {planState.analysesUsed} / {planState.limits.analyses >= 9999 ? "∞" : planState.limits.analyses}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${analysesPct >= 90 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${analysesPct}%` }}
            />
          </div>
        </div>
      </motion.div>

      {/* Gestionar suscripción (solo si tiene customerId) */}
      {planState.plan !== "free" && planState.stripeCustomerId && (
        <motion.div variants={item}>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleManage}
            disabled={portalLoading}
          >
            {portalLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <CreditCard size={14} />
            }
            {t("billing.manageSubscription")}
          </Button>
        </motion.div>
      )}

      {/* Banner: Stripe no configurado */}
      {!stripeConfigured && (
        <motion.div variants={item} className="glass rounded-xl p-4 border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={14} className="text-yellow-500" />
            <span className="font-display font-bold text-sm text-yellow-500">{t("billing.stripeNotConfigured")}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("billing.stripeNotConfiguredDesc")}
          </p>
        </motion.div>
      )}

      {/* Comparativa de planes */}
      <motion.div variants={item} className="space-y-3">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          {t("billing.comparePlans")}
        </h2>

        {(["free", "pro", "club"] as Plan[]).map((plan) => {
          const isCurrentPlan = planState.plan === plan;
          const price = PLAN_PRICES[plan].monthly;
          const canUpgrade =
            (plan === "pro" && planState.plan === "free") ||
            (plan === "club" && planState.plan !== "club");

          return (
            <div
              key={plan}
              className={`glass rounded-xl p-4 border transition-all ${
                isCurrentPlan
                  ? PLAN_BADGE[plan]
                  : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield size={14} className={isCurrentPlan ? PLAN_COLOR[plan] : "text-muted-foreground"} />
                  <span className={`font-display font-bold text-base ${isCurrentPlan ? PLAN_COLOR[plan] : "text-foreground"}`}>
                    {PLAN_LABELS[plan]}
                  </span>
                  {isCurrentPlan && (
                    <span className="text-[9px] font-display font-bold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      {t("common.active")}
                    </span>
                  )}
                </div>
                <p className="font-display font-bold text-lg text-foreground">
                  {price === 0 ? t("common.free") : `€${price}`}
                  {price > 0 && <span className="text-[10px] font-normal text-muted-foreground">{t("common.perMonth")}</span>}
                </p>
              </div>

              {/* Features */}
              <div className="space-y-1.5 mb-3">
                {FEATURES.map((f) => {
                  const val = f[plan];
                  if (val === false) return null;
                  return (
                    <div key={f.label} className="flex items-center gap-2 text-xs font-display">
                      <Check size={11} className="text-primary shrink-0" />
                      <span className="text-muted-foreground">
                        {f.label}
                        {typeof val === "string" && val !== "true" && (
                          <span className="text-foreground ml-1 font-semibold">{val}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {canUpgrade && (
                <Button
                  className="w-full gap-2"
                  variant={plan === "club" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleUpgrade(plan)}
                  disabled={checkoutLoading === plan}
                >
                  {checkoutLoading === plan
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Zap size={12} />
                  }
                  {t("billing.upgradeTo", { plan: PLAN_LABELS[plan] })}
                </Button>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* Footer info */}
      <motion.div variants={item} className="glass rounded-xl p-4 text-center space-y-1">
        <p className="text-[10px] font-display text-muted-foreground">
          {t("billing.footer.stripe")}
        </p>
        <p className="text-[10px] font-display text-muted-foreground">
          {t("billing.footer.cancelAnytime")}
        </p>
      </motion.div>
    </motion.div>
  );
};

export default BillingPage;
