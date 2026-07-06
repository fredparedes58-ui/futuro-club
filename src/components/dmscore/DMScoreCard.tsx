/**
 * VITAS · DMScoreCard — Decision-Making Score (Sprint 1.1)
 *
 * Score compuesto 0-100 con breakdown por componente, confianza y narrativa.
 * Explicable por diseño (anti caja-negra): cada punto es trazable a su fuente.
 */
import { motion } from "framer-motion";
import { Brain, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DMScoreResult } from "@/lib/dmscore";

interface Props {
  result: DMScoreResult;
}

const SOURCE_LABEL_KEY: Record<string, string> = {
  real: "sourceReal",
  mock: "sourceMock",
  bpe: "sourceBpe",
  video: "sourceVideo",
  desconocida: "sourceUnknown",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 65) return "text-cyan-400";
  if (score >= 45) return "text-amber-400";
  return "text-rose-400";
}

export function DMScoreCard({ result }: Props) {
  const { t } = useTranslation();
  // ── Empty state: faltan señales ──
  if (result.score == null) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="size-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Decision-Making Score</h3>
        </div>
        <p className="text-xs text-muted-foreground">{result.narrative}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 p-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-gradient-to-br from-cyan-500 to-purple-500">
            <Brain className="size-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-tight">
              Decision-Making Score
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {t("dmScoreCard.subtitle")}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {t("dmScoreCard.confidence", { count: Math.round(result.confidence * 100) })}
        </Badge>
      </div>

      {/* Score grande + breakdown */}
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-center">
          <div className={cn("text-4xl font-bold tabular-nums leading-none", scoreColor(result.score))}>
            {result.score}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">/100</div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {result.breakdown.map((b) => (
            <div key={b.key}>
              <div className="flex items-baseline justify-between text-[11px] mb-0.5">
                <span className="text-muted-foreground truncate">{b.label}</span>
                <span className="font-mono text-foreground shrink-0 ml-2">
                  {b.value}
                  <span className="text-muted-foreground/60 ml-1">
                    ×{Math.round(b.weight * 100)}%
                  </span>
                </span>
              </div>
              <Progress value={b.value} className="h-1" />
              <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                {t("dmScoreCard.sourceLabel", {
                  source: SOURCE_LABEL_KEY[b.source]
                    ? t(`dmScoreCard.${SOURCE_LABEL_KEY[b.source]}`)
                    : b.source,
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Narrativa */}
      <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-white/[0.03] border border-white/5 p-2">
        <Info className="size-3 text-cyan-300 shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-snug">{result.narrative}</p>
      </div>
    </motion.div>
  );
}
