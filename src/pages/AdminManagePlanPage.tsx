/**
 * AdminManagePlanPage — /admin/plans
 *
 * Allows admin to view all organizations, change plans manually,
 * and reset monthly quotas. Fase 3: SaaS without Stripe.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ArrowLeft, Shield, Users, BarChart3, RefreshCw,
  Loader2, AlertCircle, RotateCcw, Crown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  useAdminOrgs,
  useManagePlan,
  useResetQuota,
  type OrgEntry,
} from "@/hooks/useAdminOrgs";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "fredparedes58@gmail.com")
  .split(",").map((s: string) => s.trim().toLowerCase());

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

const PLAN_COLORS: Record<string, string> = {
  free: "text-muted-foreground bg-secondary",
  pro: "text-primary bg-primary/10",
  club: "text-electric bg-electric/10",
};

const PLAN_LIMITS_MAP: Record<string, { analyses: number; players: number; teamMembers: number }> = {
  free:  { analyses: 3,    players: 5,    teamMembers: 2  },
  pro:   { analyses: 20,   players: 25,   teamMembers: 5  },
  club:  { analyses: 9999, players: 9999, teamMembers: 50 },
};

export default function AdminManagePlanPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, error, refetch, isRefetching } = useAdminOrgs();
  const managePlan = useManagePlan();
  const resetQuota = useResetQuota();
  const [changingPlan, setChangingPlan] = useState<string | null>(null);

  if (!isAdmin(user?.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-xl p-6 max-w-md text-center">
          <Shield size={28} className="text-destructive mx-auto mb-2" />
          <h2 className="font-display font-bold text-lg text-foreground mb-1">{t("adminManagePlanPage.accessRestricted")}</h2>
          <p className="text-xs text-muted-foreground mb-4">
            {t("adminManagePlanPage.accessRestrictedDesc")}
          </p>
          <button
            onClick={() => navigate("/admin")}
            className="text-xs font-display font-semibold text-primary hover:underline"
          >
            {t("adminManagePlanPage.backToDashboard")}
          </button>
        </div>
      </div>
    );
  }

  const handlePlanChange = async (org: OrgEntry, newPlan: string) => {
    if (org.plan === newPlan) return;
    setChangingPlan(org.userId);
    try {
      await managePlan.mutateAsync({
        userId: org.userId,
        plan: newPlan,
        reason: `Admin manual change: ${org.plan} → ${newPlan}`,
      });
      toast.success(t("adminManagePlanPage.planChanged", { email: org.email, plan: newPlan.toUpperCase() }));
    } catch (err) {
      toast.error(t("adminManagePlanPage.errorWithMessage", { message: err instanceof Error ? err.message : t("adminManagePlanPage.unknownError") }));
    } finally {
      setChangingPlan(null);
    }
  };

  const handleResetQuota = async (org: OrgEntry) => {
    try {
      await resetQuota.mutateAsync({ userId: org.userId });
      toast.success(t("adminManagePlanPage.quotaReset", { email: org.email }));
    } catch (err) {
      toast.error(t("adminManagePlanPage.errorWithMessage", { message: err instanceof Error ? err.message : t("adminManagePlanPage.unknownError") }));
    }
  };

  // MRR calculation
  const orgs = data?.orgs ?? [];
  const proCount = orgs.filter(o => o.plan === "pro").length;
  const clubCount = orgs.filter(o => o.plan === "club").length;
  const mrr = proCount * 19 + clubCount * 79;
  const totalUsers = orgs.length;
  const conversionRate = totalUsers > 0 ? Math.round(((proCount + clubCount) / totalUsers) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-background pb-24"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/admin")}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <Crown size={18} className="text-primary" />
          <h1 className="font-display font-bold text-sm uppercase tracking-wider flex-1">
            {t("adminManagePlanPage.title")}
          </h1>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefetching ? "animate-spin text-primary" : "text-muted-foreground"} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={t("adminManagePlanPage.kpiMrr")} value={`€${mrr}`} sublabel={t("adminManagePlanPage.kpiMrrSub")} />
          <KpiCard label={t("adminManagePlanPage.kpiProUsers")} value={proCount} sublabel={t("adminManagePlanPage.revenuePerMonth", { amount: proCount * 19 })} />
          <KpiCard label={t("adminManagePlanPage.kpiClubUsers")} value={clubCount} sublabel={t("adminManagePlanPage.revenuePerMonth", { amount: clubCount * 79 })} />
          <KpiCard label={t("adminManagePlanPage.kpiConversion")} value={`${conversionRate}%`} sublabel={t("adminManagePlanPage.paidRatio", { paid: proCount + clubCount, total: totalUsers })} />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {error && !isLoading && (
          <div className="glass rounded-xl p-5 border border-destructive/30">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertCircle size={14} />
              <p className="font-display font-semibold text-sm">{t("adminManagePlanPage.errorLoadingOrgs")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
          </div>
        )}

        {/* Org Table */}
        {data && !isLoading && (
          <div className="glass rounded-xl border border-border/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/30">
              <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
                {t("adminManagePlanPage.orgsTitle", { total: data.total })}
              </h3>
              <p className="text-[10px] text-muted-foreground">{t("adminManagePlanPage.month", { month: data.month })}</p>
            </div>

            <div className="divide-y divide-border/20">
              {orgs.map((org) => {
                const limits = PLAN_LIMITS_MAP[org.plan] ?? PLAN_LIMITS_MAP.free;
                const analysisPct = limits.analyses >= 9999
                  ? 0
                  : Math.round((org.analysesUsed / limits.analyses) * 100);

                return (
                  <div key={org.userId} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-display font-semibold text-sm text-foreground truncate">
                            {org.orgName}
                          </span>
                          <span className={`text-[9px] font-display font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${PLAN_COLORS[org.plan] ?? PLAN_COLORS.free}`}>
                            {org.plan}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{org.email}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <BarChart3 size={10} />
                            {org.analysesUsed}/{limits.analyses >= 9999 ? "∞" : limits.analyses}
                            {analysisPct >= 80 && analysisPct < 100 && (
                              <span className="text-amber-500 font-bold">({analysisPct}%)</span>
                            )}
                            {analysisPct >= 100 && (
                              <span className="text-destructive font-bold">FULL</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users size={10} />
                            {t("adminManagePlanPage.members", { count: org.memberCount })}
                          </span>
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Plan selector */}
                        <select
                          value={org.plan}
                          onChange={(e) => handlePlanChange(org, e.target.value)}
                          disabled={changingPlan === org.userId}
                          className="text-xs font-display font-semibold bg-secondary/50 border border-border/30 rounded-lg px-2 py-1.5 text-foreground cursor-pointer disabled:opacity-50"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="club">Club</option>
                        </select>

                        {/* Reset quota */}
                        <button
                          onClick={() => handleResetQuota(org)}
                          disabled={resetQuota.isPending}
                          className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-primary disabled:opacity-50"
                          title={t("adminManagePlanPage.resetQuotaTitle")}
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {orgs.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-muted-foreground">{t("adminManagePlanPage.noOrgs")}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="font-display font-bold text-2xl text-foreground">{value}</p>
      {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  );
}
