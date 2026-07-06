/**
 * VITAS · TacticalIndexPage
 * /tactical (sin matchId)
 *
 * Entry point:
 *   - 0 matches con heatmap → CTA "Subir video"
 *   - 1 match → auto-redirect a /tactical/<matchId>
 *   - 2+ → grid selector con fecha de cómputo
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Activity, Video, Lock, Sparkles, ChevronRight, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

import { usePlan } from "@/hooks/usePlan";
import { useTacticalMatchList, tacticalKeys } from "@/hooks/useTacticalHeatmap";
import { PlayerService } from "@/services/real/playerService";
import { AnalysisVideoUploadDialog } from "@/components/video/AnalysisVideoUploadDialog";
import { seedDemoMatch } from "@/lib/tactical/mockSeeder";

export default function TacticalIndexPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canUseBehavioral } = usePlan();
  const { data: matches = [], isLoading } = useTacticalMatchList();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const uploadTarget = useMemo(() => PlayerService.getAll()[0] ?? null, []);

  async function handleSeedDemo() {
    setSeeding(true);
    try {
      const matchId = await seedDemoMatch();
      await queryClient.invalidateQueries({ queryKey: tacticalKeys.all });
      toast.success(t("tacticalIndexPage.demoLoadedTitle"), {
        description: t("tacticalIndexPage.demoLoadedDesc"),
      });
      navigate(`/tactical/${matchId}`);
    } catch (err) {
      toast.error(t("tacticalIndexPage.demoLoadErrorTitle"), {
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setSeeding(false);
    }
  }

  // Auto-redirect if only one match
  useEffect(() => {
    if (canUseBehavioral && matches.length === 1) {
      navigate(`/tactical/${matches[0].matchId}`, { replace: true });
    }
  }, [canUseBehavioral, matches, navigate]);

  if (!canUseBehavioral) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 glass-strong border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-cyan-400" />
              <h1 className="text-lg font-display font-bold">{t("tacticalIndexPage.title")}</h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <Sparkles className="size-8 text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{t("tacticalIndexPage.proFeature")}</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {t("tacticalIndexPage.proFeatureDesc")}
          </p>
          <Button onClick={() => navigate("/billing")}>{t("tacticalIndexPage.viewPlans")}</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-cyan-400" />
              <h1 className="text-lg font-display font-bold">{t("tacticalIndexPage.title")}</h1>
            </div>
          </div>
          {uploadTarget && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Video className="size-3.5 mr-1" />
              {t("tacticalIndexPage.uploadVideo")}
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">
            {t("tacticalIndexPage.loadingMatches")}
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <Video className="size-10 text-cyan-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t("tacticalIndexPage.emptyTitle")}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
              {t("tacticalIndexPage.emptyDesc")}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              {uploadTarget ? (
                <Button onClick={() => setUploadOpen(true)} size="lg">
                  <Video className="size-4 mr-2" />
                  {t("tacticalIndexPage.uploadFirstVideo")}
                </Button>
              ) : (
                <Button onClick={() => navigate("/players/new")} size="lg">
                  {t("tacticalIndexPage.createFirstPlayer")}
                </Button>
              )}
              <Button
                onClick={handleSeedDemo}
                size="lg"
                variant="outline"
                disabled={seeding}
                className="border-cyan-500/30 hover:bg-cyan-500/10"
              >
                <Wand2 className="size-4 mr-2" />
                {seeding ? t("tacticalIndexPage.loading") : t("tacticalIndexPage.viewWithDemoData")}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              {t("tacticalIndexPage.demoHelper")}
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-5">
              <h2 className="text-base font-semibold text-foreground">
                {t("tacticalIndexPage.selectMatch")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("tacticalIndexPage.matchCount", { count: matches.length })}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matches.map((m, i) => (
                <motion.div
                  key={m.matchId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Link
                    to={`/tactical/${m.matchId}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-cyan-400/30 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="size-10 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-xs font-mono text-white shrink-0">
                      {m.matchId.slice(0, 3).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {t("tacticalIndexPage.matchLabel", { id: m.matchId.slice(0, 8) })}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {t("tacticalIndexPage.heatmapCount", { count: m.phasesCount })} · {new Date(m.computedAt ?? Date.now()).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {uploadTarget && (
          <AnalysisVideoUploadDialog
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            playerId={uploadTarget.id}
            playerName={uploadTarget.name}
            subtitle={t("tacticalIndexPage.dialogSubtitle")}
            helperText={t("tacticalIndexPage.dialogHelper")}
            successDescription={t("tacticalIndexPage.dialogSuccess")}
            invalidateKeys={[["tactical"]]}
          />
        )}
      </main>
    </div>
  );
}
