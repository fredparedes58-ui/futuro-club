/**
 * VITAS Phase 2 — Roboflow Analysis Proxy
 * POST /api/roboflow/analyze
 *
 * Accepts a base64 image or a public image URL and sends it to a
 * Roboflow inference endpoint (object detection model — YOLOv11M or similar).
 * Returns raw detections + normalized bounding boxes.
 *
 * Env vars needed:
 *   ROBOFLOW_API_KEY        — Roboflow API key
 *   ROBOFLOW_WORKSPACE      — workspace slug (e.g. "vitas-fc")
 *   ROBOFLOW_PROJECT        — project slug (e.g. "football-players-v2")
 *   ROBOFLOW_VERSION        — model version number (e.g. "3")
 *
 * Optional (defaults to hosted inference):
 *   ROBOFLOW_INFERENCE_URL  — custom inference server URL
 */

import { z } from "zod";

const BodySchema = z.union([
  z.object({
    type: z.literal("url"),
    imageUrl: z.string().url(),
    confidence: z.number().min(0).max(1).default(0.4),
    overlap: z.number().min(0).max(1).default(0.3),
  }),
  z.object({
    type: z.literal("base64"),
    imageBase64: z.string().min(1),
    confidence: z.number().min(0).max(1).default(0.4),
    overlap: z.number().min(0).max(1).default(0.3),
  }),
]);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ROBOFLOW_API_KEY;
  const workspace = process.env.ROBOFLOW_WORKSPACE;
  const project = process.env.ROBOFLOW_PROJECT;
  const version = process.env.ROBOFLOW_VERSION ?? "1";
  const inferenceBase =
    process.env.ROBOFLOW_INFERENCE_URL ??
    "https://detect.roboflow.com";

  if (!apiKey || !workspace || !project) {
    return json(
      {
        success: false,
        error: "ROBOFLOW_API_KEY / ROBOFLOW_WORKSPACE / ROBOFLOW_PROJECT no configuradas",
        phase2Pending: true,
      },
      503
    );
  }

  try {
    const body = await req.json();
    const input = BodySchema.parse(body);

    const endpoint = `${inferenceBase}/${project}/${version}?api_key=${apiKey}&confidence=${Math.round(input.confidence * 100)}&overlap=${Math.round(input.overlap * 100)}`;

    let roboflowRes: Response;

    if (input.type === "url") {
      roboflowRes = await fetch(`${endpoint}&image=${encodeURIComponent(input.imageUrl)}`, {
        method: "GET",
      });
    } else {
      // base64 upload
      roboflowRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: input.imageBase64,
      });
    }

    if (!roboflowRes.ok) {
      const errText = await roboflowRes.text();
      throw new Error(`Roboflow error (${roboflowRes.status}): ${errText}`);
    }

    const rawDetections = (await roboflowRes.json()) as {
      time: number;
      image: { width: number; height: number };
      predictions: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        confidence: number;
        class: string;
        class_id: number;
        detection_id: string;
      }>;
    };

    // Normalize bounding boxes to [0-1] range
    const { width: imgW, height: imgH } = rawDetections.image;
    const detections = rawDetections.predictions.map((p) => ({
      id: p.detection_id,
      class: p.class,
      classId: p.class_id,
      confidence: p.confidence,
      bbox: {
        x: p.x / imgW,
        y: p.y / imgH,
        width: p.width / imgW,
        height: p.height / imgH,
        // Raw pixels too
        xPx: p.x,
        yPx: p.y,
        wPx: p.width,
        hPx: p.height,
      },
    }));

    const playerCount = detections.filter((d) => d.class === "player").length;
    const ballCount = detections.filter((d) => d.class === "ball").length;

    return json({
      success: true,
      data: {
        detections,
        summary: {
          totalDetections: detections.length,
          players: playerCount,
          balls: ballCount,
          inferenceTimeMs: Math.round(rawDetections.time * 1000),
          imageSize: rawDetections.image,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };
