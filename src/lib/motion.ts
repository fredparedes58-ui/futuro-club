/**
 * VITAS · Motion system
 *
 * Variants y transiciones canónicas para Framer Motion.
 * Usadas en toda la app para coherencia.
 *
 * Filosofía: ease curves cinemáticos (basados en Apple/Vercel/Linear),
 * springs calibrados, staggers cortos.
 */
import type { Variants, Transition } from "framer-motion";

// ─── Easings canónicos ─────────────────────────────────────────────
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT_QUART = [0.76, 0, 0.24, 1] as const;
export const EASE_OUT_BACK = [0.34, 1.56, 0.64, 1] as const;

// ─── Springs canónicos ─────────────────────────────────────────────
export const springGentle: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 35,
  mass: 0.5,
};

export const springBouncy: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 22,
  mass: 0.6,
};

// ─── Variants comunes ──────────────────────────────────────────────

/** Entrada de página · fade + ligero slide up */
export const pageEnter: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT_EXPO },
  },
};

/** Container con stagger para grids/lists · usa staggerChildren */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

/** Item individual de un grid/lista · entra de abajo */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE_OUT_EXPO },
  },
};

/** Card hover con lift sutil */
export const cardHover = {
  rest: { y: 0, scale: 1 },
  hover: {
    y: -2,
    scale: 1.005,
    transition: springSnappy,
  },
};

/** Modal/sheet entrada desde abajo */
export const sheetEnter: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: 16,
    transition: { duration: 0.25, ease: EASE_IN_OUT_QUART },
  },
};

/** Tab content fade between */
export const tabFade: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.2, ease: EASE_IN_OUT_QUART },
  },
};
