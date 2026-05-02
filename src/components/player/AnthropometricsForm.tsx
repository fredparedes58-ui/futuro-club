/**
 * VITAS · Pantalla de medidas antropométricas
 *
 * Permite al padre/coach introducir altura, peso, altura sentado, longitud pierna.
 * Al guardar, calcula automáticamente el PHV (Mirwald) y muestra el resultado.
 *
 * Uso:
 *   <AnthropometricsForm playerId={player.id} chronologicalAge={13.5} />
 */

import { useEffect, useState } from "react";

interface Props {
  playerId: string;
  chronologicalAge: number;
  gender?: "M" | "F";
  onSaved?: (result: PhvResult) => void;
}

interface PhvResult {
  offset: number;
  biologicalAge: number;
  category: "early" | "ontime" | "late";
  phv_status: "pre_phv" | "during_phv" | "post_phv";
  development_window: "critical" | "active" | "stable";
}

interface LatestMeasure {
  height_cm: number;
  weight_kg: number;
  sitting_height_cm: number | null;
  leg_length_cm: number | null;
  maturity_offset: number;
  biological_age: number;
  phv_category: PhvResult["category"];
  phv_status: PhvResult["phv_status"];
  development_window: PhvResult["development_window"];
  measured_at: string;
}

const PHV_LABELS = {
  early: { label: "Pre-estirón", color: "#1A8FFF", emoji: "🌱" },
  ontime: { label: "En estirón", color: "#B82BD9", emoji: "🚀" },
  late: { label: "Post-estirón", color: "#10b981", emoji: "🏆" },
};

export function AnthropometricsForm({ playerId, chronologicalAge, gender = "M", onSaved }: Props) {
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [sittingHeightCm, setSittingHeightCm] = useState<string>("");
  const [legLengthCm, setLegLengthCm] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PhvResult | null>(null);
  const [latest, setLatest] = useState<LatestMeasure | null>(null);

  // Cargar última medida al montar
  useEffect(() => {
    fetch(`/api/players/anthropometrics?playerId=${playerId}&history=false`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.data?.latest) {
          const m: LatestMeasure = data.data.latest;
          setLatest(m);
          setHeightCm(String(m.height_cm));
          setWeightKg(String(m.weight_kg));
          setSittingHeightCm(m.sitting_height_cm ? String(m.sitting_height_cm) : "");
          setLegLengthCm(m.leg_length_cm ? String(m.leg_length_cm) : "");
        }
      })
      .catch(() => null);
  }, [playerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/players/anthropometrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          playerId,
          heightCm: Number(heightCm),
          weightKg: Number(weightKg),
          sittingHeightCm: sittingHeightCm ? Number(sittingHeightCm) : undefined,
          legLengthCm: legLengthCm ? Number(legLengthCm) : undefined,
          chronologicalAge,
          gender,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? "Error al guardar");

      setResult(data.data.phv);
      onSaved?.(data.data.phv);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-purple-600 font-bold mb-1">
          Medidas para análisis biomecánico
        </div>
        <h2 className="font-rajdhani text-2xl font-bold mb-2">
          Datos antropométricos
        </h2>
        <p className="text-sm text-slate-600">
          Estas medidas permiten calcular la <strong>edad biológica</strong> de tu hijo (fórmula Mirwald) y
          ajustar todas las métricas según su fase de crecimiento. <strong>Repítelas cada 3-4 meses</strong> para
          detectar cambios.
        </p>
      </header>

      {/* Última medida (si existe) */}
      {latest && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm">
          <div className="font-semibold mb-1">Última medida registrada</div>
          <div className="text-slate-600">
            {new Date(latest.measured_at).toLocaleDateString("es-ES")} · {latest.height_cm}cm · {latest.weight_kg}kg ·{" "}
            <span style={{ color: PHV_LABELS[latest.phv_category].color }}>
              {PHV_LABELS[latest.phv_category].emoji} {PHV_LABELS[latest.phv_category].label}
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Altura */}
        <div>
          <label className="block text-sm font-semibold mb-1">
            Altura (cm) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            required
            min={80}
            max={230}
            step="0.1"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="ej. 165.5"
          />
        </div>

        {/* Peso */}
        <div>
          <label className="block text-sm font-semibold mb-1">
            Peso (kg) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            required
            min={15}
            max={150}
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="ej. 55.2"
          />
        </div>

        {/* Altura sentado (opcional) */}
        <div>
          <label className="block text-sm font-semibold mb-1">
            Altura sentado (cm) <span className="text-slate-400 font-normal">opcional · mejora precisión</span>
          </label>
          <input
            type="number"
            min={40}
            max={130}
            step="0.1"
            value={sittingHeightCm}
            onChange={(e) => setSittingHeightCm(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="ej. 86.0"
          />
          <p className="text-xs text-slate-500 mt-1">
            Sentado en una silla, mide desde el asiento hasta la coronilla.
          </p>
        </div>

        {/* Longitud pierna (opcional) */}
        <div>
          <label className="block text-sm font-semibold mb-1">
            Longitud de la pierna (cm) <span className="text-slate-400 font-normal">opcional</span>
          </label>
          <input
            type="number"
            min={30}
            max={130}
            step="0.1"
            value={legLengthCm}
            onChange={(e) => setLegLengthCm(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="ej. 79.5"
          />
          <p className="text-xs text-slate-500 mt-1">
            Desde la cresta ilíaca (cadera) hasta el suelo, de pie y descalzo.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold disabled:opacity-50"
        >
          {submitting ? "Guardando y calculando PHV..." : "Guardar medida y calcular PHV"}
        </button>
      </form>

      {/* Resultado PHV */}
      {result && (
        <div
          className="rounded-2xl p-6 border-2"
          style={{ borderColor: PHV_LABELS[result.category].color }}
        >
          <div className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
            Resultado del cálculo
          </div>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-5xl">{PHV_LABELS[result.category].emoji}</span>
            <div>
              <div className="font-rajdhani font-bold text-3xl" style={{ color: PHV_LABELS[result.category].color }}>
                {PHV_LABELS[result.category].label}
              </div>
              <div className="text-sm text-slate-600">
                Maduración: {result.offset > 0 ? "+" : ""}{result.offset} años respecto a su edad cronológica
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500 text-xs uppercase tracking-wider">Edad cronológica</div>
              <div className="font-rajdhani font-bold text-xl">{chronologicalAge.toFixed(1)} años</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs uppercase tracking-wider">Edad biológica</div>
              <div className="font-rajdhani font-bold text-xl">{result.biologicalAge} años</div>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-4 leading-relaxed">
            La fase <strong>{PHV_LABELS[result.category].label.toLowerCase()}</strong> implica una ventana de
            desarrollo <strong>{result.development_window}</strong>. Tu análisis de vídeo y el VSI Score se
            ajustarán automáticamente a esta fase.
          </p>
        </div>
      )}
    </div>
  );
}
