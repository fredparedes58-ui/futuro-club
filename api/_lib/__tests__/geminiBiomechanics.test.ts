/**
 * VITAS · Tests — observación Gemini → biomechanics sin rellenos + gate de identidad
 * Run: npx vitest run --config vitest.api.config.ts api/_lib/__tests__/geminiBiomechanics.test.ts
 *
 * Invariantes 1-2 (CLAUDE.md): dato ausente ⇒ null + gate_reason (nunca `?? 5`/`?? 0`).
 * identidad.md: sin identificación por dorsal/equipación ⇒ nada se atribuye al menor.
 */
import { describe, it, expect } from "vitest";
import {
  buildGeminiPlayerContext,
  geminiToBiomechanics,
  resolvePlayerIdentity,
  GEMINI_EVENT_FIELDS,
  GEMINI_SCORE_FIELDS,
  type GeminiObservation,
} from "../geminiBiomechanics";

function obs(overrides: Partial<GeminiObservation> = {}): GeminiObservation {
  return {
    identificacion: { estado: "unico_jugador", metodo: "unico_jugador_en_plano", confianza: "alta", motivo: "solo hay un jugador" },
    timeline: [{ timestamp: "0:10", tipo: "accion_con_balon", descripcion: "control orientado" }],
    momentosDestacados: [{ timestamp: "0:30", tipo: "positivo", descripcion: "regate" }],
    patronesJuego: ["busca el 1v1"],
    resumenGeneral: "resumen",
    dimensiones: {
      tecnicaConBalon: { observaciones: ["a"], score_estimado: 7 },
      inteligenciaTactica: { observaciones: ["b"], score_estimado: 6 },
      velocidadDecision: { observaciones: ["c"], score_estimado: 8 },
      liderazgoPresencia: { observaciones: ["d"], score_estimado: 5 },
      eficaciaCompetitiva: { observaciones: ["e"], score_estimado: 6 },
      // capacidadFisica AUSENTE a propósito
    },
    eventosContados: {
      pasesCompletados: 12,
      pasesFallados: 0, // 0 observado ≠ ausente
      duelosGanados: 3,
      // escaneos AUSENTE a propósito
    },
    ...overrides,
  };
}

describe("geminiToBiomechanics — sin valores por defecto", () => {
  it("score ausente ⇒ null + gate_reason (antes `?? 5`)", () => {
    const { biomechanics } = geminiToBiomechanics(obs(), { referenceProvided: false });
    expect(biomechanics.physical_score).toBeNull();
    expect(biomechanics.gate_reasons.physical_score).toMatch(/capacidadFisica/);
    expect(biomechanics.technical_score).toBe(7);
  });

  it("conteo ausente ⇒ null + gate_reason (antes `?? 0`), y un 0 observado se conserva", () => {
    const { biomechanics } = geminiToBiomechanics(obs(), { referenceProvided: false });
    expect(biomechanics.scans).toBeNull();
    expect(biomechanics.gate_reasons.scans).toMatch(/escaneos/);
    expect(biomechanics.passes_failed).toBe(0);
    expect(biomechanics.gate_reasons.passes_failed).toBeUndefined();
  });

  it("score fuera de 1-10 o no numérico ⇒ null (no se recorta a la escala)", () => {
    const o = obs({
      dimensiones: {
        tecnicaConBalon: { observaciones: [], score_estimado: 11 },
        inteligenciaTactica: { observaciones: [], score_estimado: Number.NaN },
      },
    });
    const { biomechanics } = geminiToBiomechanics(o, { referenceProvided: false });
    expect(biomechanics.technical_score).toBeNull();
    expect(biomechanics.tactical_score).toBeNull();
    expect(biomechanics.gate_reasons.technical_score).toMatch(/escala/);
  });

  it("todo campo null lleva gate_reason no vacío (contrato inv. #2)", () => {
    const { biomechanics } = geminiToBiomechanics({ identificacion: obs().identificacion }, { referenceProvided: false });
    for (const k of [...Object.keys(GEMINI_SCORE_FIELDS), ...Object.keys(GEMINI_EVENT_FIELDS)] as Array<
      keyof typeof biomechanics.gate_reasons
    >) {
      expect(biomechanics[k]).toBeNull();
      expect(biomechanics.gate_reasons[k]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("procedencia declarada ESTIMADA_LLM (nunca MEDIDA)", () => {
    const { biomechanics } = geminiToBiomechanics(obs(), { referenceProvided: false });
    expect(biomechanics.provenance).toBe("ESTIMADA_LLM");
  });
});

describe("identidad (identidad.md) — abstención antes que adivinar", () => {
  it("no_identificado ⇒ no atribuible: todas las cifras null y observación vaciada", () => {
    const o = obs({ identificacion: { estado: "no_identificado", confianza: "alta", motivo: "varios jugadores, dorsal ilegible" } });
    const { biomechanics, identity } = geminiToBiomechanics(o, { referenceProvided: false });
    expect(identity.attributable).toBe(false);
    expect(biomechanics.abstained).toBe(true);
    expect(biomechanics.technical_score).toBeNull();
    expect(biomechanics.passes_completed).toBeNull();
    expect(biomechanics.gemini_observation.timeline).toEqual([]);
    expect(biomechanics.gemini_observation.eventosContados?.pasesCompletados).toBeNull();
    expect(biomechanics.gemini_observation.dimensiones?.tecnicaConBalon?.score_estimado).toBeNull();
    expect(identity.reason).toMatch(/no identificado/i);
    expect(identity.reason).toMatch(/dorsal ilegible/);
  });

  it("sin bloque identificacion ⇒ abstención (no se asume identidad)", () => {
    const o = obs({ identificacion: undefined });
    expect(resolvePlayerIdentity(o, { referenceProvided: true }).attributable).toBe(false);
  });

  it("'identificado' sin dorsal+color de referencia ⇒ descartado (sería cara/rasgos físicos)", () => {
    const o = obs({ identificacion: { estado: "identificado", metodo: "dorsal_y_color", confianza: "alta", motivo: "" } });
    const id = resolvePlayerIdentity(o, { referenceProvided: false });
    expect(id.attributable).toBe(false);
    expect(id.reason).toMatch(/nunca por la cara/);
  });

  it("'identificado' con referencia y confianza alta ⇒ atribuible y verificado por dorsal", () => {
    const o = obs({ identificacion: { estado: "identificado", metodo: "dorsal_y_color", confianza: "alta", motivo: "dorsal 10" } });
    const id = resolvePlayerIdentity(o, { referenceProvided: true });
    expect(id).toMatchObject({ attributable: true, verifiedByDorsal: true, reason: null });
  });

  it("confianza baja ⇒ abstención aunque diga 'identificado'", () => {
    const o = obs({ identificacion: { estado: "identificado", confianza: "baja", motivo: "" } });
    expect(resolvePlayerIdentity(o, { referenceProvided: true }).attributable).toBe(false);
  });

  it("'unico_jugador' ⇒ atribuible con advertencia explícita (no verificado por dorsal)", () => {
    const id = resolvePlayerIdentity(obs(), { referenceProvided: false });
    expect(id.attributable).toBe(true);
    expect(id.verifiedByDorsal).toBe(false);
    expect(id.reason).toMatch(/no verificada por dorsal/);
  });
});

describe("buildGeminiPlayerContext — sin rellenar huecos", () => {
  it("sin antropometría ni datos ⇒ null + gate_reasons (antes 12 años / MID / derecho / formativo)", () => {
    const { playerContext, gate_reasons, referenceProvided } = buildGeminiPlayerContext(
      { name: "Ana", position: null, foot: null },
      null,
    );
    expect(playerContext).toMatchObject({
      name: "Ana",
      age: null,
      position: null,
      foot: null,
      height: null,
      weight: null,
      competitiveLevel: null,
      jerseyNumber: null,
      teamColor: null,
    });
    expect(gate_reasons.age).toBeTruthy();
    expect(gate_reasons.position).toBeTruthy();
    expect(gate_reasons.foot).toBeTruthy();
    expect(gate_reasons.identification).toBeTruthy();
    expect(referenceProvided).toBe(false);
  });

  it("conserva los datos reales y acepta la edad numérica en string (numeric de Postgres)", () => {
    const { playerContext, gate_reasons } = buildGeminiPlayerContext(
      { name: "Leo", position: "RW", foot: "izquierdo" },
      { chronological_age: "13.4", height_cm: 158, weight_kg: 47 },
      { jerseyNumber: 7, teamColor: "azul" },
    );
    expect(playerContext.age).toBeCloseTo(13.4);
    expect(playerContext.position).toBe("RW");
    expect(playerContext.jerseyNumber).toBe(7);
    expect(gate_reasons.age).toBeUndefined();
    expect(gate_reasons.identification).toBeUndefined();
  });
});
