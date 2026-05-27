/**
 * VITAS · Live Hub Page (Sprint B2)
 * /live
 *
 * Entry point del Match-day Live Mode:
 *   - Lista los partidos previos del usuario
 *   - Botón grande "Nuevo partido" con form mínimo
 *   - Click en un partido → /live/:matchId (continuar) o /live/:matchId/summary (terminado)
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Plus, Play, Trophy, Clock, Loader2, Sparkles,
  Activity, Square,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/apiAuth";
import { createLiveMatch } from "@/hooks/useLiveMatch";

interface MatchSummary {
  id: string;
  team_name: string;
  opponent_name: string | null;
  status: "live" | "paused" | "finished" | "aborted";
  duration_seconds: number;
  score_home: number;
  score_away: number;
  created_at: string;
  ended_at: string | null;
}

const STATUS_META: Record<MatchSummary["status"], { label: string; color: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  live:     { label: "EN VIVO",  color: "#22e88c", Icon: Play },
  paused:   { label: "PAUSADO",  color: "#F59E0B", Icon: Clock },
  finished: { label: "FINALIZADO", color: "#1A8FFF", Icon: Trophy },
  aborted:  { label: "CANCELADO", color: "#EF4444", Icon: Square },
};

export default function LiveHubPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [opponentName, setOpponentName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/live/matches", { headers });
        const data = await res.json();
        if (res.ok && data.success) {
          setMatches(data.data.matches as MatchSummary[]);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createLiveMatch({
        teamName: teamName.trim() || undefined,
        opponentName: opponentName.trim() || undefined,
      });
      if (!id) throw new Error("No se pudo crear");
      toast.success("⚽ Partido iniciado");
      navigate(`/live/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear");
      setCreating(false);
    }
  }

  function fmtDuration(s: number): string {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">
              Match-day Live
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Tagging en directo · análisis instant post-pitido
            </p>
          </div>
          <Activity size={18} className="text-primary" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* CTA crear partido */}
        {!showForm ? (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setShowForm(true)}
            className="w-full glass rounded-2xl p-5 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left border border-primary/30"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Plus size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-base text-foreground flex items-center gap-2">
                Nuevo partido
                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  <Sparkles size={9} className="inline -mt-0.5 mr-0.5" />Killer feature
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Etiqueta eventos en directo · 60s post-pitido tienes 4 reportes
              </p>
            </div>
            <span className="text-primary text-lg font-bold">→</span>
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="glass rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-display font-bold text-foreground">Empezar partido</h2>
              <button onClick={() => setShowForm(false)} className="text-[11px] text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-display text-primary uppercase tracking-wider mb-1 font-bold">
                  🏠 Local
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="ej. VITAS Academy U13"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-primary/30 text-sm focus:border-primary focus:outline-none"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1 font-bold">
                  ✈ Rival
                </label>
                <input
                  type="text"
                  value={opponentName}
                  onChange={(e) => setOpponentName(e.target.value)}
                  placeholder="ej. CD Rival U13"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none"
                  maxLength={80}
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? <><Loader2 size={14} className="animate-spin" /> Creando…</> : <><Play size={14} /> Iniciar partido</>}
            </button>
          </motion.div>
        )}

        {/* Lista de partidos */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && matches.length === 0 && !showForm && (
          <p className="text-center text-[11px] text-muted-foreground py-6">
            Aún no has registrado ningún partido. Empieza el primero arriba.
          </p>
        )}

        {!loading && matches.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold pt-2">
              Histórico ({matches.length})
            </div>
            {matches.map((m) => {
              const meta = STATUS_META[m.status];
              const Icon = meta.Icon;
              const isFinished = m.status === "finished";
              const target = isFinished ? `/live/${m.id}/summary` : `/live/${m.id}`;
              return (
                <button
                  key={m.id}
                  onClick={() => navigate(target)}
                  className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${meta.color}20` }}
                  >
                    <Icon size={16} style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-display font-bold text-foreground truncate">
                      {m.team_name} {m.opponent_name && <>vs <span className="text-muted-foreground">{m.opponent_name}</span></>}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span style={{ color: meta.color }} className="font-bold">{meta.label}</span>
                      <span>·</span>
                      <span>{fmtDate(m.created_at)}</span>
                      <span>·</span>
                      <span>{fmtDuration(m.duration_seconds)}</span>
                    </div>
                  </div>
                  <div className="text-sm font-display font-bold text-foreground shrink-0">
                    {m.score_home}−{m.score_away}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
