/**
 * VITAS · SmartMatchPrompt
 *
 * Textarea + botón "Buscar con IA" que envía la descripción del comprador
 * al endpoint smart-match y muestra los matches rankeados por Claude.
 */
import { useState } from "react";
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

const EXAMPLES = [
  "Necesito un central zurdo sub-19 con liderazgo y juego aéreo. Presupuesto 400k.",
  "Busco un mediocampista creativo con perfil PHV tardío para proyecto largo.",
  "Extremo rápido sub-18 para cesión 1 año. Tercera división, equipo en construcción.",
];

export function SmartMatchPrompt({ structuredQuery, onResults }: Props) {
  const [text, setText] = useState("");
  const smartMatch = useSmartMatch();

  async function handleSubmit() {
    if (text.length < 10) {
      toast.error("Describe la necesidad con al menos 10 caracteres.");
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
      toast.success(`${result.topMatches.length} matches encontrados`, {
        description: result.source === "agent" ? "Análisis IA con Claude Sonnet" : "Heurística simple",
      });
    } catch (err) {
      toast.error("No se pudo ejecutar el smart match", {
        description: err instanceof Error ? err.message : "Error",
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
          <h3 className="text-sm font-semibold text-white">Smart Match con IA</h3>
          <p className="text-[11px] text-slate-400">
            Describe lo que buscas. Claude rankea los listings disponibles.
          </p>
        </div>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="ej. Necesito un central zurdo sub-19 con liderazgo para Segunda B…"
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
              Buscando…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 mr-1.5" />
              Buscar con IA
            </>
          )}
        </Button>

        <div className="flex flex-wrap gap-1">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setText(ex)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 truncate max-w-[200px]"
              title={ex}
            >
              Ejemplo {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
