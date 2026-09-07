/**
 * VITAS · Test del helper de categoría (multi-categoría · C1)
 */
import { describe, it, expect } from "vitest";
import { resolveCategory, phvApplies, categoryDirective } from "@/lib/shared/category";

describe("resolveCategory", () => {
  it("override explícito gana sobre la edad", () => {
    expect(resolveCategory({ age: 13, category: "senior" })).toBe("senior");
    expect(resolveCategory({ age: 26, category: "youth" })).toBe("youth");
  });

  it("deriva por edad: <18 youth, ≥18 senior", () => {
    expect(resolveCategory({ age: 13 })).toBe("youth");
    expect(resolveCategory({ age: 17 })).toBe("youth");
    expect(resolveCategory({ age: 18 })).toBe("senior");
    expect(resolveCategory({ age: 26 })).toBe("senior");
  });

  it("sin datos → youth (default conservador)", () => {
    expect(resolveCategory({})).toBe("youth");
    expect(resolveCategory({ age: null })).toBe("youth");
    expect(resolveCategory({ age: NaN })).toBe("youth");
    expect(resolveCategory({ category: "pro" })).toBe("youth"); // valor no soportado → default
  });
});

describe("phvApplies", () => {
  it("PHV solo aplica a youth", () => {
    expect(phvApplies("youth")).toBe(true);
    expect(phvApplies("senior")).toBe(false);
  });
});

describe("categoryDirective", () => {
  it("youth → cadena vacía (prompt byte-idéntico al actual, cero regresión)", () => {
    expect(categoryDirective("youth")).toBe("");
    expect(categoryDirective("youth", "en")).toBe("");
  });

  it("senior → directiva (idioma-neutral) que anula el framing juvenil", () => {
    // Es una instrucción del prompt: texto único; la salida la fija languageDirective.
    const d = categoryDirective("senior");
    expect(d).toContain("SENIOR/PROFESSIONAL");
    expect(d).toContain("NOT parents");
    expect(d).toContain("PHV");
    // El locale ya no cambia el texto (multi-idioma sin ramas por idioma).
    expect(categoryDirective("senior", "en")).toBe(d);
  });
});
