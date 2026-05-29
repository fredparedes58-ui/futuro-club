/**
 * VITAS · ScanningIntelligenceReport
 *
 * Visualizes "scans before receiving the ball" data:
 * - Timeline of recent receptions with scan events overlaid (10s pre-window)
 * - Stats: avg scans pre-reception, scan effectiveness, percentile vs age
 * - Bar chart distribution of scans count per reception
 * - Correlation panel: scans → post-reception decision quality
 *
 * Phase 1 uses deterministic mock data generated from playerId so the same
 * player always shows the same report. Phase 2 replaces with real data from
 * the scanningIntelligenceDetector output.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  Target,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Info,
  Clock,
} from "lucide-react";

interface Props {
  playerId: string;
  playerName?: string;
  /** Optional pre-computed score (0-100). If absent, derives from playerId. */
  scanningScore?: number;
}

interface ReceptionEvent {
  id: string;
  /** Match minute (1-90) */
  minute: number;
  /** Number of scans detected in the 10s before reception */
  scansPreReception: number;
  /** Outcome of the post-reception action */
  outcome: "successful_pass" | "key_pass" | "shot" | "lost" | "back_pass";
  /** Pressure context: 0-100 */
  pressureLevel: number;
  /** Whether the player turned/oriented towards goal after reception */
  forwardOriented: boolean;
}

const OUTCOME_META: Record<
  ReceptionEvent["outcome"],
  { label: string; color: string; success: boolean }
> = {
  successful_pass: { label: "Pase OK", color: "#10b981", success: true },
  key_pass: { label: "Pase clave", color: "#3b82f6", success: true },
  shot: { label: "Tiro", color: "#a855f7", success: true },
  lost: { label: "Pérdida", color: "#ef4444", success: false },
  back_pass: { label: "Atrás", color: "#94a3b8", success: false },
};

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

function generateReceptions(playerId: string, scoreHint: number): ReceptionEvent[] {
  const rng = seededRng(`scan_${playerId}`);
  const count = 18 + Math.floor(rng() * 8);
  // Higher score → more scans on average
  const avgScansTarget = 1.5 + (scoreHint / 100) * 3.5;

  const events: ReceptionEvent[] = [];
  const usedMinutes = new Set<number>();
  while (events.length < count) {
    const minute = 1 + Math.floor(rng() * 89);
    if (usedMinutes.has(minute)) continue;
    usedMinutes.add(minute);

    // Sample scans count with mean = avgScansTarget, max 8
    const noise = (rng() - 0.5) * 2.5;
    const scansPreReception = Math.max(0, Math.min(8, Math.round(avgScansTarget + noise)));
    const pressureLevel = 10 + Math.floor(rng() * 80);

    // Success probability scales with scans
    const successProb = 0.35 + scansPreReception * 0.08 - pressureLevel * 0.002;
    const isSuccess = rng() < successProb;
    let outcome: ReceptionEvent["outcome"];
    if (isSuccess) {
      const r = rng();
      outcome = r < 0.55 ? "successful_pass" : r < 0.85 ? "key_pass" : "shot";
    } else {
      outcome = rng() < 0.4 ? "lost" : "back_pass";
    }

    const forwardOriented = scansPreReception >= 2 && rng() > 0.3;

    events.push({
      id: `recv_${playerId}_${events.length}`,
      minute,
      scansPreReception,
      outcome,
      pressureLevel,
      forwardOriented,
    });
  }

  return events.sort((a, b) => a.minute - b.minute);
}

function getAgeBenchmark(scoringScore: number): {
  group: string;
  percentile: number;
  description: string;
} {
  // Mock benchmark — replace with real PERFORMANCE_BENCHMARKS_DOCS reads
  if (scoringScore >= 80)
    return { group: "Sub-18 Elite", percentile: 92, description: "Top 8% en escaneo previo a recepción" };
  if (scoringScore >= 65)
    return { group: "Sub-18 Pro", percentile: 76, description: "Top cuartil en su categoría" };
  if (scoringScore >= 50)
    return { group: "Sub-15 Regional", percentile: 60, description: "Por encima de la media" };
  return { group: "Base", percentile: 35, description: "Mejorar el hábito de escanear antes de recibir" };
}

export default function ScanningIntelligenceReport({
  playerId,
  playerName,
  scanningScore,
}: Props) {
  // Derive score from playerId if not provided (same seed as overview)
  const score = useMemo(() => {
    if (scanningScore !== undefined) return scanningScore;
    const rng = seededRng(playerId);
    rng(); // skip first
    return Math.round(40 + rng() * 55);
  }, [playerId, scanningScore]);

  const receptions = useMemo(() => generateReceptions(playerId, score), [playerId, score]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (receptions.length === 0) {
      return {
        avgScans: 0,
        scansUnderPressure: 0,
        successWith0to1Scans: 0,
        successWith2plusScans: 0,
        forwardOrientedPct: 0,
        totalReceptions: 0,
      };
    }
    const total = receptions.length;
    const avgScans = receptions.reduce((s, r) => s + r.scansPreReception, 0) / total;
    const underPressure = receptions.filter((r) => r.pressureLevel >= 50);
    const scansUnderPressure =
      underPressure.length > 0
        ? underPressure.reduce((s, r) => s + r.scansPreReception, 0) / underPressure.length
        : 0;
    const lowScan = receptions.filter((r) => r.scansPreReception <= 1);
    const highScan = receptions.filter((r) => r.scansPreReception >= 2);
    const successWith0to1Scans =
      lowScan.length > 0
        ? lowScan.filter((r) => OUTCOME_META[r.outcome].success).length / lowScan.length
        : 0;
    const successWith2plusScans =
      highScan.length > 0
        ? highScan.filter((r) => OUTCOME_META[r.outcome].success).length / highScan.length
        : 0;
    const forwardOrientedPct = receptions.filter((r) => r.forwardOriented).length / total;
    return {
      avgScans,
      scansUnderPressure,
      successWith0to1Scans,
      successWith2plusScans,
      forwardOrientedPct,
      totalReceptions: total,
    };
  }, [receptions]);

  const benchmark = useMemo(() => getAgeBenchmark(score), [score]);

  // Histogram: count of receptions per scan-count bucket (0..6+)
  const histogram = useMemo(() => {
    const bins = Array.from({ length: 7 }, (_, i) => ({ scans: i, count: 0 }));
    bins[6].scans = 6; // 6+ bucket
    for (const r of receptions) {
      const idx = Math.min(6, r.scansPreReception);
      bins[idx].count++;
    }
    const max = Math.max(...bins.map((b) => b.count), 1);
    return bins.map((b) => ({ ...b, pct: b.count / max }));
  }, [receptions]);

  const selectedReception = selectedId ? receptions.find((r) => r.id === selectedId) ?? null : null;

  // Pick the maximum scan-count seen for nice axis labels
  const scaleMax = Math.max(...receptions.map((r) => r.scansPreReception), 4);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center shrink-0">
          <Eye size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-display font-bold text-foreground">
            Informe de escaneo previo a recepción
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {playerName ?? "Jugador"} · cuántas veces mira el entorno en los <strong>10 segundos antes</strong> de recibir el balón
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-display font-bold text-pink-500 leading-none">{score}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Scan IQ</p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile
          label="Scans / recepción"
          value={stats.avgScans.toFixed(1)}
          icon={<Eye size={12} />}
          color="text-pink-500 bg-pink-500/15"
        />
        <KpiTile
          label="Bajo presión"
          value={stats.scansUnderPressure.toFixed(1)}
          sub={`${receptions.filter((r) => r.pressureLevel >= 50).length} jugadas`}
          icon={<Target size={12} />}
          color="text-red-500 bg-red-500/15"
        />
        <KpiTile
          label="Éxito con scan"
          value={`${Math.round(stats.successWith2plusScans * 100)}%`}
          sub={`vs ${Math.round(stats.successWith0to1Scans * 100)}% sin scan`}
          icon={<TrendingUp size={12} />}
          color="text-emerald-500 bg-emerald-500/15"
        />
        <KpiTile
          label="Orientado al rival"
          value={`${Math.round(stats.forwardOrientedPct * 100)}%`}
          sub="tras recepción"
          icon={<CheckCircle2 size={12} />}
          color="text-blue-500 bg-blue-500/15"
        />
      </div>

      {/* Benchmark card */}
      <div className="glass rounded-xl p-3 border-l-4 border-pink-500/60 bg-pink-500/5 flex items-center gap-3">
        <Info size={14} className="text-pink-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-foreground/90">
            <strong>Percentil {benchmark.percentile}</strong> en <em>{benchmark.group}</em> — {benchmark.description}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="glass rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
            Recepciones del último partido ({receptions.length})
          </h4>
          <p className="text-[10px] text-muted-foreground">
            Click en un punto para ver el detalle
          </p>
        </div>

        <div className="relative">
          {/* Y axis ticks (scan counts) */}
          <div className="absolute left-0 top-0 bottom-0 w-6 flex flex-col-reverse text-[9px] text-muted-foreground/60 font-mono">
            {Array.from({ length: scaleMax + 1 }, (_, i) => (
              <div key={i} className="flex-1 flex items-end">
                {i}
              </div>
            ))}
          </div>

          {/* Plot area */}
          <div className="ml-6 relative h-32 border-b border-l border-border">
            {/* Threshold line: 2 scans (recommended minimum) */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-emerald-500/50 flex items-center justify-end px-1"
              style={{ bottom: `${(2 / scaleMax) * 100}%` }}
            >
              <span className="text-[8px] text-emerald-500 bg-background px-1 -translate-y-1/2">
                ≥2 scans = bueno
              </span>
            </div>

            {/* Points */}
            {receptions.map((r) => {
              const x = (r.minute / 90) * 100;
              const y = (r.scansPreReception / scaleMax) * 100;
              const meta = OUTCOME_META[r.outcome];
              const isSelected = selectedId === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                  className="absolute -translate-x-1/2 translate-y-1/2 group"
                  style={{ left: `${x}%`, bottom: `${y}%` }}
                  title={`Min ${r.minute}' · ${r.scansPreReception} scans · ${meta.label}`}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: isSelected ? 1.6 : 1 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-full border-2 border-background"
                    style={{
                      width: isSelected ? 14 : 10,
                      height: isSelected ? 14 : 10,
                      background: meta.color,
                      boxShadow: isSelected ? `0 0 0 3px ${meta.color}33` : undefined,
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* X axis */}
          <div className="ml-6 flex justify-between text-[9px] text-muted-foreground/60 font-mono mt-1">
            <span>0'</span>
            <span>22.5'</span>
            <span>45'</span>
            <span>67.5'</span>
            <span>90'</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-3 pt-1 flex-wrap">
          {Object.entries(OUTCOME_META).map(([k, m]) => (
            <div key={k} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
              {m.label}
            </div>
          ))}
        </div>
      </div>

      {/* Selected detail */}
      {selectedReception && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-3 border-l-4 border-pink-500"
        >
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Clock size={12} className="text-muted-foreground" />
            <span className="text-[11px] font-display font-bold text-foreground">
              Minuto {selectedReception.minute}'
            </span>
            <span
              className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
              style={{
                background: `${OUTCOME_META[selectedReception.outcome].color}25`,
                color: OUTCOME_META[selectedReception.outcome].color,
              }}
            >
              {OUTCOME_META[selectedReception.outcome].label}
            </span>
            {OUTCOME_META[selectedReception.outcome].success ? (
              <CheckCircle2 size={12} className="text-emerald-500" />
            ) : (
              <XCircle size={12} className="text-red-500" />
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div>
              <p className="text-muted-foreground">Scans 10s previos</p>
              <p className="text-base font-display font-bold text-pink-500">
                {selectedReception.scansPreReception}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Presión rival</p>
              <p className="text-base font-display font-bold text-foreground">
                {selectedReception.pressureLevel}%
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Orientación</p>
              <p className="text-base font-display font-bold text-foreground">
                {selectedReception.forwardOriented ? "↗ Frontal" : "↩ Atrás"}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Histogram */}
      <div className="glass rounded-xl p-3 space-y-2">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
          Distribución del número de scans por recepción
        </h4>
        <div className="flex items-end gap-1.5 h-24">
          {histogram.map((bin, i) => {
            const isRecommended = bin.scans >= 2;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono font-bold text-foreground">
                  {bin.count > 0 ? bin.count : ""}
                </span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${bin.pct * 100}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="w-full rounded-t-md"
                  style={{
                    background: isRecommended
                      ? "linear-gradient(180deg, #ec4899, #be185d)"
                      : "linear-gradient(180deg, #ef4444, #b91c1c)",
                    minHeight: bin.count > 0 ? "8%" : "0%",
                  }}
                />
                <span className="text-[9px] text-muted-foreground font-mono">
                  {bin.scans === 6 ? "6+" : bin.scans}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Eje X: número de scans antes de recibir · Eje Y: cantidad de recepciones
        </p>
      </div>

      {/* Insight */}
      <div className="glass rounded-xl p-3 border-l-4 border-emerald-500/60 bg-emerald-500/5">
        <p className="text-[12px] text-foreground/90 leading-relaxed">
          <strong className="text-emerald-500">💡 Insight automático:</strong>{" "}
          {stats.successWith2plusScans > stats.successWith0to1Scans + 0.15 ? (
            <>
              Cuando {playerName ?? "el jugador"} hace <strong>2+ scans</strong> antes de recibir, su éxito sube{" "}
              <strong>
                {Math.round((stats.successWith2plusScans - stats.successWith0to1Scans) * 100)} puntos
              </strong>{" "}
              (de {Math.round(stats.successWith0to1Scans * 100)}% a{" "}
              {Math.round(stats.successWith2plusScans * 100)}%). Reforzar el hábito de mirar antes de recibir es la mayor palanca de mejora.
            </>
          ) : (
            <>
              El éxito con scan vs sin scan está parejo (
              {Math.round(stats.successWith0to1Scans * 100)}% vs{" "}
              {Math.round(stats.successWith2plusScans * 100)}%). Su éxito no depende tanto del escaneo previo — probablemente compensa con velocidad de decisión o lectura post-recepción.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-lg p-2.5"
    >
      <div className={`w-6 h-6 rounded-md flex items-center justify-center mb-1.5 ${color}`}>
        {icon}
      </div>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className="text-lg font-display font-bold text-foreground leading-none mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </motion.div>
  );
}
