/**
 * VITAS · Match job — arnés de validación del motor de observación (lo corre el OPERADOR)
 *
 * CLI: scripts/validate-match-observation.mjs (carga este módulo con el module runner de
 * Vite). Nunca lo importa un endpoint. Ejecuta la MISMA petición a Gemini que el job
 * (segmentRequest.ts: prompt segment.v1, responseSchema, videoMetadata.fps,
 * mediaResolution y topes de config/matchVideo.json), aplica la MISMA normalización
 * (identityGuard + zod + tiempos + base visual) y puntúa las evidencias contra eventos
 * anotados a mano (validation.ts). Sale no-aprobado si no alcanza los umbrales de config.
 *
 *   - La key se lee de GEMINI_API_KEY del entorno local y NUNCA se imprime.
 *   - fixtures/partido/<clip>/ es EVALUACIÓN, nunca entrenamiento (fixtures/README.md).
 *   - El fichero subido a Gemini se borra al terminar (salvo --keep-file).
 *   - --response re-puntúa una respuesta guardada sin llamar a Gemini (coste 0).
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import { MATCH_CATEGORIES, ATTACKING_DIRECTIONS, teamKitSchema, type SegmentObservation } from "../../../src/lib/shared/matchJob/contract";
import { GEMINI_MODEL } from "../../../src/lib/shared/geminiModel";
import { localeSchema, type ReportLocale } from "../../../src/lib/shared/locale";
import { deleteFile, getFile, startResumableSession, uploadBytesToSession } from "../gemini/files";
import { generateJson, type GenerateJsonResult } from "../gemini/generate";
import { aggregateMatch, type SegmentState } from "./aggregate";
import { AGGREGATE_CONFIDENCE, MATCH_VIDEO_CONFIG as CFG, matchVideoConfigSource } from "./config";
import { geminiUsageCostUsd, type GeminiUsage } from "./costing";
import { buildNameGuard } from "./identityGuard";
import { planSegments, type PlannedSegment } from "./plan";
import { buildSegmentGenerateRequest } from "./segmentRequest";
import { normalizeSegmentOutput, visualBasisFromUsage, type NormalizedSegment, type VisualBasis } from "./segmentResult";
import {
  annotatedEventsFileSchema,
  evaluateThresholds,
  regularStepShare,
  scoreObservation,
  type AnnotatedEvent,
  type ScoreResult,
  type ThresholdFailure,
} from "./validation";

// ── Fixture ──────────────────────────────────────────────────────────────────

export const partidoFixtureMetaSchema = z
  .object({
    clip_id: z.string().trim().min(1),
    /** Nombre del fichero original (informativo). */
    fuente: z.string().trim().min(1),
    /** Ruta del vídeo local relativa al directorio del fixture (el vídeo NO se versiona). */
    clip: z.string().trim().min(1).optional(),
    /** Duración del clip evaluado (s), declarada por quien anota. */
    duracion_s: z.number().positive(),
    anotador: z.string().trim().min(1),
    fecha_anotacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    locale: localeSchema,
    category: z.enum(MATCH_CATEGORIES).nullable().optional(),
    attackingDir1h: z.enum(ATTACKING_DIRECTIONS).nullable().optional(),
    /** Colores declarados como los declararía el entrenador (identidad SOLO por equipación). */
    home: z.object({ kit: teamKitSchema }).strict(),
    away: z.object({ kit: teamKitSchema }).strict(),
    /** Solo alimenta el filtro de nombres; NUNCA se envía a Gemini. */
    notes: z.string().max(1000).optional(),
  })
  .strict();
export type PartidoFixtureMeta = z.infer<typeof partidoFixtureMetaSchema>;

export class HarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessError";
  }
}

const PLACEHOLDER_RE = /<rellenar|PLANTILLA/i;

export function loadPartidoFixture(fixtureDir: string): { meta: PartidoFixtureMeta; events: AnnotatedEvent[]; dir: string } {
  const dir = resolve(fixtureDir);
  if (dir.split(sep).includes("_plantilla")) throw new HarnessError("_plantilla/ no es un fixture real: cópiala a fixtures/partido/<clip_id>/ y rellénala.");
  const metaPath = join(dir, "clip.meta.json");
  const eventsPath = join(dir, "eventos.json");
  if (!existsSync(metaPath)) throw new HarnessError(`falta ${metaPath}`);
  if (!existsSync(eventsPath)) throw new HarnessError(`falta ${eventsPath}`);
  const rawMeta = JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  if (rawMeta.__plantilla__ === true) throw new HarnessError("clip.meta.json sigue marcado como plantilla (__plantilla__: true).");
  delete rawMeta.__plantilla__;
  delete rawMeta.__instruccion__;
  const meta = partidoFixtureMetaSchema.safeParse(rawMeta);
  if (!meta.success) {
    throw new HarnessError(`clip.meta.json inválido: ${meta.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  if (PLACEHOLDER_RE.test(meta.data.anotador) || PLACEHOLDER_RE.test(meta.data.clip_id)) {
    throw new HarnessError("clip.meta.json tiene campos sin rellenar (anotador / clip_id).");
  }
  const events = annotatedEventsFileSchema.safeParse(JSON.parse(readFileSync(eventsPath, "utf8")));
  if (!events.success) {
    throw new HarnessError(`eventos.json inválido (array [{t, team: home|away, category}], ≥1 evento): ${events.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return { meta: meta.data, events: events.data, dir };
}

// ── Resultados crudos (lo que se guarda con --save-response) ────────────────

export interface RawSegmentResult {
  segment: PlannedSegment;
  result: GenerateJsonResult;
}

const rawFileSchema = z
  .object({
    schema: z.literal("vitas-match-validation-raw.v1"),
    model: z.string().min(1),
    config: z.record(z.unknown()),
    segments: z.array(
      z.object({
        segment: z.object({ idx: z.number().int().nonnegative(), start_sec: z.number(), end_sec: z.number() }),
        result: z.record(z.unknown()),
      }),
    ),
  })
  .passthrough();

/** Parámetros del motor que determinan el resultado (se guardan con la respuesta cruda). */
export function engineParams() {
  return {
    model: GEMINI_MODEL,
    segmentSec: CFG.segmentSec,
    geminiVideoFps: CFG.geminiVideoFps,
    proxyFps: CFG.proxyFps,
    mediaResolution: CFG.mediaResolution,
    maxOutputTokens: CFG.maxOutputTokens,
    thinkingBudget: CFG.thinkingBudget,
  };
}

// ── Informe ──────────────────────────────────────────────────────────────────

export interface SegmentDiagnostic {
  idx: number;
  start_sec: number;
  end_sec: number;
  status: "done" | "failed";
  failure: string | null;
  visualBasis: VisualBasis | null;
  teamIdentification: SegmentObservation["team_identification"] | null;
  possession: { home: number; away: number } | null;
  dominance: SegmentObservation["dominance"];
  evidence: number;
  identityDropped: number;
  regularStep10s: number | null;
  costUsd: number;
}

export interface HarnessReport {
  fixture: { clip_id: string; anotador: string; fecha_anotacion: string; events: number };
  engine: ReturnType<typeof engineParams>;
  thresholds: { toleranceSec: number; minPrecision: number; minRecall: number; source: string };
  segments: SegmentDiagnostic[];
  score: ScoreResult;
  verdict: { pass: boolean; failures: ThresholdFailure[]; reason: string | null };
  possession: { home: number | null; away: number | null; lowConfidence: string[] };
  costUsd: number;
  rawSavedTo: string | null;
}

/** Paso del diagnóstico de plantilla (el spike vio eventos en pasos de ~10 s). No decide el gate. */
const TEMPLATE_STEP_SEC = 10;
const POLL_MS = 5000;
const ACTIVE_TIMEOUT_MS = 15 * 60 * 1000;

async function waitForActive(name: string, log: (s: string) => void): Promise<{ uri: string }> {
  const deadline = Date.now() + ACTIVE_TIMEOUT_MS;
  for (;;) {
    const got = await getFile(name);
    if (got.ok) {
      if (got.file.state === "ACTIVE" && got.file.uri) return { uri: got.file.uri };
      if (got.file.state === "FAILED") throw new HarnessError("Gemini no pudo procesar el vídeo (state FAILED)");
    } else if (got.status !== 404) {
      log(`  files.get → HTTP ${got.status}; reintento`);
    }
    if (Date.now() > deadline) throw new HarnessError("el fichero no llegó a ACTIVE a tiempo");
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function resolveClip(meta: PartidoFixtureMeta, dir: string, clipPath?: string): string {
  const p = clipPath ?? (meta.clip ? join(dir, meta.clip) : null);
  if (!p) throw new HarnessError("falta el vídeo: pasa --clip <ruta> o declara `clip` en clip.meta.json");
  const abs = isAbsolute(p) ? p : resolve(p);
  if (!existsSync(abs)) throw new HarnessError(`no existe el vídeo ${abs}`);
  return abs;
}

async function runGemini(opts: {
  meta: PartidoFixtureMeta;
  clip: string;
  segments: PlannedSegment[];
  keepFile: boolean;
  log: (s: string) => void;
}): Promise<RawSegmentResult[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new HarnessError("GEMINI_API_KEY no está en el entorno (p. ej. node --env-file=.env.local …). Nunca se imprime.");
  }
  const bytes = statSync(opts.clip).size;
  if (bytes > CFG.geminiFileMaxBytes) throw new HarnessError("el vídeo supera el límite por fichero de Gemini");
  const displayName = `vitas-validation-${opts.meta.clip_id}`.slice(0, 120);
  opts.log(`Subiendo ${basename(opts.clip)} (${(bytes / 1e6).toFixed(1)} MB) a Gemini…`);
  const session = await startResumableSession({ bytes, mime: "video/mp4", displayName });
  const file = await uploadBytesToSession(session.uploadUrl, new Uint8Array(readFileSync(opts.clip)));
  try {
    opts.log("Esperando a que Gemini procese el vídeo (ACTIVE)…");
    const { uri } = await waitForActive(file.name, opts.log);
    const out: RawSegmentResult[] = [];
    for (const seg of opts.segments) {
      opts.log(`Tramo #${seg.idx + 1}/${opts.segments.length} (${seg.start_sec}–${seg.end_sec} s)…`);
      const result = await generateJson(
        buildSegmentGenerateRequest({
          model: GEMINI_MODEL,
          fileUri: uri,
          locale: opts.meta.locale as ReportLocale,
          category: opts.meta.category ?? null,
          homeKit: opts.meta.home.kit,
          awayKit: opts.meta.away.kit,
          attackingDir1h: opts.meta.attackingDir1h ?? null,
          segment: seg,
          totalSegments: opts.segments.length,
        }),
      );
      out.push({ segment: seg, result });
    }
    return out;
  } finally {
    if (!opts.keepFile) {
      const ok = await deleteFile(file.name);
      opts.log(ok ? "Fichero de Gemini borrado." : `AVISO: no se pudo borrar ${file.name} en Gemini (bórralo a mano).`);
    }
  }
}

export interface HarnessOptions {
  fixtureDir: string;
  clipPath?: string;
  /** Re-puntúa una respuesta guardada (sin llamar a Gemini). */
  responsePath?: string;
  saveResponsePath?: string;
  /** Evalúa solo esta ventana (s) en vez de planificar tramos sobre toda la duración. */
  window?: { start_sec: number; end_sec: number } | null;
  keepFile?: boolean;
  log?: (line: string) => void;
}

export async function runValidationHarness(opts: HarnessOptions): Promise<HarnessReport> {
  const log = opts.log ?? (() => undefined);
  const { meta, events, dir } = loadPartidoFixture(opts.fixtureDir);
  const segments = opts.window
    ? [{ idx: 0, start_sec: opts.window.start_sec, end_sec: Math.min(opts.window.end_sec, meta.duracion_s) }]
    : planSegments(meta.duracion_s, CFG.segmentSec, CFG.minTrailingSegmentSec);
  if (segments.some((s) => !(s.end_sec > s.start_sec))) throw new HarnessError("ventana vacía o fuera del clip");

  let raw: RawSegmentResult[];
  if (opts.responsePath) {
    const parsed = rawFileSchema.parse(JSON.parse(readFileSync(opts.responsePath, "utf8")));
    raw = parsed.segments.map((s) => ({ segment: s.segment, result: s.result as unknown as GenerateJsonResult }));
    log(`Re-puntuando respuesta guardada (${raw.length} tramos, modelo ${parsed.model}); sin llamadas a Gemini.`);
  } else {
    raw = await runGemini({ meta, clip: resolveClip(meta, dir, opts.clipPath), segments, keepFile: !!opts.keepFile, log });
  }

  let rawSavedTo: string | null = null;
  if (opts.saveResponsePath) {
    rawSavedTo = resolve(opts.saveResponsePath);
    writeFileSync(
      rawSavedTo,
      JSON.stringify({ schema: "vitas-match-validation-raw.v1", model: GEMINI_MODEL, config: engineParams(), segments: raw }, null, 2),
      "utf8",
    );
  }

  const exclude = [meta.home.kit.shirt.label, meta.away.kit.shirt.label, meta.home.kit.shorts?.label, meta.away.kit.shorts?.label];
  const names = buildNameGuard({ notes: meta.notes ?? null, exclude });
  const states: SegmentState[] = [];
  const diags: SegmentDiagnostic[] = [];
  const evidence: NormalizedSegment["observation"]["evidence"] = [];
  let costUsd = 0;

  for (const { segment: seg, result } of raw) {
    const usage = (result.usage ?? null) as GeminiUsage | null;
    const cost = usage ? geminiUsageCostUsd(usage, GEMINI_MODEL).usd : 0;
    costUsd += cost;
    const base = { idx: seg.idx, start_sec: seg.start_sec, end_sec: seg.end_sec, costUsd: cost };
    const failed = (failure: string, visualBasis: VisualBasis | null): void => {
      diags.push({ ...base, status: "failed", failure, visualBasis, teamIdentification: null, possession: null, dominance: null, evidence: 0, identityDropped: 0, regularStep10s: null });
      states.push({ ...seg, status: "failed", result: null, failure: { kind: "invalid_output", attempts: 1 } });
    };
    if (!result.ok) {
      failed(`${result.kind}: ${result.message}`, null);
      continue;
    }
    const visualBasis = visualBasisFromUsage(usage);
    if (visualBasis === "absent") {
      failed("no_visual_input: usageMetadata sin tokens de vídeo", visualBasis);
      continue;
    }
    const norm = normalizeSegmentOutput(result.json, seg, names);
    if (!norm.ok) {
      failed(`invalid_output: ${norm.issues}`, visualBasis);
      continue;
    }
    const o = norm.value.observation;
    evidence.push(...o.evidence);
    states.push({ ...seg, status: "done", result: { ...norm.value, visual_basis: visualBasis }, failure: null });
    diags.push({
      ...base,
      status: "done",
      failure: null,
      visualBasis,
      teamIdentification: o.team_identification,
      possession: o.possession_estimate ? { home: o.possession_estimate.home_pct, away: o.possession_estimate.away_pct } : null,
      dominance: o.dominance,
      evidence: o.evidence.length,
      identityDropped: norm.value.guard.items_dropped + norm.value.guard.keys_stripped,
      regularStep10s: regularStepShare(o.evidence, TEMPLATE_STEP_SEC),
    });
  }

  const score = scoreObservation({ evidence, events, toleranceSec: CFG.validationTimeToleranceSec, windows: segments });
  const verdict = evaluateThresholds(score, { minPrecision: CFG.validationMinPrecision, minRecall: CFG.validationMinRecall });

  // Lo que mostraría el producto (posesión + banderas de baja confianza), para el operador.
  const observation = aggregateMatch({
    durationSec: meta.duracion_s,
    segments: states.sort((a, b) => a.idx - b.idx),
    locale: meta.locale as ReportLocale,
    geminiModel: GEMINI_MODEL,
    confidence: AGGREGATE_CONFIDENCE,
  });

  return {
    fixture: { clip_id: meta.clip_id, anotador: meta.anotador, fecha_anotacion: meta.fecha_anotacion, events: events.length },
    engine: engineParams(),
    thresholds: {
      toleranceSec: CFG.validationTimeToleranceSec,
      minPrecision: CFG.validationMinPrecision,
      minRecall: CFG.validationMinRecall,
      source: matchVideoConfigSource("validationMinPrecision"),
    },
    segments: diags.sort((a, b) => a.idx - b.idx),
    score,
    verdict,
    possession: {
      home: observation.possession.home.value,
      away: observation.possession.away.value,
      lowConfidence: (observation.possession_detail.low_confidence ?? []).map((f) => f.reason),
    },
    costUsd: Math.round(costUsd * 10000) / 10000,
    rawSavedTo,
  };
}

// ── Formato de consola ───────────────────────────────────────────────────────

const pct = (v: number | null) => (v === null ? "  n/a" : `${(v * 100).toFixed(0).padStart(4)}%`);

export function formatHarnessReport(r: HarnessReport): string {
  const lines: string[] = [];
  lines.push(`Fixture ${r.fixture.clip_id} · anotado por ${r.fixture.anotador} (${r.fixture.fecha_anotacion}) · ${r.fixture.events} eventos`);
  lines.push(
    `Motor: ${r.engine.model} · tramos ${r.engine.segmentSec}s · videoMetadata.fps ${r.engine.geminiVideoFps} (proxy ${r.engine.proxyFps}) · ${r.engine.mediaResolution}`,
  );
  lines.push(`Tolerancia ±${r.thresholds.toleranceSec}s · umbrales precisión ≥ ${pct(r.thresholds.minPrecision).trim()} · exhaustividad ≥ ${pct(r.thresholds.minRecall).trim()} (pendiente de validar)`);
  lines.push("");
  lines.push("Tramos:");
  for (const s of r.segments) {
    const head = `  #${s.idx + 1} ${s.start_sec}–${s.end_sec}s`;
    if (s.status === "failed") {
      lines.push(`${head} FALLIDO · ${s.failure}`);
      continue;
    }
    const pos = s.possession ? `${s.possession.home}/${s.possession.away}` : "null";
    const step = s.regularStep10s === null ? "n/a" : `${Math.round(s.regularStep10s * 100)}%`;
    lines.push(
      `${head} base visual ${s.visualBasis} · equipos ${s.teamIdentification} · posesión ${pos} · dominio ${s.dominance ?? "null"} · evidencias ${s.evidence} · descartadas por identidad ${s.identityDropped} · t múltiplo de 10 s ${step}`,
    );
  }
  lines.push("");
  lines.push("Categoría                anotados  citadas  aciertos  precisión  exhaustividad");
  for (const c of [...r.score.byCategory, r.score.overall]) {
    lines.push(
      `  ${c.category.padEnd(22)} ${String(c.annotated).padStart(8)} ${String(c.predicted).padStart(8)} ${String(c.matched).padStart(9)}      ${pct(c.precision)}          ${pct(c.recall)}`,
    );
  }
  const a = r.score.overallTeamAgnostic;
  lines.push(`  (diagnóstico sin equipo: precisión ${pct(a.precision).trim()} · exhaustividad ${pct(a.recall).trim()})`);
  if (r.score.eventsOutsideWindows > 0) lines.push(`  ${r.score.eventsOutsideWindows} eventos anotados fuera de los tramos evaluados (no cuentan).`);
  lines.push("");
  lines.push(
    `Posesión que mostraría el producto: ${r.possession.home === null ? "bloqueada" : `${r.possession.home}% – ${r.possession.away}% (Estimado por IA)`}`,
  );
  for (const f of r.possession.lowConfidence) lines.push(`  ${f}`);
  lines.push(`Coste Gemini de esta ejecución: $${r.costUsd.toFixed(4)}${r.rawSavedTo ? ` · respuesta guardada en ${r.rawSavedTo}` : ""}`);
  lines.push("");
  if (r.verdict.pass) {
    lines.push("RESULTADO: APROBADO para este clip. Un clip no basta: valida varios partidos antes de proponer MATCH_VIDEO_ENABLED=true.");
  } else {
    lines.push(`RESULTADO: NO APROBADO (${r.verdict.reason}). El análisis de partido completo sigue en validación.`);
    for (const f of r.verdict.failures) lines.push(`  ${f.category}: ${f.metric} ${pct(f.value).trim()} < ${pct(f.threshold).trim()}`);
  }
  return lines.join("\n");
}

/** Directorio del fixture por defecto a partir del id del clip. */
export function defaultFixtureDir(repoRoot: string, clipId: string): string {
  return join(repoRoot, "fixtures", "partido", clipId);
}
