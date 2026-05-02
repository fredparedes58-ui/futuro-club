/**
 * VITAS · Video Quality Pre-Check (NUEVO · determinista)
 * POST /api/agents/video-quality-check
 *
 * Valida un vídeo ANTES de procesarlo en GPU.
 * Si el vídeo no cumple requisitos mínimos, devuelve error con razón clara
 * y EVITA gastar minutos de GPU procesando algo que dará un mal análisis.
 *
 * Reglas mínimas para análisis biomecánico fiable:
 * - Resolución mínima: 720p (1280×720)
 * - Duración: entre 30 segundos y 5 minutos
 * - FPS: ≥24
 * - Tamaño persona promedio: ≥80px de alto en frame (estimado por bbox YOLO sample)
 * - Iluminación: brillo medio en rango [40, 220] (escala 0-255)
 * - Bitrate: ≥1 Mbps
 *
 * Llamado por el webhook de Bunny ANTES de invocar Modal.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const qualitySchema = z.object({
  videoUrl: z.string().url(),
  metadata: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    durationSec: z.number().positive(),
    fps: z.number().positive(),
    bitrateKbps: z.number().positive().optional(),
    avgBrightness: z.number().min(0).max(255).optional(),
    avgPersonHeightPx: z.number().positive().optional(),
  }),
});

export const QUALITY_RULES = {
  minWidth: 1280,
  minHeight: 720,
  minDurationSec: 30,
  maxDurationSec: 300,
  minFps: 24,
  minBitrateKbps: 1000,
  brightnessMin: 40,
  brightnessMax: 220,
  minPersonHeightPx: 80,
} as const;

interface QualityIssue {
  rule: string;
  observed: string | number;
  expected: string;
  severity: "block" | "warn";
  message: string;
}

export interface QualityCheckResult {
  passed: boolean;
  canProcess: boolean;          // false → bloqueante, no llamar GPU
  issues: QualityIssue[];
  warnings: QualityIssue[];
  recommendation: string;
}

export default withHandler(
  { schema: qualitySchema, requireAuth: true, maxRequests: 200 },
  async ({ body }) => {
    const { metadata } = body;
    const issues: QualityIssue[] = [];
    const warnings: QualityIssue[] = [];

    // ── Resolución ───────────────────────────────────────────────
    if (metadata.width < QUALITY_RULES.minWidth || metadata.height < QUALITY_RULES.minHeight) {
      issues.push({
        rule: "resolution",
        observed: `${metadata.width}×${metadata.height}`,
        expected: `≥${QUALITY_RULES.minWidth}×${QUALITY_RULES.minHeight}`,
        severity: "block",
        message: "El vídeo no tiene resolución suficiente. Graba a 720p o superior.",
      });
    }

    // ── Duración ─────────────────────────────────────────────────
    if (metadata.durationSec < QUALITY_RULES.minDurationSec) {
      issues.push({
        rule: "duration_min",
        observed: `${metadata.durationSec}s`,
        expected: `≥${QUALITY_RULES.minDurationSec}s`,
        severity: "block",
        message: "Vídeo demasiado corto. Necesitamos al menos 30 segundos para un análisis fiable.",
      });
    }
    if (metadata.durationSec > QUALITY_RULES.maxDurationSec) {
      issues.push({
        rule: "duration_max",
        observed: `${metadata.durationSec}s`,
        expected: `≤${QUALITY_RULES.maxDurationSec}s`,
        severity: "block",
        message: "Vídeo demasiado largo. Máximo 5 minutos por análisis.",
      });
    }

    // ── FPS ──────────────────────────────────────────────────────
    if (metadata.fps < QUALITY_RULES.minFps) {
      issues.push({
        rule: "fps",
        observed: metadata.fps,
        expected: `≥${QUALITY_RULES.minFps}`,
        severity: "block",
        message: "Frame rate insuficiente. Mínimo 24 FPS.",
      });
    }

    // ── Bitrate (si está disponible) ─────────────────────────────
    if (metadata.bitrateKbps !== undefined && metadata.bitrateKbps < QUALITY_RULES.minBitrateKbps) {
      warnings.push({
        rule: "bitrate",
        observed: `${metadata.bitrateKbps} kbps`,
        expected: `≥${QUALITY_RULES.minBitrateKbps} kbps`,
        severity: "warn",
        message: "Bitrate bajo: el análisis biomecánico puede ser menos preciso.",
      });
    }

    // ── Iluminación ──────────────────────────────────────────────
    if (metadata.avgBrightness !== undefined) {
      if (metadata.avgBrightness < QUALITY_RULES.brightnessMin) {
        issues.push({
          rule: "lighting_dark",
          observed: metadata.avgBrightness,
          expected: `≥${QUALITY_RULES.brightnessMin}`,
          severity: "block",
          message: "Vídeo demasiado oscuro. Graba con mejor iluminación.",
        });
      } else if (metadata.avgBrightness > QUALITY_RULES.brightnessMax) {
        warnings.push({
          rule: "lighting_overexposed",
          observed: metadata.avgBrightness,
          expected: `≤${QUALITY_RULES.brightnessMax}`,
          severity: "warn",
          message: "Vídeo sobreexpuesto. Algunos detalles biomecánicos pueden perderse.",
        });
      }
    }

    // ── Tamaño persona ───────────────────────────────────────────
    if (metadata.avgPersonHeightPx !== undefined && metadata.avgPersonHeightPx < QUALITY_RULES.minPersonHeightPx) {
      issues.push({
        rule: "person_too_small",
        observed: `${metadata.avgPersonHeightPx}px`,
        expected: `≥${QUALITY_RULES.minPersonHeightPx}px`,
        severity: "block",
        message: "Cámara demasiado lejos. Graba más cerca de los jugadores.",
      });
    }

    const passed = issues.length === 0 && warnings.length === 0;
    const canProcess = issues.length === 0;
    const recommendation = canProcess
      ? warnings.length === 0
        ? "Vídeo óptimo. Procesando análisis."
        : "Vídeo procesable con advertencias menores."
      : `Vídeo no procesable. Problemas: ${issues.map((i) => i.message).join(" · ")}`;

    return successResponse<QualityCheckResult>({
      passed,
      canProcess,
      issues,
      warnings,
      recommendation,
    });
  }
);
