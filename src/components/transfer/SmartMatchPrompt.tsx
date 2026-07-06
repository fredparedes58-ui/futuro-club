/**
 * VITAS · SmartMatchPrompt
 *
 * Textarea + botón "Buscar con IA" que envía la descripción del comprador
 * al endpoint smart-match y muestra los matches rankeados por Claude.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { useSmartMatch } from "@/hooks/useTransferMarket";
import type { MatchScore, TransferSearchQuery } from "@/lib/transfer/transferTypes";

interface Props {
  /** Existing filters get passed as structured query alongside the prompt */
  structuredQuery?: TransferSearchQuery;
  onResults: (matches: MatchScore[], summary: string) => void;
}

const EXAMPLE_KEYS = ["example1", "example2", "example3"] as const;

export function SmartMatchPrompt({ structuredQuery, onResults }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const smartMatch = useSmartMatch();
  const examples = EXAMPLE_KEYS.map((k) => t(`smartMatchPrompt.${k}`));

  async function handleSubmit() {
    if (text.length < 10) {
      toast.error(t("smartMatchPrompt.minCharsError"));
      return;
    }
    try {
      const result = await smartMatch.mutateAsync({
        buyerNeed: {
          description: text,
          query: structuredQuery,
        },
        maxCandidates: 30,
      });
      onResults(result.topMatches, result.summary);
      toast.success(t("smartMatchPrompt.matchesFound", { count: result.topMatches.length }), {
        description: result.source === "agent" ? t("smartMatchPrompt.aiAnalysis") : t("smartMatchPrompt.simpleHeuristic"),
      });
    } catch (err) {
      toast.error(t("smartMatchPrompt.smartMatchError"), {
        description: err instanceof Error ? err.message : t("smartMatchPrompt.errorFallback"),
      });
    }
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-gradient-to-br from-cyan-500 to-purple-500">
          <Wand2 className="size-3.5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{t("smartMatchPrompt.title")}</h3>
          <p className="text-[11px] text-slate-400">
            {t("smartMatchPrompt.subtitle")}
          </p>
        </div>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("smartMatchPrompt.textareaPlaceholder")}
        rows={3}
        className="bg-white/[0.02] border-white/10 text-sm resize-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleSubmit}
          disabled={smartMatch.isPending || text.length < 10}
          className="bg-gradient-to-br from-cyan-600 to-purple-600 hover:opacity-90"
        >
          {smartMatch.isPending ? (
            <>
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              {t("smartMatchPrompt.searching")}
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 mr-1.5" />
              {t("smartMatchPrompt.searchButton")}
            </>
          )}
        </Button>

        <div className="flex flex-wrap gap-1">
          {examples.map((ex, i) => (
            <button
              key={i}
              onClick={() => setText(ex)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 truncate max-w-[200px]"
              title={ex}
            >
              {t("smartMatchPrompt.exampleLabel", { number: i + 1 })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
