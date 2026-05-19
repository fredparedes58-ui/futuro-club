/**
 * VITAS · Tracking Module Barrel Export
 *
 * Re-exports all tracking modules for clean imports.
 * Modules 1-5 are in src/lib/yolo/ (YOLO core).
 * Modules 6-10 are here:
 *   6. serverInference    — Server-side fallback for mobile/low-power devices
 *   7. fineTunePipeline   — Annotation collection + model fine-tuning infra
 *   8. multiCameraFusion  — Multi-angle fusion (Phase 3)
 *   9. eventDetectionEngine — Physics-based tactical event detection
 *  10. analyticsExportPipeline — 6-format export (JSON, CSV, SPADL, STS, Metrica, HTML)
 *
 * Plus:
 *   - fieldLineDetector — OpenCV.js field line auto-detection for calibration
 */

// ── Active modules (wired into VitasLab) ──────────────────────────────────────
export { EventDetectionEngine } from "./eventDetectionEngine";
export type { TacticalEvent, EventSummary, EventDetectionConfig } from "./eventDetectionEngine";

export { AnalyticsExporter } from "./analyticsExportPipeline";
export type { SessionExportData, ExportFormat } from "./analyticsExportPipeline";

export { detectFieldLines } from "./fieldLineDetector";
export type { FieldDetectionResult } from "./fieldLineDetector";

// ── Infrastructure modules (Phase 2-3, exported for future wiring) ────────────
export { ServerInferenceClient, getInferenceClient } from "./serverInference";
export type { InferenceRequest, InferenceBatchRequest, InferenceEndpointConfig } from "./serverInference";

export { AnnotationCollector, TrainingJobManager, getAnnotationCollector } from "./fineTunePipeline";
export type { AnnotatedFrame, YOLOAnnotation, TrainingJob } from "./fineTunePipeline";

export { MultiCameraFusionEngine, getFusionEngine } from "./multiCameraFusion";
export type { CameraConfig, CameraDetection, FusionConfig } from "./multiCameraFusion";
