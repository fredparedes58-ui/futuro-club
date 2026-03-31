/**
 * VITAS Phase 2 — Full Analysis Pipeline
 * POST /api/pipeline/start
 *
 * Orchestrates:
 *   1. Fetch thumbnail from Bunny Stream (after video finishes encoding)
 *   2. Send thumbnail → Roboflow (player/ball detection)
 *   3. Send detections → TacticalLabelAgent (Claude Haiku) for tactical insights
 *   4. Return full analysis report
 *
 * Expected body: { videoId: string, playerId?: string }
 *
 * Env vars: all of the above (Bunny + Roboflow + Anthropic)
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const BodySchema = z.object({
  videoId: z.string().min(1),
  playerId: z.string().optional(),
  libraryId: z.string().optional(), // overrides env var (for multi-tenant)
});

const TACTICAL_PROMPT = `You are TacticalLabelAgent, a football analysis AI specialized in youth player development.

Given player detection data from a video frame (bounding boxes, positions, confidence scores), generate a concise tactical analysis report in JSON with this exact schema:

{
  "formationHint": string,        // e.g. "4-3-3 attack shape"
  "pressureZone": string,         // e.g. "high press in opponent half"
  "keyMovements": string[],       // max 3 notable movements detected
  "playerCount": number,          // total players detected
  "ballDetected": boolean,
  "tacticalPhase": "attack" | "defense" | "transition" | "set-piece" | "unknown",
  "confidence": number,           // 0-1 overall confidence in analysis
  "notes": string                 // brief scout note (1-2 sentences)
}

Respond ONLY with valid JSON. No markdown, no explanation.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Check all required env vars
  const missingEnv: string[] = [];
  if (!process.env.BUNNY_STREAM_LIBRARY_ID) missingEnv.push("BUNNY_STREAM_LIBRARY_ID");
  if (!process.env.BUNNY_STREAM_API_KEY) missingEnv.push("BUNNY_STREAM_API_KEY");
  if (!process.env.BUNNY_CDN_HOSTNAME) missingEnv.push("BUNNY_CDN_HOSTNAME");
  if (!process.env.ROBOFLOW_API_KEY) missingEnv.push("ROBOFLOW_API_KEY");
  if (!process.env.ROBOFLOW_PROJECT) missingEnv.push("ROBOFLOW_PROJECT");
  if (!process.env.ANTHROPIC_API_KEY) missingEnv.push("ANTHROPIC_API_KEY");

  if (missingEnv.length > 0) {
    return json(
      {
        success: false,
        error: `Variables de entorno pendientes: ${missingEnv.join(", ")}`,
        phase2Pending: true,
        missingEnv,
      },
      503
    );
  }

  try {
    const body = await req.json();
    const { videoId, playerId, libraryId: libOverride } = BodySchema.parse(body);

    const libraryId = libOverride ?? process.env.BUNNY_STREAM_LIBRARY_ID!;
    const bunnyKey = process.env.BUNNY_STREAM_API_KEY!;
    const cdnHostname = process.env.BUNNY_CDN_HOSTNAME!;
    const roboflowKey = process.env.ROBOFLOW_API_KEY!;
    const roboflowProject = process.env.ROBOFLOW_PROJECT!;
    const roboflowVersion = process.env.ROBOFLOW_VERSION ?? "1";

    // ── Step 1: Get video details + thumbnail URL from Bunny ──────────────────
    const videoRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      { headers: { AccessKey: bunnyKey } }
    );

    if (!videoRes.ok) {
      throw new Error(`Video not found in Bunny: ${videoId}`);
    }

    const videoData = (await videoRes.json()) as {
      guid: string;
      title: string;
      status: number;
      thumbnailFileName: string;
      length: number;
    };

    if (videoData.status !== 4) {
      return json(
        {
          success: false,
          error: "Video aún no está listo. Espera a que termine de procesar.",
          videoStatus: videoData.status,
        },
        202
      );
    }

    const thumbnailUrl = `https://${cdnHostname}/${videoId}/${videoData.thumbnailFileName}`;

    // ── Step 2: Roboflow detection ────────────────────────────────────────────
    const rfEndpoint = `https://detect.roboflow.com/${roboflowProject}/${roboflowVersion}?api_key=${roboflowKey}&confidence=40&overlap=30&image=${encodeURIComponent(thumbnailUrl)}`;
    const rfRes = await fetch(rfEndpoint);

    if (!rfRes.ok) {
      throw new Error(`Roboflow failed (${rfRes.status})`);
    }

    const rfData = (await rfRes.json()) as {
      time: number;
      image: { width: number; height: number };
      predictions: Array<{
        x: number; y: number; width: number; height: number;
        confidence: number; class: string; detection_id: string;
      }>;
    };

    const detectionSummary = {
      playerCount: rfData.predictions.filter((p) => p.class === "player").length,
      ballDetected: rfData.predictions.some((p) => p.class === "ball"),
      totalDetections: rfData.predictions.length,
      inferenceMs: Math.round(rfData.time * 1000),
      imageSize: rfData.image,
      positions: rfData.predictions.map((p) => ({
        class: p.class,
        confidence: p.confidence,
        normalizedX: p.x / rfData.image.width,
        normalizedY: p.y / rfData.image.height,
      })),
    };

    // ── Step 3: TacticalLabelAgent (Claude) ───────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const agentMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      temperature: 0.2,
      system: TACTICAL_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            videoTitle: videoData.title,
            playerId,
            detections: detectionSummary,
          }),
        },
      ],
    });

    const rawTactical = (agentMsg.content[0] as { type: string; text: string }).text;
    const tacticalAnalysis = JSON.parse(rawTactical);

    // ── Final report ──────────────────────────────────────────────────────────
    return json({
      success: true,
      data: {
        videoId,
        playerId: playerId ?? null,
        videoTitle: videoData.title,
        thumbnailUrl,
        videoDuration: videoData.length,
        detections: detectionSummary,
        tacticalAnalysis,
        pipeline: {
          steps: ["bunny-fetch", "roboflow-detect", "tactical-label"],
          completedAt: new Date().toISOString(),
          tokensUsed: agentMsg.usage.input_tokens + agentMsg.usage.output_tokens,
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
