// @ts-nocheck — harness de validación PUNTUAL (dev): usa node:fs para leer un JSON
// de scratchpad y se salta si no está. No es código de producción ni parte del
// suite permanente; tsconfig.app.json (frontend) no tipa node, así que lo eximimos.
/**
 * Validación end-to-end de la auto-calibración sobre imágenes REALES held-out.
 *
 * Lee scratchpad/field_eval.json (generado por vision-pipeline/eval_field_model.py:
 * 28 imgs del test split del dataset público, con keypoints PREDICHOS por el modelo
 * y GROUND-TRUTH). Alimenta ambos a NUESTRA cadena (registerFieldFromLandmarks +
 * homografía + refinamiento LM) y mide la fiabilidad real:
 *   - % de imágenes que calibran con confianza high/medium
 *   - error de reproyección (px) del modelo
 *   - ERROR EN METROS entre nuestra homografía (keypoints predichos) y la de GT
 *
 * Si el JSON no existe (CI normal), el test se salta — es una validación puntual,
 * no parte del suite permanente.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  registerFieldFromLandmarks,
  type DetectedLandmark,
  type FieldRegistration,
} from "@/lib/yolo/fieldRegistration";
import { pixelToField, fieldToPixel } from "@/lib/yolo/homography";

interface EvalImage {
  name: string; w: number; h: number;
  pred: Array<{ id: number; x: number; y: number; conf: number }>;
  gt: Array<{ id: number; x: number; y: number }>;
}

// Vitest corre desde la raíz del repo. (`process` está permitido: fichero @ts-nocheck.)
const JSON_PATH = join(process.cwd(), "scratchpad", "field_eval.json");
const hasData = existsSync(JSON_PATH);

/** Error de localización en metros entre dos homografías píxel→campo. */
function meterError(a: FieldRegistration, b: FieldRegistration, w: number, h: number): number[] {
  if (!a.Hpix2field || !b.Hpix2field) return [];
  const errs: number[] = [];
  for (let gy = 1; gy <= 8; gy++) {
    for (let gx = 1; gx <= 8; gx++) {
      const px = (gx / 9) * w;
      const py = (gy / 9) * h;
      const fa = pixelToField(a.Hpix2field, px, py);
      const fb = pixelToField(b.Hpix2field, px, py);
      // Descartar puntos que ambos mapean muy fuera del campo (zona horizonte).
      const inField = (f: { fx: number; fy: number }) => f.fx > -25 && f.fx < 130 && f.fy > -25 && f.fy < 93;
      if (!inField(fa) || !inField(fb)) continue;
      errs.push(Math.hypot(fa.fx - fb.fx, fa.fy - fb.fy));
    }
  }
  return errs;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

describe.skipIf(!hasData)("Auto-calibración sobre imágenes reales (held-out)", () => {
  const images: EvalImage[] = hasData ? JSON.parse(readFileSync(JSON_PATH, "utf-8")) : [];

  it("reporta fiabilidad de la cadena completa", () => {
    let predOk = 0;         // confianza high/medium con keypoints predichos
    let bothOk = 0;         // pred y gt calibran → comparables
    const reproj: number[] = [];
    const meterErrs: number[] = [];
    const confCount: Record<string, number> = { high: 0, medium: 0, low: 0, none: 0 };

    for (const img of images) {
      const predDets: DetectedLandmark[] = img.pred.map((k) => ({ id: k.id, px: k.x, py: k.y, confidence: k.conf }));
      const gtDets: DetectedLandmark[] = img.gt.map((k) => ({ id: k.id, px: k.x, py: k.y, confidence: 1 }));

      const regPred = registerFieldFromLandmarks(predDets);
      const regGt = registerFieldFromLandmarks(gtDets);

      confCount[regPred.confidence]++;
      if (regPred.confidence === "high" || regPred.confidence === "medium") {
        predOk++;
        reproj.push(regPred.meanReprojErrorPx);
      }
      if (regPred.Hpix2field && regGt.Hpix2field) {
        bothOk++;
        meterErrs.push(median(meterError(regPred, regGt, img.w, img.h)));
      }
    }

    const pct = (n: number) => `${Math.round((100 * n) / images.length)}%`;
     
    console.log(`\n╔═══ VALIDACIÓN AUTO-CALIBRACIÓN (${images.length} imágenes reales held-out) ═══`);
    console.log(`║ Confianza (keypoints del modelo): high=${confCount.high} medium=${confCount.medium} low=${confCount.low} none=${confCount.none}`);
    console.log(`║ Calibran fiables (high/medium): ${predOk}/${images.length} (${pct(predOk)})`);
    console.log(`║ Error de reproyección medio: ${median(reproj).toFixed(2)} px (mediana)`);
    console.log(`║ Error vs ground-truth: ${median(meterErrs).toFixed(2)} m (mediana), P90 ${[...meterErrs].sort((a,b)=>a-b)[Math.floor(meterErrs.length*0.9)]?.toFixed(2)} m`);
    console.log(`╚${"═".repeat(60)}`);

    // Asserts suaves: la mayoría debe calibrar fiable y con reproyección baja.
    expect(images.length).toBeGreaterThan(0);
    expect(predOk / images.length).toBeGreaterThan(0.6);
    expect(median(reproj)).toBeLessThan(10);
  });
});

// ── Estabilidad TEMPORAL sobre un vídeo real (clip de muestra público) ──────
const VIDEO_PATH = join(process.cwd(), "scratchpad", "field_video_eval.json");
const hasVideo = existsSync(VIDEO_PATH);

describe.skipIf(!hasVideo)("Auto-calibración sobre VÍDEO real (estabilidad temporal)", () => {
  const frames: EvalImage[] = hasVideo ? JSON.parse(readFileSync(VIDEO_PATH, "utf-8")) : [];

  it("reporta fiabilidad + jitter a lo largo del clip", () => {
    let ok = 0;
    const reproj: number[] = [];
    const conf: Record<string, number> = { high: 0, medium: 0, low: 0, none: 0 };
    const centers: Array<{ px: number; py: number } | null> = [];

    for (const fr of frames) {
      const dets: DetectedLandmark[] = fr.pred.map((k) => ({ id: k.id, px: k.x, py: k.y, confidence: k.conf }));
      const reg = registerFieldFromLandmarks(dets);
      conf[reg.confidence]++;
      if ((reg.confidence === "high" || reg.confidence === "medium") && reg.Hfield2pix) {
        ok++;
        reproj.push(reg.meanReprojErrorPx);
        // Dónde cae el CENTRO del campo (52.5, 34) en píxeles este frame.
        centers.push(fieldToPixel(reg.Hfield2pix, 52.5, 34));
      } else {
        centers.push(null);
      }
    }

    // Jitter: salto en píxeles del centro del campo entre frames CONSECUTIVOS
    // calibrados. En un clip que panea el centro se mueve suave; saltos = temblor.
    const steps: number[] = [];
    for (let i = 1; i < centers.length; i++) {
      const a = centers[i - 1], b = centers[i];
      if (a && b) steps.push(Math.hypot(b.px - a.px, b.py - a.py));
    }

    const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)];
     
    console.log(`\n╔═══ VÍDEO REAL · estabilidad temporal (${frames.length} frames, 1920×1080) ═══`);
    console.log(`║ Confianza: high=${conf.high} medium=${conf.medium} low=${conf.low} none=${conf.none}`);
    console.log(`║ Calibran fiables: ${ok}/${frames.length} (${Math.round(100 * ok / frames.length)}%)`);
    console.log(`║ Reproyección: ${median(reproj).toFixed(2)} px (mediana), P90 ${p90(reproj)?.toFixed(2)} px`);
    console.log(`║ Jitter centro campo (frame→frame): ${median(steps).toFixed(1)} px mediana, P90 ${p90(steps)?.toFixed(1)} px, max ${Math.max(...steps).toFixed(0)} px`);
    console.log(`╚${"═".repeat(64)}`);

    // Informativo: el % fiable depende del DOMINIO del clip (broadcast ~100%,
    // footage de móvil/academia mucho menos → hueco de dominio). No es un gate.
    expect(frames.length).toBeGreaterThan(0);
  });
});
