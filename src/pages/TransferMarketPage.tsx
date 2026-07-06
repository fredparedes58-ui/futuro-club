/**
 * VITAS · TransferMarketPage
 * /transfer
 *
 * Marketplace principal. Grid de listings + sidebar de filtros + SmartMatch.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Lock, Sparkles, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { usePlan } from "@/hooks/usePlan";
import { useListings } from "@/hooks/useTransferMarket";
import { ListingCard } from "@/components/transfer/ListingCard";
import { TransferFilters } from "@/components/transfer/TransferFilters";
import { SmartMatchPrompt } from "@/components/transfer/SmartMatchPrompt";
import { seedDemoListings } from "@/lib/transfer/mockSeeder";
import { useQueryClient } from "@tanstack/react-query";
import { transferKeys } from "@/hooks/useTransferMarket";
import type { MatchScore, TransferSearchQuery } from "@/lib/transfer/transferTypes";

export default function TransferMarketPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canUseBehavioral } = usePlan(); // same gate as other Pro+
  const [query, setQuery] = useState<TransferSearchQuery>({});
  const [matches, setMatches] = useState<MatchScore[]>([]);
  const [matchSummary, setMatchSummary] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const { data: listings = [], isLoading } = useListings(query);

  // Map matchScore by listingId for fast lookup
  const matchScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of matches) map.set(m.listingId, m.score);
    return map;
  }, [matches]);

  const sortedListings = useMemo(() => {
    if (matches.length === 0) return listings;
    // Apply IA ranking: matched listings first by score desc, then unmatched
    const matched = listings
      .filter((l) => matchScoreMap.has(l.id))
      .sort((a, b) => (matchScoreMap.get(b.id) ?? 0) - (matchScoreMap.get(a.id) ?? 0));
    const unmatched = listings.filter((l) => !matchScoreMap.has(l.id));
    return [...matched, ...unmatched];
  }, [listings, matches, matchScoreMap]);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemoListings();
      await queryClient.invalidateQueries({ queryKey: transferKeys.all });
      toast.success(t("transferMarketPage.demoLoaded", { count: 8 }));
    } catch (err) {
      toast.error(t("transferMarketPage.demoLoadError"), {
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setSeeding(false);
    }
  }

  if (!canUseBehavioral) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 glass-strong border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-lg font-display font-bold">Transfer Intelligence</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <Lock className="size-8 text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold mb-2">{t("transferMarketPage.proFeatureTitle")}</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
            {t("transferMarketPage.proFeatureDesc")}
          </p>
          <Button onClick={() => navigate("/billing")}>{t("transferMarketPage.viewPlans")}</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-lg font-display font-bold">Transfer Intelligence</h1>
          </div>
          <div className="flex gap-2">
            {listings.length === 0 && (
              <Button onClick={handleSeed} variant="outline" size="sm" disabled={seeding}>
                <Wand2 className="size-3.5 mr-1.5" />
                {seeding ? t("transferMarketPage.loading") : t("transferMarketPage.demoData")}
              </Button>
            )}
            <Button onClick={() => navigate("/transfer/new")} size="sm">
              <Plus className="size-3.5 mr-1.5" />
              {t("transferMarketPage.publishPlayer")}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar filters */}
          <aside className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3">
                {t("transferMarketPage.filters")}
              </h3>
              <TransferFilters value={query} onChange={setQuery} />
            </div>
          </aside>

          {/* Main */}
          <section className="space-y-4">
            <SmartMatchPrompt
              structuredQuery={query}
              onResults={(m, s) => {
                setMatches(m);
                setMatchSummary(s);
              }}
            />

            {matchSummary && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200"
              >
                <Sparkles className="size-3.5 inline mr-1.5" />
                {matchSummary}
              </motion.div>
            )}

            {isLoading ? (
              <div className="text-center text-muted-foreground py-12">
                {t("transferMarketPage.loadingListings")}
              </div>
            ) : sortedListings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
                <h2 className="text-lg font-semibold mb-2">
                  {t("transferMarketPage.noMatchingListings")}
                </h2>
                <p className="text-sm text-muted-foreground mb-5">
                  {t("transferMarketPage.noListingsDesc")}
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => navigate("/transfer/new")}>
                    <Plus className="size-4 mr-2" />
                    {t("transferMarketPage.publishPlayer")}
                  </Button>
                  <Button variant="outline" onClick={handleSeed} disabled={seeding}>
                    <Wand2 className="size-4 mr-2" />
                    {seeding ? t("transferMarketPage.loading") : t("transferMarketPage.loadDemo")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {sortedListings.map((l) => (
                  <ListingCard key={l.id} listing={l} matchScore={matchScoreMap.get(l.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
