import { describe, it, expect } from "vitest";
import { splitMetricValue } from "@/lib/scout/insightValue";

describe("splitMetricValue — desambigua 'valor (±delta)'", () => {
  it("separa '67.4 (+9.9)' en base + delta al alza (el caso del docx)", () => {
    expect(splitMetricValue("67.4 (+9.9)")).toEqual({ base: "67.4", delta: "+9.9", up: true });
  });

  it("delta a la baja → up:false", () => {
    expect(splitMetricValue("55.0 (-3.2)")).toEqual({ base: "55.0", delta: "-3.2", up: false });
  });

  it("acepta el signo menos unicode (−) del LLM y lo normaliza", () => {
    expect(splitMetricValue("55.0 (−3.2)")).toEqual({ base: "55.0", delta: "-3.2", up: false });
  });

  it("delta en porcentaje", () => {
    expect(splitMetricValue("120 (+14%)")).toEqual({ base: "120", delta: "+14%", up: true });
  });

  it("valor simple sin paréntesis → tal cual, sin delta", () => {
    expect(splitMetricValue("82.4")).toEqual({ base: "82.4", delta: null, up: true });
  });

  it("un delta suelto sin base NO se parte (no hay paréntesis)", () => {
    expect(splitMetricValue("+14%")).toEqual({ base: "+14%", delta: null, up: true });
  });

  it("texto no numérico entre paréntesis → tal cual (no inventa tendencia)", () => {
    expect(splitMetricValue("1er percentil (Sub-15)")).toEqual({
      base: "1er percentil (Sub-15)",
      delta: null,
      up: true,
    });
  });

  it("null/undefined/'' → placeholder, sin delta", () => {
    expect(splitMetricValue(null)).toEqual({ base: "—", delta: null, up: true });
    expect(splitMetricValue(undefined)).toEqual({ base: "—", delta: null, up: true });
    expect(splitMetricValue("")).toEqual({ base: "—", delta: null, up: true });
  });
});
