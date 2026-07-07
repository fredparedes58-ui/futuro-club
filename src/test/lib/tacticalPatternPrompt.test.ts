/**
 * VITAS · Test del prompt-builder táctico (FASE 5)
 *
 * Evidencia de que buildTacticalPatternPrompt respeta:
 *   - locale (default es / en) → directiva de idioma correcta
 *   - phvDistribution → bloque PHV + consideración (diferenciador VITAS),
 *     y ausencia del bloque cuando no hay datos PHV (additive-safe)
 */
import { describe, it, expect } from "vitest";
import { buildTacticalPatternPrompt } from "@/lib/tactical/tacticalPatternPrompt";
import type { TacticalPatternInput } from "@/agents/contracts";

function baseInput(overrides: Partial<TacticalPatternInput> = {}): TacticalPatternInput {
  return {
    match: { id: "m1" },
    team: { averageAge: 13, formation: "4-3-3" },
    phaseDurations: {
      build_up: 100,
      attacking: 200,
      defending: 150,
      defensive_transition: 50,
      offensive_transition: 50,
      set_piece: 30,
    },
    possessionPct: 55,
    teamHotZonesByPhase: [],
    ...overrides,
  };
}

describe("buildTacticalPatternPrompt · locale", () => {
  it("por defecto (sin locale) usa la directiva en español", () => {
    const prompt = buildTacticalPatternPrompt(baseInput());
    expect(prompt).toContain("Redacta TODA la respuesta en español");
    expect(prompt).not.toContain("Write the ENTIRE response in natural English");
  });

  it("locale 'en' usa la directiva en inglés", () => {
    const prompt = buildTacticalPatternPrompt(baseInput({ locale: "en" }));
    expect(prompt).toContain("Write the ENTIRE response in natural English");
    expect(prompt).not.toContain("Redacta TODA la respuesta en español");
  });
});

describe("buildTacticalPatternPrompt · PHV", () => {
  it("sin phvDistribution NO incluye el bloque PHV", () => {
    const prompt = buildTacticalPatternPrompt(baseInput());
    expect(prompt).not.toContain("MADURACIÓN BIOLÓGICA (PHV)");
    expect(prompt).not.toContain("CONSIDERACIÓN PHV");
  });

  it("con phvDistribution incluye el bloque de datos y la consideración", () => {
    const prompt = buildTacticalPatternPrompt(
      baseInput({ phvDistribution: { prePhv: 40, circaPhv: 45, postPhv: 15 } }),
    );
    expect(prompt).toContain("MADURACIÓN BIOLÓGICA (PHV)");
    expect(prompt).toContain("pre-PHV 40%");
    expect(prompt).toContain("CONSIDERACIÓN PHV");
  });

  it("con phvDistribution y locale 'en' usa etiquetas/consideración en inglés", () => {
    const prompt = buildTacticalPatternPrompt(
      baseInput({ locale: "en", phvDistribution: { circaPhv: 50 } }),
    );
    expect(prompt).toContain("Team biological maturation (PHV)");
    expect(prompt).toContain("PHV CONSIDERATION (VITAS differentiator)");
  });
});
