/**
 * Regresión: la vista de "informe completo" (AnalysisDashboard) crasheaba con
 * "Algo salió mal" cuando el contenido LLM de un reporte traía un campo array como
 * string (`.map is not a function`) o con elementos null (`null.title`). Estas dos
 * funciones son la guarda; el test fija su contrato.
 */
import { describe, it, expect } from "vitest";
import { asItemArray, itemTitle } from "@/lib/reports/reportItems";

describe("asItemArray", () => {
  it("devuelve el array tal cual", () => {
    const a = [1, 2, 3];
    expect(asItemArray(a)).toBe(a);
  });
  it("coerce string/null/undefined/objeto a [] (no crashea .map)", () => {
    expect(asItemArray("no soy array")).toEqual([]);
    expect(asItemArray(null)).toEqual([]);
    expect(asItemArray(undefined)).toEqual([]);
    expect(asItemArray({ title: "x" })).toEqual([]);
    expect(asItemArray(42)).toEqual([]);
  });
  it("permite encadenar .map con seguridad sobre entradas no-array", () => {
    expect(() => asItemArray("x").map((v) => v)).not.toThrow();
  });
});

describe("itemTitle", () => {
  it("string → el propio string", () => {
    expect(itemTitle("Fortaleza")).toBe("Fortaleza");
  });
  it("{ title } → title", () => {
    expect(itemTitle({ title: "Debilidad" })).toBe("Debilidad");
  });
  it("null/undefined → '' (no crashea leyendo .title)", () => {
    expect(itemTitle(null)).toBe("");
    expect(itemTitle(undefined)).toBe("");
  });
  it("objeto sin title (o title no-string) → ''", () => {
    expect(itemTitle({})).toBe("");
    expect(itemTitle({ title: 123 })).toBe("");
    expect(itemTitle({ nombre: "x" })).toBe("");
  });
  it("no lanza con un array de elementos mixtos incluyendo null", () => {
    const mixed = ["a", null, { title: "b" }, 5, undefined];
    expect(() => mixed.map(itemTitle)).not.toThrow();
    expect(mixed.map(itemTitle)).toEqual(["a", "", "b", "", ""]);
  });
});
