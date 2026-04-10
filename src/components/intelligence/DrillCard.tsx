/**
 * DrillCard — Card individual para un drill recomendado del RAG
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, ThumbsUp, ThumbsDown } from "lucide-react";
import { getAuthHeaders } from "@/lib/apiAuth";
import { Badge } from "@/components/ui/badge";
import { observability } from "@/services/real/observabilityAdapter";

interface DrillCardProps {
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
  traceId?: string;
}

export default function DrillCard({ content, similarity, metadata, traceId }: DrillCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<"up" | "down" | null>(null);

  const title = (metadata?.title as string) ?? content.split("\n")[0]?.slice(0, 80) ?? "Ejercicio";
  const category = (metadata?.category as string) ?? "drill";
  const ageRange = metadata?.ageRange as string | undefined;
  const truncated = content.length > 150;
  const displayContent = expanded ? content : content.slice(0, 150);

  const relevanceColor =
    similarity >= 0.85 ? "text-green-400" :
    similarity >= 0.7  ? "text-amber-400" : "text-muted-foreground";

  return (
    <div className="glass rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">
          {title}
        </p>
        <span className={`text-[9px] font-mono font-bold ${relevanceColor} shrink-0`}>
          {Math.round(similarity * 100)}%
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="secondary" className="text-[8px] px-1.5 py-0">
          {category}
        </Badge>
        {ageRange && (
          <Badge variant="outline" className="text-[8px] px-1.5 py-0">
            {ageRange}
          </Badge>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-line">
        {displayContent}
        {truncated && !expanded && "..."}
      </p>

      {truncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[9px] text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}

      {traceId && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          <span className="text-[8px] text-muted-foreground">Útil?</span>
          <button
            onClick={() => {
              setFeedbackGiven("up");
              observability.recordFeedback(traceId, 5, "drill_useful");
              getAuthHeaders().then(h => fetch("/api/rag/feedback", {
                method: "POST",
                headers: h,
                body: JSON.stringify({ traceId, score: 5, comment: "drill_useful" }),
              })).catch(() => {});
            }}
            disabled={feedbackGiven !== null}
            className={`p-0.5 rounded transition-colors ${
              feedbackGiven === "up" ? "text-green-400" : "text-muted-foreground/50 hover:text-green-400"
            }`}
          >
            <ThumbsUp size={10} />
          </button>
          <button
            onClick={() => {
              setFeedbackGiven("down");
              observability.recordFeedback(traceId, 1, "drill_not_useful");
              getAuthHeaders().then(h => fetch("/api/rag/feedback", {
                method: "POST",
                headers: h,
                body: JSON.stringify({ traceId, score: 1, comment: "drill_not_useful" }),
              })).catch(() => {});
            }}
            disabled={feedbackGiven !== null}
            className={`p-0.5 rounded transition-colors ${
              feedbackGiven === "down" ? "text-red-400" : "text-muted-foreground/50 hover:text-red-400"
            }`}
          >
            <ThumbsDown size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
