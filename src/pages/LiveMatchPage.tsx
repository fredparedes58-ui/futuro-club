/**
 * VITAS · Live Match Page (Sprint B2 · Match-day Live Mode)
 * /live/:matchId
 *
 * Pantalla móvil para coach durante el partido. Optimizada para
 * tap rápido con haptic feedback (cuando disponible).
 *
 * Flow:
 *   1. Tap en jugador → selecciona (highlight)
 *   2. Tap en evento → registra evento al jugador seleccionado
 *   3. Eventos van a queue offline + sync auto cada 15s
 *   4. Botón FIN → status='finished' + redirige a aggregation
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Play, Pause, Square, Undo2, Wifi, WifiOff,
  Goal, Send, Shield, Activity, ChevronUp, ChevronDown, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useLiveMatch, type LiveEventType } from "@/hooks/useLiveMatch";
import { useAllPlayers } from "@/hooks/usePlayers";

interface EventButtonConfig {
  type: LiveEventType;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  short: string;
}

const EVENT_BUTTONS: EventButtonConfig[] = [
  { type: "gol",            label: "Gol",         Icon: Goal,     color: "#22e88c", short: "GOL" },
  { type: "pase_clave",     label: "Pase clave",  Icon: Send,     color: "#1A8FFF", short: "PASE" },
  { type: "recuperacion",   label: "Recuperación",Icon: Shield,   color: "#10b981", short: "RECUP" },
  { type: "perdida",        label: "Pérdida",     Icon: AlertCircle, color: "#F59E0B", short: "PÉRD" },
  { type: "duelo_ganado",   label: "Duelo +",     Icon: ChevronUp,color: "#22e88c", short: "DUEL+" },
  { type: "duelo_perdido",  label: "Duelo −",     Icon: ChevronDown, color: "#EF4444", short: "DUEL−" },
];

const EVENT_LABELS: Record<LiveEventType, { short: string; color: string }> = Object.fromEntries(
  EVENT_BUTTONS.map((b) => [b.type, { short: b.short, color: b.color }]),
) as Record<LiveEventType, { short: string; color: string }>;

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function vibrate(ms: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}

export default function LiveMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { data: players = [] } = useAllPlayers();
  const {
    match, events, elapsed, online, queueSize,
    addEvent, undoLast, updateMatchStatus,
  } = useLiveMatch(matchId ?? null);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Posición vigente por jugador en este partido (default: posición principal)
  // Permite trackear cambios tácticos (ej. min 60 Samu pasa de LB a CAM)
  const [livePositions, setLivePositions] = useState<Record<string, string>>({});
  const [showPositionPicker, setShowPositionPicker] = useState(false);

  const recentEvents = events.slice(-5).reverse();

  function handleEventTap(type: LiveEventType) {
    if (!matchId) return;
    const playerPosition = selectedPlayerId
      ? livePositions[selectedPlayerId] ?? players.find((p) => p.id === selectedPlayerId)?.position
      : undefined;
    addEvent({
      playerId: selectedPlayerId,
      eventType: type,
      metadata: playerPosition ? { player_position: playerPosition } : undefined,
    });
    vibrate(20);
    // Mantener jugador seleccionado para próximos eventos del mismo jugador
  }

  function changePlayerPosition(playerId: string, newPosition: string) {
    setLivePositions((prev) => ({ ...prev, [playerId]: newPosition }));
    setShowPositionPicker(false);
    const playerName = players.find((p) => p.id === playerId)?.name ?? "Jugador";
    toast.info(`📍 ${playerName} ahora juega de ${newPosition}`);
  }

  async function handlePauseToggle() {
    if (!match) return;
    const newStatus = match.status === "live" ? "paused" : "live";
    await updateMatchStatus({ status: newStatus });
    toast.info(newStatus === "live" ? "▶ Reanudado" : "⏸ Pausado");
  }

  async function handleFinish() {
    if (!match || isFinishing) return;
    if (!confirm("¿Terminar el partido y generar reporte?")) return;
    setIsFinishing(true);
    try {
      await updateMatchStatus({ status: "finished" });
      toast.success("✓ Partido terminado · generando reporte…");
      navigate(`/live/${matchId}/summary`);
    } catch {
      toast.error("Error al terminar");
      setIsFinishing(false);
    }
  }

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const isLive = match?.status === "live";
  const isFinished = match?.status === "finished" || match?.status === "aborted";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header sticky · cronómetro grande */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="px-4 py-2 flex items-center gap-3">
          <button onClick={() => navigate("/live")} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
              {match?.team_name ?? "Mi equipo"}
              {match?.opponent_name && <> vs <span className="text-foreground">{match.opponent_name}</span></>}
            </div>
            <div className="font-mono font-display font-bold text-2xl text-foreground leading-none">
              {fmtTime(elapsed)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            {online ? (
              <Wifi size={11} className="text-green-400" />
            ) : (
              <WifiOff size={11} className="text-amber-400" />
            )}
            {queueSize > 0 && <span className="text-amber-400 font-bold">{queueSize}</span>}
          </div>
        </div>

        {/* Score + estado */}
        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScoreButton
              label="L"
              value={match?.score_home ?? 0}
              onChange={(v) => updateMatchStatus({ scoreHome: v })}
              disabled={isFinished}
            />
            <span className="text-muted-foreground">−</span>
            <ScoreButton
              label="V"
              value={match?.score_away ?? 0}
              onChange={(v) => updateMatchStatus({ scoreAway: v })}
              disabled={isFinished}
            />
          </div>
          <div className="flex items-center gap-2">
            {!isFinished && (
              <button
                onClick={handlePauseToggle}
                className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-display font-bold hover:bg-secondary/80 transition-colors flex items-center gap-1"
              >
                {isLive ? <Pause size={11} /> : <Play size={11} />}
                {isLive ? "Pausa" : "Reanudar"}
              </button>
            )}
            {!isFinished && (
              <button
                onClick={handleFinish}
                disabled={isFinishing}
                className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-display font-bold disabled:opacity-50 hover:bg-destructive/90 transition-colors flex items-center gap-1"
              >
                <Square size={11} /> FIN
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista jugadores · scroll horizontal */}
      <div className="border-b border-border bg-background/50 py-2">
        <div className="flex gap-2 px-4 overflow-x-auto scrollbar-thin">
          <PlayerChip
            label="Sin jugador"
            initial="?"
            isSelected={selectedPlayerId === null}
            onClick={() => setSelectedPlayerId(null)}
          />
          {players.map((p) => (
            <PlayerChip
              key={p.id}
              label={p.name}
              initial={p.name[0]?.toUpperCase() ?? "?"}
              isSelected={selectedPlayerId === p.id}
              onClick={() => { setSelectedPlayerId(p.id); vibrate(10); }}
            />
          ))}
        </div>
      </div>

      {/* Hint con posición vigente y opción de cambiar */}
      {selectedPlayer && (
        <div className="px-4 py-1.5 bg-primary/10 border-b border-primary/30 text-[11px] text-primary font-display font-bold flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="truncate">
              Eventos para: {selectedPlayer.name}
              {" · "}
              <span className="text-foreground/70 font-normal">
                jugando de {livePositions[selectedPlayer.id] ?? selectedPlayer.position}
              </span>
            </span>
          </div>
          <button
            onClick={() => setShowPositionPicker(true)}
            className="px-2 py-0.5 rounded text-[10px] bg-primary/20 hover:bg-primary/30 transition-colors shrink-0"
          >
            Cambiar posición
          </button>
        </div>
      )}

      {/* Modal cambio de posición */}
      {showPositionPicker && selectedPlayer && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowPositionPicker(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-strong rounded-2xl p-5 max-w-md w-full space-y-3"
          >
            <h3 className="font-display font-bold text-base text-foreground">
              ¿En qué posición está jugando ahora {selectedPlayer.name}?
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Los eventos siguientes se etiquetarán con esta posición. Útil para análisis post-partido segregado.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[selectedPlayer.position, ...(selectedPlayer.secondaryPositions ?? [])]
                .filter(Boolean)
                .filter((p, i, arr) => arr.indexOf(p) === i)
                .map((pos) => {
                  const current = livePositions[selectedPlayer.id] ?? selectedPlayer.position;
                  const isActive = pos === current;
                  return (
                    <button
                      key={pos}
                      onClick={() => changePlayerPosition(selectedPlayer.id, pos)}
                      className={`px-3 py-1.5 rounded-md text-xs font-display border transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      {pos === selectedPlayer.position ? `⭐ ${pos}` : pos}
                      {isActive && " ·  ahora"}
                    </button>
                  );
                })}
            </div>
            <button
              onClick={() => setShowPositionPicker(false)}
              className="w-full py-2 rounded-lg bg-secondary text-xs font-display font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Grid 6 botones · main interaction zone */}
      <div className="flex-1 px-3 py-3">
        <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
          {EVENT_BUTTONS.map((cfg) => {
            const Icon = cfg.Icon;
            return (
              <motion.button
                key={cfg.type}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleEventTap(cfg.type)}
                disabled={!isLive}
                className="aspect-[2/1] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all disabled:opacity-50"
                style={{
                  borderColor: cfg.color,
                  backgroundColor: `${cfg.color}15`,
                }}
              >
                <Icon size={24} style={{ color: cfg.color }} />
                <span className="text-xs font-display font-bold" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Recent events + undo */}
      <div className="border-t border-border bg-background/80 backdrop-blur-md">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
            <Activity size={11} />
            Últimos eventos · {events.length} total
          </div>
          {recentEvents.length > 0 && (
            <button
              onClick={undoLast}
              className="flex items-center gap-1 text-[11px] text-amber-400 font-bold hover:text-amber-300"
            >
              <Undo2 size={11} /> Deshacer
            </button>
          )}
        </div>
        <div className="px-4 pb-4 space-y-1">
          <AnimatePresence>
            {recentEvents.map((e) => {
              const meta = EVENT_LABELS[e.eventType];
              const player = players.find((p) => p.id === e.playerId);
              return (
                <motion.div
                  key={e.clientEventId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center gap-2 text-[11px] py-1"
                >
                  <span className="font-mono text-muted-foreground w-12 shrink-0">
                    {fmtTime(e.timestampSeconds)}
                  </span>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: `${meta.color}25`, color: meta.color }}
                  >
                    {meta.short}
                  </span>
                  <span className="text-foreground truncate flex-1">
                    {player?.name ?? "—"}
                  </span>
                  {e.syncStatus !== "synced" && (
                    <span className="text-[9px] text-amber-400">↻</span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {recentEvents.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic text-center py-2">
              Selecciona un jugador y toca un evento
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────

function PlayerChip({
  label, initial, isSelected, onClick,
}: { label: string; initial: string; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex flex-col items-center gap-1 px-2 py-1 rounded-lg border transition-all ${
        isSelected
          ? "border-primary bg-primary/15"
          : "border-border bg-secondary/30 hover:border-foreground/30"
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-display font-bold ${
          isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
        }`}
      >
        {initial}
      </div>
      <span className={`text-[9px] font-display ${isSelected ? "text-primary font-bold" : "text-muted-foreground"} max-w-[60px] truncate`}>
        {label}
      </span>
    </button>
  );
}

function ScoreButton({
  label, value, onChange, disabled,
}: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{label}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled}
        className="w-6 h-6 rounded bg-secondary hover:bg-secondary/80 text-xs font-bold disabled:opacity-50"
      >−</button>
      <span className="font-display font-bold text-base w-5 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(99, value + 1))}
        disabled={disabled}
        className="w-6 h-6 rounded bg-secondary hover:bg-secondary/80 text-xs font-bold disabled:opacity-50"
      >+</button>
    </div>
  );
}
