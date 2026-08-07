// @ts-nocheck — harness de PIPELINE (dev), no test de CI. Reutiliza el gate de
// producción (registerFieldFromLandmarks) para auto-etiquetar frames y separar los
// difíciles. Usa node:fs; tsconfig.app.json (frontend) no tipa node → @ts-nocheck.
// Se salta si falta el JSON de predicciones (no afecta a CI).
/**
 * PASO 2 del auto-etiquetado semiautomático (ver vision-pipeline/prepare_finetune.py).
 *
 * Entrada: ${FT_DIR}/predictions.json  (keypoints del modelo base por frame)
 * Salida:
 *   ${FT_DIR}/dataset/images/*.jpg  + labels/*.txt   → pseudo-etiquetas AUTO (para entrenar)
 *   ${FT_DIR}/to_annotate/*.jpg                        → frames HARD (los marca el usuario)
 *   ${FT_DIR}/manifest.json                            → resumen por clip
 *
 * Regla: un frame es AUTO solo si NUESTRO gate de producción lo calibra fiable
 * (classifyCalibration high/medium). Así la pseudo-etiqueta solo se genera donde
 * de verdad confiamos en la geometría. El resto → HARD para mano humana.
 *
 * Ejecutar (desde el worktree):
 *   FT_DIR="C:/.../scratchpad/ft" npx vitest run src/test/lib/yolo/bucketPseudoLabels.test.ts
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  registerFieldFromLandmarks,
  FIELD_TEMPLATE,
  FIELD_LENGTH_M,
  FIELD_WIDTH_M,
  type DetectedLandmark,
} from "@/lib/yolo/fieldRegistration";
import { fieldToPixel } from "@/lib/yolo/homography";

// ─── Knobs (los fija la verificación de diseño) ──────────────────────────────
// Estrategia de etiqueta AUTO:
//   "raw"      → keypoints crudos del modelo, visibilidad por confianza (seguro,
//                sin sesgo de reproducir nuestra homografía).
//   "template" → reproyectar FIELD_TEMPLATE por la homografía (labels completas).
const LABEL_STRATEGY: "raw" | "template" = "raw";
// Confianza de calibración que cuenta como AUTO. "high" es lo más conservador.
const AUTO_LEVELS = new Set<string>(["high", "medium"]);
// Confianza mínima por keypoint para marcarlo visible (v=2) en modo "raw".
const KP_VIS_CONF = 0.5;
// Tope de frames HARD por clip que se le pide marcar al usuario (dedup temporal).
const HARD_CAP_PER_CLIP = 12;
// Tope de frames AUTO por clip (evita cientos de casi-duplicados en el train).
const AUTO_CAP_PER_CLIP = 30;

const FT = process.env.FT_DIR || join(process.cwd(), "scratchpad", "ft");
const PRED_PATH = join(FT, "predictions.json");
const RAW_DIR = join(FT, "frames_raw");
const hasData = existsSync(PRED_PATH);

interface Pred { name: string; w: number; h: number; pred: Array<{ id: number; x: number; y: number; conf: number }>; }

const clipOf = (name: string) => name.replace(/_\d+\.(jpg|jpeg|png)$/i, "");

/** Muestreo uniforme para quedarnos con `cap` items diversos (dedup temporal barato). */
function spread<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const step = items.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

/** Genera la línea YOLO-pose (class cx cy w h  x1 y1 v1 ... x32 y32 v32), normalizada. */
function yoloLine(fr: Pred, reg: ReturnType<typeof registerFieldFromLandmarks>): string | null {
  const K = FIELD_TEMPLATE.length; // 32
  const kx: number[] = new Array(K).fill(0);
  const ky: number[] = new Array(K).fill(0);
  const kv: number[] = new Array(K).fill(0);

  if (LABEL_STRATEGY === "raw") {
    for (const p of fr.pred) {
      if (p.id < 0 || p.id >= K) continue;
      kx[p.id] = p.x; ky[p.id] = p.y;
      kv[p.id] = p.conf >= KP_VIS_CONF ? 2 : 0;
    }
  } else {
    // template: reproyectar cada landmark por la homografía campo→píxel refinada.
    if (!reg.Hfield2pix) return null;
    for (const l of FIELD_TEMPLATE) {
      const p = fieldToPixel(reg.Hfield2pix, l.field.fx, l.field.fy);
      // Solo puntos dentro de la imagen (con pequeño margen) → visibles.
      if (p.px >= -8 && p.px <= fr.w + 8 && p.py >= -8 && p.py <= fr.h + 8) {
        kx[l.id] = Math.min(Math.max(p.px, 0), fr.w);
        ky[l.id] = Math.min(Math.max(p.py, 0), fr.h);
        kv[l.id] = 2;
      }
    }
  }

  // bbox = envolvente de los keypoints visibles (+ margen), normalizado.
  const vis = kx.map((x, i) => ({ x, y: ky[i], v: kv[i] })).filter((p) => p.v === 2);
  if (vis.length < 4) return null;
  const minx = Math.min(...vis.map((p) => p.x)), maxx = Math.max(...vis.map((p) => p.x));
  const miny = Math.min(...vis.map((p) => p.y)), maxy = Math.max(...vis.map((p) => p.y));
  const pad = 0.03;
  const cx = ((minx + maxx) / 2) / fr.w, cy = ((miny + maxy) / 2) / fr.h;
  const bw = Math.min(1, (maxx - minx) / fr.w + pad), bh = Math.min(1, (maxy - miny) / fr.h + pad);

  let line = `0 ${cx.toFixed(6)} ${cy.toFixed(6)} ${bw.toFixed(6)} ${bh.toFixed(6)}`;
  for (let i = 0; i < K; i++) {
    if (kv[i] === 2) line += ` ${(kx[i] / fr.w).toFixed(6)} ${(ky[i] / fr.h).toFixed(6)} 2`;
    else line += ` 0 0 0`;
  }
  return line;
}

describe.skipIf(!hasData)("Auto-etiquetado semiautomático (bucketing pseudo-labels)", () => {
  it("separa AUTO (pseudo-etiqueta) de HARD (anotar a mano) con el gate de producción", () => {
    const frames: Pred[] = JSON.parse(readFileSync(PRED_PATH, "utf-8"));

    // Preparar carpetas de salida (limpias).
    const IMG_DIR = join(FT, "dataset", "images");
    const LBL_DIR = join(FT, "dataset", "labels");
    const HARD_DIR = join(FT, "to_annotate");
    for (const d of [IMG_DIR, LBL_DIR, HARD_DIR]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }

    const byClip: Record<string, { auto: Array<{ fr: Pred; line: string }>; hard: Pred[]; conf: Record<string, number> }> = {};
    // Muestras para verificación visual: reproyectar la homografía sobre el frame.
    const overlaySamples: any[] = [];
    const sampleCount: Record<string, { high: number; medium: number; hard: number }> = {};

    for (const fr of frames) {
      const clip = clipOf(fr.name);
      byClip[clip] ??= { auto: [], hard: [], conf: { high: 0, medium: 0, low: 0, none: 0 } };
      sampleCount[clip] ??= { high: 0, medium: 0, hard: 0 };
      const dets: DetectedLandmark[] = fr.pred.map((k) => ({ id: k.id, px: k.x, py: k.y, confidence: k.conf }));
      const reg = registerFieldFromLandmarks(dets);
      byClip[clip].conf[reg.confidence]++;

      // Recoger hasta 2 muestras por tipo/clip para el overlay visual.
      const bucket = reg.confidence === "high" ? "high" : reg.confidence === "medium" ? "medium" : "hard";
      if (sampleCount[clip][bucket] < 2) {
        sampleCount[clip][bucket]++;
        overlaySamples.push({
          name: fr.name, w: fr.w, h: fr.h,
          confidence: reg.confidence,
          reprojPx: Number.isFinite(reg.meanReprojErrorPx) ? Math.round(reg.meanReprojErrorPx * 100) / 100 : null,
          inliers: reg.inlierCount, used: reg.usedLandmarks,
          H: reg.Hfield2pix ? Array.from(reg.Hfield2pix) : null,
          kps: fr.pred.filter((k) => k.conf >= KP_VIS_CONF).map((k) => ({ id: k.id, x: k.x, y: k.y })),
        });
      }

      if (AUTO_LEVELS.has(reg.confidence)) {
        const line = yoloLine(fr, reg);
        if (line) byClip[clip].auto.push({ fr, line });
        else byClip[clip].hard.push(fr);
      } else {
        byClip[clip].hard.push(fr);
      }
    }
    writeFileSync(join(FT, "overlays.json"), JSON.stringify(overlaySamples));

    // Escribir salidas con dedup/cap por clip.
    const manifest: any = { strategy: LABEL_STRATEGY, autoLevels: [...AUTO_LEVELS], clips: {}, totals: { auto: 0, hard: 0 } };
    for (const [clip, b] of Object.entries(byClip)) {
      const autoKept = spread(b.auto, AUTO_CAP_PER_CLIP);
      const hardKept = spread(b.hard, HARD_CAP_PER_CLIP);
      for (const { fr, line } of autoKept) {
        const src = join(RAW_DIR, fr.name);
        if (existsSync(src)) copyFileSync(src, join(IMG_DIR, fr.name));
        writeFileSync(join(LBL_DIR, fr.name.replace(/\.(jpg|jpeg|png)$/i, ".txt")), line + "\n");
      }
      for (const fr of hardKept) {
        const src = join(RAW_DIR, fr.name);
        if (existsSync(src)) copyFileSync(src, join(HARD_DIR, fr.name));
      }
      manifest.clips[clip] = {
        frames: b.auto.length + b.hard.length,
        conf: b.conf,
        autoAvailable: b.auto.length, autoKept: autoKept.length,
        hardAvailable: b.hard.length, hardKept: hardKept.length,
      };
      manifest.totals.auto += autoKept.length;
      manifest.totals.hard += hardKept.length;
    }
    writeFileSync(join(FT, "manifest.json"), JSON.stringify(manifest, null, 2));

    // Reporte legible.
    console.log(`\n╔═══ AUTO-ETIQUETADO (estrategia=${LABEL_STRATEGY}, AUTO=${[...AUTO_LEVELS].join("/")}) ═══`);
    for (const [clip, m] of Object.entries(manifest.clips)) {
      console.log(`║ ${clip}: ${m.frames} frames · conf h/m/l/n=${m.conf.high}/${m.conf.medium}/${m.conf.low}/${m.conf.none}`);
      console.log(`║    AUTO ${m.autoKept}/${m.autoAvailable} (pseudo-etiquetados) · HARD ${m.hardKept}/${m.hardAvailable} (a marcar)`);
    }
    console.log(`║ TOTAL → AUTO ${manifest.totals.auto} etiquetas gratis · HARD ${manifest.totals.hard} frames a marcar`);
    console.log(`╚${"═".repeat(60)}`);

    expect(frames.length).toBeGreaterThan(0);
  }, 120000);
});
