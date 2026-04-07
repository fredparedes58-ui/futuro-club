/**
 * VITAS · Tracking Worker
 *
 * Web Worker dedicado al pipeline YOLO:
 *   1. Carga el modelo ONNX (una vez)
 *   2. Por cada frame: preprocesar → inferir → NMS → postprocesar
 *   3. Ejecuta el tracker IoU y devuelve Track[] al hilo principal
 *
 * Usa onnxruntime-web con numThreads=1 (sin SharedArrayBuffer).
 * Modelo: YOLOv8n-pose (output shape [1, 56, 8400])
 *   56 = 4 bbox + 1 conf + 17×3 keypoints
 */

import * as ort from "onnxruntime-web";
import { CentroidTracker }  from "../lib/yolo/tracker";
import type { Detection, WorkerCommand, WorkerEvent } from "../lib/yolo/types";

// ─── Configuración ─────────────────────────────────────────────────────────

ort.env.wasm.numThreads = 1;   // sin SharedArrayBuffer
ort.env.wasm.simd       = true; // SIMD acelera en CPUs modernas

const MODEL_INPUT_SIZE = 640;
const CONF_THRESH      = 0.30;
const IOU_THRESH       = 0.45;
const NUM_KEYPOINTS    = 17;

let session: ort.InferenceSession | null = null;
const tracker = new CentroidTracker();

// ─── Comunicación con hilo principal ──────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerCommand>) => {
  const cmd = e.data;

  switch (cmd.type) {
    case "INIT":
      await initModel(cmd.modelUrl);
      break;
    case "FRAME":
      await processFrame(cmd);
      break;
    case "RESET":
      tracker.reset();
      break;
  }
};

function send(event: WorkerEvent): void {
  (self as unknown as Worker).postMessage(event);
}

// ─── Inicializar modelo ONNX ───────────────────────────────────────────────

// Fallback CDN for YOLO model if local/Bunny CDN isn't available
const FALLBACK_MODEL_URL = "https://raw.githubusercontent.com/akbartus/Yolov8-Pose-Detection-on-Browser/main/yolov8_pose_onnx/model/yolov8n-pose.onnx";

async function initModel(modelUrl: string): Promise<void> {
  try {
    send({ type: "PROGRESS", percent: 10, message: "Descargando modelo YOLO…" });

    // Try primary URL first, fallback to public CDN
    let response = await fetch(modelUrl);
    if (!response.ok && modelUrl !== FALLBACK_MODEL_URL) {
      send({ type: "PROGRESS", percent: 12, message: "Modelo local no encontrado, descargando de CDN…" });
      response = await fetch(FALLBACK_MODEL_URL);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} — no se pudo descargar el modelo YOLO`);

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream no disponible");

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        const pct = Math.round((received / contentLength) * 70) + 10;
        send({ type: "PROGRESS", percent: pct, message: "Descargando modelo YOLO…" });
      }
    }

    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }

    send({ type: "PROGRESS", percent: 85, message: "Cargando en memoria…" });

    session = await ort.InferenceSession.create(buffer.buffer, {
      executionProviders:    ["wasm"],
      graphOptimizationLevel: "all",
    });

    send({ type: "PROGRESS", percent: 100, message: "Modelo listo" });
    send({ type: "READY" });
  } catch (err) {
    send({ type: "ERROR", message: err instanceof Error ? err.message : String(err) });
  }
}

// ─── Procesar frame ────────────────────────────────────────────────────────

async function processFrame(cmd: Extract<WorkerCommand, { type: "FRAME" }>): Promise<void> {
  if (!session) {
    send({ type: "ERROR", message: "Modelo no inicializado" });
    return;
  }

  try {
    // 1. Preprocesar ImageData → tensor [1, 3, 640, 640]
    const inputTensor = preprocess(cmd.imageData);

    // 2. Inferencia
    const feeds: Record<string, ort.Tensor> = {};
    feeds[session.inputNames[0]] = inputTensor;
    const output = await session.run(feeds);

    // 3. Postprocesar — output shape [1, 56, 8400]
    const outputData = output[session.outputNames[0]].data as Float32Array;
    const detections = postprocess(
      outputData,
      cmd.imageData.width,
      cmd.imageData.height
    );

    // 4. Actualizar tracker (usa timestamps reales, no FPS hardcoded)
    const H = new Float64Array(cmd.homography);
    const tracks = tracker.update(detections, H, cmd.timestampMs);

    send({
      type:       "RESULT",
      frameIndex: cmd.frameIndex,
      timestampMs: cmd.timestampMs,
      tracks,
    });
  } catch (err) {
    send({ type: "ERROR", message: err instanceof Error ? err.message : String(err) });
  }
}

// ─── Preprocesar ImageData → Float32 tensor CHW normalizado ───────────────

function preprocess(imageData: ImageData): ort.Tensor {
  const { width, height, data } = imageData;
  const size   = MODEL_INPUT_SIZE;
  const tensor = new Float32Array(3 * size * size);

  // Calcular escala de resize con letterboxing
  const scale  = Math.min(size / width, size / height);
  const newW   = Math.round(width  * scale);
  const newH   = Math.round(height * scale);
  const padX   = Math.floor((size - newW) / 2);
  const padY   = Math.floor((size - newH) / 2);

  // Convertir RGBA → RGB normalizado en CHW
  for (let py = 0; py < newH; py++) {
    for (let px = 0; px < newW; px++) {
      // Muestrear pixel del imageData original (nearest neighbor)
      const srcX = Math.min(Math.round(px / scale), width  - 1);
      const srcY = Math.min(Math.round(py / scale), height - 1);
      const srcIdx = (srcY * width + srcX) * 4;

      const dstX = px + padX;
      const dstY = py + padY;

      tensor[0 * size * size + dstY * size + dstX] = data[srcIdx]     / 255; // R
      tensor[1 * size * size + dstY * size + dstX] = data[srcIdx + 1] / 255; // G
      tensor[2 * size * size + dstY * size + dstX] = data[srcIdx + 2] / 255; // B
    }
  }

  return new ort.Tensor("float32", tensor, [1, 3, size, size]);
}

// ─── Postprocesar output YOLOv8n-pose [1, 56, 8400] ──────────────────────

function postprocess(
  data:    Float32Array,
  imgW:    number,
  imgH:    number
): Detection[] {
  const size    = MODEL_INPUT_SIZE;
  const scale   = Math.min(size / imgW, size / imgH);
  const padX    = (size - imgW * scale) / 2;
  const padY    = (size - imgH * scale) / 2;
  const numAnch = 8400;
  const numKp   = NUM_KEYPOINTS;

  const boxes:  Array<[number,number,number,number]> = [];
  const scores: number[] = [];
  const kpsList: Array<Array<{x:number;y:number;confidence:number}>> = [];

  for (let i = 0; i < numAnch; i++) {
    const conf = data[4 * numAnch + i];
    if (conf < CONF_THRESH) continue;

    // BBox (cx, cy, w, h) en espacio 640×640 → píxeles originales
    const cx = data[0 * numAnch + i];
    const cy = data[1 * numAnch + i];
    const bw = data[2 * numAnch + i];
    const bh = data[3 * numAnch + i];

    const x = (cx - bw / 2 - padX) / scale;
    const y = (cy - bh / 2 - padY) / scale;
    const w = bw / scale;
    const h = bh / scale;

    // Keypoints (17 × 3): x, y, conf por keypoint
    const kps: Array<{x:number;y:number;confidence:number}> = [];
    for (let k = 0; k < numKp; k++) {
      const kx   = (data[(5 + k * 3 + 0) * numAnch + i] - padX) / scale;
      const ky   = (data[(5 + k * 3 + 1) * numAnch + i] - padY) / scale;
      const kc   =  data[(5 + k * 3 + 2) * numAnch + i];
      kps.push({ x: kx, y: ky, confidence: kc });
    }

    boxes.push([x, y, w, h]);
    scores.push(conf);
    kpsList.push(kps);
  }

  // NMS
  const keep = nms(boxes, scores, IOU_THRESH);

  return keep.map(idx => ({
    bbox:       boxes[idx],
    confidence: scores[idx],
    keypoints:  kpsList[idx],
  }));
}

// ─── Non-Maximum Suppression ───────────────────────────────────────────────

function nms(
  boxes:  Array<[number,number,number,number]>,
  scores: number[],
  iouThresh: number
): number[] {
  const idxs = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .map(o => o.i);

  const keep: number[] = [];
  const suppressed = new Set<number>();

  for (const i of idxs) {
    if (suppressed.has(i)) continue;
    keep.push(i);
    for (const j of idxs) {
      if (i === j || suppressed.has(j)) continue;
      if (iouBoxes(boxes[i], boxes[j]) > iouThresh) suppressed.add(j);
    }
  }
  return keep;
}

function iouBoxes(
  a: [number,number,number,number],
  b: [number,number,number,number]
): number {
  const ax2 = a[0]+a[2], ay2 = a[1]+a[3];
  const bx2 = b[0]+b[2], by2 = b[1]+b[3];
  const ix = Math.max(0, Math.min(ax2,bx2) - Math.max(a[0],b[0]));
  const iy = Math.max(0, Math.min(ay2,by2) - Math.max(a[1],b[1]));
  const inter = ix * iy;
  if (!inter) return 0;
  return inter / (a[2]*a[3] + b[2]*b[3] - inter);
}
