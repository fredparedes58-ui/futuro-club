/**
 * VITAS · PhvWindowPlan (Sprint B3 · día 1-2)
 *
 * Visualiza el plan de carga periodizado generado por Claude según la
 * fase PHV del jugador. Diferenciador único · ningún competidor lo hace.
 *
 * Estados:
 *   - sin PHV calculado → CTA para registrar antropometría
 *   - sin plan generado → botón "Generar plan"
 *   - con plan → render completo con secciones expandibles
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, Loader2, AlertCircle, Activity, Zap, Shield, Calendar,
  TrendingUp, Eye, ListChecks, X,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/apiAuth";

interface Plan {
  current_phase: "pre_phv" | "in_phv" | "post_phv";
  phase_label: string;
  phase_description: string;
  neuromotor_window: {
    is_open: boolean;
    months_remaining: number;
    advice: string;
  };
  training_load: {
    intensity: number;
    volume: "alto" | "medio" | "bajo";
    frequency: string;
    main_focus: string;
  };
  do: Array<{ action: string; why: string }>;
  avoid: Array<{ action: string; risk: string }>;
  monitoring: {
    metrics_to_track: string[];
    remeasure_in_months: number;
  };
  next_phase_preview: string;
}

const PHASE_META: Record<Plan["current_phase"], { color: string; emoji: string }> = {
  pre_phv:  { color: "#1A8FFF", emoji: "🌱" },
  in_phv:   { color: "#B82BD9", emoji: "🚀" },
  post_phv: { color: "#10b981", emoji: "🏆" },
};

interface Props {
  playerId: string;
  hasPhv: boolean;
}

export function PhvWindowPlan({ playerId, hasPhv }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/players/phv-window-plan", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message ?? "No se pudo generar el plan");
      }
      setPlan(data.data.plan as Plan);
      setExpanded(true);
      toast.success("✓ Plan PHV generado");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // Sin PHV calculado
  if (!hasPhv) {
    return (
      <div className="rounded-lg bg-secondary/30 border border-border p-3 flex items-start gap-2">
        <AlertCircle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-display font-bold text-foreground">
            Plan PHV no disponible
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Registra una medición antropométrica arriba para calcular el PHV y desbloquear el plan periodizado.
          </p>
        </div>
      </div>
    );
  }

  // Aún no generado
  if (!plan && !loading) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-primary/15 via-electric/10 to-transparent border border-primary/30 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
            Plan PHV periodizado
          </span>
          <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 ml-auto">
            Único en el mercado
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Genera un plan de carga de entrenamiento ajustado a la fase de maduración biológica del jugador.
          Identifica la ventana neuromotora, riesgos a evitar y métricas a monitorizar.
        </p>
        {error && (
          <div className="flex items-center gap-1.5 text-[10px] text-destructive">
            <AlertCircle size={11} /> {error}
          </div>
        )}
        <button
          onClick={handleGenerate}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-display font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
        >
          <Sparkles size={11} /> Generar plan PHV
        </button>
      </div>
    );
  }

  // Cargando
  if (loading) {
    return (
      <div className="rounded-xl bg-secondary/30 border border-border p-4 flex items-center justify-center gap-2">
        <Loader2 size={14} className="animate-spin text-primary" />
        <span className="text-[11px] text-muted-foreground">Claude generando plan…</span>
      </div>
    );
  }

  if (!plan) return null;

  const meta = PHASE_META[plan.current_phase];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="rounded-xl border-2 p-3 space-y-3"
      style={{ borderColor: meta.color, backgroundColor: `${meta.color}10` }}
    >
      {/* Header · fase actual */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-2xl shrink-0">{meta.emoji}</span>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: meta.color }}>
              Fase actual
            </div>
            <div className="font-display font-bold text-sm text-foreground">
              {plan.phase_label}
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-muted-foreground hover:text-foreground p-1"
          aria-label={expanded ? "Colapsar" : "Expandir"}
        >
          {expanded ? <X size={12} /> : "Ver"}
        </button>
      </div>
      <p className="text-[11px] text-foreground/90 leading-relaxed">
        {plan.phase_description}
      </p>

      {/* Ventana neuromotora */}
      {plan.neuromotor_window && (
        <div className={`rounded-lg p-2.5 ${plan.neuromotor_window.is_open ? "bg-green-400/10 border border-green-400/30" : "bg-secondary/40 border border-border"}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Eye size={11} className={plan.neuromotor_window.is_open ? "text-green-400" : "text-muted-foreground"} />
            <span className={`text-[10px] uppercase tracking-wider font-bold ${plan.neuromotor_window.is_open ? "text-green-400" : "text-muted-foreground"}`}>
              Ventana neuromotora · {plan.neuromotor_window.is_open ? "ABIERTA" : "cerrada"}
            </span>
            {plan.neuromotor_window.is_open && plan.neuromotor_window.months_remaining > 0 && (
              <span className="ml-auto text-[10px] font-display font-bold text-green-400">
                ~{plan.neuromotor_window.months_remaining} meses
              </span>
            )}
          </div>
          <p className="text-[10px] text-foreground/90 leading-relaxed">
            {plan.neuromotor_window.advice}
          </p>
        </div>
      )}

      {/* Carga de entrenamiento */}
      {expanded && plan.training_load && (
        <div className="rounded-lg bg-secondary/40 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={11} className="text-electric" />
            <span className="text-[10px] uppercase tracking-wider text-electric font-bold">
              Carga recomendada
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Stat label="Intensidad" value={`${plan.training_load.intensity}/10`} />
            <Stat label="Volumen" value={plan.training_load.volume} />
            <Stat label="Frecuencia" value={plan.training_load.frequency} small />
          </div>
          <p className="text-[10px] text-foreground/90 leading-relaxed pt-2 border-t border-border/40">
            <strong className="text-electric">Foco:</strong> {plan.training_load.main_focus}
          </p>
        </div>
      )}

      {/* DO */}
      {expanded && plan.do && plan.do.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity size={11} className="text-green-400" />
            <span className="text-[10px] uppercase tracking-wider text-green-400 font-bold">
              Hacer ({plan.do.length})
            </span>
          </div>
          <ul className="space-y-1">
            {plan.do.map((d, i) => (
              <li key={i} className="text-[10px] leading-relaxed">
                <span className="text-foreground font-semibold">{d.action}</span>
                <span className="text-muted-foreground"> · {d.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AVOID */}
      {expanded && plan.avoid && plan.avoid.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shield size={11} className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
              Evitar ({plan.avoid.length})
            </span>
          </div>
          <ul className="space-y-1">
            {plan.avoid.map((a, i) => (
              <li key={i} className="text-[10px] leading-relaxed">
                <span className="text-foreground font-semibold">{a.action}</span>
                <span className="text-amber-400/80"> · riesgo: {a.risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Monitoring */}
      {expanded && plan.monitoring && (
        <div className="rounded-lg bg-secondary/40 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ListChecks size={11} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              Monitorizar
            </span>
            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar size={10} /> Re-medir en {plan.monitoring.remeasure_in_months}m
            </span>
          </div>
          {plan.monitoring.metrics_to_track && plan.monitoring.metrics_to_track.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plan.monitoring.metrics_to_track.map((m, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview próxima fase */}
      {expanded && plan.next_phase_preview && (
        <div className="rounded-lg bg-electric/10 border border-electric/30 p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={11} className="text-electric" />
            <span className="text-[10px] uppercase tracking-wider text-electric font-bold">
              Qué viene
            </span>
          </div>
          <p className="text-[10px] text-foreground/90 leading-relaxed">
            {plan.next_phase_preview}
          </p>
        </div>
      )}

      {expanded && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-1.5 rounded-md text-[10px] text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 transition-colors flex items-center justify-center gap-1"
        >
          <Sparkles size={9} /> Regenerar plan
        </button>
      )}
    </motion.div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className={`font-display font-bold text-foreground ${small ? "text-[10px]" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
