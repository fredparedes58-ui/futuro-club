/**
 * VITAS · Descarga de modelos ONNX en build-time (FASE 2 vision pipeline)
 *
 * Los *.onnx están gitignored (demasiado grandes para git) y viven como
 * release assets del repo (tag models-v1). El navegador NO puede bajarlos
 * directamente de github.com/releases (302 sin CORS), así que este script
 * los trae a public/models/ en build para servirlos same-origin desde Vercel.
 *
 * Best-effort: si un asset no baja, avisa y sigue — el worker cae en cadena
 * (nano local → CDN raw con CORS) y la app nunca rompe.
 */
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "models");
const BASE = "https://github.com/fredparedes58-ui/futuro-club/releases/download/models-v1";

const MODELS = [
  { file: "yolov8n-pose.onnx",   minBytes: 10_000_000 },  // baseline/fallback
  { file: "yolov11m-pose.onnx",  minBytes: 70_000_000 },  // default desktop (FASE 1)
  { file: "yolov8n-pose-1280.onnx",  minBytes: 10_000_000 }, // #26 recall (imgsz 1280, opt-in)
  { file: "yolov11m-pose-1280.onnx", minBytes: 70_000_000 }, // #26 recall (imgsz 1280, opset 18)
  { file: "yolo11s-detect.onnx", minBytes: 30_000_000 },  // balón COCO genérico (FASE 2)
  { file: "ball-football.onnx",  minBytes:  8_000_000 },  // balón fine-tuned fútbol (FASE 3)
  { file: "field-keypoints-s.onnx", minBytes: 35_000_000 }, // auto-calibración de campo (FASE 3)
];

mkdirSync(OUT_DIR, { recursive: true });

let failures = 0;
for (const { file, minBytes } of MODELS) {
  const dest = join(OUT_DIR, file);
  if (existsSync(dest) && statSync(dest).size >= minBytes) {
    console.log(`[models] ${file} ya presente (${(statSync(dest).size / 1e6).toFixed(1)}MB) — skip`);
    continue;
  }
  try {
    console.log(`[models] Descargando ${file}…`);
    const res = await fetch(`${BASE}/${file}`, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < minBytes) throw new Error(`tamaño sospechoso: ${buf.length}B`);
    writeFileSync(dest, buf);
    console.log(`[models] ${file} OK (${(buf.length / 1e6).toFixed(1)}MB)`);
  } catch (err) {
    failures++;
    console.warn(`[models] ⚠ ${file} no descargado (${err instanceof Error ? err.message : err}) — la app usará el fallback`);
  }
}

console.log(failures === 0 ? "[models] Todos los modelos listos ✔" : `[models] ${failures} modelo(s) pendientes — build continúa (best-effort)`);
