/**
 * VITAS · ProPlayerMatch Component
 * Muestra el jugador profesional más similar y el top 5.
 * Usado en el informe de inteligencia y en el perfil del jugador.
 */

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Star, Zap } from "lucide-react";
import { scoreToBadge, matchNarrative, type SimilarityMatch } from "@/services/real/similarityService";

interface ProPlayerMatchProps {
  top5:      SimilarityMatch[];
  bestMatch: SimilarityMatch;
  compact?:  boolean;
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] font-mono text-foreground w-6 text-right">{value}</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const { label, color } = scoreToBadge(score);
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ color, borderColor: color, backgroundColor: `${color}15` }}
    >
      {label}
    </span>
  );
}

function BestMatchCard({ match }: { match: SimilarityMatch }) {
  const p = match.player;
  const { color } = scoreToBadge(match.score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-2xl p-4 border border-primary/20 relative overflow-hidden"
    >
      {/* Glow de fondo */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ background: `radial-gradient(circle at 30% 50%, ${color}, transparent 70%)` }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-gold shrink-0" />
            <span className="text-[10px] font-display uppercase tracking-widest text-gold">
              Clon más cercano
            </span>
          </div>
          <h3 className="text-lg font-display font-black text-foreground mt-0.5">{p.short_name}</h3>
          <p className="text-xs text-muted-foreground">{p.position} · {p.club}</p>
        </div>

        <div className="text-right shrink-0">
          <div
            className="text-3xl font-display font-black"
            style={{ color }}
          >
            {match.score.toFixed(1)}%
          </div>
          <ScoreBadge score={match.score} />
        </div>
      </div>

      {/* Métricas del pro */}
      <div className="space-y-1.5 mb-3">
        <MetricBar label="Ritmo"  value={p.pace}      color="#F59E0B" />
        <MetricBar label="Tiro"   value={p.shooting}  color="#EF4444" />
        <MetricBar label="Pase"   value={p.passing}   color="#3B82F6" />
        <MetricBar label="Téc."   value={p.dribbling} color="#8B5CF6" />
        <MetricBar label="Def."   value={p.defending} color="#22C55E" />
        <MetricBar label="Físico" value={p.physic}    color="#06B6D4" />
      </div>

      {/* Narrativa */}
      <p className="text-xs text-muted-foreground leading-relaxed italic border-t border-border pt-3">
        "{matchNarrative(match)}"
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        <Badge variant="secondary" className="text-[9px]">
          {p.nationality}
        </Badge>
        <Badge variant="secondary" className="text-[9px]">
          Overall {p.overall}
        </Badge>
        {p.league && (
          <Badge variant="secondary" className="text-[9px]">
            {p.league}
          </Badge>
        )}
      </div>
    </motion.div>
  );
}

function Top5List({ matches }: { matches: SimilarityMatch[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Star size={12} className="text-primary" />
        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
          Top 5 referencias
        </span>
      </div>

      {matches.map((m, i) => {
        const { color } = scoreToBadge(m.score);
        return (
          <motion.div
            key={m.player.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center gap-3 glass rounded-xl p-2.5"
          >
            {/* Rank */}
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}>
              <span className="text-[10px] font-bold" style={{ color }}>{i + 1}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-display font-bold text-foreground truncate">
                  {m.player.short_name}
                </span>
                <ScoreBadge score={m.score} />
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {m.player.position} · {m.player.club}
              </p>
            </div>

            {/* Score */}
            <span className="text-sm font-mono font-bold shrink-0" style={{ color }}>
              {m.score.toFixed(0)}%
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function ProPlayerMatch({ top5, bestMatch, compact = false }: ProPlayerMatchProps) {
  if (!bestMatch || top5.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <Zap size={20} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Sin datos de similitud disponibles
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <Top5List matches={top5} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BestMatchCard match={bestMatch} />
      <Top5List matches={top5.slice(1)} />
    </div>
  );
}
