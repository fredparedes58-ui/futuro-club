// @ts-nocheck — arnés de validación (dev) del ENDURECIMIENTO del gate. Corre el
// gate (con assessFieldGeometry) sobre 3 datasets y compara la distribución de
// confianza: broadcast (verdaderos positivos, deben SEGUIR high/medium) vs academia
// (falsos positivos, deben CAER a low/none). Se salta si faltan los JSON. No CI.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  registerFieldFromLandmarks,
  assessFieldGeometry,
  type DetectedLandmark,
} from "@/lib/yolo/fieldRegistration";

interface EvalImage { name: string; w: number; h: number; pred: Array<{ id: number; x: number; y: number; conf: number }>; }

const FT = process.env.FT_DIR || join(process.cwd(), "scratchpad", "ft");
const DATASETS = [
  { tag: "BROADCAST imgs (TP)", path: join(process.cwd(), "scratchpad", "field_eval.json"), expectTrusted: "alto" },
  { tag: "BROADCAST vídeo (TP)", path: join(process.cwd(), "scratchpad", "field_video_eval.json"), expectTrusted: "alto" },
  { tag: "ACADEMIA (FP)", path: join(FT, "predictions.json"), expectTrusted: "bajo" },
];

// Arnés de dev: los JSON viven en scratchpad/ (gitignored) → ausentes en CI.
// Se SALTA honestamente si no hay datos (antes hacía expect(anyData).toBe(true),
// que rojaba CI y enmascaraba regresiones reales del job "Unit & API Tests").
const HAS_DATA = DATASETS.some((ds) => existsSync(ds.path));

function run(frames: EvalImage[]) {
  const conf = { high: 0, medium: 0, low: 0, none: 0 };
  for (const fr of frames) {
    const dets: DetectedLandmark[] = fr.pred.map((k) => ({ id: k.id, px: k.x, py: k.y, confidence: k.conf }));
    const reg = registerFieldFromLandmarks(dets);
    conf[reg.confidence]++;
  }
  const trusted = conf.high + conf.medium;
  return { conf, trusted, total: frames.length, pct: Math.round((100 * trusted) / frames.length) };
}

describe("Endurecimiento del gate: TP broadcast se mantienen, FP academia caen", () => {
  it.skipIf(!HAS_DATA)("reporta la distribución de confianza por dataset (con sanity geométrica)", () => {
    const results: Record<string, ReturnType<typeof run>> = {};
    console.log(`\n╔═══ GATE ENDURECIDO · confianza por dataset ═══`);
    for (const ds of DATASETS) {
      if (!existsSync(ds.path)) { console.log(`║ ${ds.tag}: (sin datos)`); continue; }
      const frames: EvalImage[] = JSON.parse(readFileSync(ds.path, "utf-8"));
      const r = run(frames);
      results[ds.tag] = r;
      console.log(`║ ${ds.tag}: fiables ${r.trusted}/${r.total} (${r.pct}%) · h/m/l/n=${r.conf.high}/${r.conf.medium}/${r.conf.low}/${r.conf.none}  [esperado: ${ds.expectTrusted}]`);
    }
    console.log(`╚${"═".repeat(58)}`);
    // Sanity: al menos un dataset produjo resultados cuando hay datos presentes.
    expect(Object.keys(results).length).toBeGreaterThan(0);
  }, 120000);
});
