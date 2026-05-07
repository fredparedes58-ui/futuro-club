/**
 * VITAS · Live Match Summary Page (Sprint B2 · día 4)
 * /live/:matchId/summary
 *
 * Llamado tras pitido final (auto-redirect desde LiveMatchPage al
 * pasar status='finished'). Invoca POST /api/live/aggregate que
 * genera 3 reportes Claude y los cachea en analysis_result.
 *
 * Visual: stats por jugador + 3 secciones (resumen, players, tactical).
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, AlertCircle, Trophy, Star, TrendingUp, TrendingDown,
  Sparkles, Brain, Users, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/apiAuth";

interface PlayerStat {
  playerId: string | null;
  playerName: string;
  goles: number;
  asistencias: number;
  pases_clave: number;
  recuperaciones: number;
  perdidas: number;
  duelos_ganados: number;
  duelos_perdidos: number;
  tarjetas: number;
  totalEvents: number;
  netImpact: number;
}

interface AnalysisResult {
  generated_at: string;
  stats_by_player: PlayerStat[];
  total_events: number;
  reports: Array<{ type: string; content: Record<string, unknown>; model: string }>;
}

interface AggregateResponse {
  cached: boolean;
  match: {
    id: string;
    status: string;
    score_home: number;
    score_away: number;
    duration_seconds: number;
    team_name: string;
    opponent_name: string | null;
  };
  analysis: AnalysisResult;
}

export default function LiveSummaryPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let mounted = true;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/live/aggregate?matchId=${matchId}`, {
          method: "POST",
          headers,
        });
        const json = await res.json();
        if (!mounted) return;
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? "Error generando análisis");
        }
        setData(json.data as AggregateResponse);
        if (!json.data.cached) {
          toast.success(`✓ ${json.data.analysis.reports.length}/3 reportes · ${json.data.analysis.total_events} eventos`);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [matchId]);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    return `${m}min`;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm font-display font-bold text-foreground">Generando análisis…</p>
        <p className="text-[11px] text-muted-foreground">Claude procesando ~15-25s</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle size={28} className="text-destructive" />
        <h1 className="text-base font-display font-bold text-foreground">No se pudo generar</h1>
        <p className="text-xs text-muted-foreground max-w-sm">{error ?? "Error desconocido"}</p>
        <button onClick={() => navigate("/live")} className="text-xs font-bold text-primary mt-3">
          ← Volver a partidos
        </button>
      </div>
    );
  }

  const { match, analysis } = data;
  const teamSummary = analysis.reports.find((r) => r.type === "team-summary")?.content ?? {};
  const playerInsights = analysis.reports.find((r) => r.type === "per-player")?.content as
    | { players?: Array<{ player_name: string; rating: number; summary: string; highlight: string }> } | undefined;
  const tactical = analysis.reports.find((r) => r.type === "tactical-take")?.content ?? {};

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/live")} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">
              {match.team_name} {match.opponent_name && `vs ${match.opponent_name}`}
            </h1>
            <p className="text-[10px] text-muted-foreground">Resumen del partido · IA</p>
          </div>
          <Trophy size={18} className="text-gold" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto">
        {/* Score banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 text-center bg-gradient-to-br from-primary/15 via-electric/10 to-transparent"
        >
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
            Resultado
          </div>
          <div className="font-display font-bold text-5xl text-foreground leading-none">
            {match.score_home}<span className="text-muted-foreground mx-2">−</span>{match.score_away}
          </div>
          <div className="text-[11px] mt-2 text-muted-foreground">
            {fmt(match.duration_seconds)} · {analysis.total_events} eventos · {analysis.reports.length}/3 reportes
          </div>
          {teamSummary.result_phrase ? (
            <div className="text-sm font-display font-bold text-foreground mt-2">{teamSummary.result_phrase as string}</div>
          ) : null}
        </motion.div>

        {/* MVP */}
        {teamSummary.mvp ? (
          <div className="glass rounded-2xl p-4 border-2 border-gold/40 bg-gold/5">
            <div className="flex items-center gap-2 mb-2">
              <Star size={14} className="text-gold" />
              <span className="text-[10px] uppercase tracking-widest text-gold font-bold">MVP del partido</span>
            </div>
            <div className="font-display font-bold text-base text-foreground">
              {(teamSummary.mvp as { player_name?: string }).player_name}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(teamSummary.mvp as { reason?: string }).reason}
            </p>
          </div>
        ) : null}

        {/* Team summary */}
        <Section title="Resumen del equipo" Icon={Brain} color="#0066CC">
          {teamSummary.key_moments && Array.isArray(teamSummary.key_moments) && (
            <div>
              <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Momentos clave</h5>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-foreground">
                {(teamSummary.key_moments as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {teamSummary.team_strengths && Array.isArray(teamSummary.team_strengths) && (
            <div>
              <h5 className="text-[10px] uppercase tracking-wider text-green-400 font-bold mb-1">✓ Fortalezas</h5>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-foreground">
                {(teamSummary.team_strengths as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {teamSummary.team_weaknesses && Array.isArray(teamSummary.team_weaknesses) && (
            <div>
              <h5 className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">⚠ Debilidades</h5>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-foreground">
                {(teamSummary.team_weaknesses as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {teamSummary.next_focus ? (
            <div className="rounded-lg bg-primary/10 border border-primary/30 p-2 text-xs">
              <strong className="text-primary">Próximo foco:</strong>{" "}
              <span className="text-foreground">{teamSummary.next_focus as string}</span>
            </div>
          ) : null}
        </Section>

        {/* Stats por jugador */}
        <Section title="Stats por jugador" Icon={Users} color="#B82BD9">
          <div className="space-y-2">
            {analysis.stats_by_player.filter((s) => s.totalEvents > 0).map((s) => {
              const insight = playerInsights?.players?.find((p) => p.player_name === s.playerName);
              return (
                <div key={s.playerId ?? "team"} className="rounded-lg bg-secondary/30 border border-border p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-display font-bold text-sm text-foreground">{s.playerName}</div>
                    <div className="flex items-center gap-2">
                      {insight && (
                        <span className="text-[10px] text-muted-foreground">
                          rating <span className="font-display font-bold text-foreground text-base">{insight.rating}</span>/10
                        </span>
                      )}
                      <span className={`text-[11px] font-display font-bold ${s.netImpact > 0 ? "text-green-400" : s.netImpact < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {s.netImpact > 0 ? <TrendingUp size={10} className="inline" /> : <TrendingDown size={10} className="inline" />}
                        {s.netImpact > 0 ? "+" : ""}{s.netImpact.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-[10px] text-muted-foreground mb-1.5">
                    <Stat label="Gol"     value={s.goles} highlight={s.goles > 0} />
                    <Stat label="Asist"   value={s.asistencias} highlight={s.asistencias > 0} />
                    <Stat label="Pase+"   value={s.pases_clave} highlight={s.pases_clave > 0} />
                    <Stat label="Recup"   value={s.recuperaciones} />
                    <Stat label="Pérd"    value={s.perdidas} />
                    <Stat label="Duelo+"  value={s.duelos_ganados} />
                    <Stat label="Duelo−"  value={s.duelos_perdidos} />
                    <Stat label="Tarj"    value={s.tarjetas} />
                  </div>
                  {insight?.summary && (
                    <p className="text-[11px] text-foreground/90 leading-relaxed mt-1.5 pt-1.5 border-t border-border/40">
                      {insight.summary}
                    </p>
                  )}
                  {insight?.highlight && (
                    <p className="text-[10px] text-primary mt-0.5">
                      <Star size={9} className="inline mr-0.5" /> {insight.highlight}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Tactical take */}
        <Section title="Lectura táctica" Icon={ClipboardList} color="#22e88c">
          {tactical.what_worked && Array.isArray(tactical.what_worked) && (
            <div>
              <h5 className="text-[10px] uppercase tracking-wider text-green-400 font-bold mb-1">Funcionó</h5>
              <ul className="list-disc list-inside text-xs text-foreground space-y-0.5">
                {(tactical.what_worked as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {tactical.what_didnt && Array.isArray(tactical.what_didnt) && (
            <div>
              <h5 className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">Falló</h5>
              <ul className="list-disc list-inside text-xs text-foreground space-y-0.5">
                {(tactical.what_didnt as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {tactical.next_match_adjustment ? (
            <div className="rounded-lg bg-electric/10 border border-electric/30 p-2 text-xs">
              <strong className="text-electric">Ajuste próximo partido:</strong>{" "}
              <span className="text-foreground">{tactical.next_match_adjustment as string}</span>
            </div>
          ) : null}
          {tactical.recommended_drills && Array.isArray(tactical.recommended_drills) && (
            <div>
              <h5 className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">
                <Sparkles size={10} className="inline mr-0.5" />Drills recomendados
              </h5>
              <ul className="list-disc list-inside text-xs text-foreground space-y-0.5">
                {(tactical.recommended_drills as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, Icon, color, children }: {
  title: string; Icon: React.ComponentType<{ size?: number; className?: string }>; color: string; children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon size={14} style={{ color }} />
        </div>
        <h2 className="font-display font-bold text-sm text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`text-center rounded p-1 ${highlight ? "bg-primary/10" : ""}`}>
      <div className={`text-[8px] uppercase tracking-wider ${highlight ? "text-primary" : "text-muted-foreground"} font-bold`}>{label}</div>
      <div className={`font-display font-bold text-sm ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
