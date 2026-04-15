/**
 * VITAS · Player Intelligence Page
 * /players/:id/intelligence
 *
 * Muestra el análisis completo de inteligencia de un jugador:
 *   - Estado Actual (6 dimensiones)
 *   - ADN Futbolístico
 *   - Jugador Referencia / Clon (ProPlayerMatch)
 *   - Proyección de Carrera
 *   - Plan de Desarrollo
 *
 * También permite lanzar un análisis nuevo con video.
 */

import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Zap, Play, Brain, Target, TrendingUp,
  ClipboardList, Star, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronUp, RefreshCw, Loader2, GitCompare,
  ArrowUpRight, ArrowDownRight, Minus, Video, Trophy,
  Shield, MapPin, FileText, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { PlayerService, type Player } from "@/services/real/playerService";
import { VideoService, getBestVideoUrl, type VideoRecord } from "@/services/real/videoService";
import { usePlayerIntelligence, useSavedAnalyses } from "@/hooks/usePlayerIntelligence";
import ProPlayerMatch from "@/components/ProPlayerMatch";
import VitasCard from "@/components/VitasCard";
import AnalysisTimeline from "@/components/AnalysisTimeline";
import VideoUpload from "@/components/VideoUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SimilarityMatch } from "@/services/real/similarityService";
import type { VideoIntelligenceOutput } from "@/agents/contracts";
import QuantitativeMetricsPanel from "@/components/QuantitativeMetricsPanel";
import MatchStatsPanel from "@/components/MatchStatsPanel";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import { getErrorDetails } from "@/services/errorDiagnosticService";
import AnalysisFocusSelector from "@/components/AnalysisFocusSelector";
import DrillRecommendations from "@/components/intelligence/DrillRecommendations";
import BenchmarkBadge from "@/components/intelligence/BenchmarkBadge";
import { calculateReportBenchmark, type ReportBenchmark, DIMENSION_TO_METRIC } from "@/services/real/benchmarkService";
import { PDFService } from "@/services/real/pdfService";

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  elite:       "Élite",
  alto:        "Alto",
  medio_alto:  "Medio-Alto",
  medio:       "Medio",
  desarrollo:  "En Desarrollo",
};

const LEVEL_COLORS: Record<string, string> = {
  elite:       "#FFD700",
  alto:        "#22C55E",
  medio_alto:  "#3B82F6",
  medio:       "#F59E0B",
  desarrollo:  "#8B5CF6",
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 20;
  const circ   = 2 * Math.PI * radius;
  const dash   = (score / 10) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={radius} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" className="text-foreground">
          {score.toFixed(1)}
        </text>
      </svg>
      <span className="text-[9px] text-center text-muted-foreground leading-tight max-w-[52px]">{label}</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: {
  icon: React.ElementType; title: string; subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-display font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Secciones del informe ────────────────────────────────────────────────────

function EstadoActual({ data, benchmark }: {
  data: VideoIntelligenceOutput["estadoActual"];
  benchmark?: ReportBenchmark | null;
}) {
  const { t } = useTranslation();
  if (!data) return null;
  const levelColor = LEVEL_COLORS[data.nivelActual] ?? "#3B82F6";

  return (
    <div className="space-y-4">
      {/* Nivel y resumen */}
      <div className="glass rounded-2xl p-4">
        <SectionHeader icon={Brain} title={t("intelligence.currentState")} subtitle={t("intelligence.currentStateDesc")} />

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-display font-bold"
            style={{ color: levelColor }}>
            ● {LEVEL_LABELS[data.nivelActual] ?? data.nivelActual}
          </span>
          {data.ajusteVSIVideoScore !== 0 && (
            <Badge
              variant={data.ajusteVSIVideoScore > 0 ? "default" : "destructive"}
              className="text-[9px]"
            >
              VSI {data.ajusteVSIVideoScore > 0 ? "+" : ""}{data.ajusteVSIVideoScore}
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{data.resumenEjecutivo}</p>
      </div>

      {/* 6 dimensiones */}
      <div className="glass rounded-2xl p-4">
        <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-4">
          {t("intelligence.sixDimensions")}
        </p>
        <div className="grid grid-cols-3 gap-3 justify-items-center">
          {Object.entries({
            [t("intelligence.dimensions.decision")]:    { dim: data.dimensiones?.velocidadDecision, key: "velocidadDecision" },
            [t("intelligence.dimensions.technique")]:   { dim: data.dimensiones?.tecnicaConBalon, key: "tecnicaConBalon" },
            [t("intelligence.dimensions.tactics")]:     { dim: data.dimensiones?.inteligenciaTactica, key: "inteligenciaTactica" },
            [t("intelligence.dimensions.physical")]:    { dim: data.dimensiones?.capacidadFisica, key: "capacidadFisica" },
            [t("intelligence.dimensions.leadership")]:  { dim: data.dimensiones?.liderazgoPresencia, key: "liderazgoPresencia" },
            [t("intelligence.dimensions.efficiency")]:  { dim: data.dimensiones?.eficaciaCompetitiva, key: "eficaciaCompetitiva" },
          }).filter(([, v]) => v.dim).map(([label, { dim, key }]) => {
            const bench = benchmark?.dimensions.find(d => d.dimensionKey === key);
            return (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <ScoreRing score={dim!.score ?? 0} label={label} />
                {bench && bench.sampleSize > 0 && (
                  <BenchmarkBadge percentile={bench.percentile} isSmallSample={bench.isSmallSample} />
                )}
              </div>
            );
          })}
        </div>
        {benchmark && benchmark.sampleSize > 0 && (
          <p className="text-[9px] text-muted-foreground text-center mt-2">
            Benchmark: {benchmark.groupDescription}
          </p>
        )}
        {/* Observaciones expandibles */}
        <div className="mt-4 space-y-2">
          {Object.entries({
            [t("intelligence.observations.decisionSpeed")]:  data.dimensiones?.velocidadDecision?.observacion,
            [t("intelligence.observations.ballTechnique")]:      data.dimensiones?.tecnicaConBalon?.observacion,
            [t("intelligence.observations.tacticalIntelligence")]:   data.dimensiones?.inteligenciaTactica?.observacion,
          }).filter(([, obs]) => obs).map(([k, obs]) => (
            <div key={k} className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">{k}: </span>{obs}
            </div>
          ))}
        </div>
      </div>

      {/* Fortalezas y áreas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle size={11} className="text-green-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-green-400">{t("intelligence.strengths")}</span>
          </div>
          {(data.fortalezasPrimarias ?? []).map((f, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {f}</p>
          ))}
        </div>
        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={11} className="text-amber-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-amber-400">{t("intelligence.toWork")}</span>
          </div>
          {(data.areasDesarrollo ?? []).map((a, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {a}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ADNFutbolistico({ data }: { data: VideoIntelligenceOutput["adnFutbolistico"] }) {
  const { t } = useTranslation();
  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Zap} title={t("intelligence.footballDNA")} subtitle={t("intelligence.footballDNADesc")} />

      <div className="mb-3">
        <Badge className="text-xs mb-2">{data.arquetipoTactico ?? "—"}</Badge>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.estiloJuego ?? ""}</p>
      </div>

      <div className="space-y-2 mb-3">
        {(data.patrones ?? []).map((pat, i) => {
          const freqColor = pat.frecuencia === "alto" ? "#22C55E" : pat.frecuencia === "medio" ? "#F59E0B" : "#6B7280";
          return (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5 shrink-0" style={{ color: freqColor }}>●</span>
              <span>
                <span className="font-medium text-foreground">{pat.patron}</span>
                <span className="text-muted-foreground"> — {pat.descripcion}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed italic border-t border-border pt-3">
        {data.mentalidad ?? ""}
      </p>
    </div>
  );
}

function ProyeccionCarrera({ data }: { data: VideoIntelligenceOutput["proyeccionCarrera"] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={TrendingUp} title={t("intelligence.careerProjection")} subtitle={t("intelligence.careerProjectionDesc")} />

      {/* Optimista */}
      {data.escenarioOptimista && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Star size={11} className="text-green-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-green-400">{t("intelligence.optimisticScenario")}</span>
            <Badge variant="secondary" className="text-[9px] ml-auto">{data.escenarioOptimista.nivelProyecto ?? "—"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{data.escenarioOptimista.descripcion ?? ""}</p>
          {data.escenarioOptimista.edadPeak && (
            <p className="text-[10px] text-green-400 mt-1.5">{t("intelligence.peakProjected", { age: data.escenarioOptimista.edadPeak })}</p>
          )}
        </div>
      )}

      {/* Realista */}
      {data.escenarioRealista && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Target size={11} className="text-blue-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-blue-400">{t("intelligence.realisticScenario")}</span>
            <Badge variant="secondary" className="text-[9px] ml-auto">{data.escenarioRealista.nivelProyecto ?? "—"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{data.escenarioRealista.descripcion ?? ""}</p>
        </div>
      )}

      {/* Factores y riesgos */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground w-full"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {t("intelligence.keyFactorsAndRisks")}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-green-400 mb-1">{t("intelligence.positiveFactors")}</p>
                {(data.factoresClave ?? []).map((f, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">• {f}</p>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-red-400 mb-1">{t("intelligence.risks")}</p>
                {(data.riesgos ?? []).map((r, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">• {r}</p>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Proyección Competitiva ──────────────────────────────────────────────────

const NIVEL_COLORS: Record<string, string> = {
  "Segunda Regional":  "#94A3B8",
  "Primera Regional":  "#8B5CF6",
  "Preferente":        "#3B82F6",
  "Autonómica":        "#22C55E",
  "Nacional":          "#F59E0B",
  "División de Honor": "#FFD700",
};

const CATEGORIA_LABELS: Record<string, string> = {
  prebenjamin: "Prebenjamín",
  benjamin:    "Benjamín",
  alevin:      "Alevín",
  infantil:    "Infantil",
  cadete:      "Cadete",
  juvenil:     "Juvenil",
};

function getNivelColor(nivel: string): string {
  for (const [key, color] of Object.entries(NIVEL_COLORS)) {
    if (nivel.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#3B82F6";
}

function ProbabilityBar({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "#22C55E" : pct >= 40 ? "#F59E0B" : "#EF4444";
  const h = size === "md" ? "h-2" : "h-1.5";
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${h} rounded-full bg-secondary overflow-hidden`}>
        <div className={`${h} rounded-full transition-all`} style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[9px] font-bold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

function ProyeccionCompetitiva({ data }: { data: NonNullable<VideoIntelligenceOutput["proyeccionCompetitiva"]> }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader
        icon={Trophy}
        title="Proyección Competitiva"
        subtitle="Nivel recomendado y roadmap por categoría de edad"
      />

      {/* Nivel Actual Recomendado */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-primary" />
            <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">
              Nivel Actual Recomendado
            </span>
          </div>
          <Badge
            className="text-xs font-bold px-3 py-1"
            style={{
              backgroundColor: `${getNivelColor(data.nivelActualRecomendado)}20`,
              color: getNivelColor(data.nivelActualRecomendado),
              borderColor: getNivelColor(data.nivelActualRecomendado),
            }}
          >
            {data.nivelActualRecomendado}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{data.justificacionNivel}</p>
      </div>

      {/* Tipo de Jugador Proyectado */}
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Target size={11} className="text-gold" />
          <span className="text-[10px] font-display uppercase tracking-wider text-gold">
            Tipo de Jugador Proyectado
          </span>
        </div>
        <p className="text-xs text-foreground font-medium leading-relaxed">{data.tipoJugadorProyectado}</p>
      </div>

      {/* Roadmap por Categoría */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground w-full mb-3"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Roadmap por Categoría ({data.roadmapPorCategoria.length} etapas)
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 mb-3">
              {data.roadmapPorCategoria.map((etapa, i) => {
                const nivelColor = getNivelColor(etapa.nivelRecomendado);
                return (
                  <div key={i} className="rounded-xl border border-border p-3 relative">
                    {/* Timeline dot */}
                    {i < data.roadmapPorCategoria.length - 1 && (
                      <div className="absolute left-6 top-full w-px h-2 bg-border" />
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                          style={{ backgroundColor: `${nivelColor}20`, color: nivelColor }}>
                          {i + 1}
                        </div>
                        <div>
                          <span className="text-xs font-display font-bold text-foreground">
                            {CATEGORIA_LABELS[etapa.categoria] ?? etapa.categoria}
                          </span>
                          <span className="text-[9px] text-muted-foreground ml-1.5">({etapa.edadRango} años)</span>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[9px] font-bold"
                        style={{ color: nivelColor, borderColor: `${nivelColor}50` }}
                      >
                        {etapa.nivelRecomendado}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-foreground mb-1.5">{etapa.tipoJugadorEnEstaEtapa}</p>

                    {/* Capacidades clave */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {etapa.capacidadesClave.map((cap, j) => (
                        <span key={j} className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {cap}
                        </span>
                      ))}
                    </div>

                    {/* Enfoque */}
                    <div className="flex items-start gap-1 mb-1.5">
                      <MapPin size={9} className="text-primary mt-0.5 shrink-0" />
                      <span className="text-[10px] text-muted-foreground">{etapa.enfoqueDesarrollo}</span>
                    </div>

                    {/* Probabilidad */}
                    <ProbabilityBar value={etapa.probabilidadAlcanzar} />
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Techo Competitivo */}
      <div className="rounded-xl border border-gold/30 bg-gradient-to-r from-gold/5 to-transparent p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp size={11} className="text-gold" />
          <span className="text-[10px] font-display uppercase tracking-wider text-gold">Techo Competitivo</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-sm font-display font-bold text-foreground">{data.techoCompetitivo.nivel}</span>
            <span className="text-[10px] text-muted-foreground ml-2">
              ~{data.techoCompetitivo.edadEstimada} años
            </span>
          </div>
          <span className="text-xs font-bold" style={{
            color: data.techoCompetitivo.probabilidad >= 0.5 ? "#22C55E" : "#F59E0B"
          }}>
            {Math.round(data.techoCompetitivo.probabilidad * 100)}% prob.
          </span>
        </div>
        <ProbabilityBar value={data.techoCompetitivo.probabilidad} size="md" />
        <div className="mt-2 space-y-0.5">
          {data.techoCompetitivo.requisitosParaAlcanzarlo.map((req, i) => (
            <p key={i} className="text-[10px] text-muted-foreground">→ {req}</p>
          ))}
        </div>
      </div>

      {/* Factores Ascenso / Riesgo */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-2.5">
          <div className="flex items-center gap-1 mb-1.5">
            <ArrowUpRight size={10} className="text-green-400" />
            <span className="text-[9px] font-display uppercase tracking-wider text-green-400">Factores de Ascenso</span>
          </div>
          {data.factoresAscenso.map((f, i) => (
            <p key={i} className="text-[10px] text-muted-foreground leading-relaxed">• {f}</p>
          ))}
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-2.5">
          <div className="flex items-center gap-1 mb-1.5">
            <ArrowDownRight size={10} className="text-red-400" />
            <span className="text-[9px] font-display uppercase tracking-wider text-red-400">Factores de Riesgo</span>
          </div>
          {data.factoresRiesgo.map((f, i) => (
            <p key={i} className="text-[10px] text-muted-foreground leading-relaxed">• {f}</p>
          ))}
        </div>
      </div>

      {/* Recomendación Final — narrativa scout */}
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Brain size={11} className="text-primary" />
          <span className="text-[10px] font-display uppercase tracking-wider text-primary">Recomendación Scout</span>
        </div>
        <p className="text-xs text-foreground leading-relaxed italic">
          "{data.recomendacionFinal}"
        </p>
      </div>
    </div>
  );
}

function PlanDesarrollo({ data }: { data: VideoIntelligenceOutput["planDesarrollo"] }) {
  const { t } = useTranslation();
  const prioColor = (p: string) =>
    p === "crítica" ? "#EF4444" : p === "alta" ? "#F59E0B" : "#3B82F6";

  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={ClipboardList} title={t("intelligence.developmentPlan")} />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-border p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={10} className="text-primary" />
            <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">6 meses</span>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">{data.objetivo6meses ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={10} className="text-gold" />
            <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">18 meses</span>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">{data.objetivo18meses ?? "—"}</p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {(data.pilaresTrabajo ?? []).map((pilar, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-display font-bold text-foreground">{pilar.pilar}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ color: prioColor(pilar.prioridad ?? "media"), backgroundColor: `${prioColor(pilar.prioridad ?? "media")}15` }}>
                {(pilar.prioridad ?? "media").toUpperCase()}
              </span>
            </div>
            {(pilar.acciones ?? []).map((acc, j) => (
              <p key={j} className="text-[11px] text-muted-foreground">→ {acc}</p>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-1">
          Para el entrenador
        </p>
        <p className="text-xs text-foreground leading-relaxed italic">
          "{data.recomendacionEntrenador ?? "—"}"
        </p>
      </div>
    </div>
  );
}

// ─── Comparativa entre análisis ───────────────────────────────────────────────

function ScoreDelta({ label, current, previous }: { label: string; current: number; previous: number }) {
  const delta = current - previous;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const color = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-foreground font-mono">{previous}</span>
        <Icon size={12} className={color} />
        <span className={`text-[11px] font-mono font-bold ${color}`}>{current}</span>
        {delta !== 0 && (
          <span className={`text-[9px] font-bold ${color}`}>({delta > 0 ? "+" : ""}{delta})</span>
        )}
      </div>
    </div>
  );
}

function AnalysisComparison({ current, previous, currentDate, previousDate }: {
  current: VideoIntelligenceOutput;
  previous: VideoIntelligenceOutput;
  currentDate: string;
  previousDate: string;
}) {
  const dims = current.estadoActual?.dimensiones;
  const prevDims = previous.estadoActual?.dimensiones;
  if (!dims || !prevDims) return null;

  const dimensionLabels: Record<string, string> = {
    velocidadDecision: "Velocidad decisión",
    tecnicaConBalon: "Técnica con balón",
    inteligenciaTactica: "Inteligencia táctica",
    capacidadFisica: "Capacidad física",
    liderazgoPresencia: "Liderazgo",
    eficaciaCompetitiva: "Eficacia competitiva",
  };

  // Calcular evolución general
  const currentAvg = Object.values(dims).reduce((s, d) => s + (d?.score ?? 0), 0) / Object.keys(dims).length;
  const prevAvg = Object.values(prevDims).reduce((s, d) => s + (d?.score ?? 0), 0) / Object.keys(prevDims).length;
  const avgDelta = currentAvg - prevAvg;

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GitCompare size={14} className="text-primary" />
        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
          Comparativa entre análisis
        </span>
      </div>

      {/* Resumen evolución */}
      <div className={`rounded-xl p-3 border ${avgDelta >= 0 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <div className="flex items-center gap-2 mb-1">
          {avgDelta >= 0 ? <ArrowUpRight size={14} className="text-green-400" /> : <ArrowDownRight size={14} className="text-red-400" />}
          <span className="text-xs font-bold text-foreground">
            {avgDelta > 0 ? "Progreso detectado" : avgDelta < 0 ? "Regresión detectada" : "Sin cambios"}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Promedio: {prevAvg.toFixed(1)} → {currentAvg.toFixed(1)} ({avgDelta >= 0 ? "+" : ""}{avgDelta.toFixed(1)})
        </p>
        <p className="text-[9px] text-muted-foreground mt-1">
          {new Date(previousDate).toLocaleDateString("es")} vs {new Date(currentDate).toLocaleDateString("es")}
        </p>
      </div>

      {/* Detalle por dimensión */}
      <div className="space-y-0.5">
        {Object.entries(dimensionLabels).map(([key, label]) => {
          const cur = (dims as Record<string, { score: number }>)[key]?.score ?? 0;
          const prev = (prevDims as Record<string, { score: number }>)[key]?.score ?? 0;
          return <ScoreDelta key={key} label={label} current={cur} previous={prev} />;
        })}
      </div>

      {/* Proyección comparada */}
      {current.proyeccionCarrera?.escenarioRealista && previous.proyeccionCarrera?.escenarioRealista && (
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">Proyección</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-secondary/50 p-2">
              <p className="text-[9px] text-muted-foreground">Anterior</p>
              <p className="text-[11px] font-bold text-foreground">{previous.proyeccionCarrera.escenarioRealista.nivelProyecto ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-primary/10 border border-primary/30 p-2">
              <p className="text-[9px] text-primary">Actual</p>
              <p className="text-[11px] font-bold text-foreground">{current.proyeccionCarrera.escenarioRealista.nivelProyecto ?? "—"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Confianza comparada */}
      <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1">
        <span>Confianza anterior: {Math.round((previous.confianza ?? 0) * 100)}%</span>
        <span>Confianza actual: {Math.round((current.confianza ?? 0) * 100)}%</span>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PlayerIntelligencePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"nuevo" | "guardado" | "historial">("guardado");
  const [showCard, setShowCard] = useState(false);
  const [jerseyNumber, setJerseyNumber] = useState<string>("");
  const [teamColor, setTeamColor] = useState<string>("");
  const [analysisFocus, setAnalysisFocus] = useState<string[]>([]);

  const player = id ? PlayerService.getById(id) : null;
  const { data: analyses, isLoading: loadingAnalyses } = useSavedAnalyses(id ?? "");

  const {
    state,
    isAnalyzing,
    isSimilarityLoading,
    analysisResult,
    similarityData,
    runAnalysis,
    refetchSimilarity,
  } = usePlayerIntelligence(player ?? ({} as Player));

  // Hooks MUST be called before any early return (Rules of Hooks)
  const [selectedAnalysisIdx, setSelectedAnalysisIdx] = useState<number>(0);
  const [searchParams] = useSearchParams();
  const [compareMode, setCompareMode] = useState(searchParams.get("compare") === "1");
  const [compareIdx, setCompareIdx] = useState<number>(1);

  if (!player) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle size={32} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{t("toasts.playerNotFound")}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>{t("common.back")}</Button>
      </div>
    );
  }

  // Obtener videos disponibles — primero los del jugador, si no hay, mostrar todos
  const playerVideos = (() => {
    const byPlayer = VideoService.getByPlayerId(player.id);
    if (byPlayer.length > 0) return byPlayer;
    // Fallback: mostrar todos los videos disponibles para análisis
    return VideoService.getAll();
  })();

  // Informe a mostrar: el recién generado o el seleccionado del historial
  const savedReport = analyses && analyses[selectedAnalysisIdx]
    ? (analyses[selectedAnalysisIdx].report as VideoIntelligenceOutput)
    : null;
  const latestReport: VideoIntelligenceOutput | null = analysisResult ?? savedReport;

  // Para comparativa
  const compareReport: VideoIntelligenceOutput | null =
    compareMode && analyses && analyses[compareIdx]
      ? (analyses[compareIdx].report as VideoIntelligenceOutput)
      : null;

  // Similitud: priorizar motor determinista (datos reales de PRO_PLAYERS) sobre Claude
  const top5Matches: SimilarityMatch[] = similarityData?.top5 ?? [];

  const bestMatchData: SimilarityMatch | null =
    similarityData?.bestMatch ?? top5Matches[0] ?? null;

  const handleRunAnalysis = async () => {
    if (!selectedVideoId) {
      toast.error(t("reports.selectVideoFirst", "Selecciona un video primero"));
      return;
    }
    const video = playerVideos.find(v => v.id === selectedVideoId);
    if (!video) return;
    const duration = (video.duration as number) || 34;
    try {
      // Get best available video URL (prefers CDN over expired blob)
      const videoSrc = getBestVideoUrl(video) ?? undefined;

      // Verify blob URLs are still valid (they expire on page refresh)
      if (videoSrc?.startsWith("blob:")) {
        const { isBlobUrlValid } = await import("@/lib/localVideoUtils");
        if (!isBlobUrlValid(videoSrc)) {
          toast.error("El video local expiró", {
            description: "Los videos locales se pierden al refrescar la página. Sube el video de nuevo para analizarlo.",
            duration: 8000,
          });
          return;
        }
      }
      if (!videoSrc) {
        toast.error("No hay video disponible", {
          description: "Sube un video para este jugador antes de generar el informe.",
          duration: 6000,
        });
        return;
      }

      await runAnalysis({
        videoId: selectedVideoId,
        videoDuration: duration,
        jerseyNumber: jerseyNumber.trim() || undefined,
        teamColor: teamColor.trim() || undefined,
        localVideoSrc: videoSrc,
        analysisFocus: analysisFocus.length > 0 ? analysisFocus : undefined,
      });
      toast.success(t("toasts.drillAnalyzed"));
      setActiveTab("guardado");
    } catch (err) {
      const { title, description } = getErrorDetails(err, "intelligence");
      toast.error(title, { description });
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-strong safe-area-top">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(`/player/${id}`)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-black text-foreground truncate">{player.name}</h1>
            <p className="text-[10px] text-muted-foreground">Intelligence Report</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[9px] font-display uppercase tracking-widest text-primary">AI</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 p-1 glass rounded-xl">
          {(["guardado", "historial", "nuevo"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-display font-bold uppercase tracking-wider transition-all ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "guardado" ? "Informe" : tab === "historial" ? "Historial" : "Nuevo"}
            </button>
          ))}
        </div>

        {/* ── HISTORIAL ── */}
        {activeTab === "historial" && id && (
          <AnalysisTimeline playerId={id} />
        )}

        {/* ── NUEVO ANÁLISIS ── */}
        {activeTab === "nuevo" && (
          <div className="space-y-4">
            {/* Upload de video */}
            <div className="glass rounded-2xl p-4">
              <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-3">
                Subir nuevo video
              </p>
              <VideoUpload
                playerId={player.id}
                onDone={(videoId) => {
                  toast.success("Video listo para analizar");
                  setSelectedVideoId(videoId);
                }}
              />
            </div>

            {/* Selector de video */}
            {playerVideos.length > 0 ? (
              <div className="glass rounded-2xl p-4">
                <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-3">
                  Selecciona el video a analizar
                </p>
                <div className="space-y-2">
                  {playerVideos.filter(v => v.status === "finished" || v.status === "uploaded" || !!v.embedUrl || (v.localPath && !v.localPath.startsWith("http"))).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVideoId(v.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        selectedVideoId === v.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Play size={14} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {v.title ?? v.id}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {v.embedUrl || (v.localPath && !v.localPath.startsWith("http")) ? "Listo para análisis" : v.status}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="glass rounded-2xl p-6 text-center">
                <Play size={24} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">Sin videos disponibles</p>
                <p className="text-xs text-muted-foreground">
                  Sube un video desde el perfil del jugador primero
                </p>
              </div>
            )}

            {/* Botón de análisis */}
            {state.step !== "idle" && state.step !== "done" && state.step !== "error" && (
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 size={14} className="text-primary animate-spin" />
                  <span className="text-xs text-foreground">{state.message}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${state.progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            )}

            {state.step === "error" && (
              <div className="glass rounded-2xl p-4 border border-destructive/30">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-destructive" />
                  <p className="text-xs text-destructive">{state.message}</p>
                </div>
              </div>
            )}

            {/* Identificación del jugador en video */}
            <div className="glass rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                Identificar jugador en el video
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                    Nº Camiseta
                  </label>
                  <input
                    type="text"
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder="ej: 7, 10, 23"
                    maxLength={3}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                    Color uniforme
                  </label>
                  <input
                    type="text"
                    value={teamColor}
                    onChange={(e) => setTeamColor(e.target.value)}
                    placeholder="ej: rojo, verde"
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                La IA buscará específicamente ese dorsal y color en los fotogramas del video para centrar el análisis en ese jugador.
              </p>
            </div>

            {/* Selector de enfoque */}
            <AnalysisFocusSelector value={analysisFocus} onChange={setAnalysisFocus} />

            <Button
              className="w-full h-12 text-sm font-display font-bold gap-2"
              onClick={handleRunAnalysis}
              disabled={!selectedVideoId || isAnalyzing}
            >
              {isAnalyzing ? (
                <><Loader2 size={16} className="animate-spin" /> Analizando con IA...</>
              ) : (
                <><Zap size={16} /> Generar Informe VITAS</>
              )}
            </Button>

            {/* Similitud sin video */}
            {!latestReport && (
              <Button
                variant="outline"
                className="w-full h-10 text-xs gap-2"
                onClick={() => refetchSimilarity()}
                disabled={isSimilarityLoading}
              >
                {isSimilarityLoading ? (
                  <><Loader2 size={12} className="animate-spin" /> Calculando...</>
                ) : (
                  <><RefreshCw size={12} /> Solo similitud (sin video)</>
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── INFORME ── */}
        {activeTab === "guardado" && (
          <>
            {loadingAnalyses ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : latestReport ? (
              <div className="space-y-4">

                {/* Selector de análisis por video */}
                {analyses && analyses.length > 1 && (
                  <div className="glass rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Video size={14} className="text-primary" />
                        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                          Análisis guardados ({analyses.length})
                        </span>
                        <button
                          onClick={() => navigate(`/players/${id}/reports`)}
                          className="text-[9px] text-primary/70 hover:text-primary underline ml-1"
                        >
                          Ver todos
                        </button>
                        <button
                          onClick={() => navigate(`/players/${id}/evolution`)}
                          className="text-[9px] text-green-400/70 hover:text-green-400 underline"
                        >
                          Evolución
                        </button>
                      </div>
                      <button
                        onClick={() => setCompareMode(m => !m)}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${
                          compareMode ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"
                        }`}
                      >
                        <GitCompare size={10} />
                        {compareMode ? "Cerrar" : "Comparar"}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {analyses.map((a: { video_id?: string; created_at?: string; report?: unknown }, idx: number) => {
                        const report = a.report as VideoIntelligenceOutput | null;
                        const videoTitle = report?.videoId && report.videoId !== "unknown"
                          ? VideoService.getById(report.videoId)?.title ?? report.videoId
                          : `Análisis ${analyses.length - idx}`;
                        const date = a.created_at ? new Date(a.created_at).toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
                        const isSelected = selectedAnalysisIdx === idx;
                        const isCompare = compareMode && compareIdx === idx;
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              if (compareMode && idx !== selectedAnalysisIdx) {
                                setCompareIdx(idx);
                              } else if (!compareMode) {
                                setSelectedAnalysisIdx(idx);
                              }
                            }}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                              isSelected ? "border-primary bg-primary/10" :
                              isCompare ? "border-amber-500 bg-amber-500/10" :
                              "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              isSelected ? "bg-primary text-primary-foreground" :
                              isCompare ? "bg-amber-500 text-white" :
                              "bg-secondary text-muted-foreground"
                            }`}>
                              {isSelected ? "A" : isCompare ? "B" : idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-foreground truncate">{videoTitle}</p>
                              <p className="text-[9px] text-muted-foreground">{date} · Confianza {Math.round(((report?.confianza ?? 0)) * 100)}%</p>
                            </div>
                            {isSelected && <Badge variant="secondary" className="text-[8px]">Actual</Badge>}
                            {isCompare && <Badge className="text-[8px] bg-amber-500">Comparar</Badge>}
                          </button>
                        );
                      })}
                    </div>
                    {compareMode && (
                      <p className="text-[9px] text-muted-foreground text-center">
                        Selecciona <span className="text-primary font-bold">A</span> (actual) y <span className="text-amber-500 font-bold">B</span> (comparar)
                      </p>
                    )}
                  </div>
                )}

                {/* Comparativa */}
                {compareReport && analyses && (
                  <AnalysisComparison
                    current={latestReport}
                    previous={compareReport}
                    currentDate={analyses[selectedAnalysisIdx]?.created_at ?? ""}
                    previousDate={analyses[compareIdx]?.created_at ?? ""}
                  />
                )}

                {/* Estado Actual */}
                <EstadoActual
                  data={latestReport.estadoActual}
                  benchmark={
                    player && latestReport.estadoActual?.dimensiones
                      ? calculateReportBenchmark(player.age, player.position, latestReport.estadoActual.dimensiones)
                      : null
                  }
                />

                {/* Panel de Estadísticas — Wyscout Premium */}
                {latestReport.metricasCuantitativas ? (
                  <MatchStatsPanel
                    data={latestReport.metricasCuantitativas}
                    title={`Estadísticas — ${player.name}`}
                  />
                ) : (
                  <div className="glass rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                        <Activity size={14} className="text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold text-foreground mb-1">
                          Panel de Estadísticas no disponible
                        </p>
                        <p className="text-[11px] text-muted-foreground mb-3">
                          Este análisis fue generado antes de la actualización del pipeline de métricas cuantitativas (velocidad, pases, duelos, recuperaciones). Para ver los KPIs completos, genera un nuevo análisis de vídeo.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => setActiveTab("nuevo")}
                        >
                          <Zap size={13} />
                          Generar nuevo análisis
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Métricas Cuantitativas — vista clásica (se mantiene para compatibilidad) */}
                {latestReport.metricasCuantitativas && (
                  <QuantitativeMetricsPanel data={latestReport.metricasCuantitativas} />
                )}

                {/* Mapa de Calor */}
                {latestReport.metricasCuantitativas?.heatmapPositions &&
                  latestReport.metricasCuantitativas.heatmapPositions.length > 0 && (
                  <PlayerHeatmap
                    positions={latestReport.metricasCuantitativas.heatmapPositions}
                    title={`Mapa de Calor — ${player.name}`}
                  />
                )}

                {/* ADN */}
                <ADNFutbolistico data={latestReport.adnFutbolistico} />

                {/* Clon */}
                {top5Matches.length > 0 && bestMatchData && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Star size={12} className="text-gold" />
                      <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                        Jugadores Referencia
                      </span>
                    </div>
                    <ProPlayerMatch top5={top5Matches} bestMatch={bestMatchData} />
                  </div>
                )}

                {/* Proyección */}
                <ProyeccionCarrera data={latestReport.proyeccionCarrera} />

                {/* Proyección Competitiva — ligas juveniles */}
                {latestReport.proyeccionCompetitiva && (
                  <ProyeccionCompetitiva data={latestReport.proyeccionCompetitiva} />
                )}

                {/* Plan */}
                <PlanDesarrollo data={latestReport.planDesarrollo} />

                {/* Ejercicios recomendados RAG */}
                {latestReport.estadoActual?.areasDesarrollo &&
                  latestReport.estadoActual.areasDesarrollo.length > 0 && (
                  <DrillRecommendations areasDesarrollo={latestReport.estadoActual.areasDesarrollo} />
                )}

                {/* Guardar y Exportar */}
                <div className="glass rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
                      Guardar y Exportar
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      Confianza: {Math.round((latestReport.confianza ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                      onClick={() => {
                        if (id) PDFService.exportPlayerReport(id);
                      }}
                    >
                      <FileText size={13} />
                      Exportar PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                      onClick={() => {
                        if (id) PDFService.exportAsImage(id);
                      }}
                    >
                      <ArrowDownRight size={13} />
                      Exportar Imagen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                      onClick={() => {
                        const exportData = {
                          player: player ? { id: player.id, name: player.name, age: player.age, position: player.position } : null,
                          report: latestReport,
                          exportDate: new Date().toISOString(),
                          version: "VITAS 1.0",
                        };
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `vitas-intelligence-${player?.name?.replace(/\s/g, "-") ?? "report"}.json`;
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success("Datos exportados correctamente");
                      }}
                    >
                      <ClipboardList size={13} />
                      Exportar JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                      onClick={async () => {
                        const shareData = {
                          title: `VITAS Intelligence — ${player?.name ?? ""}`,
                          text: `Informe de ${player?.name ?? ""}: Nivel ${latestReport.estadoActual?.nivelActual ?? "N/A"}`,
                          url: window.location.href,
                        };
                        if (navigator.share) {
                          await navigator.share(shareData).catch(() => {});
                        } else {
                          await navigator.clipboard.writeText(window.location.href);
                          toast.success("Enlace copiado al portapapeles");
                        }
                      }}
                    >
                      <Target size={13} />
                      Compartir
                    </Button>
                  </div>
                  <div className="flex items-center justify-center gap-4 pt-1">
                    <button
                      onClick={() => setShowCard(true)}
                      className="flex items-center gap-1.5 text-[10px] text-gold font-bold"
                    >
                      <Star size={10} /> VITAS Card
                    </button>
                    <button
                      onClick={() => setActiveTab("nuevo")}
                      className="flex items-center gap-1.5 text-[10px] text-primary"
                    >
                      <RefreshCw size={10} /> Nuevo análisis
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Sin informe todavía */
              <div className="space-y-4">
                <div className="glass rounded-2xl p-8 text-center">
                  <Brain size={32} className="mx-auto mb-3 text-primary/50" />
                  <h3 className="text-sm font-display font-bold text-foreground mb-1">
                    Sin análisis todavía
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Genera el primer informe de inteligencia para {player.name}
                  </p>
                  <Button size="sm" onClick={() => setActiveTab("nuevo")} className="gap-2">
                    <Zap size={14} /> Generar Informe
                  </Button>
                </div>

                {/* Similitud rápida sin video */}
                {similarityData && bestMatchData && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                      Similitud por métricas (sin video)
                    </p>
                    <ProPlayerMatch top5={similarityData.top5} bestMatch={similarityData.bestMatch} />
                  </div>
                )}

                {!similarityData && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => refetchSimilarity()}
                    disabled={isSimilarityLoading}
                  >
                    {isSimilarityLoading ? (
                      <><Loader2 size={14} className="animate-spin" /> Calculando similitud...</>
                    ) : (
                      <><Star size={14} /> Ver jugadores similares ahora</>
                    )}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal VITAS Card */}
      <Dialog open={showCard} onOpenChange={setShowCard}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">VITAS Card — {player.name}</DialogTitle>
          </DialogHeader>
          <VitasCard
            player={player}
            bestMatch={bestMatchData}
            projection={latestReport?.proyeccionCarrera?.escenarioRealista?.nivelProyecto}
            onClose={() => setShowCard(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
