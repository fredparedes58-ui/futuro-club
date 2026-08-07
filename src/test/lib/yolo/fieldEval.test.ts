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
import { pixelToField } from "@/lib/yolo/homography";

interface EvalImage {
  name: string; w: number; h: number;
  pred: Array<{ id: number; x: number; y: number; conf: number }>;
  gt: Array<{ id: number; x: number; y: number }>;
}

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
