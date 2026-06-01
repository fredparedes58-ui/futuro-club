/**
 * VITAS · IDPCheckinForm
 *
 * Cuestionario de fin de mes que el coach rellena. Captura:
 *   - score global del plan (0-100)
 *   - 5 preguntas Likert por dimensión
 *   - notas cualitativas
 *   - ajustes propuestos para el próximo mes
 *   - opción "cerrar mes" (transiciona plan a completed)
 */

import { useState } from "react";
import { Save, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { DevelopmentPlan, IDPDimension } from "@/lib/idp/idpTypes";

interface Props {
  plan: DevelopmentPlan;
  /** Coach user_id for `reviewerId` */
  reviewerId?: string;
  onSubmit: (payload: {
    planId: string;
    reviewerId?: string;
    progressScore: number;
    qualitativeNotes: string;
    questionnaireAnswers: Record<string, unknown>;
    adjustmentsProposed: {
      nextMonthFocus?: string;
      dimensionsToBoost?: IDPDimension[];
      notes?: string;
    };
    closeMonth: boolean;
  }) => void;
  submitting?: boolean;
}

const LIKERT = [
  { value: 1, label: "Nada" },
  { value: 2, label: "Poco" },
  { value: 3, label: "Algo" },
  { value: 4, label: "Bastante" },
  { value: 5, label: "Mucho" },
];

const DIMENSIONS: { key: IDPDimension; label: string; question: string }[] = [
  { key: "technical",  label: "Técnico",   question: "¿Mejoró el control y precisión técnica?" },
  { key: "tactical",   label: "Táctico",   question: "¿Tomó mejores decisiones tácticas?" },
  { key: "physical",   label: "Físico",    question: "¿Ganó capacidad física?" },
  { key: "mental",     label: "Mental",    question: "¿Mostró progreso mental (decisión, resiliencia)?" },
  { key: "maturation", label: "Maduración",question: "¿Se gestionó bien su carga vs su PHV?" },
];

export function IDPCheckinForm({ plan, reviewerId, onSubmit, submitting }: Props) {
  const [progressScore, setProgressScore] = useState(70);
  const [likert, setLikert] = useState<Partial<Record<IDPDimension, number>>>({});
  const [notes, setNotes] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  const [toBoost, setToBoost] = useState<Set<IDPDimension>>(new Set());
  const [closeMonth, setCloseMonth] = useState(true);

  // Only show dimensions that the plan actually contains
  const planDimensions = new Set(plan.goals?.map((g) => g.dimension) ?? []);
  const relevantDims = DIMENSIONS.filter((d) => planDimensions.has(d.key));

  function toggleBoost(d: IDPDimension) {
    const next = new Set(toBoost);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setToBoost(next);
  }

  function handleSubmit() {
    onSubmit({
      planId: plan.id,
      reviewerId,
      progressScore,
      qualitativeNotes: notes,
      questionnaireAnswers: likert,
      adjustmentsProposed: {
        nextMonthFocus: nextFocus || undefined,
        dimensionsToBoost: Array.from(toBoost),
        notes: notes || undefined,
      },
      closeMonth,
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Overall score */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-medium text-white">Progreso global del plan</h3>
          <span className="text-2xl font-bold text-white tabular-nums">
            {progressScore}
            <span className="text-sm text-slate-500">/100</span>
          </span>
        </div>
        <Slider
          value={[progressScore]}
          onValueChange={(v) => setProgressScore(v[0])}
          min={0}
          max={100}
          step={5}
        />
        <p className="text-xs text-slate-500 mt-1">
          Tu evaluación holística del mes para este jugador.
        </p>
      </section>

      {/* Per-dimension Likert */}
      <section>
        <h3 className="text-sm font-medium text-white mb-3">Por dimensión</h3>
        <div className="space-y-3">
          {relevantDims.map((d) => (
            <div key={d.key} className="rounded-lg border border-white/10 p-3 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{d.label}</Badge>
                  <span className="text-xs text-slate-300">{d.question}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {LIKERT.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLikert({ ...likert, [d.key]: opt.value })}
                    className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                      likert[d.key] === opt.value
                        ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-200"
                        : "bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    {opt.value} · {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Next month focus */}
      <section>
        <h3 className="text-sm font-medium text-white mb-2">Foco para el próximo mes</h3>
        <Textarea
          value={nextFocus}
          onChange={(e) => setNextFocus(e.target.value)}
          placeholder="Ej: consolidar lo trabajado en mental, pasar a alta intensidad en físico..."
          className="bg-white/[0.02] border-white/10 text-sm"
          rows={2}
        />
      </section>

      {/* Dimensions to boost */}
      <section>
        <h3 className="text-sm font-medium text-white mb-2">Dimensiones a reforzar</h3>
        <div className="flex flex-wrap gap-2">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => toggleBoost(d.key)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                toBoost.has(d.key)
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section>
        <h3 className="text-sm font-medium text-white mb-2">Notas adicionales</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Comentarios cualitativos del mes, lesiones, contexto personal..."
          className="bg-white/[0.02] border-white/10 text-sm"
          rows={3}
        />
      </section>

      {/* Close month checkbox */}
      <section className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={closeMonth}
            onCheckedChange={(v) => setCloseMonth(!!v)}
            className="mt-0.5"
          />
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <Lock className="size-3 text-amber-400" />
              <span className="font-medium text-amber-200">Cerrar mes</span>
            </div>
            <p className="text-xs text-amber-300/70 mt-0.5">
              Marca el plan como completado. El próximo plan se generará automáticamente con el contexto de este checkin.
            </p>
          </div>
        </label>
      </section>

      <Button onClick={handleSubmit} disabled={submitting} className="w-full" size="lg">
        <Save className="size-4 mr-2" />
        {submitting ? "Guardando..." : "Guardar checkin"}
      </Button>
    </div>
  );
}
