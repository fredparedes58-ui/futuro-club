import { describe, it, expect } from "vitest";
import { weekStreak } from "@/lib/weekStreak";

const WEEK = 604800000;
// "ahora" fijo (mitad de un bucket) para tests deterministas
const NOW = 100 * WEEK + WEEK / 2;
const iso = (bucketsAgo: number) => new Date((100 - bucketsAgo) * WEEK + 1000).toISOString();

describe("weekStreak", () => {
  it("sin fechas → 0", () => {
    expect(weekStreak([], NOW)).toBe(0);
  });

  it("actividad esta semana → 1", () => {
    expect(weekStreak([iso(0)], NOW)).toBe(1);
  });

  it("3 semanas seguidas incluyendo la actual → 3", () => {
    expect(weekStreak([iso(0), iso(1), iso(2)], NOW)).toBe(3);
  });

  it("un hueco corta la racha", () => {
    // semanas 0 y 1 activas, semana 2 vacía, 3 activa → racha = 2
    expect(weekStreak([iso(0), iso(1), iso(3)], NOW)).toBe(2);
  });

  it("semana actual vacía no rompe una racha reciente (cuenta desde la anterior)", () => {
    // nada esta semana, pero sí las 2 anteriores → racha = 2
    expect(weekStreak([iso(1), iso(2)], NOW)).toBe(2);
  });

  it("solo actividad antigua con hueco hasta hoy → 0", () => {
    // última actividad hace 3 semanas, semanas 0,1,2 vacías → 0
    expect(weekStreak([iso(3), iso(4)], NOW)).toBe(0);
  });

  it("varias fechas en la misma semana cuentan como una", () => {
    expect(weekStreak([iso(0), iso(0), iso(0)], NOW)).toBe(1);
  });
});
