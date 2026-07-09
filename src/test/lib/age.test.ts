/**
 * VITAS · Tests de edad cronológica decimal (precisión por edad del PHV)
 */
import { describe, it, expect } from "vitest";
import { decimalAgeYears, resolveChronologicalAge } from "@/lib/shared/age";

describe("decimalAgeYears", () => {
  it("calcula la edad decimal en una fecha de referencia dada", () => {
    // Nacido 2013-01-01, medido 2026-07-01 → ~13.5 años.
    const a = decimalAgeYears("2013-01-01", "2026-07-01");
    expect(a).not.toBeNull();
    expect(a!).toBeGreaterThan(13.4);
    expect(a!).toBeLessThan(13.6);
  });

  it("distingue medio año (no redondea a entero)", () => {
    const younger = decimalAgeYears("2013-07-01", "2026-01-01")!; // ~12.5
    const older = decimalAgeYears("2013-01-01", "2026-01-01")!; // ~13.0
    expect(older - younger).toBeGreaterThan(0.4);
  });

  it("fecha inválida o futura → null (no inventa edad)", () => {
    expect(decimalAgeYears(undefined)).toBeNull();
    expect(decimalAgeYears("")).toBeNull();
    expect(decimalAgeYears("no-es-fecha")).toBeNull();
    expect(decimalAgeYears("2030-01-01", "2026-01-01")).toBeNull();
  });
});

describe("resolveChronologicalAge", () => {
  it("prefiere la edad decimal desde birthDate", () => {
    const age = resolveChronologicalAge({ birthDate: "2013-01-01", age: 13 }, "2026-07-01");
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThan(13.4); // decimal, no el entero 13
  });

  it("cae al entero age si no hay birthDate", () => {
    expect(resolveChronologicalAge({ age: 14 })).toBe(14);
    expect(resolveChronologicalAge({ birthDate: "", age: 14 })).toBe(14);
  });

  it("sin ningún dato → null", () => {
    expect(resolveChronologicalAge({})).toBeNull();
  });
});
