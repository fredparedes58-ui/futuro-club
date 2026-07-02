/**
 * VITAS · Scanning Intelligence Page
 * /scanning
 *
 * Dedicated page for the "scans before receiving the ball" analysis.
 * Separated from the main Behavioral dashboard for focus and depth.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, Search, Trophy, Upload, Cpu, Video as VideoIcon, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PlayerService, type Player } from "@/services/real/playerService";
import ScanningIntelligenceReport from "@/components/behavioral/ScanningIntelligenceReport";
import { ScanIQCard } from "@/components/dmscore/ScanIQCard";
import { computeScanIQ } from "@/lib/dmscore";
import VideoUploadDialog from "@/components/setPiece/VideoUploadDialog";
import ScanningAnalyzerDialog from "@/components/behavioral/ScanningAnalyzerDialog";
import {
  ScanningVideoAnalyses,
  type ScanningAnalysisResult,
} from "@/services/real/scanningVideoDetector";

// Same RNG / score generator used in the BehavioralOverviewPage so the same
// player gets the same Scan IQ value across the app.
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let s = (h >>> 0) || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateScanIQ(playerId: string): number {
  const rng = seededRng(playerId);
  rng(); // skip first — keeps parity with BehavioralOverviewPage seed sequence
  return Math.round(40 + rng() * 55);
}

function tierFor(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Élite", color: "#10b981" };
  if (score >= 65) return { label: "Profesional", color: "#3b82f6" };
  if (score >= 50) return { label: "Regional", color: "#f59e0b" };
  return { label: "Base", color: "#ef4444" };
}

export default function ScanningIntelligencePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [analyzerOpen, setAnalyzerOpen] = useState(false);
  const [preselectedVideoId, setPreselectedVideoId] = useState<string | undefined>(undefined);
  const [latestAnalysis, setLatestAnalysis] = useState<ScanningAnalysisResult | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setPlayers(PlayerService.getAll());
  }, []);

  // Load latest analysis for the focused player whenever focus or version changes
  // We can't reference `focus` directly here (it's computed later) so we derive
  // the id from the search param or fall back to the first ranked player.
  useEffect(() => {
    void version; // refresh after new analysis
    const paramId = searchParams.get("playerId");
    const all = PlayerService.getAll();
    const ranked = all
      .map((p) => ({ id: p.id }))
      .sort(() => 0);
    const focusId = paramId ?? ranked[0]?.id ?? null;
    if (focusId) {
      setLatestAnalysis(ScanningVideoAnalyses.getLatestForPlayer(focusId));
    } else {
      setLatestAnalysis(null);
    }
  }, [searchParams, version, players]);

  const ranked = useMemo(() => {
    return players
      .map((p) => ({ player: p, score: generateScanIQ(p.id) }))
      .sort((a, b) => b.score - a.score);
  }, [players]);

  const filtered = useMemo(() => {
    if (!query.trim()) return ranked;
    const q = query.toLowerCase();
    return ranked.filter(
      (r) => r.player.name.toLowerCase().includes(q) || r.player.position.toLowerCase().includes(q),
    );
  }, [ranked, query]);

  const focusFromParam = searchParams.get("playerId");
  const focus = useMemo(() => {
    if (focusFromParam) {
      return ranked.find((r) => r.player.id === focusFromParam) ?? ranked[0] ?? null;
    }
    return ranked[0] ?? null;
  }, [focusFromParam, ranked]);

  const teamAvg =
    ranked.length > 0 ? Math.round(ranked.reduce((s, r) => s + r.score, 0) / ranked.length) : 0;
  const eliteCount = ranked.filter((r) => r.score >= 80).length;
  const underTwoCount = ranked.filter((r) => r.score < 50).length;

  const selectPlayer = (id: string) => {
    setSearchParams({ playerId: id }, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center shrink-0">
            <Eye size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-base text-foreground">
              Scanning
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Escaneo previo a la recepción del balón · {ranked.length}{" "}
              {ranked.length === 1 ? "jugador analizado" : "jugadores analizados"}
            </p>
          </div>
          <button
            onClick={() => {
              const target = focus?.player ?? players[0];
              if (!target) {
                toast.error("Crea un jugador primero.");
                return;
              }
              const r = ScanningVideoAnalyses.seedDemo(target.id, target.name);
              setLatestAnalysis(r);
              setVersion((v) => v + 1);
              toast.success(`Scan IQ de demo cargado para ${target.name} (${r.scanIQ}/100)`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-pink-500/40 text-pink-400 text-xs font-display font-semibold hover:bg-pink-500/10 transition-all"
            title="Ver el Scan IQ con datos de ejemplo (sin subir vídeo)"
          >
            <Wand2 size={14} />
            Datos de demo
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-display font-semibold hover:opacity-90 transition-all shadow-md"
            title="Sube un video y analiza su scanning"
          >
            <Upload size={14} />
            Subir video
          </button>
          <button
            onClick={() => {
              setPreselectedVideoId(undefined);
              setAnalyzerOpen(true);
            }}
            disabled={!focus}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-xs font-display font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            title="Analiza el scanning del jugador desde un video"
          >
            <Cpu size={14} />
            Analizar video
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {ranked.length === 0 ? (
          <EmptyState onCreate={() => navigate("/players/new")} />
        ) : (
          <>
            {/* Team stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <TeamStat
                label="Scan IQ promedio"
                value={teamAvg.toString()}
                sub="/ 100"
                color="from-pink-500 to-fuchsia-600"
              />
              <TeamStat
                label="Jugadores élite"
                value={eliteCount.toString()}
                sub="Scan IQ ≥ 80"
                color="from-emerald-500 to-teal-600"
                icon={<Trophy size={14} className="text-white" />}
              />
              <TeamStat
                label="Por mejorar"
                value={underTwoCount.toString()}
                sub="Scan IQ < 50"
                color="from-amber-500 to-orange-500"
              />
              <TeamStat
                label="Top jugador"
                value={ranked[0]?.player.name ?? "—"}
                sub={`Scan ${ranked[0]?.score ?? 0}`}
                color="from-purple-500 to-indigo-600"
              />
            </div>

            {/* Latest video analysis banner */}
            {latestAnalysis && focus && latestAnalysis.playerId === focus.player.id && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-xl p-3 border-l-4 border-pink-500 bg-pink-500/5 flex items-center gap-3 flex-wrap"
              >
                <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center shrink-0">
                  <VideoIcon size={14} className="text-pink-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground">
                    <strong>Último análisis de scanning desde video:</strong>{" "}
                    {latestAnalysis.videoTitle} · {latestAnalysis.receptionsAnalyzed} recepciones
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {new Date(latestAnalysis.createdAt).toLocaleString("es-ES")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-display font-bold text-pink-500 leading-none">
                    {latestAnalysis.scanIQ}
                  </p>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground">
                    Scan IQ del video
                  </p>
                </div>
              </motion.div>
            )}

            {/* Sprint 1.2 — Scan IQ productizado: calibrado por edad + narrativa */}
            {latestAnalysis && focus && latestAnalysis.playerId === focus.player.id && (
              <ScanIQCard
                result={computeScanIQ(
                  latestAnalysis.avgScansPreReception,
                  focus.player.age ?? 14,
                )}
                source={latestAnalysis.source ?? "mock"}
                stats={{
                  receptionsAnalyzed: latestAnalysis.receptionsAnalyzed,
                  successWithScan: latestAnalysis.successWithScan,
                  successWithoutScan: latestAnalysis.successWithoutScan,
                }}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-4">
              {/* Sidebar — ranked players */}
              <aside className="space-y-2">
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar jugador…"
                    className="w-full pl-8 pr-3 py-1.5 bg-secondary/40 rounded-lg text-xs border border-border focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                  {filtered.map((entry, idx) => {
                    const tier = tierFor(entry.score);
                    const isActive = focus?.player.id === entry.player.id;
                    return (
                      <motion.button
                        key={entry.player.id}
                        onClick={() => selectPlayer(entry.player.id)}
                        whileHover={{ x: 2 }}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-left border transition-all ${
                          isActive
                            ? "border-pink-500 bg-pink-500/10"
                            : "border-border bg-secondary/30 hover:border-pink-500/40"
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-secondary text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-display font-bold text-foreground truncate">
                            {entry.player.name}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            {entry.player.age}a · {entry.player.position}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className="text-base font-display font-bold leading-none"
                            style={{ color: tier.color }}
                          >
                            {entry.score}
                          </p>
                          <p
                            className="text-[8px] uppercase tracking-wider font-bold"
                            style={{ color: tier.color }}
                          >
                            {tier.label}
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-4">
                      Ningún jugador coincide con "{query}"
                    </p>
                  )}
                </div>
              </aside>

              {/* Main panel — focused player's full report */}
              <section>
                {focus ? (
                  <div className="glass rounded-2xl p-4">
                    <ScanningIntelligenceReport
                      key={focus.player.id}
                      playerId={focus.player.id}
                      playerName={focus.player.name}
                      scanningScore={focus.score}
                    />
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        ¿Quieres ver el perfil mental completo de {focus.player.name}?
                      </p>
                      <button
                        onClick={() => navigate(`/players/${focus.player.id}?tab=mental`)}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-display font-semibold hover:bg-primary/90"
                      >
                        Abrir perfil mental →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="glass rounded-xl p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Selecciona un jugador a la izquierda.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {/* Upload video dialog */}
      <VideoUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(video) => {
          setUploadOpen(false);
          setPreselectedVideoId(video.id);
          // Open analyzer with the freshly uploaded video pre-selected
          setTimeout(() => setAnalyzerOpen(true), 400);
        }}
      />

      {/* Scanning analyzer dialog */}
      {focus && (
        <ScanningAnalyzerDialog
          open={analyzerOpen}
          onClose={() => {
            setAnalyzerOpen(false);
            setPreselectedVideoId(undefined);
          }}
          playerId={focus.player.id}
          playerName={focus.player.name}
          preselectedVideoId={preselectedVideoId}
          onCompleted={(result) => {
            setLatestAnalysis(result);
            setVersion((v) => v + 1);
            toast.success(
              `Scan IQ actualizado a ${result.scanIQ}/100 para ${result.playerName}`,
            );
          }}
        />
      )}
    </div>
  );
}

function TeamStat({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-3 space-y-2"
    >
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
        {icon ?? <Eye size={14} className="text-white" />}
      </div>
      <div>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
          {label}
        </p>
        <p className="text-base font-display font-bold text-foreground leading-tight mt-0.5 truncate">
          {value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="glass rounded-2xl p-8 text-center max-w-2xl mx-auto border border-dashed border-border space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pink-500/20 to-fuchsia-600/20 flex items-center justify-center">
        <Eye size={28} className="text-pink-500" />
      </div>
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Sin jugadores aún</h2>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-md mx-auto">
          El análisis de escaneo cuenta cuántas veces mira el entorno cada jugador en los 10s
          previos a recibir el balón, y correlaciona eso con la calidad de su decisión posterior.
          Necesitas jugadores en el equipo para verlo.
        </p>
      </div>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-xs font-display font-semibold"
      >
        Crear primer jugador
      </button>
    </div>
  );
}
