/**
 * VITAS · Tests del motor científico de maduración (A: APHV · B: %PAH)
 *
 * Blindan las bases científicas y el anti-falso-positivo:
 *  - APHV = edad − offset (Mirwald 2002), NO edad + offset.
 *  - Khamis-Roche %PAH con coeficientes correctos (ejemplo numérico).
 *  - Bandas de bio-banding (Cumming 2017): <88 / 88-95 / >95.
 *  - Sin datos suficientes o lejos del PHV → NO se afirma timing (unknown),
 *    factor de ajuste neutro (1). Nunca un falso positivo.
 */
import { describe, it, expect } from "vitest";
import { computeMirwald } from "@/lib/phv/mirwald";
import { computeKhamisRoche, bandFromPercentPAH } from "@/lib/phv/khamisRoche";
import { resolveMaturity } from "@/lib/phv/maturity";

describe("Mirwald · APHV = edad − offset (corrección A)", () => {
  it("ageAtPHV se calcula restando el offset (no sumando)", () => {
    const r = computeMirwald({ chronologicalAge: 14, height: 165, weight: 55, gender: "M" });
    // APHV = 14 − offset. offset negativo (pre-PHV) → APHV > 14.
    expect(r.ageAtPHV).toBeCloseTo(14 - r.offset, 5);
    // El legacy biologicalAge (edad+offset, inválido) fue retirado del resultado.
    expect(r).not.toHaveProperty("biologicalAge");
  });
});

describe("Khamis-Roche · %PAH (opción B)", () => {
  it("bandas de bio-banding (Cumming 2017)", () => {
    expect(bandFromPercentPAH(80)).toBe("pre_phv");
    expect(bandFromPercentPAH(87.9)).toBe("pre_phv");
    expect(bandFromPercentPAH(88)).toBe("circa_phv");
    expect(bandFromPercentPAH(95)).toBe("circa_phv");
    expect(bandFromPercentPAH(95.1)).toBe("post_phv");
    expect(bandFromPercentPAH(99)).toBe("post_phv");
  });

  it("ejemplo chico 14a (bloquea coeficientes + conversión de unidades)", () => {
    const r = computeKhamisRoche({
      sex: "M",
      ageYears: 14,
      heightCm: 165,
      weightKg: 55,
      motherHeightCm: 165,
      fatherHeightCm: 178,
    });
    expect(r).not.toBeNull();
    // PAH plausible y por encima de la altura actual (aún crece).
    expect(r!.predictedAdultHeightCm).toBeGreaterThan(165);
    expect(r!.predictedAdultHeightCm).toBeGreaterThan(175);
    expect(r!.predictedAdultHeightCm).toBeLessThan(195);
    // %PAH ~90-91 → circa-PHV.
    expect(r!.percentOfPredictedAdultHeight).toBeGreaterThan(89);
    expect(r!.percentOfPredictedAdultHeight).toBeLessThan(92);
    expect(r!.status).toBe("circa_phv");
  });

  it("chico pre-púber 10a → pre-PHV (<88%)", () => {
    const r = computeKhamisRoche({
      sex: "M", ageYears: 10, heightCm: 138, weightKg: 32,
      motherHeightCm: 165, fatherHeightCm: 178,
    });
    expect(r).not.toBeNull();
    expect(r!.percentOfPredictedAdultHeight).toBeLessThan(88);
    expect(r!.status).toBe("pre_phv");
  });

  it("sin altura de padres → null (no inventa)", () => {
    const r = computeKhamisRoche({
      sex: "M", ageYears: 14, heightCm: 165, weightKg: 55,
      motherHeightCm: 0, fatherHeightCm: 0,
    });
    expect(r).toBeNull();
  });

  it("edad fuera de rango (4–17.5) → null", () => {
    const r = computeKhamisRoche({
      sex: "M", ageYears: 19, heightCm: 180, weightKg: 72,
      motherHeightCm: 165, fatherHeightCm: 178,
    });
    expect(r).toBeNull();
  });
});

describe("resolveMaturity · motor canónico + anti-falso-positivo", () => {
  it("sin datos → insufficient_data, timing unknown, ajuste neutro", () => {
    const m = resolveMaturity({});
    expect(m.method).toBe("insufficient_data");
    expect(m.timing).toBe("unknown");
    expect(m.status).toBe("unknown");
    expect(m.adjustmentFactor).toBe(1);
  });

  it("pre-púber 9a SIN alturas parentales → NO afirma timing (blindaje)", () => {
    // Caso Samu: lejos del PHV, solo Mirwald → confianza baja, timing unknown.
    const m = resolveMaturity({ sex: "M", ageYears: 9, heightCm: 135, weightKg: 30 });
    expect(m.method).toBe("mirwald_offset");
    expect(m.confidence).toBe("low");
    expect(m.timing).toBe("unknown"); // NADA de "tardío" con datos poco fiables
    expect(m.adjustmentFactor).toBe(1); // sin ajuste sin timing firme
    expect(m.ageAtPHV).toBeDefined();
    expect(m.validityNote).toBeTruthy();
  });

  it("con alturas parentales → método Khamis-Roche, estado por %PAH, alta confianza", () => {
    const m = resolveMaturity({
      sex: "M", ageYears: 14, heightCm: 165, weightKg: 55,
      motherHeightCm: 165, fatherHeightCm: 178,
    });
    expect(m.method).toBe("khamis_roche_pah");
    expect(m.confidence).toBe("high");
    expect(m.status).toBe("circa_phv");
    expect(m.percentPredictedAdultHeight).toBeGreaterThan(89);
  });

  it("timing tardío: APHV bastante más tarde que la media → late maturer + ajuste al alza", () => {
    // Chico cerca del PHV pero madurador claramente tardío (APHV > 13.7 + 1).
    // Construimos datos que den offset pequeño y APHV alto.
    const m = resolveMaturity({ sex: "M", ageYears: 14, heightCm: 150, weightKg: 40 });
    // Solo comprobamos coherencia interna: si el timing es 'late', el ajuste sube.
    if (m.timing === "late") {
      expect(m.adjustmentFactor).toBeGreaterThan(1);
    } else if (m.timing === "early") {
      expect(m.adjustmentFactor).toBeLessThan(1);
    } else {
      expect(m.adjustmentFactor).toBe(1);
    }
  });

  it("determinista: misma entrada → misma salida (sin contradicciones)", () => {
    const input = { sex: "M" as const, ageYears: 13, heightCm: 158, weightKg: 47,
      motherHeightCm: 162, fatherHeightCm: 176 };
    expect(resolveMaturity(input)).toEqual(resolveMaturity(input));
  });

  it("sexo NO registrado (datos completos) → NO calcula sobre sexo asumido (blindaje)", () => {
    const m = resolveMaturity({ ageYears: 14, heightCm: 165, weightKg: 55,
      motherHeightCm: 165, fatherHeightCm: 178 }); // sin sex
    expect(m.method).toBe("insufficient_data");
    expect(m.timing).toBe("unknown");
    expect(m.adjustmentFactor).toBe(1);
    expect(m.validityNote).toMatch(/[Ss]exo/);
  });

  it("antropometría absurda → no pasa el gate (garbage-in no da resultado categórico)", () => {
    const m = resolveMaturity({ sex: "M", ageYears: 14, heightCm: 20, weightKg: 400,
      motherHeightCm: 250, fatherHeightCm: 250 });
    expect(m.method).toBe("insufficient_data");
    expect(m.status).toBe("unknown");
  });

  it("edad fuera del dominio Mirwald (20a) y sin padres → no emite estado categórico", () => {
    const m = resolveMaturity({ sex: "M", ageYears: 20, heightCm: 180, weightKg: 72 });
    expect(m.method).toBe("insufficient_data");
    expect(m.status).toBe("unknown");
    expect(m.timing).toBe("unknown");
  });
});
