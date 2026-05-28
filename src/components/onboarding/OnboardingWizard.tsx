/**
 * VITAS · Onboarding Wizard · 4-step
 *
 * Flujo guiado para nuevos usuarios:
 *   1. Signup (cuenta + persona)
 *   2. Consent parental (si es padre/jugador menor)
 *   3. Primer upload (vídeo)
 *   4. Ver reporte generado
 *
 * Persistencia: localStorage para retomar si abandona.
 *
 * Uso:
 *   <OnboardingWizard onComplete={() => navigate("/dashboard")} />
 */

import { useState, useEffect } from "react";
import { StepSignup } from "./StepSignup";
import { StepConsent } from "./StepConsent";
import { StepFirstUpload } from "./StepFirstUpload";
import { StepFirstReport } from "./StepFirstReport";
import { usePlan } from "@/hooks/usePlan";
import { PLAN_LABELS, PLAN_LIMITS } from "@/services/real/subscriptionService";
import { Zap, Lock, CheckCircle2, Mail } from "lucide-react";

export type OnboardingPersona =
  | "parent"
  | "player"
  | "coach"
  | "scout"
  | "academy_director"
  | "agent"
  | "club_director"
  | "other";

export interface OnboardingState {
  step: 1 | 2 | 3 | 4;
  userId: string | null;
  persona: OnboardingPersona | null;
  isMinor: boolean;          // si el jugador es menor → consent obligatorio
  playerId: string | null;
  videoId: string | null;
  analysisId: string | null;
  consentVerified: boolean;
}

const INITIAL_STATE: OnboardingState = {
  step: 1,
  userId: null,
  persona: null,
  isMinor: false,
  playerId: null,
  videoId: null,
  analysisId: null,
  consentVerified: false,
};

const STORAGE_KEY = "vitas_onboarding_state_v1";

interface Props {
  onComplete?: () => void;
}

// ── Inline step: plan info (shown between step 1 and step 2/3) ──
function StepPlanInfo({ onContinue }: { onContinue: () => void }) {
  const { plan, limits, analysesUsed, playerCount, isPro, isClub } = usePlan();
  const planLabel = PLAN_LABELS[plan];
  const features = [
    { label: "Análisis IA/mes", value: limits.analyses >= 9999 ? "∞" : limits.analyses, used: analysesUsed },
    { label: "Jugadores", value: limits.players >= 9999 ? "∞" : limits.players, used: playerCount },
    { label: "Miembros equipo", value: limits.teamMembers >= 9999 ? "∞" : limits.teamMembers },
    { label: "VAEP avanzado", value: limits.vaep ? "✓" : "—" },
    { label: "Export PDF", value: limits.pdf ? "✓" : "—" },
  ];

  return (
    <div className="space-y-6 text-center">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center mx-auto">
        <Zap size={24} className="text-blue-500" />
      </div>
      <div>
        <h2 className="text-xl font-rajdhani font-bold">Tu plan actual: <span className="text-blue-600">{planLabel}</span></h2>
        <p className="text-sm text-slate-500 mt-1">
          {isPro || isClub
            ? "Tienes acceso a funcionalidades avanzadas."
            : "El admin de tu academia puede upgradearte en cualquier momento."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-left max-w-sm mx-auto">
        {features.map((f) => (
          <div key={f.label} className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{f.label}</p>
            <p className="text-lg font-rajdhani font-bold text-slate-900">
              {f.used != null ? `${f.used}/` : ""}{f.value}
            </p>
          </div>
        ))}
      </div>
      {!(isPro || isClub) && (
        <div className="bg-blue-50 rounded-xl p-4 text-left">
          <div className="flex items-start gap-3">
            <Lock size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-900">¿Necesitas más?</p>
              <p className="text-[11px] text-blue-700 mt-1">
                Contacta al admin de tu academia para desbloquear análisis ilimitados, VAEP avanzado y más.
              </p>
              <a
                href="mailto:fredparedes58@gmail.com?subject=VITAS%20Upgrade%20Request"
                className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
              >
                <Mail size={11} /> Solicitar upgrade
              </a>
            </div>
          </div>
        </div>
      )}
      <button
        onClick={onContinue}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-rajdhani font-bold text-sm hover:opacity-90 transition-opacity"
      >
        Continuar →
      </button>
    </div>
  );
}

export function OnboardingWizard({ onComplete }: Props) {
  const [showPlanStep, setShowPlanStep] = useState(false);
  const [state, setState] = useState<OnboardingState>(() => {
    if (typeof window === "undefined") return INITIAL_STATE;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_STATE;
    } catch {
      return INITIAL_STATE;
    }
  });

  // Persistir estado
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  function update(partial: Partial<OnboardingState>) {
    setState((s) => ({ ...s, ...partial }));
  }

  function next() {
    setState((s) => {
      // Saltar step 2 (consent) si NO es padre/jugador menor
      if (s.step === 1 && !s.isMinor) {
        return { ...s, step: 3 };
      }
      const nextStep = Math.min(4, (s.step + 1)) as 1 | 2 | 3 | 4;
      return { ...s, step: nextStep };
    });
  }

  function back() {
    setState((s) => {
      const prev = Math.max(1, s.step - 1) as 1 | 2 | 3 | 4;
      return { ...s, step: prev };
    });
  }

  function finish() {
    localStorage.removeItem(STORAGE_KEY);
    onComplete?.();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header con progreso */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-purple-600 font-bold">
                Bienvenida a VITAS
              </div>
              <h1 className="font-rajdhani text-2xl sm:text-3xl font-bold mt-1">
                Configura tu cuenta · {Math.min(state.step, 4)}/4
              </h1>
            </div>
          </div>

          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => {
              const isCompleted = n < state.step;
              const isActive = n === state.step;
              const isSkipped = n === 2 && !state.isMinor && state.step >= 3;
              return (
                <div
                  key={n}
                  className={`flex-1 h-1.5 rounded-full transition ${
                    isCompleted || isSkipped
                      ? "bg-gradient-to-r from-blue-500 to-purple-500"
                      : isActive
                        ? "bg-gradient-to-r from-blue-500 to-purple-500 opacity-50"
                        : "bg-slate-200"
                  }`}
                />
              );
            })}
          </div>

          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span className={state.step === 1 ? "font-semibold text-slate-900" : ""}>
              1. Tu cuenta
            </span>
            <span className={state.step === 2 ? "font-semibold text-slate-900" : ""}>
              2. Consentimiento
            </span>
            <span className={state.step === 3 ? "font-semibold text-slate-900" : ""}>
              3. Primer vídeo
            </span>
            <span className={state.step === 4 ? "font-semibold text-slate-900" : ""}>
              4. Tu reporte
            </span>
          </div>
        </header>

        {/* Step content */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {state.step === 1 && !showPlanStep && (
            <StepSignup
              onComplete={(data) => {
                update({
                  userId: data.userId,
                  persona: data.persona,
                  isMinor: data.isMinor,
                  playerId: data.playerId,
                });
                setShowPlanStep(true);
              }}
            />
          )}

          {state.step === 1 && showPlanStep && (
            <StepPlanInfo onContinue={() => { setShowPlanStep(false); next(); }} />
          )}

          {state.step === 2 && state.playerId && (
            <StepConsent
              playerId={state.playerId}
              onComplete={() => {
                update({ consentVerified: true });
                next();
              }}
              onBack={back}
            />
          )}

          {state.step === 3 && state.playerId && (
            <StepFirstUpload
              playerId={state.playerId}
              onComplete={(videoId, analysisId) => {
                update({ videoId, analysisId });
                next();
              }}
              onBack={back}
              onSkip={() => finish()}
            />
          )}

          {state.step === 4 && state.analysisId && (
            <StepFirstReport
              analysisId={state.analysisId}
              playerId={state.playerId ?? ""}
              onComplete={() => finish()}
            />
          )}
        </div>

        {/* Footer · skip onboarding */}
        <div className="mt-6 text-center">
          <button
            onClick={finish}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Saltar onboarding · ir al dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
