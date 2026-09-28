/**
 * VITAS · Advertencia de identidad de un análisis (src/lib/reports/analysisIdentity.ts)
 * identidad.md: identidad no verificada por una persona ⇒ la UI lo indica + confianza
 * reducida en lo derivado. Determinista desde `analyses.biomechanics`.
 */
import { describe, it, expect } from "vitest";
import {
  IDENTITY_CONFIDENCE_FACTORS,
  reduceConfidenceForIdentity,
  resolveAnalysisIdentity,
} from "@/lib/reports/analysisIdentity";

// Forma que persiste api/_lib/geminiBiomechanics.ts (identity + gemini_observation).
function bm(identity: Record<string, unknown> | null, identificacion: Record<string, unknown> | null) {
  return {
    provenance: "ESTIMADA_LLM",
    ...(identity ? { identity } : {}),
    gemini_observation: identificacion ? { identificacion } : {},
  };
}

describe("resolveAnalysisIdentity", () => {
  it("identificado por dorsal+color (servidor y Gemini coinciden) → dorsal_llm con lo que vio Gemini", () => {
    const c = resolveAnalysisIdentity(
      bm(
        { status: "identificado", confidence: "media", method: "dorsal_y_color", attributable: true, verifiedByDorsal: true },
        { estado: "identificado", dorsalObservado: 10, colorObservado: "rojo", confianza: "media" },
      ),
    );
    expect(c).toMatchObject({ kind: "dorsal_llm", dorsal: "10", color: "rojo", confidence: "media" });
    expect(c.confidenceFactor).toBe(IDENTITY_CONFIDENCE_FACTORS.dorsal_llm.media);
  });

  it("confianza alta → aun así < 1 (estimación de IA sin ground truth)", () => {
    const c = resolveAnalysisIdentity(
      bm(
        { status: "identificado", confidence: "alta", verifiedByDorsal: true },
        { estado: "identificado", dorsalObservado: "7", colorObservado: "azul", confianza: "alta" },
      ),
    );
    expect(c.kind).toBe("dorsal_llm");
    expect(c.confidenceFactor).toBeLessThan(1);
  });

  it("único jugador en plano → single_player", () => {
    const c = resolveAnalysisIdentity(
      bm({ status: "unico_jugador", confidence: "alta", verifiedByDorsal: false }, { estado: "unico_jugador", confianza: "alta" }),
    );
    expect(c.kind).toBe("single_player");
    expect(c.confidenceFactor).toBe(IDENTITY_CONFIDENCE_FACTORS.single_player.alta);
  });

  it("sin identificacion guardada (análisis antiguo / pipeline de cliente) → unverified", () => {
    expect(resolveAnalysisIdentity({ drillScore: 70, source: "client_mediapipe" }).kind).toBe("unverified");
    expect(resolveAnalysisIdentity(null).kind).toBe("unverified");
    expect(resolveAnalysisIdentity(undefined).confidenceFactor).toBe(IDENTITY_CONFIDENCE_FACTORS.unverified);
  });

  it("identificacion sin la decisión del servidor (identity) → unverified (no se confirman las reglas)", () => {
    const c = resolveAnalysisIdentity(bm(null, { estado: "identificado", dorsalObservado: "10", confianza: "alta" }));
    expect(c.kind).toBe("unverified");
  });

  it("servidor y Gemini se contradicen → unverified (conservador)", () => {
    const c = resolveAnalysisIdentity(
      bm({ status: "unico_jugador", confidence: "alta" }, { estado: "identificado", dorsalObservado: "10", confianza: "alta" }),
    );
    expect(c.kind).toBe("unverified");
  });

  it("«identificado» sin verificación por dorsal → unverified", () => {
    const c = resolveAnalysisIdentity(
      bm({ status: "identificado", confidence: "alta", verifiedByDorsal: false }, { estado: "identificado", confianza: "alta" }),
    );
    expect(c.kind).toBe("unverified");
  });

  it("confianza baja o ausente → unverified", () => {
    expect(
      resolveAnalysisIdentity(bm({ status: "identificado", confidence: "baja", verifiedByDorsal: true }, { estado: "identificado", confianza: "baja" })).kind,
    ).toBe("unverified");
    expect(resolveAnalysisIdentity(bm({ status: "unico_jugador" }, { estado: "unico_jugador" })).kind).toBe("unverified");
  });

  it("determinista: misma entrada ⇒ misma advertencia", () => {
    const input = bm({ status: "unico_jugador", confidence: "media" }, { estado: "unico_jugador", confianza: "media" });
    expect(resolveAnalysisIdentity(input)).toEqual(resolveAnalysisIdentity(input));
  });
});

describe("reduceConfidenceForIdentity", () => {
  const unverified = resolveAnalysisIdentity(null);
  it("multiplica por el factor", () => {
    expect(reduceConfidenceForIdentity(0.8, unverified)).toBeCloseTo(0.8 * IDENTITY_CONFIDENCE_FACTORS.unverified);
  });
  it("null/ausente sigue null (una confianza ausente no se vuelve número)", () => {
    expect(reduceConfidenceForIdentity(null, unverified)).toBeNull();
    expect(reduceConfidenceForIdentity(undefined, unverified)).toBeNull();
  });
});
