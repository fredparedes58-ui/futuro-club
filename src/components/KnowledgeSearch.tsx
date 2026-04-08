/**
 * KnowledgeSearch — Widget de busqueda RAG
 * Consulta /api/rag/query con debounce y muestra resultados con score de similitud.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, BookOpen, Loader2, X } from "lucide-react";

/* ── Types ───────────────────────────────────────────────── */

interface RagResult {
  id: string;
  content: string;
  category: string;
  metadata: any;
  similarity: number;
}

interface KnowledgeSearchProps {
  onSelectResult?: (result: { content: string; category: string }) => void;
  className?: string;
  compact?: boolean;
}

/* ── Category config ─────────────────────────────────────── */

const CATEGORIES = [
  { label: "Todos", value: null },
  { label: "Drills", value: "drill" },
  { label: "Metodología", value: "methodology" },
  { label: "Scouting", value: "scouting" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  drill: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  methodology: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  scouting: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

/* ── Component ───────────────────────────────────────────── */

export default function KnowledgeSearch({
  onSelectResult,
  className = "",
  compact = false,
}: KnowledgeSearchProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [results, setResults] = useState<RagResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pad = compact ? "px-3 py-2" : "px-4 py-3";
  const textSm = compact ? "text-xs" : "text-sm";

  /* ── Fetch ──────────────────────────────────────────────── */

  const fetchResults = useCallback(
    async (q: string, cat: string | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const body: Record<string, unknown> = { query: q, limit: 10 };
        if (cat) body.category = cat;

        const res = await fetch("/api/rag/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Error ${res.status}`);

        const data = await res.json();
        setResults(data.results ?? []);
        setSearched(true);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setError("No se pudo conectar con la base de conocimiento.");
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /* ── Debounce trigger ──────────────────────────────────── */

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 3) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchResults(query.trim(), category);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, category, fetchResults]);

  /* ── Clear ──────────────────────────────────────────────── */

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setError(null);
  };

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search input */}
      <div className={`glass rounded-xl flex items-center gap-2 ${pad} border border-white/10`}>
        <Search size={compact ? 14 : 16} className="text-white/40 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ejercicios, metodologías..."
          className={`flex-1 bg-transparent outline-none ${textSm} text-white placeholder:text-white/30`}
        />
        {query && (
          <button onClick={handleClear} className="text-white/40 hover:text-white/70 transition-colors">
            <X size={compact ? 12 : 14} />
          </button>
        )}
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => {
          const active = category === cat.value;
          return (
            <button
              key={cat.label}
              onClick={() => setCategory(cat.value)}
              className={`
                ${compact ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1"}
                rounded-full font-semibold transition-all border
                ${
                  active
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                    : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/70"
                }
              `}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className={`flex items-center justify-center gap-2 ${pad} text-white/50`}>
          <Loader2 size={16} className="animate-spin" />
          <span className={textSm}>Buscando...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`glass rounded-xl ${pad} border border-red-500/20 text-red-400 ${textSm}`}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && searched && results.length === 0 && (
        <div className={`glass rounded-xl ${pad} border border-white/10 text-center text-white/40 ${textSm}`}>
          No se encontraron resultados
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelectResult?.({ content: r.content, category: r.category })}
              className={`
                glass w-full text-left rounded-xl ${pad} border border-white/10
                hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group
              `}
            >
              {/* Header: category badge + similarity */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`
                    ${compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"}
                    rounded-full font-bold uppercase tracking-wider border
                    ${CATEGORY_COLORS[r.category] ?? "bg-white/10 text-white/50 border-white/20"}
                  `}
                >
                  {r.category}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className={`${compact ? "w-12" : "w-16"} h-1 bg-white/10 rounded-full overflow-hidden`}>
                    <div
                      className="h-full bg-indigo-400 rounded-full transition-all"
                      style={{ width: `${Math.round(r.similarity * 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-white/40">
                    {Math.round(r.similarity * 100)}%
                  </span>
                </div>
              </div>

              {/* Content preview */}
              <p className={`${textSm} text-white/70 leading-relaxed group-hover:text-white/90 transition-colors`}>
                {r.content.length > 120 ? r.content.slice(0, 120) + "..." : r.content}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Idle hint */}
      {!searched && !loading && query.length === 0 && (
        <div className={`flex flex-col items-center gap-2 ${pad} text-white/30`}>
          <BookOpen size={compact ? 18 : 24} className="opacity-40" />
          <span className={`${compact ? "text-[10px]" : "text-xs"} font-display`}>
            Escribe 3+ caracteres para buscar
          </span>
        </div>
      )}
    </div>
  );
}
