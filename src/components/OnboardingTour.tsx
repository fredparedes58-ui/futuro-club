/**
 * VITAS · Onboarding Tour (Sprint UX · día 3)
 *
 * Modal tour que aparece UNA VEZ tras el primer login (o al pulsar
 * "Ver tour" desde Settings). Muestra 5 slides con las features
 * killer · skipable · persistido en localStorage.
 *
 * Skip / Done → marca como visto · no vuelve a aparecer.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, ChevronRight, Activity, Swords, Grid3x3, Sparkles,
  Search, Brain, Trophy,
} from "lucide-react";

const SEEN_KEY = "vitas_onboarding_seen_v1";

interface Slide {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  title: string;
  description: string;
  cta?: { label: string; to: string };
}

const SLIDES: Slide[] = [
  {
    Icon: Brain,
    color: "#0066CC",
    title: "Bienvenido a VITAS",
    description: "Análisis IA de fútbol juvenil con corrección por maduración biológica (PHV). Único en el mercado · adaptado a la realidad de cada jugador.",
  },
  {
    Icon: Activity,
    color: "#22e88c",
    title: "Match-day Live",
    description: "Etiqueta eventos del partido en directo desde el móvil con 6 botones. Al pitido final, 4 reportes Claude listos en 60 segundos.",
    cta: { label: "Probar Match-day", to: "/live" },
  },
  {
    Icon: Swords,
    color: "#F59E0B",
    title: "Plan vs Rival",
    description: "Describe al rival con lo que sepas (formación, jugadores clave, debilidades) y recibe un plan de partido completo + drills para entrenar la semana.",
    cta: { label: "Crear plan", to: "/equipo/rival" },
  },
  {
    Icon: Grid3x3,
    color: "#1A8FFF",
    title: "Análisis táctico de equipo",
    description: "5 reportes IA + grid de 9 cuadrantes con eficacia ofensiva/defensiva por zona del campo. Sin necesidad de vídeo.",
    cta: { label: "Ver demo", to: "/equipo/baseline" },
  },
  {
    Icon: Search,
    color: "#B82BD9",
    title: "Búsqueda global ⌘K",
    description: "Pulsa ⌘K (o Ctrl+K) en cualquier momento para buscar jugadores, acciones o ir directo a cualquier página. El botón flotante arriba a la derecha también lo abre.",
  },
];

export default function OnboardingTour({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();

  // Auto-open al primer mount si no está visto
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (!seen) {
        // Pequeño delay para que la app cargue primero
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, [forceOpen]);

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setOpen(false);
    onClose?.();
  }

  function handleCta() {
    const cta = SLIDES[index]?.cta;
    if (cta) {
      dismiss();
      navigate(cta.to);
    }
  }

  if (!open) return null;

  const slide = SLIDES[index];
  const Icon = slide.Icon;
  const isLast = index === SLIDES.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-background/85 backdrop-blur-md flex items-center justify-center p-4 print:hidden"
      >
        <motion.div
          initial={{ y: 20, scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 20, scale: 0.95 }}
          className="glass rounded-3xl p-6 max-w-md w-full space-y-5 border-2 relative"
          style={{ borderColor: `${slide.color}40` }}
        >
          {/* Close */}
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar tour"
          >
            <X size={14} />
          </button>

          {/* Slide content · animated key */}
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Icon + step */}
              <div className="flex items-center justify-between">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: `${slide.color}20`, border: `1px solid ${slide.color}40` }}
                >
                  <Icon size={26} style={{ color: slide.color }} />
                </div>
                <div className="flex items-center gap-1">
                  <Sparkles size={9} style={{ color: slide.color }} />
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: slide.color }}>
                    {index + 1} de {SLIDES.length}
                  </span>
                </div>
              </div>

              {/* Title + desc */}
              <div className="space-y-2">
                <h2 className="font-display font-bold text-lg text-foreground">{slide.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{slide.description}</p>
              </div>

              {/* CTA específico del slide */}
              {slide.cta && (
                <button
                  onClick={handleCta}
                  className="w-full py-2.5 rounded-lg text-sm font-display font-bold text-primary-foreground transition-colors"
                  style={{ backgroundColor: slide.color }}
                >
                  {slide.cta.label} →
                </button>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-secondary hover:bg-foreground/30"
                }`}
                aria-label={`Ir al slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={12} /> Anterior
            </button>

            {isLast ? (
              <button
                onClick={dismiss}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 transition-colors"
              >
                <Trophy size={12} /> Empezar a usar VITAS
              </button>
            ) : (
              <button
                onClick={() => setIndex((i) => Math.min(SLIDES.length - 1, i + 1))}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-foreground hover:text-primary transition-colors font-bold"
              >
                Siguiente <ChevronRight size={12} />
              </button>
            )}
          </div>

          {/* Skip */}
          <button
            onClick={dismiss}
            className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Saltar tour · puedes verlo de nuevo desde Ajustes
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
