/**
 * OnboardingPage — /onboarding
 * Flujo de bienvenida para nuevos usuarios: 4 pasos.
 *   1. Bienvenida
 *   2. Tipo de perfil (scout / parent / academy / club)
 *   3. Nombre de organización (opcional según perfil)
 *   4. Primer jugador (opcional)
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserRound, Users, Building2, Trophy,
  ChevronRight, ArrowLeft, Zap, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import {
  UserProfileService,
  PROFILE_TYPE_LABELS,
  PROFILE_TYPE_DESCRIPTIONS,
  type ProfileType,
  type UserRole,
} from "@/services/real/userProfileService";
import { PlayerService } from "@/services/real/playerService";

// ─── Constantes ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const PROFILE_ICONS: Record<ProfileType, React.ReactNode> = {
  scout:   <UserRound size={24} />,
  parent:  <Users size={24} />,
  academy: <Building2 size={24} />,
  club:    <Trophy size={24} />,
};

const PROFILE_ROLE_MAP: Record<ProfileType, UserRole> = {
  scout:   "scout",
  parent:  "viewer",
  academy: "director",
  club:    "director",
};

// ─── Componente ───────────────────────────────────────────────────────────────

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [profileType, setProfileType] = useState<ProfileType | null>(null);
  const [orgName, setOrgName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerAge, setPlayerAge] = useState("14");
  const [playerPosition, setPlayerPosition] = useState("Extremo Izquierdo");
  const [saving, setSaving] = useState(false);

  const showOrgStep = profileType === "academy" || profileType === "club";

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const prev = () => setStep((s) => Math.max(s - 1, 1));

  const handleFinish = async () => {
    if (!user || !profileType) return;
    setSaving(true);
    try {
      // Crear perfil de usuario
      UserProfileService.create({
        userId: user.id,
        profileType,
        role: PROFILE_ROLE_MAP[profileType],
        organizationName: orgName.trim() || undefined,
        onboardingCompleted: true,
      });

      // Crear primer jugador si se proporcionó nombre
      if (playerName.trim()) {
        PlayerService.create({
          name: playerName.trim(),
          age: parseInt(playerAge) || 14,
          position: playerPosition,
          gender: "M",
          foot: "right",
          height: 165,
          weight: 58,
          competitiveLevel: "Regional",
          minutesPlayed: 0,
          metrics: {
            speed: 60, technique: 60, vision: 60,
            stamina: 60, shooting: 50, defending: 50,
          },
        });
      }

      toast.success("¡Perfil configurado! Bienvenido a VITAS.");
      navigate("/pulse", { replace: true });
    } catch (err) {
      toast.error("Error al guardar el perfil");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const slide = {
    initial: { opacity: 0, x: 32 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
    exit:    { opacity: 0, x: -32, transition: { duration: 0.2 } },
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap size={20} className="text-primary" />
            <span className="font-display font-black text-2xl text-foreground tracking-tight">
              VITAS<span className="text-primary">.</span>
            </span>
          </div>
          <p className="text-[10px] font-display text-muted-foreground uppercase tracking-widest">
            Football Intelligence
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i + 1 === step
                  ? "w-6 h-2 bg-primary"
                  : i + 1 < step
                  ? "w-2 h-2 bg-primary/50"
                  : "w-2 h-2 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" {...slide} className="space-y-6 text-center">
              <div>
                <h1 className="font-display font-bold text-2xl text-foreground mb-2">
                  Bienvenido a VITAS<span className="text-primary">.</span>
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  La plataforma de inteligencia deportiva para scouts,
                  entrenadores y academias de fútbol.
                </p>
              </div>
              <div className="glass rounded-xl p-4 text-left space-y-2">
                {[
                  "Análisis IA de jugadores con VSI",
                  "VAEP · Valor por Evento real",
                  "PHV · Peak Height Velocity",
                  "Comparativas y role profiles",
                ].map((feat) => (
                  <div key={feat} className="flex items-center gap-2 text-xs font-display text-muted-foreground">
                    <Check size={12} className="text-primary shrink-0" />
                    {feat}
                  </div>
                ))}
              </div>
              <Button className="w-full gap-2" onClick={next}>
                Comenzar <ChevronRight size={14} />
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" {...slide} className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-foreground mb-1">
                  ¿Cómo usas VITAS?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Selecciona tu perfil para personalizar la experiencia.
                </p>
              </div>
              <div className="space-y-2">
                {(["scout", "parent", "academy", "club"] as ProfileType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setProfileType(type)}
                    className={`w-full glass rounded-xl p-3 flex items-center gap-3 border transition-all text-left ${
                      profileType === type
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:border-primary/30"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      profileType === type ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                    }`}>
                      {PROFILE_ICONS[type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-semibold text-foreground">
                        {PROFILE_TYPE_LABELS[type]}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                        {PROFILE_TYPE_DESCRIPTIONS[type]}
                      </p>
                    </div>
                    {profileType === type && (
                      <Check size={14} className="text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={prev} className="gap-1">
                  <ArrowLeft size={14} />
                </Button>
                <Button className="flex-1 gap-2" onClick={next} disabled={!profileType}>
                  Siguiente <ChevronRight size={14} />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" {...slide} className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-foreground mb-1">
                  {showOrgStep ? "Tu organización" : "Tu nombre"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {showOrgStep
                    ? "¿Cómo se llama tu academia o club?"
                    : "¿Cómo quieres que te identifiquemos?"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                  {showOrgStep ? "Nombre de la organización" : "Tu nombre"}{" "}
                  <span className="text-[9px] normal-case text-muted-foreground/60">(opcional)</span>
                </Label>
                <Input
                  placeholder={
                    profileType === "academy"
                      ? "Ej: Academia Fútbol Norte"
                      : profileType === "club"
                      ? "Ej: Club Deportivo Atlético"
                      : profileType === "scout"
                      ? "Ej: Carlos Martínez"
                      : "Ej: Juan García"
                  }
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={prev} className="gap-1">
                  <ArrowLeft size={14} />
                </Button>
                <Button className="flex-1 gap-2" onClick={next}>
                  Siguiente <ChevronRight size={14} />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" {...slide} className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-xl text-foreground mb-1">
                  Primer jugador
                </h2>
                <p className="text-xs text-muted-foreground">
                  Registra un jugador inicial o sáltalo por ahora.
                </p>
              </div>

              <div className="glass rounded-xl p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                    Nombre
                  </Label>
                  <Input
                    placeholder="Ej: Lucas Moreno"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                      Edad
                    </Label>
                    <Input
                      type="number"
                      min={8}
                      max={21}
                      value={playerAge}
                      onChange={(e) => setPlayerAge(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-display text-muted-foreground uppercase tracking-wide">
                      Posición
                    </Label>
                    <select
                      value={playerPosition}
                      onChange={(e) => setPlayerPosition(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-display text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {[
                        "Portero", "Defensa Central", "Lateral Derecho", "Lateral Izquierdo",
                        "Pivote", "Mediocentro", "Mediapunta",
                        "Extremo Derecho", "Extremo Izquierdo", "Delantero Centro",
                      ].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={prev} className="gap-1">
                  <ArrowLeft size={14} />
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 text-muted-foreground"
                  onClick={() => { setPlayerName(""); handleFinish(); }}
                  disabled={saving}
                >
                  Saltar
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleFinish}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : (
                    <><Check size={14} /> Finalizar</>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default OnboardingPage;
