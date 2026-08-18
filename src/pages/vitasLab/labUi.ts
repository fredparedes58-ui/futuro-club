import type { Variants } from "framer-motion";

/** Segundos → HH:MM:SS. Puro, sin estado. */
export const formatTime = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** Variantes de entrada escalonada del layout del laboratorio. */
export const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
export const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4 } },
};
