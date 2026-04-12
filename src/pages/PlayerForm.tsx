/**
 * PlayerForm — Crear y editar jugadores
 * Ruta /players/new  → modo creación
 * Ruta /players/:id/edit → modo edición
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  ArrowLeft, Save, User, Ruler, Weight,
  Target, Dna, Trophy, Sliders, Info, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PlayerService } from "@/services/real/playerService";
import { StorageService } from "@/services/real/storageService";
import { MetricsService } from "@/services/real/metricsService";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";
import { useQueryClient } from "@tanstack/react-query";
import { usePlan } from "@/hooks/usePlan";
import { useAuth } from "@/context/AuthContext";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useTranslation } from "react-i18next";

// ─── Schema del formulario ────────────────────────────────────────────────────
const formSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres"),
  age: z.number({ invalid_type_error: "Ingresa la edad" }).min(8, "Mínimo 8 años").max(21, "Máximo 21 años"),
  position: z.string().min(1, "Selecciona una posición"),
  gender: z.enum(["M", "F"]).default("M"),
  foot: z.enum(["right", "left", "both"], { required_error: "Selecciona pie dominante" }),
  height: z.number({ invalid_type_error: "Ingresa la altura" }).min(100, "Mínimo 100 cm").max(220, "Máximo 220 cm"),
  weight: z.number({ invalid_type_error: "Ingresa el peso" }).min(20, "Mínimo 20 kg").max(120, "Máximo 120 kg"),
  sittingHeight: z.number().min(40).max(120).optional().or(z.literal(0).transform(() => undefined)),
  legLength: z.number().min(40).max(130).optional().or(z.literal(0).transform(() => undefined)),
  competitiveLevel: z.string().min(1, "Selecciona el nivel"),
  minutesPlayed: z.number().min(0).default(0),
  metrics: z.object({
    speed: z.number().min(0).max(100),
    technique: z.number().min(0).max(100),
    vision: z.number().min(0).max(100),
    stamina: z.number().min(0).max(100),
    shooting: z.number().min(0).max(100),
    defending: z.number().min(0).max(100),
  }),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Constantes ───────────────────────────────────────────────────────────────
const POSITIONS = [
  "Portero", "Defensa Central", "Lateral Derecho", "Lateral Izquierdo",
  "Pivote", "Mediocentro", "Mediapunta",
  "Extremo Derecho", "Extremo Izquierdo", "Delantero Centro", "Segundo Delantero",
];

const COMPETITIVE_LEVELS = ["Local", "Regional", "Nacional", "Internacional"];

const METRIC_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  speed:     { label: "Velocidad",   desc: "Aceleración y sprint",       color: "from-amber-400 to-orange-500" },
  technique: { label: "Técnica",     desc: "Control, pase, regate",      color: "from-blue-400 to-primary" },
  vision:    { label: "Visión",      desc: "Lectura del juego",          color: "from-violet-400 to-purple-600" },
  stamina:   { label: "Resistencia", desc: "Capacidad aeróbica",         color: "from-green-400 to-emerald-600" },
  shooting:  { label: "Disparo",     desc: "Potencia y precisión",       color: "from-rose-400 to-red-600" },
  defending: { label: "Defensa",     desc: "Marcaje y anticipación",     color: "from-cyan-400 to-teal-600" },
};

const DEFAULT_METRICS: FormValues["metrics"] = {
  speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 50, defending: 50,
};

// ─── VSI Preview en tiempo real ───────────────────────────────────────────────
function VSIPreview({ metrics }: { metrics: FormValues["metrics"] }) {
  const { t } = useTranslation();
  const vsi = MetricsService.calculateVSI(metrics);
  const label = MetricsService.classifyVSI(vsi);
  const labelColors: Record<string, string> = {
    elite: "text-primary",
    high: "text-electric",
    medium: "text-gold",
    developing: "text-muted-foreground",
  };
  return (
    <div className="glass rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
          {t("players.form.vsiRealtime")}
        </p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className={`font-display font-bold text-3xl ${labelColors[label]}`}>{vsi}</span>
          <span className={`text-xs font-display font-semibold uppercase ${labelColors[label]}`}>{label}</span>
        </div>
      </div>
      <div className="w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle
            cx="32" cy="32" r="26"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(vsi / 100) * 163.4} 163.4`}
            className="transition-all duration-500"
          />
        </svg>
      </div>
    </div>
  );
}

// ─── Slider de métrica ────────────────────────────────────────────────────────
function MetricSlider({
  name, value, onChange,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const info = METRIC_LABELS[name];
  const getColor = (v: number) => {
    if (v >= 85) return "text-primary";
    if (v >= 70) return "text-electric";
    if (v >= 50) return "text-gold";
    return "text-muted-foreground";
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-display font-semibold text-foreground">{info.label}</span>
          <span className="text-[10px] text-muted-foreground ml-2">{info.desc}</span>
        </div>
        <span className={`text-lg font-display font-bold w-10 text-right ${getColor(value)}`}>{value}</span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${info.color} transition-all duration-150`}
          style={{ width: `${value}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 opacity-0 absolute cursor-pointer"
        style={{ marginTop: "-0.875rem", position: "relative" }}
      />
    </div>
  );
}

// ─── Guía de medición antropométrica ──────────────────────────────────────────
function AnthropometricGuide({ t }: { t: (key: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 text-left"
      >
        <Info size={14} className="text-primary shrink-0" />
        <div className="flex-1">
          <span className="text-xs font-display font-semibold text-foreground">
            {t("players.form.anthropometricGuideTitle")}
          </span>
          <span className="text-[10px] text-muted-foreground ml-2">
            {t("players.form.anthropometricGuideDesc")}
          </span>
        </div>
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-primary/10 pt-2">
          <div className="flex gap-2">
            <Ruler size={12} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{t("players.form.sittingHeight")}:</strong>{" "}
              {t("players.form.anthropometricGuideSitting")}
            </p>
          </div>
          <div className="flex gap-2">
            <Ruler size={12} className="text-electric shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{t("players.form.legLength")}:</strong>{" "}
              {t("players.form.anthropometricGuideLeg")}
            </p>
          </div>
          <div className="flex gap-2 pt-1 border-t border-border/50">
            <Dna size={12} className="text-gold shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {t("players.form.anthropometricGuideWhere")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
const PlayerForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const queryClient = useQueryClient();
  const { canAddPlayer, limits, playerCount } = usePlan();
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      age: 14,
      position: "",
      gender: "M",
      foot: "right",
      height: 165,
      weight: 58,
      sittingHeight: 0,
      legLength: 0,
      competitiveLevel: "Regional",
      minutesPlayed: 0,
      metrics: DEFAULT_METRICS,
    },
  });

  // Cargar datos del jugador en modo edición
  useEffect(() => {
    if (!isEditMode || !id) return;
    const player = PlayerService.getById(id);
    if (!player) {
      toast.error(t("toasts.playerNotFound"));
      navigate("/rankings");
      return;
    }
    reset({
      name: player.name,
      age: player.age,
      position: player.position,
      gender: (player as typeof player & { gender?: "M" | "F" }).gender ?? "M",
      foot: player.foot,
      height: player.height,
      weight: player.weight,
      sittingHeight: player.sittingHeight ?? 0,
      legLength: player.legLength ?? 0,
      competitiveLevel: player.competitiveLevel,
      minutesPlayed: player.minutesPlayed,
      metrics: player.metrics,
    });
  }, [id, isEditMode, navigate, reset]);

  const metricsWatch = watch("metrics");

  const onSubmit = async (data: FormValues) => {
    // Verificar límite del plan antes de crear (solo en modo creación)
    if (!isEditMode && !canAddPlayer) {
      const limitLabel = limits.players >= 9999 ? "∞" : limits.players;
      toast.error(t("toasts.planLimitReached", { count: playerCount, limit: limitLabel }), {
        action: { label: t("toasts.viewPlans"), onClick: () => navigate("/billing") },
      });
      return;
    }

    try {
      if (isEditMode && id) {
        // Actualizar métricas + datos básicos en localStorage
        await PlayerService.updateMetrics(id, data.metrics);
        const players = PlayerService.getAll();
        const idx = players.findIndex((p) => p.id === id);
        if (idx !== -1) {
          players[idx] = {
            ...players[idx],
            name: data.name,
            age: data.age,
            position: data.position,
            foot: data.foot,
            height: data.height,
            weight: data.weight,
            sittingHeight: data.sittingHeight || undefined,
            legLength: data.legLength || undefined,
            competitiveLevel: data.competitiveLevel,
            minutesPlayed: data.minutesPlayed,
            updatedAt: new Date().toISOString(),
          };
          StorageService.set("players", players);
          // Sincronizar a Supabase en background
          if (user && SUPABASE_CONFIGURED) {
            SupabasePlayerService.pushOne(user.id, players[idx]).catch(() => {});
          }
        }
        toast.success(t("toasts.playerUpdated", { name: data.name }));
      } else {
        const input = {
          name: data.name,
          age: data.age,
          position: data.position,
          gender: data.gender,
          foot: data.foot,
          height: data.height,
          weight: data.weight,
          sittingHeight: data.sittingHeight || undefined,
          legLength: data.legLength || undefined,
          competitiveLevel: data.competitiveLevel,
          minutesPlayed: data.minutesPlayed,
          metrics: data.metrics,
        };
        // Crear jugador: si Supabase está activo, guardar también en cloud
        if (user && SUPABASE_CONFIGURED) {
          await SupabasePlayerService.create(user.id, input);
        } else {
          PlayerService.create(input);
        }
        toast.success(t("toasts.playerAdded", { name: data.name }));
      }

      // Invalida todas las caches relevantes
      queryClient.invalidateQueries({ queryKey: ["players-all"] });
      queryClient.invalidateQueries({ queryKey: ["rankings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (isEditMode && id) {
        queryClient.invalidateQueries({ queryKey: ["player", id] });
        queryClient.invalidateQueries({ queryKey: ["player-raw", id] });
      }

      navigate(isEditMode ? `/player/${id}` : "/rankings");
    } catch (err) {
      toast.error(t("toasts.playerSaveError"));
      console.error(err);
    }
  };

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-28 space-y-5 max-w-lg mx-auto"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-foreground">
            {isEditMode ? t("players.form.editTitle") : t("players.form.newTitle")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isEditMode ? t("players.form.editSubtitle") : t("players.form.newSubtitle")}
          </p>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Sección: Datos básicos */}
        <motion.div variants={item} className="glass rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User size={14} className="text-primary" />
            <h2 className="font-display font-semibold text-sm text-foreground">{t("players.form.basicData")}</h2>
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
              {t("players.form.fullName")}
            </Label>
            <Input
              id="name"
              placeholder={t("players.form.fullNamePlaceholder")}
              {...register("name")}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && <p className="text-[10px] text-destructive">{errors.name.message}</p>}
          </div>

          {/* Edad + Posición */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="age" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("common.age")}
              </Label>
              <Input
                id="age"
                type="number"
                min={8}
                max={21}
                {...register("age", { valueAsNumber: true })}
                className={errors.age ? "border-destructive" : ""}
              />
              {errors.age && <p className="text-[10px] text-destructive">{errors.age.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("common.position")}
              </Label>
              <select
                id="position"
                {...register("position")}
                className={`w-full h-9 rounded-md border bg-background px-3 py-1 text-sm font-display text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.position ? "border-destructive" : "border-input"
                }`}
              >
                <option value="">{t("common.select")}</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {errors.position && <p className="text-[10px] text-destructive">{errors.position.message}</p>}
            </div>
          </div>

          {/* Género */}
          <div className="space-y-1.5">
            <Label className="text-xs font-display text-muted-foreground uppercase tracking-wide">
              {t("common.gender")} <span className="text-[9px] normal-case">{t("players.form.genderNote")}</span>
            </Label>
            <Controller
              name="gender"
              control={control}
              render={({ field }) => (
                <div className="flex gap-2">
                  {[
                    { value: "M", label: t("common.male") },
                    { value: "F", label: t("common.female") },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-display font-semibold border transition-all ${
                        field.value === opt.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {/* Pie dominante */}
          <div className="space-y-1.5">
            <Label className="text-xs font-display text-muted-foreground uppercase tracking-wide">
              {t("common.foot")}
            </Label>
            <Controller
              name="foot"
              control={control}
              render={({ field }) => (
                <div className="flex gap-2">
                  {[
                    { value: "right", label: t("common.footRight") },
                    { value: "left", label: t("common.footLeft") },
                    { value: "both", label: t("common.footBoth") },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-display font-semibold border transition-all ${
                        field.value === opt.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
        </motion.div>

        {/* Sección: Físico */}
        <motion.div variants={item} className="glass rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Ruler size={14} className="text-electric" />
            <h2 className="font-display font-semibold text-sm text-foreground">{t("players.form.physicalData")}</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">{t("players.form.physicalNote")}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="height" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("players.form.heightCm")}
              </Label>
              <Input
                id="height"
                type="number"
                min={100}
                max={220}
                step={0.5}
                {...register("height", { valueAsNumber: true })}
                className={errors.height ? "border-destructive" : ""}
              />
              {errors.height && <p className="text-[10px] text-destructive">{errors.height.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("players.form.weightKg")}
              </Label>
              <Input
                id="weight"
                type="number"
                min={20}
                max={120}
                step={0.5}
                {...register("weight", { valueAsNumber: true })}
                className={errors.weight ? "border-destructive" : ""}
              />
              {errors.weight && <p className="text-[10px] text-destructive">{errors.weight.message}</p>}
            </div>
          </div>

          {/* Antropometría avanzada (opcional) — Guía + campos */}
          <AnthropometricGuide t={t} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sittingHeight" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("players.form.sittingHeight")}
              </Label>
              <Input
                id="sittingHeight"
                type="number"
                min={0}
                max={120}
                step={0.5}
                placeholder={t("players.form.optional")}
                {...register("sittingHeight", { valueAsNumber: true })}
              />
              <p className="text-[9px] text-muted-foreground">{t("players.form.sittingHeightHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legLength" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("players.form.legLength")}
              </Label>
              <Input
                id="legLength"
                type="number"
                min={0}
                max={130}
                step={0.5}
                placeholder={t("players.form.optional")}
                {...register("legLength", { valueAsNumber: true })}
              />
              <p className="text-[9px] text-muted-foreground">{t("players.form.legLengthHint")}</p>
            </div>
          </div>

          {/* Nivel competitivo + Minutos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="competitiveLevel" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("players.form.competitiveLevel")}
              </Label>
              <select
                id="competitiveLevel"
                {...register("competitiveLevel")}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-display text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COMPETITIVE_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minutesPlayed" className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                {t("players.form.minutesPlayed")}
              </Label>
              <Input
                id="minutesPlayed"
                type="number"
                min={0}
                step={10}
                {...register("minutesPlayed", { valueAsNumber: true })}
              />
            </div>
          </div>
        </motion.div>

        {/* Sección: Métricas */}
        <motion.div variants={item} className="glass rounded-xl p-4 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Sliders size={14} className="text-gold" />
            <h2 className="font-display font-semibold text-sm text-foreground">{t("players.form.performanceMetrics")}</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">0 – 100</span>
          </div>

          {/* VSI Preview en tiempo real */}
          <VSIPreview metrics={metricsWatch} />

          {/* Sliders */}
          {(Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>).map((metricKey) => (
            <Controller
              key={metricKey}
              name={`metrics.${metricKey}` as `metrics.${typeof metricKey}`}
              control={control}
              render={({ field }) => (
                <MetricSlider
                  name={metricKey}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          ))}
        </motion.div>

        {/* Botones */}
        <motion.div variants={item} className="flex gap-3 pt-2 pb-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => navigate(-1)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            className="flex-1 gap-2"
            disabled={isSubmitting}
          >
            <Save size={16} />
            {isSubmitting
              ? t("players.form.submitting")
              : isEditMode
              ? t("players.form.submitEdit")
              : t("players.form.submit")}
          </Button>
        </motion.div>
      </form>
    </motion.div>
  );
};

export default PlayerForm;
