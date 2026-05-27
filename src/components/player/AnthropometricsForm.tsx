/**
 * VITAS · Antropometría + PHV
 *
 * Pantalla integrada en PlayerProfile que permite:
 *   - Registrar nuevas mediciones (altura, peso, sentado, pierna)
 *   - Calcular el PHV (Mirwald) automáticamente al guardar
 *   - Ver el histórico completo de mediciones
 *   - Editar o eliminar mediciones existentes
 *
 * Toda la persistencia va a Supabase (`player_anthropometrics`) vía
 * /api/players/anthropometrics. El cálculo PHV se cachea por fila.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ruler, Save, Loader2, Pencil, Trash2, Plus, X, Calendar,
  AlertCircle, Sparkles, WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/apiAuth";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";

interface Props {
  playerId: string;
  chronologicalAge: number;
  gender?: "M" | "F";
  /** Fallbacks si todavía no hay mediciones en la tabla histórica */
  fallback?: {
    heightCm?: number;
    weightKg?: number;
    sittingHeightCm?: number;
    legLengthCm?: number;
  };
  onSaved?: (result: PhvResult) => void;
}

interface PhvResult {
  offset: number;
  biologicalAge: number;
  category: "early" | "ontime" | "late";
  phv_status: "pre_phv" | "during_phv" | "post_phv";
  development_window: "critical" | "active" | "stable";
}

interface AnthroRow {
  id: string;
  player_id: string;
  height_cm: number;
  weight_kg: number;
  sitting_height_cm: number | null;
  leg_length_cm: number | null;
  chronological_age: number;
  maturity_offset: number;
  biological_age: number;
  phv_category: "early" | "ontime" | "late";
  phv_status: PhvResult["phv_status"];
  development_window: PhvResult["development_window"];
  measured_at: string;
  notes?: string | null;
}

const PHV_LABELS = {
  early:  { label: "Pre-estirón",  color: "#1A8FFF", emoji: "🌱" },
  ontime: { label: "En estirón",   color: "#B82BD9", emoji: "🚀" },
  late:   { label: "Post-estirón", color: "#10b981", emoji: "🏆" },
} as const;

const EMPTY_FORM = { height: "", weight: "", sitting: "", leg: "" };

export function AnthropometricsForm({ playerId, chronologicalAge, gender = "M", fallback, onSaved }: Props) {
  const [history, setHistory] = useState<AnthroRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [lastResult, setLastResult] = useState<PhvResult | null>(null);

  // Offline queue para mediciones · resilencia ante red intermitente
  const offline = useOfflineMutation({
    queueKey: "vitas_anthro_queue_v1",
    execute: async (action) => {
      const headers = await getAuthHeaders();
      const res = await fetch(action.url, {
        method: action.method,
        headers: { ...headers, "Content-Type": "application/json" },
        credentials: "include",
        body: action.payload ? JSON.stringify(action.payload) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
    },
  });

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/players/anthropometrics?playerId=${playerId}&history=true`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data?.data?.history)) {
        setHistory(data.data.history as AnthroRow[]);
      }
    } catch {
      // silencioso · el usuario puede registrar uno nuevo igual
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Si no hay histórico pero el jugador tiene fallback (PlayerForm), pre-rellenar
  useEffect(() => {
    if (!loading && history.length === 0 && fallback && !showForm) {
      setForm({
        height:  fallback.heightCm        ? String(fallback.heightCm)        : "",
        weight:  fallback.weightKg        ? String(fallback.weightKg)        : "",
        sitting: fallback.sittingHeightCm ? String(fallback.sittingHeightCm) : "",
        leg:     fallback.legLengthCm     ? String(fallback.legLengthCm)     : "",
      });
    }
  }, [loading, history.length, fallback, showForm]);

  function startNew() {
    setEditingId(null);
    setForm({
      height:  fallback?.heightCm        ? String(fallback.heightCm)        : "",
      weight:  fallback?.weightKg        ? String(fallback.weightKg)        : "",
      sitting: fallback?.sittingHeightCm ? String(fallback.sittingHeightCm) : "",
      leg:     fallback?.legLengthCm     ? String(fallback.legLengthCm)     : "",
    });
    setLastResult(null);
    setError(null);
    setShowForm(true);
  }

  function startEdit(row: AnthroRow) {
    setEditingId(row.id);
    setForm({
      height:  String(row.height_cm),
      weight:  String(row.weight_kg),
      sitting: row.sitting_height_cm ? String(row.sitting_height_cm) : "",
      leg:     row.leg_length_cm     ? String(row.leg_length_cm)     : "",
    });
    setLastResult(null);
    setError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const heightCm = Number(form.height);
    const weightKg = Number(form.weight);
    const sittingHeightCm = form.sitting ? Number(form.sitting) : 0;
    const legLengthCm = form.leg ? Number(form.leg) : 0;

    if (!heightCm || !weightKg) {
      setError("Altura y peso son obligatorios");
      setSubmitting(false);
      return;
    }

    if (!sittingHeightCm || !legLengthCm) {
      setError("Altura sentado y longitud de pierna son obligatorios para calcular el PHV con precisión real");
      setSubmitting(false);
      return;
    }

    const payload = {
      playerId,
      heightCm,
      weightKg,
      sittingHeightCm,
      legLengthCm,
      chronologicalAge,
      gender,
    };

    const url = editingId
      ? `/api/players/anthropometrics?id=${editingId}`
      : "/api/players/anthropometrics";
    const method: "POST" | "PATCH" = editingId ? "PATCH" : "POST";

    try {
      const result = await offline.run({
        url,
        method,
        payload,
        label: editingId ? "Actualizar medición" : "Nueva medición antropométrica",
      });

      if (result.sent) {
        toast.success(editingId ? "Medida actualizada" : "Medida guardada · PHV recalculado");
        await loadHistory();
      } else if (result.queued) {
        toast.info("📡 Guardado en cola · se sincronizará al volver la red", { duration: 5000 });
      }

      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta medición? El PHV histórico de esta fecha se perderá.")) return;
    try {
      const result = await offline.run({
        url: `/api/players/anthropometrics?id=${id}`,
        method: "DELETE",
        label: "Eliminar medición",
      });
      if (result.sent) {
        toast.success("Medición eliminada");
        await loadHistory();
      } else if (result.queued) {
        toast.info("📡 Eliminación en cola · se aplicará al recuperar conexión");
        // Optimistic UI · quitar de history local
        setHistory((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  const latest = history[0];

  return (
    <div className="space-y-3">
      {/* Indicador offline · solo si hay items en cola */}
      {offline.queueSize > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5">
          {offline.online && offline.syncing ? (
            <Loader2 size={11} className="text-amber-400 animate-spin shrink-0" />
          ) : (
            <WifiOff size={11} className="text-amber-400 shrink-0" />
          )}
          <span className="text-[10px] text-amber-400 font-display font-bold">
            {offline.queueSize} {offline.queueSize === 1 ? "cambio pendiente" : "cambios pendientes"}
            {offline.online ? " · sincronizando…" : " · sin conexión"}
          </span>
        </div>
      )}

      {/* Última medida + CTA nueva */}
      {!loading && (
        <div className="flex items-center justify-between gap-3">
          {latest ? (
            <div className="flex-1 text-[11px] text-muted-foreground">
              Última:{" "}
              <span className="text-foreground font-medium">
                {latest.height_cm}cm · {latest.weight_kg}kg
              </span>
              {" · "}
              <span style={{ color: PHV_LABELS[latest.phv_category].color }}>
                {PHV_LABELS[latest.phv_category].emoji} {PHV_LABELS[latest.phv_category].label}
              </span>
              {" · "}
              <span className="text-[10px]">
                {new Date(latest.measured_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            </div>
          ) : (
            <div className="flex-1 text-[11px] text-muted-foreground">
              Sin mediciones registradas. Añade la primera para calcular el PHV.
            </div>
          )}
          {!showForm && (
            <button
              onClick={startNew}
              className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <Plus size={12} /> Nueva
            </button>
          )}
        </div>
      )}

      {/* PHV resultado */}
      <AnimatePresence>
        {lastResult && !showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl p-3 border-2 bg-secondary/30"
            style={{ borderColor: PHV_LABELS[lastResult.category].color }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={12} className="text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Cálculo PHV (Mirwald)
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl">{PHV_LABELS[lastResult.category].emoji}</span>
              <div>
                <div className="font-display font-bold text-lg" style={{ color: PHV_LABELS[lastResult.category].color }}>
                  {PHV_LABELS[lastResult.category].label}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Maduración {lastResult.offset > 0 ? "+" : ""}{lastResult.offset} años · Edad biológica {lastResult.biologicalAge}a
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formulario · alta o edición */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="space-y-3 rounded-xl bg-secondary/30 p-3 border border-border"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                {editingId ? "Editar medición" : "Nueva medición"}
              </span>
              <button
                type="button"
                onClick={cancelForm}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Altura (cm)"
                value={form.height}
                onChange={(v) => setForm((f) => ({ ...f, height: v }))}
                min={80} max={230}
                required
                placeholder="165.5"
              />
              <Field
                label="Peso (kg)"
                value={form.weight}
                onChange={(v) => setForm((f) => ({ ...f, weight: v }))}
                min={15} max={150}
                required
                placeholder="55.2"
              />
              <Field
                label="Altura sentado (cm)"
                value={form.sitting}
                onChange={(v) => setForm((f) => ({ ...f, sitting: v }))}
                min={40} max={130}
                required
                placeholder="86.0"
                hint="obligatorio para PHV"
              />
              <Field
                label="Pierna (cm)"
                value={form.leg}
                onChange={(v) => setForm((f) => ({ ...f, leg: v }))}
                min={30} max={130}
                required
                placeholder="79.5"
                hint="obligatorio para PHV"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-[10px] text-destructive">
                <AlertCircle size={12} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-xs disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            >
              {submitting ? (
                <><Loader2 size={12} className="animate-spin" /> Guardando…</>
              ) : (
                <><Save size={12} /> {editingId ? "Actualizar medición" : "Guardar y calcular PHV"}</>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Histórico */}
      {history.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold pt-1">
            <Calendar size={10} />
            Histórico ({history.length})
          </div>
          <div className="space-y-1">
            {history.map((row) => {
              const phv = PHV_LABELS[row.phv_category];
              const date = new Date(row.measured_at);
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 px-2.5 py-2 border border-border/50"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-base shrink-0" title={phv.label}>{phv.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] text-foreground font-medium truncate">
                        {row.height_cm}cm · {row.weight_kg}kg
                        <span className="text-muted-foreground ml-2 text-[10px]">
                          off {row.maturity_offset > 0 ? "+" : ""}{row.maturity_offset}
                        </span>
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                        {row.sitting_height_cm && ` · sent ${row.sitting_height_cm}`}
                        {row.leg_length_cm     && ` · pierna ${row.leg_length_cm}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(row)}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Editar"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Hint educativo */}
      {!loading && (
        <p className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
          <Ruler size={10} className="inline mr-1" />
          Repite estas mediciones cada 3-4 meses para detectar el salto puberal. La fórmula <strong>Mirwald</strong>{" "}
          calcula automáticamente la edad biológica y ajusta el VSI según la fase de desarrollo.
        </p>
      )}
    </div>
  );
}

// ─── Sub-componente: input numérico con label compacto ──────────────────────

function Field({
  label, value, onChange, min, max, required, placeholder, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wide mb-1">
        {label} {required && <span className="text-primary">*</span>}
      </label>
      <input
        type="number"
        required={required}
        min={min}
        max={max}
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
      />
      {hint && <p className="text-[9px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
