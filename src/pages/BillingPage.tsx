/**
 * BillingPage — /billing
 * Plan actual, uso del mes, comparativa de planes.
 * Fase 3: Stripe-independent — admin assigns plans manually.
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Check, Zap, Users, BarChart3,
  Shield, Mail, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
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
  { label: "Analisis IA / mes",  free: "3",           pro: "20",          club: "Ilimitados"   },
  { label: "Miembros equipo",    free: "2",           pro: "5",           club: "50"           },
  { label: "VAEP · Eventos",     free: false,         pro: true,          club: true           },
  { label: "Exportar PDF",       free: false,         pro: true,          club: true           },
  { label: "Notif. push",        free: false,         pro: true,          club: true           },
  { label: "Roles / multi-user", free: false,         pro: false,         club: true           },
  { label: "Analisis Equipo",    free: false,         pro: false,         club: true           },
  { label: "Rival Scouting",     free: false,         pro: false,         club: true           },
];

// ─── Usage Bar Component ─────────────────────────────────────────────────────

function UsageBar({
  icon: Icon, label, used, limit,
}: {
  icon: React.ElementType;
  label: string;
  used: number;
  limit: number;
}) {
  const isUnlimited = limit >= 9999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isWarning = pct >= 80;
  const isDanger = pct >= 90;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-display">
        <span className="text-muted-foreground flex items-center gap-1">
          <Icon size={11} /> {label}
        </span>
        <span className="text-foreground">
          {used} / {isUnlimited ? "∞" : limit}
          {isWarning && !isDanger && (
            <span className="ml-1.5 text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">80%</span>
          )}
          {isDanger && (
            <span className="ml-1.5 text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">LIMITE</span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isDanger ? "bg-destructive" : isWarning ? "bg-amber-500" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────

const BillingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const planState = usePlan();

  // Manejar redirect desde Stripe (legacy)
  useEffect(() => {
    if (searchParams.get("success")) {
      toast.success(t("toasts.planActivated"));
    }
    if (searchParams.get("canceled")) {
      toast.info(t("toasts.paymentCanceled"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

      {/* Plan actual + Usage */}
      <motion.div
        variants={item}
        className={`glass rounded-xl p-4 border ${PLAN_BADGE[planState.plan]}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
              {t("billing.currentPlan")}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Zap size={16} className={PLAN_COLOR[planState.plan]} />
              <span className={`font-display font-bold text-2xl ${PLAN_COLOR[planState.plan]}`}>
                {PLAN_LABELS[planState.plan]}
              </span>
            </div>
          </div>
          {planState.plan !== "free" && (
            <p className={`font-display font-bold text-xl ${PLAN_COLOR[planState.plan]}`}>
              €{PLAN_PRICES[planState.plan].monthly}
              <span className="text-xs font-normal text-muted-foreground">/mes</span>
            </p>
          )}
        </div>

        {/* Usage bars */}
        <div className="space-y-3">
          <UsageBar
            icon={Users}
            label="Jugadores"
            used={planState.playerCount}
            limit={planState.limits.players}
          />
          <UsageBar
            icon={BarChart3}
            label="Analisis IA este mes"
            used={planState.analysesUsed}
            limit={planState.limits.analyses}
          />
          <UsageBar
            icon={UserPlus}
            label="Miembros equipo"
            used={planState.teamMemberCount}
            limit={planState.teamMemberLimit}
          />
        </div>
      </motion.div>

      {/* Upgrade CTA (for non-club users) */}
      {planState.plan !== "club" && (
        <motion.div variants={item} className="glass rounded-xl p-4 border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-primary" />
            <span className="font-display font-bold text-sm text-primary">
              {planState.plan === "free" ? "Desbloquea mas con Pro o Club" : "Upgrade a Club"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Para cambiar tu plan, contacta al administrador de tu academia o escribe directamente.
          </p>
          <a
            href="mailto:fredparedes58@gmail.com?subject=VITAS%20Upgrade%20Request&body=Hola%2C%20me%20gustaria%20upgrade%20mi%20plan%20VITAS."
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs hover:bg-primary/90 transition-colors"
          >
            <Mail size={12} />
            Solicitar upgrade
          </a>
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
              <div className="space-y-1.5">
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
            </div>
          );
        })}
      </motion.div>

      {/* Footer info */}
      <motion.div variants={item} className="glass rounded-xl p-4 text-center space-y-1">
        <p className="text-[10px] font-display text-muted-foreground">
          Los planes son gestionados por el administrador de la plataforma.
        </p>
        <p className="text-[10px] font-display text-muted-foreground">
          Contacta a tu admin para cambios de plan o preguntas sobre facturacion.
        </p>
      </motion.div>
    </motion.div>
  );
};

export default BillingPage;
