/**
 * VITAS · Shared Analysis Page (público · sin auth)
 * /share/analysis/:analysisId?t=<token>
 *
 * Vista de solo lectura del dashboard de análisis para padres / coaches
 * que reciben el link por WhatsApp. Valida HMAC token contra
 * /api/analyses/share. Sin login required.
 */

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, Brain } from "lucide-react";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";

interface SharedData {
  analysis: { id: string; player_id: string };
  player: { name?: string; position?: string; age?: number } | null;
  reports: Array<{ report_type: string; content: Record<string, unknown> }>;
}

export default function SharedAnalysisPage() {
  const { t } = useTranslation();
  const { analysisId } = useParams<{ analysisId: string }>();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!analysisId || !token) {
      setError(t("sharedAnalysisPage.invalidLinkMissingToken"));
      setLoading(false);
      return;
    }

    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`/api/analyses/share?analysisId=${analysisId}&t=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!mounted) return;
        if (!res.ok || !json.success) {
          setError(json?.error?.message ?? t("sharedAnalysisPage.invalidOrExpiredLink"));
        } else {
          setData(json.data as SharedData);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : t("sharedAnalysisPage.networkError"));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [analysisId, token, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">{t("sharedAnalysisPage.loadingAnalysis")}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle size={28} className="text-destructive" />
        <h1 className="text-base font-display font-bold text-foreground">{t("sharedAnalysisPage.linkUnavailable")}</h1>
        <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
        <a href="/" className="text-xs font-bold text-primary mt-3 hover:text-primary/80">
          {t("sharedAnalysisPage.goToVitas")}
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Public header · sin BottomNav */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Brain size={18} className="text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">
              {data.player?.name ?? t("sharedAnalysisPage.player")}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              {t("sharedAnalysisPage.vitasAnalysisPublicView")}
              {data.player?.position && ` · ${data.player.position}`}
              {data.player?.age && ` · ${data.player.age}${t("sharedAnalysisPage.ageSuffix")}`}
            </p>
          </div>
          <a
            href="/"
            className="text-[10px] font-display font-bold text-primary hover:text-primary/80 px-2 py-1 rounded border border-primary/30"
          >
            VITAS
          </a>
        </div>
      </div>

      <div className="px-4 py-4 max-w-3xl mx-auto">
        {analysisId && <AnalysisDashboard analysisId={analysisId} shareToken={token} />}
      </div>

      {/* Watermark footer */}
      <div className="mt-8 max-w-3xl mx-auto px-4">
        <div className="text-center text-[10px] text-muted-foreground">
          {t("sharedAnalysisPage.generatedBy")} <a href="/" className="text-primary font-bold">VITAS · Football Intelligence</a>
        </div>
      </div>
    </div>
  );
}
