/**
 * VITAS · First-run Wizard (Sprint Onboarding · día 1)
 *
 * Detecta primera vez del usuario (cero jugadores + flag NO seteado),
 * lo guía en 3 pasos para crear el primer jugador, y al terminar le
 * ofrece 3 next-actions claras para activar valor inmediato.
 *
 * Activación:
 *   - Auto-aparece tras OnboardingTour cierra · delay 800ms
 *   - Solo si:
 *       * No hay flag 'vitas_first_run_done_v1'
 *       * Player count === 0
 *       * Tour ya completado (vitas_onboarding_seen_v1 set)
 *
 * Flow:
 *   Step 1: Nombre + Edad
 *   Step 2: Posición + Pie dominante
 *   Step 3: Medidas (opcional · skip OK)
 *   Done:   3 CTAs próximos pasos
 *
 * Persistencia: marca `vitas_first_run_done_v1` al terminar O saltar
 * (single-shot · no vuelve a aparecer).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, ChevronRight, User, MapPin, Ruler, Trophy,
  Sparkles, FileText, Heart, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAllPlayers, useCreatePlayer } from "@/hooks/usePlayers";

const DONE_KEY = "vitas_first_run_done_v1";
const TOUR_KEY = "vitas_onboarding_seen_v1";

const POSITIONS = [
  { value: "Portero", emoji: "🥅" },
  { value: "Defensa Central", emoji: "🛡️" },
  { value: "Lateral Derecho", emoji: "↗️" },
  { value: "Lateral Izquierdo", emoji: "↖️" },
  { value: "Mediocentro", emoji: "⚙️" },
  { value: "Extremo", emoji: "⚡" },
  { value: "Delantero", emoji: "🎯" },
];

const FOOT_OPTIONS: Array<{ value: "right" | "left" | "both"; label: string; emoji: string }> = [
  { value: "right", label: "Diestro",     emoji: "🦵" },
  { value: "left",  label: "Zurdo",       emoji: "🦵" },
  { value: "both",  label: "Ambidiestro", emoji: "✨" },
];

interface FormState {
  name: string;
  age: string;
  position: string;
  foot: "right" | "left" | "both" | "";
  height: string;
  weight: string;
}

const EMPTY_FORM: FormState = {
  name: "", age: "", position: "", foot: "", height: "", weight: "",
};

// Defaults razonables si el user salta paso 3
const DEFAULTS_BY_AGE: Record<number, { height: number; weight: number }> = {
  // Estaturas/pesos medios europeos · interpolados
  8:  { height: 130, weight: 28 },
  9:  { height: 135, weight: 31 },
  10: { height: 140, weight: 34 },
  11: { height: 145, weight: 38 },
  12: { height: 150, weight: 42 },
  13: { height: 155, weight: 47 },
  14: { height: 162, weight: 52 },
  15: { height: 168, weight: 58 },
  16: { height: 172, weight: 62 },
  17: { height: 175, weight: 65 },
  18: { height: 177, weight: 68 },
};

function defaultsForAge(age: number) {
  const clamped = Math.min(18, Math.max(8, Math.round(age)));
  return DEFAULTS_BY_AGE[clamped] ?? { height: 160, weight: 50 };
}

export default function FirstRunWizard() {
  const navigate = useNavigate();
  const { data: players, isLoading } = useAllPlayers();
  const createPlayer = useCreatePlayer();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [createdPlayerId, setCreatedPlayerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-open · cero jugadores + tour visto + nunca completado el wizard
  useEffect(() => {
    if (isLoading) return;
    try {
      const done = localStorage.getItem(DONE_KEY);
      const tourSeen = localStorage.getItem(TOUR_KEY);
      if (done) return;                                // ya completado/saltado
      if (!players || players.length > 0) return;      // ya tiene jugadores
      if (!tourSeen) return;                            // espera al tour primero
      const t = setTimeout(() => setOpen(true), 800);   // delay tras tour
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, [players, isLoading]);

  function dismiss() {
    try { localStorage.setItem(DONE_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setOpen(false);
  }

  async function handleCreate(skipMeasurements: boolean) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const age = Number(form.age);
      const defaults = defaultsForAge(age);
      const heightCm = skipMeasurements || !form.height ? defaults.height : Number(form.height);
      const weightKg = skipMeasurements || !form.weight ? defaults.weight : Number(form.weight);

      const player = await createPlayer.mutateAsync({
        name: form.name.trim(),
        age,
        position: form.position,
        foot: (form.foot || "right") as "right" | "left" | "both",
        height: heightCm,
        weight: weightKg,
        gender: "M",
        competitiveLevel: "Regional",
        minutesPlayed: 0,
        // Defaults neutros para que el coach pueda ajustar después
        metrics: {
          speed: 50, technique: 50, vision: 50,
          stamina: 50, shooting: 50, defending: 50,
        },
      });

      setCreatedPlayerId(player.id);
      setStep(4);
      toast.success(`¡${player.name} añadido!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creando jugador");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNextStep() {
    if (step === 1) {
      if (!form.name.trim() || !form.age) {
        toast.error("Necesito nombre y edad");
        return;
      }
      const age = Number(form.age);
      if (age < 8 || age > 21) { toast.error("Edad entre 8 y 21"); return; }
      setStep(2);
    } else if (step === 2) {
      if (!form.position) { toast.error("Elige una posición"); return; }
      if (!form.foot)     { toast.error("Elige pie dominante"); return; }
      setStep(3);
    } else if (step === 3) {
      void handleCreate(false);
    }
  }

  function handleSkipMeasurements() {
    void handleCreate(true);
  }

  function handleGoToBaseline() {
    if (!createdPlayerId) return;
    dismiss();
    navigate(`/players/${createdPlayerId}/reports`);
  }

  function handleGoToProfile() {
    if (!createdPlayerId) return;
    dismiss();
    navigate(`/player/${createdPlayerId}`);
  }

  function handleGoToFamily() {
    if (!createdPlayerId) return;
    dismiss();
    navigate(`/family/${createdPlayerId}`);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[55] bg-background/85 backdrop-blur-md flex items-center justify-center p-4 print:hidden"
      >
        <motion.div
          initial={{ y: 16, scale: 0.96 }}
          animate={{ y: 0, scale: 1 }}
          className="glass rounded-3xl p-5 max-w-md w-full space-y-5 border-2 border-primary/40 relative"
        >
          {/* Close · solo permite cerrar antes del step done */}
          {step !== 4 && (
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Saltar configuración"
              title="Configurar más tarde"
            >
              <X size={14} />
            </button>
          )}

          {/* Progress dots */}
          {step !== 4 && (
            <div className="flex items-center justify-center gap-1.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-secondary"
                  }`}
                />
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ─── STEP 1 · Nombre + Edad ─────────────────────────── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ x: 12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -12, opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto">
                    <User size={26} className="text-primary" />
                  </div>
                  <h2 className="font-display font-bold text-lg text-foreground">Empecemos por lo básico</h2>
                  <p className="text-xs text-muted-foreground">Solo 3 pasos · ~30 segundos</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-display text-muted-foreground uppercase tracking-wider mb-1.5">
                      Nombre del jugador
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="ej. Samu"
                      autoFocus
                      maxLength={60}
                      className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-base text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-display text-muted-foreground uppercase tracking-wider mb-1.5">
                      Edad (años)
                    </label>
                    <input
                      type="number"
                      value={form.age}
                      onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                      placeholder="9"
                      min={8} max={21}
                      className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-base text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── STEP 2 · Posición + Pie ──────────────────────── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ x: 12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -12, opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="w-14 h-14 rounded-2xl bg-electric/20 border border-electric/40 flex items-center justify-center mx-auto">
                    <MapPin size={26} className="text-electric" />
                  </div>
                  <h2 className="font-display font-bold text-lg text-foreground">¿En qué posición juega?</h2>
                  <p className="text-xs text-muted-foreground">Y su pie dominante</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-display text-muted-foreground uppercase tracking-wider mb-1.5">
                      Posición
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {POSITIONS.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setForm((f) => ({ ...f, position: p.value }))}
                          className={`px-2 py-2 rounded-lg text-xs font-display border transition-all ${
                            form.position === p.value
                              ? "border-electric bg-electric/15 text-foreground font-bold"
                              : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {p.emoji} {p.value}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-display text-muted-foreground uppercase tracking-wider mb-1.5">
                      Pie dominante
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {FOOT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setForm((f) => ({ ...f, foot: opt.value }))}
                          className={`px-2 py-2.5 rounded-lg text-xs font-display border transition-all ${
                            form.foot === opt.value
                              ? "border-primary bg-primary/15 text-foreground font-bold"
                              : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {opt.emoji} {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── STEP 3 · Medidas opcional ────────────────────── */}
            {step === 3 && (
              <motion.div key="s3" initial={{ x: 12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -12, opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="w-14 h-14 rounded-2xl bg-gold/20 border border-gold/40 flex items-center justify-center mx-auto">
                    <Ruler size={26} className="text-gold" />
                  </div>
                  <h2 className="font-display font-bold text-lg text-foreground">Medidas (opcional)</h2>
                  <p className="text-xs text-muted-foreground">Puedes saltarlo · se añade después</p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-display text-muted-foreground uppercase tracking-wider mb-1.5">
                        Altura (cm)
                      </label>
                      <input
                        type="number"
                        value={form.height}
                        onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                        placeholder="ej. 145"
                        min={100} max={220}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-display text-muted-foreground uppercase tracking-wider mb-1.5">
                        Peso (kg)
                      </label>
                      <input
                        type="number"
                        value={form.weight}
                        onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                        placeholder="ej. 38"
                        min={20} max={120}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg bg-electric/10 border border-electric/30 p-2.5 text-[11px] text-foreground leading-relaxed">
                    💡 Estos datos desbloquean el cálculo <strong>PHV</strong> (edad biológica) que ajusta el VSI · si no los tienes ahora, los añades cuando midas.
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── STEP 4 · DONE · Next actions ───────────────── */}
            {step === 4 && (
              <motion.div key="s4" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4 text-center">
                <motion.div
                  animate={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 0.6 }}
                  className="text-5xl"
                >
                  🏆
                </motion.div>
                <div className="space-y-1">
                  <h2 className="font-display font-bold text-lg text-foreground">
                    ¡{form.name} añadido!
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    ¿Qué quieres hacer ahora?
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleGoToBaseline}
                    className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left border-2 border-primary/40"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-bold text-foreground flex items-center gap-1.5">
                        Generar primer informe
                        <Sparkles size={11} className="text-primary" />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        6 reportes Claude en 25-40s · sube un vídeo para análisis real
                      </div>
                    </div>
                    <span className="text-primary text-lg">→</span>
                  </button>

                  <button
                    onClick={handleGoToProfile}
                    className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left border border-electric/40"
                  >
                    <div className="w-9 h-9 rounded-lg bg-electric/20 border border-electric/40 flex items-center justify-center shrink-0">
                      <Trophy size={16} className="text-electric" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-bold text-foreground">Ver perfil completo</div>
                      <div className="text-[10px] text-muted-foreground">
                        Antropometría, PHV, evolución
                      </div>
                    </div>
                    <span className="text-electric">→</span>
                  </button>

                  <button
                    onClick={handleGoToFamily}
                    className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left border border-pink-400/40"
                  >
                    <div className="w-9 h-9 rounded-lg bg-pink-400/20 border border-pink-400/40 flex items-center justify-center shrink-0">
                      <Heart size={16} className="text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-bold text-foreground">Vista para familia</div>
                      <div className="text-[10px] text-muted-foreground">
                        Compartible con padre/madre por WhatsApp
                      </div>
                    </div>
                    <span className="text-pink-400">→</span>
                  </button>
                </div>

                <button
                  onClick={dismiss}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Más tarde · cierra esto
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Navigation footer · steps 1-3 ────────────────── */}
          {step !== 4 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              {step > 1 ? (
                <button
                  onClick={() => setStep((s) => Math.max(1, (s - 1) as 1 | 2 | 3))}
                  disabled={submitting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                >
                  <ChevronLeft size={12} /> Atrás
                </button>
              ) : <div />}

              {step === 3 ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleSkipMeasurements}
                    disabled={submitting}
                    className="px-3 py-2 text-xs font-display font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Saltar
                  </button>
                  <button
                    onClick={handleNextStep}
                    disabled={submitting}
                    className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={12} className="animate-spin" /> : <Trophy size={12} />}
                    Crear jugador
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleNextStep}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 transition-colors"
                >
                  Siguiente <ChevronRight size={12} />
                </button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
