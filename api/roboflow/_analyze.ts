/**
 * VITAS Phase 2 — Roboflow Analysis Proxy
 * POST /api/roboflow/analyze
 *
 * Accepts a base64 image or a public image URL and sends it to
 * Roboflow inference endpoint (YOLOv11M).
 */

import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";

export const config = { runtime: "edge" };

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

export default withHandler(
  { schema: BodySchema, requireAuth: true, maxRequests: 30 },
  async ({ body: input }) => {
    const apiKey = process.env.ROBOFLOW_API_KEY;
    const workspace = process.env.ROBOFLOW_WORKSPACE;
    const project = process.env.ROBOFLOW_PROJECT;
    const version = process.env.ROBOFLOW_VERSION ?? "1";
    const inferenceBase = process.env.ROBOFLOW_INFERENCE_URL ?? "https://detect.roboflow.com";

    if (!apiKey || !workspace || !project) {
      return errorResponse(
        "ROBOFLOW_API_KEY / ROBOFLOW_WORKSPACE / ROBOFLOW_PROJECT no configuradas",
        503
      );
    }

    const endpoint = `${inferenceBase}/${project}/${version}?api_key=${apiKey}&confidence=${Math.round(input.confidence * 100)}&overlap=${Math.round(input.overlap * 100)}`;

    let roboflowRes: Response;

    if (input.type === "url") {
      roboflowRes = await fetch(`${endpoint}&image=${encodeURIComponent(input.imageUrl)}`, {
        method: "GET",
      });
    } else {
      roboflowRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: input.imageBase64,
      });
    }

    if (!roboflowRes.ok) {
      const errText = await roboflowRes.text();
      return errorResponse(`Roboflow error (${roboflowRes.status}): ${errText}`, 502);
    }

    const rawDetections = (await roboflowRes.json()) as {
      time: number;
      image: { width: number; height: number };
      predictions: Array<{
        x: number; y: number; width: number; height: number;
        confidence: number; class: string; class_id: number; detection_id: string;
      }>;
    };

    const { width: imgW, height: imgH } = rawDetections.image;
    const detections = rawDetections.predictions.map((p) => ({
      id: p.detection_id,
      class: p.class,
      classId: p.class_id,
      confidence: p.confidence,
      bbox: {
        x: p.x / imgW, y: p.y / imgH, width: p.width / imgW, height: p.height / imgH,
        xPx: p.x, yPx: p.y, wPx: p.width, hPx: p.height,
      },
    }));

    const playerCount = detections.filter((d) => d.class === "player").length;
    const ballCount = detections.filter((d) => d.class === "ball").length;

    return successResponse({
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
  }
);
