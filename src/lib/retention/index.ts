/**
 * VITAS · Retención — barrel (Sprint 3.7)
 *
 * G5 (honestidad de producto): la calculadora de ROI en € (`roi.ts`) se retiró.
 * Derivaba euros del riesgo de abandono, que hoy es un mock determinista sobre el
 * id del jugador (`dropoutScore.ts`), no una señal medida. Mostrar euros a un club
 * a partir de datos sintéticos está prohibido (CLAUDE.md invariantes #1/#2 y
 * `.claude/rules/metricas.md`). Volverá cuando el riesgo venga de señales reales.
 */
export * from "./dropoutScore";
