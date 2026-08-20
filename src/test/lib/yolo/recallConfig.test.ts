import { describe, it, expect, beforeEach } from "vitest";
import {
  parseRecallConfig,
  getRecallConfig,
  setRecallConfig,
  DEFAULT_RECALL_TILING,
} from "@/lib/yolo/recallConfig";

describe("parseRecallConfig", () => {
  it("sin enabled:true → null (recall apagado por defecto)", () => {
    expect(parseRecallConfig({})).toBeNull();
    expect(parseRecallConfig({ enabled: false })).toBeNull();
    expect(parseRecallConfig(null)).toBeNull();
    expect(parseRecallConfig("on")).toBeNull();
  });

  it("enabled:true → config completa con defaults del detector", () => {
    const cfg = parseRecallConfig({ enabled: true });
    expect(cfg).not.toBeNull();
    expect(cfg!.detectModelUrl).toMatch(/yolo11s-detect\.onnx$/);
    expect(cfg!.personClassId).toBe(0);
    expect(cfg!.numClasses).toBeGreaterThan(0);
    expect(cfg!.inputSize).toBeGreaterThan(0);
    expect(cfg!.confThreshold).toBeGreaterThan(0);
    expect(cfg!.minPoseBoxHeightPx).toBeGreaterThan(0);
  });

  it("respeta overrides válidos de confThreshold y minPoseBoxHeightPx", () => {
    const cfg = parseRecallConfig({ enabled: true, confThreshold: 0.4, minPoseBoxHeightPx: 150 });
    expect(cfg!.confThreshold).toBeCloseTo(0.4, 6);
    expect(cfg!.minPoseBoxHeightPx).toBe(150);
  });

  it("ignora overrides fuera de rango (cae al default)", () => {
    const base = parseRecallConfig({ enabled: true })!;
    const bad = parseRecallConfig({ enabled: true, confThreshold: 5, minPoseBoxHeightPx: -3 })!;
    expect(bad.confThreshold).toBe(base.confThreshold);
    expect(bad.minPoseBoxHeightPx).toBe(base.minPoseBoxHeightPx);
  });

  it("DEFAULT_RECALL_TILING es una malla útil (grid ≥ 2)", () => {
    expect(DEFAULT_RECALL_TILING.grid).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_RECALL_TILING.overlap).toBeGreaterThan(0);
  });
});

describe("getRecallConfig / setRecallConfig (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("sin la clave vitas_recall → null (tracking normal por defecto)", () => {
    expect(getRecallConfig()).toBeNull();
  });

  it("setRecallConfig({enabled:true}) persiste y getRecallConfig lo lee", () => {
    setRecallConfig({ enabled: true });
    const cfg = getRecallConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.personClassId).toBe(0);
  });

  it("setRecallConfig(null) apaga (elimina la clave)", () => {
    setRecallConfig({ enabled: true });
    setRecallConfig(null);
    expect(getRecallConfig()).toBeNull();
    expect(localStorage.getItem("vitas_recall")).toBeNull();
  });

  it("una config que no valida equivale a apagar (no deja estado intermedio)", () => {
    setRecallConfig({ enabled: false });
    expect(localStorage.getItem("vitas_recall")).toBeNull();
  });

  it("JSON corrupto en la clave → null (no lanza)", () => {
    localStorage.setItem("vitas_recall", "{ not json");
    expect(getRecallConfig()).toBeNull();
  });
});
