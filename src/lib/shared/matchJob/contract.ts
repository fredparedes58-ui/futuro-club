/**
 * VITAS · Match video job — SHARED CONTRACT (Phase 1, PR-0)
 *
 * Single source of truth for the "full-match video job" so three teams can build
 * in parallel against the same shapes (invariant #7):
 *   - backend  (api/match/[action].ts, api/_lib/matchJob/*, api/_lib/gemini/*)
 *   - Modal CPU worker (vision-pipeline/match_worker.py — reads the JSON shapes and
 *     the HMAC scheme documented here and in docs/diseno-partido-completo.md)
 *   - UI       (useMatchAnalysisJob, CoverageBanner, EvidenceLink, TeamReportView)
 *
 * Lives in src/lib/shared/ on purpose: api/ already imports src/lib/shared/*
 * (geminiModel.ts, locale.ts), so both sides use the SAME zod schemas.
 *
 * What this file contains, and what it does NOT:
 *   - declarative data only: enums, the legal-transition TABLE, zod schemas, the
 *     Gemini responseSchema, protocol constants and three canonical formatters
 *     (HMAC base string, Gemini displayName, evidence id). No I/O, no state
 *     machine logic, no tunable thresholds.
 *   - tunables (segment length, proxy fps/height, confidences, kit ΔE warning,
 *     staleness, concurrency caps) live in config/matchVideo.json (backend PR),
 *     each with "_source" or "pendiente de validar". The max match duration is
 *     MAX_MATCH_DURATION_MIN in src/lib/shared/videoLimits.ts (PR #292) — not
 *     duplicated here.
 *
 * Honesty rules encoded in the schemas (CLAUDE.md invariants, .claude/rules/*):
 *   - every value produced by Gemini/Claude is ESTIMADA_LLM (never MEDIDA);
 *     coverage values derived from job state are DERIVADA; ambiguous-team and
 *     not-evaluable seconds come from Gemini's self-report → ESTIMADA_LLM.
 *     `calibrated` is always false on this path. MOCK is allowed only so the
 *     IS_DEMO fixture validates against the same schemas (banner required).
 *   - missing ⇒ value null + gate_reason (enforced by matchMetricSchema).
 *   - team identity ONLY by the kit colours the user declares; no individual-level
 *     field exists anywhere (all objects are .strict(): an extra key such as
 *     `dorsal`, `player` or `jugador` makes the parse FAIL). Free text is scrubbed
 *     with INDIVIDUAL_TEXT_PATTERNS before parsing. Never face.
 *   - the report has no overall_rating and no LLM self-reported confidence.
 *   - PHV / bio-banding: untouched and not referenced.
 */

import { z } from "zod";
import type { MetricResult, Provenance } from "../../metrics/MetricResult";
import { localeSchema } from "../locale";
import type { PlayerCategory } from "../category";

// ═════════════════════════════════════════════════════════════════════════════
// 0 · Versions (stored on the job: prompt_versions / schema_version)
// ═════════════════════════════════════════════════════════════════════════════

export const MATCH_JOB_CONTRACT_VERSION = "match-job.v1" as const;
/** Gemini per-segment prompt + responseSchema version (source_ref suffix). */
export const SEGMENT_PROMPT_VERSION = "segment.v1" as const;
/** Claude A-vs-B report prompt version. */
export const TEAM_REPORT_PROMPT_VERSION = "team-report.v2" as const;
export const MATCH_OBSERVATION_SCHEMA_VERSION = "match-observation.v1" as const;
export const MATCH_REPORT_SCHEMA_VERSION = "match-report.v2" as const;

// ═════════════════════════════════════════════════════════════════════════════
// 1 · Job status, legal transitions, UI stages
// ═════════════════════════════════════════════════════════════════════════════

export const MATCH_JOB_STATUSES = [
  "awaiting_encode", //   row inserted; waiting for Bunny encode (API status Finished + target variant)
  "dispatched", //        Vercel spawned the Modal worker (call_id stored); waiting for op=begin
  "preparing", //         worker transcoding (ffmpeg 1 fps / no audio / small height)
  "uploading", //         upload_session minted; worker streaming the proxy to Gemini
  "gemini_processing", // proxy_ready received; polling files.get until ACTIVE
  "observing", //         segments planned; one Gemini generateContent per advance
  "aggregating", //       deterministic aggregation (observation, evidence index, coverage)
  "reporting", //         Claude A-vs-B report (match_ab only)
  "completed",
  "failed",
  "cancelled",
] as const;
export type MatchJobStatus = (typeof MATCH_JOB_STATUSES)[number];
export const matchJobStatusSchema = z.enum(MATCH_JOB_STATUSES);

export const TERMINAL_MATCH_JOB_STATUSES = ["completed", "failed", "cancelled"] as const satisfies readonly MatchJobStatus[];
export type TerminalMatchJobStatus = (typeof TERMINAL_MATCH_JOB_STATUSES)[number];

/**
 * Legal STATUS changes (the backend stateMachine.ts throws on anything else).
 *
 * Epoch bumps are orthogonal to this table: a re-dispatch of a stale epoch
 * (heartbeat older than config.staleHeartbeatSec) increments dispatch_epoch and
 *   - moves preparing | uploading → dispatched (the transcode restarts), and
 *     gemini_processing | observing → dispatched ONLY when the Gemini file is
 *     expired/lost (completed segments are kept and never re-billed);
 *   - keeps dispatched | gemini_processing | observing | aggregating | reporting
 *     unchanged when the Gemini file is still ACTIVE (op=begin then answers
 *     action "advance" and the transcode is skipped).
 * aggregating → completed covers team_baseline (no Claude report in the job) and
 * a match with 0 analysed segments (report gated, never invented).
 */
export const MATCH_JOB_TRANSITIONS: Readonly<Record<MatchJobStatus, readonly MatchJobStatus[]>> = {
  awaiting_encode: ["dispatched", "failed", "cancelled"],
  dispatched: ["preparing", "failed", "cancelled"],
  preparing: ["uploading", "dispatched", "failed", "cancelled"],
  uploading: ["gemini_processing", "dispatched", "failed", "cancelled"],
  gemini_processing: ["observing", "dispatched", "failed", "cancelled"],
  observing: ["aggregating", "dispatched", "failed", "cancelled"],
  aggregating: ["reporting", "completed", "failed", "cancelled"],
  reporting: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/** Statuses the tick may re-dispatch when the epoch is stale (never awaiting_encode or terminal). */
export const REDISPATCHABLE_MATCH_JOB_STATUSES = [
  "dispatched",
  "preparing",
  "uploading",
  "gemini_processing",
  "observing",
  "aggregating",
  "reporting",
] as const satisfies readonly MatchJobStatus[];

/** Coarse UI stages (i18n keys live in the UI PR: matchJob.stage.<stage>). */
export const MATCH_JOB_STAGES = ["encoding", "preparing", "analysing", "reporting", "done", "failed", "cancelled"] as const;
export type MatchJobStage = (typeof MATCH_JOB_STAGES)[number];
export const matchJobStageSchema = z.enum(MATCH_JOB_STAGES);

export const MATCH_STATUS_TO_STAGE: Readonly<Record<MatchJobStatus, MatchJobStage>> = {
  awaiting_encode: "encoding", //    "Bunny procesando (puede tardar horas)"
  dispatched: "preparing", //        "Preparando vídeo"
  preparing: "preparing",
  uploading: "preparing",
  gemini_processing: "preparing",
  observing: "analysing", //         "Analizando tramo k/n (tiempo de vídeo mm:ss–mm:ss)"
  aggregating: "reporting", //       "Redactando informe"
  reporting: "reporting",
  completed: "done",
  failed: "failed",
  cancelled: "cancelled",
};

/** Job-level error codes (job.error.code). */
export const MATCH_JOB_ERROR_CODES = [
  "encode_failed", //         Bunny reported Error / UploadFailed
  "encode_timeout", //        encode never finished within config.maxEncodeWaitHours
  "video_too_long", //        Bunny length (unknown at start, encode pending) turned out > MAX_MATCH_DURATION_MIN
  "dispatch_exhausted", //    MATCH_MAX_DISPATCH_ATTEMPTS reached
  "source_forbidden", //      CDN answered 401/403 to the worker (token auth / referrer rules)
  "source_unavailable", //    CDN 404/5xx or no playable variant
  "transcode_failed",
  "duration_mismatch", //     ffprobe vs Bunny length outside the tolerance
  "proxy_too_large", //       proxy bytes above the Gemini per-file limit
  "gemini_upload_failed",
  "gemini_file_failed", //    files.get → FAILED
  "budget_exhausted", //      partial results kept; remaining segments "skipped"
  "analysis_disabled", //     MATCH_VIDEO_ENABLED turned off while the job was in flight (server kill switch)
  "worker_failed", //         op=fail with an unmapped code
  "deadline_exceeded",
  "internal_error",
] as const;
export type MatchJobErrorCode = (typeof MATCH_JOB_ERROR_CODES)[number];

export const matchJobErrorSchema = z
  .object({
    code: z.enum(MATCH_JOB_ERROR_CODES),
    /** Human text in the job locale. Never contains URLs, tokens or env values. */
    message: z.string().min(1).max(1000),
  })
  .strict();

/** Machine-readable reason attached to a gated value / skipped segment / missing report. */
export const MATCH_GATE_CODES = [
  "segment_pending",
  "segment_running",
  "segment_failed",
  "segment_skipped", //             job ended (budget / cancel) before this segment ran
  "teams_ambiguous", //             Gemini self-reported team_identification = ambiguous
  "not_evaluated_by_model", //      Gemini returned null for this descriptor
  "invalid_model_value", //         Gemini value outside the contract (e.g. formation not matching FORMATION_RE)
  "possession_missing",
  "possession_incoherent", //       home_pct + away_pct !== 100
  "no_usable_segments",
  "duration_unknown",
  "report_no_analysed_segments",
  "report_engine_unavailable", //   ANTHROPIC_API_KEY unset → honest abstention
  "report_engine_error",
  "report_budget_exhausted",
] as const;
export type MatchGateCode = (typeof MATCH_GATE_CODES)[number];

export const matchGateSchema = z
  .object({
    code: z.enum(MATCH_GATE_CODES),
    /** Human text in the job locale (rendered as-is by the UI). */
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type MatchGate = z.infer<typeof matchGateSchema>;

// ═════════════════════════════════════════════════════════════════════════════
// 2 · Protocol constants
// ═════════════════════════════════════════════════════════════════════════════

export const MATCH_API_ROUTES = {
  start: "/api/match/start", //   POST · user JWT
  status: "/api/match/status", // GET ?jobId= · user JWT · READ-ONLY (CWE-650)
  list: "/api/match/list", //     GET · user JWT · owner's jobs
  cancel: "/api/match/cancel", // POST · user JWT
  /** GET ?locale= · user JWT · READ-ONLY: is the video path offered? (UI shows "En validación" when not). */
  availability: "/api/match/availability",
  step: "/api/match/step", //     POST · HMAC (Modal worker only, never a browser)
} as const;

/**
 * Why the video path is not offered (GET /api/match/availability). The feature is OFF
 * by default and stays OFF until the observation engine passes the validation harness
 * (scripts/validate-match-observation.mjs, docs/diseno-partido-completo.md §20):
 *   - match_video_disabled     MATCH_VIDEO_ENABLED !== "true" → "en validación"
 *   - real_inference_disabled  flag on but server configuration incomplete
 * Env var NAMES are never listed here (only /start lists them, to the operator).
 */
export const MATCH_AVAILABILITY_CODES = ["match_video_disabled", "real_inference_disabled"] as const;

export const matchAvailabilityResponseSchema = z
  .object({
    enabled: z.boolean(),
    code: z.enum(MATCH_AVAILABILITY_CODES).nullable(),
    /** Human text in the requested locale; null when enabled. */
    reason: z.string().trim().min(1).max(500).nullable(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.enabled !== (a.code === null) || a.enabled !== (a.reason === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["code"], message: "enabled ⇔ code === null ⇔ reason === null" });
    }
  });
export type MatchAvailabilityResponse = z.infer<typeof matchAvailabilityResponseSchema>;

/** Header carrying hex(HMAC_SHA256(MODAL_CALLBACK_SECRET, ts + "." + rawBody)), lowercase. */
export const STEP_SIGNATURE_HEADER = "X-Vitas-Signature" as const;
/** Header carrying the unix time in seconds (10 decimal digits) used in the signature. */
export const STEP_TIMESTAMP_HEADER = "X-Vitas-Timestamp" as const;
/** |now − ts| must be ≤ this, else 401 (fail-closed). Design decision (replay window). */
export const STEP_SIGNATURE_WINDOW_SEC = 300;
export const STEP_TIMESTAMP_RE = /^\d{10}$/;
export const STEP_SIGNATURE_RE = /^[0-9a-f]{64}$/;
/** Worker heartbeat cadence during ffmpeg + upload (design decision; staleness threshold lives in config). */
export const WORKER_HEARTBEAT_INTERVAL_SEC = 60;
/** Max dispatches per job (first dispatch included) before failed:dispatch_exhausted (design decision). */
export const MATCH_MAX_DISPATCH_ATTEMPTS = 3;
/** Modal scheduled driver period: modal.Period(minutes=5) (design decision). */
export const MATCH_TICK_PERIOD_MIN = 5;
/** Only host the worker may upload the proxy to (the resumable session URL is minted by Vercel). */
export const GEMINI_UPLOAD_HOST = "generativelanguage.googleapis.com" as const;

/**
 * Canonical string that is HMAC-signed for every step op (both directions use the
 * same secret; only the worker → Vercel direction is signed in Phase 1).
 * Sign the EXACT bytes sent (UTF-8), never a re-serialisation.
 */
export function stepSignatureBase(ts: string, rawBody: string): string {
  return `${ts}.${rawBody}`;
}

/**
 * Protocol test vectors (part of the spec, like an RFC's). Computed with
 * node:crypto createHmac and cross-checked with Python hmac; asserted by
 * src/test/lib/matchJobContract.test.ts (Web Crypto) and
 * api/_lib/__tests__/matchStepHmac.test.ts (node:crypto). The Python worker must
 * reproduce them with
 *   body = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
 *   hmac.new(secret, ts.encode() + b"." + body, hashlib.sha256).hexdigest()
 * Vector 2 contains non-ASCII characters to pin UTF-8. The secret is a test value.
 */
export const STEP_HMAC_TEST_VECTORS = {
  secret: "vitas-test-secret-not-a-real-key",
  vectors: [
    {
      ts: "1790000000",
      body: '{"op":"advance","jobId":"8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f","epoch":1}',
      bodyBytes: 73,
      signature: "98ae526b57a69637dcfee55258c077005abc9ed955c868cef3627a7d3b82353c",
    },
    {
      ts: "1790000300",
      body: '{"op":"fail","jobId":"8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f","epoch":2,"code":"transcode_failed","reason":"ffmpeg salió con código 1: sin señal de vídeo"}',
      bodyBytes: 157,
      signature: "b1b460ada7e65771fc55ef6ba67cf9c4c3f7600101f0be53b773905d3db127d2",
    },
  ],
} as const;

/** Gemini File API displayName prefix; the sweeper lists files by it. */
export const GEMINI_DISPLAY_NAME_PREFIX = "vitas-match-" as const;
const GEMINI_DISPLAY_NAME_RE = /^vitas-match-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([1-9]\d*)$/;

/** `vitas-match-{jobId}-{epoch}` — minted by Vercel at op=upload_session. */
export function geminiDisplayName(jobId: string, epoch: number): string {
  return `${GEMINI_DISPLAY_NAME_PREFIX}${jobId}-${epoch}`;
}

/** Inverse of geminiDisplayName; null when the name is not ours (the sweeper never touches it). */
export function parseGeminiDisplayName(displayName: string): { jobId: string; epoch: number } | null {
  const m = GEMINI_DISPLAY_NAME_RE.exec(displayName);
  if (!m) return null;
  return { jobId: m[1], epoch: Number(m[2]) };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · Shared primitives
// ═════════════════════════════════════════════════════════════════════════════

export const MATCH_PURPOSES = ["match_ab", "team_baseline"] as const;
export type MatchPurpose = (typeof MATCH_PURPOSES)[number];
export const matchPurposeSchema = z.enum(MATCH_PURPOSES);

export const TEAM_SIDES = ["home", "away"] as const;
export type TeamSide = (typeof TEAM_SIDES)[number];

/** Explicit category only. Absent ⇒ null ⇒ the prompts omit the category directive (no "youth" default). */
export const MATCH_CATEGORIES = ["youth", "senior"] as const satisfies readonly PlayerCategory[];

/** Direction the HOME team attacks in the 1st half, as seen on screen (coach-provided, not observed). */
export const ATTACKING_DIRECTIONS = ["left_to_right", "right_to_left"] as const;

export const HEX_COLOUR_RE = /^#[0-9a-fA-F]{6}$/;
const jobIdSchema = z.string().uuid();
const epochSchema = z.number().int().min(1);
const isoDateTime = z.string().datetime({ offset: true });
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** A declared kit colour: picker hex + optional human description used in the prompt. */
export const kitColourSchema = z
  .object({
    hex: z.string().regex(HEX_COLOUR_RE),
    label: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export const teamKitSchema = z
  .object({
    shirt: kitColourSchema,
    shorts: kitColourSchema.optional(),
    gk: kitColourSchema.optional(),
  })
  .strict();
export type TeamKit = z.infer<typeof teamKitSchema>;

export const teamInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    kit: teamKitSchema.optional(),
  })
  .strict();

/**
 * Operational money amount (billing), NOT a product metric: it never describes a
 * team or a player, is not registered in config/metrics.json and is labelled
 * "estimación de coste" in the UI. `basis` states where it comes from.
 */
export const usdAmountSchema = z
  .object({
    usd: z.number().finite().nonnegative(),
    kind: z.enum(["estimate", "ledger"]),
    basis: z.enum(["bunny_length", "max_duration_cap", "usage_tokens"]),
    /** e.g. "config/aiPricing.json@2026-09-28" */
    pricing_ref: z.string().min(1),
  })
  .strict();
export type UsdAmount = z.infer<typeof usdAmountSchema>;

// ═════════════════════════════════════════════════════════════════════════════
// 4 · Coach attestation (owner decision: required to start a job)
// ═════════════════════════════════════════════════════════════════════════════

/** Bump when the wording changes; the server rejects any other version (400 attestation_required). */
export const MATCH_ATTESTATION_VERSION = "2026-09-28.v1" as const;
/** Canonical (legal reference) wording. The UI shows the i18n translation of THIS version. */
export const MATCH_ATTESTATION_TEXT_ES =
  "Declaro que tengo el consentimiento y los derechos para analizar este vídeo" as const;

export const matchAttestationSchema = z
  .object({
    accepted: z.literal(true),
    version: z.literal(MATCH_ATTESTATION_VERSION),
  })
  .strict();
// Stored on the job by the SERVER: attested_by = verified JWT user id (never from
// the body), attested_at = server clock, attestation_version = version above.

// ═════════════════════════════════════════════════════════════════════════════
// 5 · User-facing API: start / status / list / cancel
// ═════════════════════════════════════════════════════════════════════════════

/** Input bound (product limit, not a metric threshold). */
export const MATCH_NOTES_MAX_CHARS = 1000;

export const matchStartRequestSchema = z
  .object({
    /** videos.id (= Bunny guid). The server loads the row and checks ownsVideo. */
    videoId: z.string().trim().min(1).max(128),
    purpose: matchPurposeSchema,
    home: teamInputSchema,
    away: teamInputSchema,
    /** Required for team_baseline (the team being profiled). */
    focusTeam: z.enum(TEAM_SIDES).optional(),
    attackingDir1h: z.enum(ATTACKING_DIRECTIONS).optional(),
    /** "aportado por el entrenador, no observado". Sent ONLY to the report step, never to Gemini. */
    notes: z.string().trim().max(MATCH_NOTES_MAX_CHARS).optional(),
    category: z.enum(MATCH_CATEGORIES).optional(),
    /** Job locale = language of evidence text, gate reasons and report. */
    locale: localeSchema,
    attestation: matchAttestationSchema,
  })
  .strict()
  .superRefine((req, ctx) => {
    const need = (side: TeamSide, field: "name" | "kit") => {
      if (req[side][field] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [side, field],
          message: `${side}.${field} is required for purpose ${req.purpose}`,
        });
      }
    };
    if (req.purpose === "match_ab") {
      // Both shirt colours are required: identity is ONLY by declared kit colours.
      for (const side of TEAM_SIDES) {
        need(side, "name");
        need(side, "kit");
      }
    } else {
      if (req.focusTeam === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["focusTeam"],
          message: "focusTeam is required for purpose team_baseline",
        });
        return;
      }
      // Own-team colour required; the rival colour is optional.
      need(req.focusTeam, "name");
      need(req.focusTeam, "kit");
    }
  });
export type MatchStartRequest = z.infer<typeof matchStartRequestSchema>;

/** Error codes of POST /api/match/start (standard envelope { ok:false, error:{ code, message } }). */
export const MATCH_START_ERROR_CODES = [
  "invalid_input", //            400
  "attestation_required", //     400 (missing/false/outdated attestation)
  "unauthorized", //             401
  "plan_required", //           403 (withHandler requiredPlan, fail-closed)
  "not_owner", //                403 (ownsVideo)
  "video_not_found", //          404
  "video_too_long", //           422 (Bunny length > MAX_MATCH_DURATION_MIN, videoLimits.ts)
  "concurrency_limit", //        429 (1 active job per user, small global cap)
  "budget_exceeded", //          429 details.estimate: UsdAmount
  "match_video_disabled", //     503 MATCH_VIDEO_ENABLED !== "true" ("análisis de partido completo en validación"; default OFF)
  "real_inference_disabled", //  503 details.missing: env var NAMES (never values)
] as const;
export type MatchStartErrorCode = (typeof MATCH_START_ERROR_CODES)[number];

export const matchStartResponseSchema = z
  .object({
    jobId: jobIdSchema,
    status: matchJobStatusSchema,
    /** true ⇒ an active job for the same video + purpose + kits was returned instead. */
    deduplicated: z.boolean(),
    /** Reservation held against GLOBAL_MONTHLY_BUDGET_USD until the job is terminal. */
    estimate: usdAmountSchema,
  })
  .strict();
export type MatchStartResponse = z.infer<typeof matchStartResponseSchema>;

export const matchCancelRequestSchema = z.object({ jobId: jobIdSchema }).strict();
export const matchCancelResponseSchema = z
  .object({ jobId: jobIdSchema, status: matchJobStatusSchema })
  .strict();

// ═════════════════════════════════════════════════════════════════════════════
// 6 · Identity guard — shared definitions (keys + text)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Keys that must never appear in any observation/report object. The schemas are
 * .strict() so such a key already fails the parse; the backend identityGuard
 * strips them from raw model JSON first and counts them.
 */
export const INDIVIDUAL_LEVEL_KEYS = [
  "dorsal", "dorsales", "dorsal_number", "jersey", "jersey_number", "shirt_number",
  "number", "numero", "número", "player", "players", "player_id", "player_name",
  "jugador", "jugadores", "jugadora", "jugadoras", "nombre", "name", "face", "faces",
  "cara", "rostro",
] as const;

/**
 * Text patterns that reference an individual (dorsal / shirt number / "el 10 del
 * local"). A text field that matches is DROPPED (item or claim) and counted — over-
 * scrubbing is the safe direction (identidad.md: abstain more, never attribute).
 * Names are scrubbed separately by the backend against the tenant roster and the
 * coach notes (dynamic lists, not expressible here).
 * No /g flag on purpose: RegExp.test must be stateless.
 *
 * 2026-09-29 (spike on a real U10 match): Gemini added "#10"/"#11" to evidence text
 * despite the prompt (even for a team with no numbers), so the list also drops any
 * reference to ONE player: a singular "player" noun with an article ("el jugador",
 * "a player", "der Spieler") and single-person roles with a definite/possessive
 * determiner ("el portero", "the striker", "their captain"). Plural / collective
 * wording ("los jugadores", "los centrales", "the back line") is team-level and kept.
 */
export const INDIVIDUAL_TEXT_PATTERNS: readonly RegExp[] = [
  /#\s?\d{1,2}\b/,
  /\b(dorsal(es)?|dossard|r[üu]ckennummer|trikotnummer|rugnummer|shirtnummer)\b/i,
  /\b(shirt|jersey|squad|kit)\s+numbers?\b/i,
  /\bnum[eé]ro\s+(di|de)\s+(maglia|maillot)\b/i,
  /\b(n[úu]mero|num[ée]ro|number|nummer|n\.?º|no\.)\s*\d{1,2}\b/i,
  /\b(jugador|jugadora|player|giocatore|joueur|joueuse|spieler|spielerin|speler|portero|goalkeeper|keeper|delantero|striker|lateral|extremo|winger|pivote|mediocentro|defensa|defender)\s+\d{1,2}\b/i,
  /\b(el|la|al|del|the)\s+\d{1,2}\s+(del|de|of|local|visitante|rival|home|away|visitor|visitors)\b/i,
  // shirt/jersey + a number: "camiseta 10", "shirt 7", "maglia 9", "Trikot 11"
  /\b(camiseta|camisa|shirt|jersey|maglia|maillot|trikot|shirtje)\s*(n[úu]mero\s*)?\d{1,2}\b/i,
  // a bare number in parentheses next to a description: "el blanco (10) conduce"
  /\(\s*#?\d{1,2}\s*\)/,
  // ONE player, with an article: "el jugador", "un jugador", "a player", "der Spieler", "de speler"
  /\b(el|al|del|un|una|la|the|a|an|one|il|lo|uno|le|une|der|die|den|dem|des|ein|eine|einen|einem|einer|de|het|een)\s+(jugador|jugadora|futbolista|player|footballer|giocatore|giocatrice|calciatore|calciatrice|joueur|joueuse|footballeur|footballeuse|spieler|spielerin|speler|speelster)\b/i,
  // single-person roles with a definite/possessive determiner: "el portero", "the striker", "their captain"
  /\b(el|al|del|la|su|the|their|its|his|her|il|lo|suo|sua|le|son|sa|leur|der|die|den|dem|des|sein|seine|seinen|ihr|ihre|ihren|de|het|hun|zijn|haar)\s+(portero|portera|guardameta|arquero|arquera|goalkeeper|keeper|goalie|portiere|gardien|gardienne|torwart|torh[üu]ter|torh[üu]terin|doelman|delantero\s+centro|nueve|striker|centre[-\s]forward|center[-\s]forward|centravanti|avant-centre|mittelst[üu]rmer|spits|capit[áa]n|capitana|captain|capitano|capitaine|kapit[äa]n|kapit[äa]nin|aanvoerder)\b/i,
];

/** True when a text mentions an individual (dorsal/number). Pure predicate shared by identityGuard and acceptance checks. */
export function mentionsIndividual(text: string): boolean {
  return INDIVIDUAL_TEXT_PATTERNS.some((re) => re.test(text));
}

// ═════════════════════════════════════════════════════════════════════════════
// 7 · Gemini segment observation (responseSchema + zod) — raw model output
// ═════════════════════════════════════════════════════════════════════════════

export const TEAM_IDENTIFICATION_LEVELS = ["clear", "partial", "ambiguous"] as const;
export const NOT_EVALUABLE_REASONS = [
  "pre_kickoff",
  "half_time",
  "post_match",
  "stoppage",
  "camera_off_play",
  "replay_or_graphics",
  "poor_visibility",
  "teams_indistinguishable",
  "other",
] as const;
export const POSSESSION_BASES = ["ball_control_observed", "territorial_proxy", "mixed"] as const;
export const DOMINANCE_VALUES = ["home", "balanced", "away"] as const;
export const PHASES_OF_PLAY = ["organised_attack", "organised_defence", "attacking_transition", "defensive_transition"] as const;
export const BUILD_UP_STYLES = ["short", "direct", "mixed"] as const;
export const ORDINAL_LEVELS = ["low", "mid", "high"] as const;
export const BLOCK_COMPACTNESS = ["compact", "medium", "stretched"] as const;
export const ATTACKING_TRANSITION_STYLES = ["fast", "controlled", "mixed"] as const;
export const DEFENSIVE_TRANSITION_STYLES = ["counter_press", "retreat", "mixed"] as const;
export const EVIDENCE_TEAMS = ["home", "away", "ambiguous"] as const;
export const EVIDENCE_CATEGORIES = [
  "build_up",
  "pressing",
  "defensive_block",
  "attacking_transition",
  "defensive_transition",
  "set_piece",
  "chance",
  "possession_spell",
  "other",
] as const;

export type TeamIdentification = (typeof TEAM_IDENTIFICATION_LEVELS)[number];
export type Dominance = (typeof DOMINANCE_VALUES)[number];

/**
 * Output bounds (design decision: they cap output tokens and avoid MAX_TOKENS
 * truncation; they are NOT metric thresholds). The prompt asks for ≤ 200 chars.
 */
export const SEGMENT_OUTPUT_BOUNDS = {
  maxEvidence: 20,
  maxNotEvaluableIntervals: 12,
  maxTextChars: 400,
} as const;

/** "4-4-2", "4-2-3-1", "3-5-2"… (outfield lines only). */
export const FORMATION_RE = /^[1-6](-[1-6]){1,4}$/;

const videoSec = z.number().int().nonnegative();
const boundedText = z.string().trim().min(1).max(SEGMENT_OUTPUT_BOUNDS.maxTextChars);

/** Times are ABSOLUTE video seconds ("tiempo de vídeo") once normalised by the backend. */
export const notEvaluableIntervalSchema = z
  .object({
    start: videoSec,
    end: videoSec,
    reason: z.enum(NOT_EVALUABLE_REASONS),
  })
  .strict()
  .refine((i) => i.end > i.start, { message: "end must be > start", path: ["end"] });

export const segmentEvidenceSchema = z
  .object({
    t_start: videoSec,
    t_end: videoSec,
    team: z.enum(EVIDENCE_TEAMS),
    category: z.enum(EVIDENCE_CATEGORIES),
    /** In the job locale. Team-level only; scrubbed with INDIVIDUAL_TEXT_PATTERNS. */
    text: boundedText,
  })
  .strict()
  .refine((e) => e.t_end >= e.t_start, { message: "t_end must be >= t_start", path: ["t_end"] });

const ordinal = z.enum(ORDINAL_LEVELS);

/**
 * Per-team, per-segment observation. null = not evaluable in this segment (never a default).
 * `formation` is lenient here (a formatting slip must not fail the whole segment);
 * the aggregator applies FORMATION_RE and gates a non-matching value as
 * `invalid_model_value` (see teamSegmentMetricsSchema).
 */
export const teamSegmentObservationSchema = z
  .object({
    formation: z.string().trim().min(1).max(20).nullable(),
    phases: z.object({ predominant: z.enum(PHASES_OF_PLAY).nullable() }).strict(),
    build_up: z.object({ style: z.enum(BUILD_UP_STYLES).nullable() }).strict(),
    pressing: z.object({ height: ordinal.nullable(), intensity: ordinal.nullable() }).strict(),
    block: z.object({ height: ordinal.nullable(), compactness: z.enum(BLOCK_COMPACTNESS).nullable() }).strict(),
    transitions: z
      .object({
        attacking: z.enum(ATTACKING_TRANSITION_STYLES).nullable(),
        defensive: z.enum(DEFENSIVE_TRANSITION_STYLES).nullable(),
      })
      .strict(),
    set_pieces: z.object({ threat: ordinal.nullable() }).strict(),
    note: boundedText.nullable(),
  })
  .strict();

/**
 * What Gemini returns for ONE segment, both teams in one call. Possession sum is
 * NOT enforced here (a bad sum must not fail the whole segment): the aggregator
 * gates it as possession_incoherent.
 */
export const segmentObservationSchema = z
  .object({
    team_identification: z.enum(TEAM_IDENTIFICATION_LEVELS),
    not_evaluable_intervals: z.array(notEvaluableIntervalSchema).max(SEGMENT_OUTPUT_BOUNDS.maxNotEvaluableIntervals),
    possession_estimate: z
      .object({
        home_pct: z.number().int().min(0).max(100),
        away_pct: z.number().int().min(0).max(100),
        basis: z.enum(POSSESSION_BASES),
      })
      .strict()
      .nullable(),
    dominance: z.enum(DOMINANCE_VALUES).nullable(),
    teams: z.object({ home: teamSegmentObservationSchema, away: teamSegmentObservationSchema }).strict(),
    evidence: z.array(segmentEvidenceSchema).max(SEGMENT_OUTPUT_BOUNDS.maxEvidence),
  })
  .strict();
export type SegmentObservation = z.infer<typeof segmentObservationSchema>;

// Gemini `generationConfig.responseSchema` (OpenAPI-subset Schema object). Kept in
// lock-step with segmentObservationSchema by a parity test. zod stays the
// authority: every reply is parsed with zod whatever the model returns.
type GeminiSchema = {
  type: "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN" | "ARRAY" | "OBJECT";
  nullable?: boolean;
  enum?: readonly string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: readonly string[];
  propertyOrdering?: readonly string[];
};

function gEnum(values: readonly string[], nullable: boolean): GeminiSchema {
  return nullable ? { type: "STRING", enum: values, nullable: true } : { type: "STRING", enum: values };
}
function gObject(properties: Record<string, GeminiSchema>, nullable = false): GeminiSchema {
  const keys = Object.keys(properties);
  const o: GeminiSchema = { type: "OBJECT", properties, required: keys, propertyOrdering: keys };
  if (nullable) o.nullable = true;
  return o;
}
const gSec: GeminiSchema = { type: "INTEGER", minimum: 0, description: "absolute video seconds" };
const gText = (nullable: boolean): GeminiSchema =>
  nullable
    ? { type: "STRING", nullable: true, description: "team-level only, no dorsal, number or name" }
    : { type: "STRING", description: "team-level only, no dorsal, number or name" };

const gTeam: GeminiSchema = gObject({
  formation: { type: "STRING", nullable: true, description: "e.g. 4-4-2; null if not evaluable" },
  phases: gObject({ predominant: gEnum(PHASES_OF_PLAY, true) }),
  build_up: gObject({ style: gEnum(BUILD_UP_STYLES, true) }),
  pressing: gObject({ height: gEnum(ORDINAL_LEVELS, true), intensity: gEnum(ORDINAL_LEVELS, true) }),
  block: gObject({ height: gEnum(ORDINAL_LEVELS, true), compactness: gEnum(BLOCK_COMPACTNESS, true) }),
  transitions: gObject({
    attacking: gEnum(ATTACKING_TRANSITION_STYLES, true),
    defensive: gEnum(DEFENSIVE_TRANSITION_STYLES, true),
  }),
  set_pieces: gObject({ threat: gEnum(ORDINAL_LEVELS, true) }),
  note: gText(true),
});

export const SEGMENT_GEMINI_RESPONSE_SCHEMA: GeminiSchema = gObject({
  team_identification: gEnum(TEAM_IDENTIFICATION_LEVELS, false),
  not_evaluable_intervals: {
    type: "ARRAY",
    maxItems: SEGMENT_OUTPUT_BOUNDS.maxNotEvaluableIntervals,
    items: gObject({ start: gSec, end: gSec, reason: gEnum(NOT_EVALUABLE_REASONS, false) }),
  },
  possession_estimate: gObject(
    {
      home_pct: { type: "INTEGER", minimum: 0, maximum: 100 },
      away_pct: { type: "INTEGER", minimum: 0, maximum: 100 },
      basis: gEnum(POSSESSION_BASES, false),
    },
    true,
  ),
  dominance: gEnum(DOMINANCE_VALUES, true),
  teams: gObject({ home: gTeam, away: gTeam }),
  evidence: {
    type: "ARRAY",
    maxItems: SEGMENT_OUTPUT_BOUNDS.maxEvidence,
    items: gObject({
      t_start: gSec,
      t_end: gSec,
      team: gEnum(EVIDENCE_TEAMS, false),
      category: gEnum(EVIDENCE_CATEGORIES, false),
      text: gText(false),
    }),
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 · MetricResult-shaped values (match path)
// ═════════════════════════════════════════════════════════════════════════════

/** Everything that comes from Gemini/Claude. */
export const LLM_PROVENANCES = ["ESTIMADA_LLM", "MOCK"] as const satisfies readonly Provenance[];
/** Deterministic over job state / file duration. */
export const DERIVED_PROVENANCES = ["DERIVADA", "MOCK"] as const satisfies readonly Provenance[];

/**
 * A MetricResult on the match path: assignable to MetricResult<T> (renderable by
 * MetricValue / ProvenanceBadge), with the provenance narrowed, calibrated
 * pinned to false and an optional machine-readable gate_code.
 */
export type MatchMetric<T, P extends Provenance = Provenance> = Omit<MetricResult<T>, "provenance" | "calibrated"> & {
  provenance: P;
  calibrated: false;
  gate_code?: MatchGateCode | null;
};

/**
 * zod for a MetricResult on the match path. Enforces metricas.md invariants
 * (confidence ∈ [0,1], null ⇒ non-empty gate_reason) plus the path rules:
 * provenance restricted to `provenances` (never MEDIDA/CONSTANTE here),
 * calibrated always false, ESTIMADA_LLM requires source_ref. The output type is
 * declared explicitly (MatchMetric) so it stays a MetricResult even under the
 * app's non-strict tsconfig, where z.infer would make every key optional.
 */
export function matchMetricSchema<V extends z.ZodTypeAny, P extends readonly [Provenance, ...Provenance[]]>(
  valueSchema: V,
  provenances: P,
): z.ZodType<MatchMetric<z.output<V>, P[number]>, z.ZodTypeDef, unknown> {
  const schema = z
    .object({
      value: valueSchema.nullable(),
      provenance: z.enum(provenances),
      confidence: z.number().min(0).max(1),
      units: z.string().min(1).nullable(),
      calibrated: z.literal(false),
      gate_reason: z.string().nullable(),
      gate_code: z.enum(MATCH_GATE_CODES).nullable().optional(),
      source_ref: z.string().min(1).optional(),
    })
    .strict()
    .superRefine((m, ctx) => {
      if (m.value === null && (m.gate_reason === null || m.gate_reason.trim() === "")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gate_reason"], message: "value=null requires a non-empty gate_reason" });
      }
      if (m.provenance === "ESTIMADA_LLM" && !m.source_ref) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source_ref"], message: "ESTIMADA_LLM requires source_ref (model@prompt#segment)" });
      }
    });
  // Runtime shape is exactly MatchMetric; the cast only pins the declared output type.
  return schema as unknown as z.ZodType<MatchMetric<z.output<V>, P[number]>, z.ZodTypeDef, unknown>;
}

const pct = z.number().min(0).max(100);
const seconds = z.number().finite().nonnegative();
const llmMetric = <V extends z.ZodTypeAny>(v: V) => matchMetricSchema(v, LLM_PROVENANCES);
const derivedMetric = <V extends z.ZodTypeAny>(v: V) => matchMetricSchema(v, DERIVED_PROVENANCES);

// ═════════════════════════════════════════════════════════════════════════════
// 9 · Coverage (DERIVADA from job state; ambiguous / not-evaluable = ESTIMADA_LLM)
// ═════════════════════════════════════════════════════════════════════════════

export const SEGMENT_STATUSES = ["pending", "running", "done", "failed", "skipped"] as const;
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];

export const coverageSegmentSchema = z
  .object({
    idx: z.number().int().nonnegative(),
    start_sec: seconds,
    end_sec: seconds,
    status: z.enum(SEGMENT_STATUSES),
    gate_code: z.enum(MATCH_GATE_CODES).nullable(),
    /** e.g. "MAX_TOKENS tras 2 intentos" (job locale); null when done. */
    reason: z.string().min(1).nullable(),
  })
  .strict();

export const coverageGapSchema = z
  .object({
    start_sec: seconds,
    end_sec: seconds,
    kind: z.enum(["segment_not_analysed", "not_evaluable", "teams_ambiguous"]),
    /** segment_not_analysed ⇒ DERIVADA; not_evaluable / teams_ambiguous ⇒ ESTIMADA_LLM (model self-report). */
    provenance: z.enum(["DERIVADA", "ESTIMADA_LLM", "MOCK"]),
    reason: z.string().min(1),
  })
  .strict();

export const matchCoverageSchema = z
  .object({
    /** All times are "tiempo de vídeo" (pre-kickoff and half-time included), never match minutes. */
    time_base: z.literal("video"),
    /** Bunny API `length`, cross-checked by ffprobe. Never videos.duration (polluted by `?? 0`). */
    duration_sec: derivedMetric(seconds),
    /** Σ(end − start) over segments with status done. */
    analysed_sec: derivedMetric(seconds),
    /** analysed_sec / duration_sec; < 1 whenever any segment is not done. */
    analysed_fraction: derivedMetric(z.number().min(0).max(1)),
    failed_segments: derivedMetric(z.number().int().nonnegative()),
    /** Gemini self-report (team_identification / teams_indistinguishable) — kept SEPARATE from DERIVADA. */
    ambiguous_sec: llmMetric(seconds),
    /** Gemini self-report (half-time, pre-kickoff, replays…). */
    not_evaluable_sec: llmMetric(seconds),
    segments: z.array(coverageSegmentSchema),
    gaps: z.array(coverageGapSchema),
  })
  .strict()
  .superRefine((c, ctx) => {
    const allDone = c.segments.length > 0 && c.segments.every((s) => s.status === "done");
    const frac = c.analysed_fraction.value;
    if (!allDone && frac !== null && frac >= 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["analysed_fraction", "value"],
        message: "coverage cannot be 100% while a segment is not done",
      });
    }
    const a = c.analysed_sec.value;
    const d = c.duration_sec.value;
    if (a !== null && d !== null && a > d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["analysed_sec", "value"], message: "analysed_sec > duration_sec" });
    }
  });
export type MatchCoverage = z.infer<typeof matchCoverageSchema>;

// ═════════════════════════════════════════════════════════════════════════════
// 10 · Aggregated observation (deterministic over segment results)
// ═════════════════════════════════════════════════════════════════════════════

/** "s{segmentIdx}-e{n}", n 1-based within the segment after the identity guard. */
export const EVIDENCE_ID_RE = /^s(\d+)-e([1-9]\d*)$/;
export function evidenceId(segmentIdx: number, n: number): string {
  return `s${segmentIdx}-e${n}`;
}

/** An LLM POINTER to a moment ("puntero IA, no verificado"), never a verified fact. */
export const evidenceItemSchema = z
  .object({
    id: z.string().regex(EVIDENCE_ID_RE),
    segment_idx: z.number().int().nonnegative(),
    t_start: videoSec,
    t_end: videoSec,
    team: z.enum(EVIDENCE_TEAMS),
    category: z.enum(EVIDENCE_CATEGORIES),
    text: boundedText,
    provenance: z.enum(LLM_PROVENANCES),
    /** `${GEMINI_MODEL}@segment.v1#s{idx}[{start}-{end}s]` */
    source_ref: z.string().min(1),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.t_end < e.t_start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["t_end"], message: "t_end must be >= t_start" });
    }
    const m = EVIDENCE_ID_RE.exec(e.id);
    if (m && Number(m[1]) !== e.segment_idx) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "evidence id segment does not match segment_idx" });
    }
  });
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const teamSegmentMetricsSchema = z
  .object({
    formation: llmMetric(z.string().regex(FORMATION_RE)),
    phases: z.object({ predominant: llmMetric(z.enum(PHASES_OF_PLAY)) }).strict(),
    build_up: z.object({ style: llmMetric(z.enum(BUILD_UP_STYLES)) }).strict(),
    pressing: z.object({ height: llmMetric(ordinal), intensity: llmMetric(ordinal) }).strict(),
    block: z.object({ height: llmMetric(ordinal), compactness: llmMetric(z.enum(BLOCK_COMPACTNESS)) }).strict(),
    transitions: z
      .object({
        attacking: llmMetric(z.enum(ATTACKING_TRANSITION_STYLES)),
        defensive: llmMetric(z.enum(DEFENSIVE_TRANSITION_STYLES)),
      })
      .strict(),
    set_pieces: z.object({ threat: llmMetric(ordinal) }).strict(),
    note: boundedText.nullable(),
  })
  .strict();

const possessionPairSchema = z.object({ home: llmMetric(pct), away: llmMetric(pct) }).strict();

/**
 * Why a possession estimate is surfaced as LOW-CONFIDENCE (its own gate, owner update
 * 2026-09-29: the spike returned 50/50 at LOW resolution and templated events):
 *   - no_visual_basis  the segment result cannot be tied to what the model saw: the
 *                      usage report does not confirm video tokens, or the segment cites
 *                      no evidence at all;
 *   - uniform_output   every usable segment came back 50/50 with dominance "balanced"
 *                      — indistinguishable from a default, so never a confident figure.
 * The value is kept (it is still the model's estimate) but its confidence drops to
 * config `possessionLowConfidence` ("pendiente de validar") and the UI must say why.
 */
export const POSSESSION_LOW_CONFIDENCE_CODES = ["no_visual_basis", "uniform_output"] as const;
export type PossessionLowConfidenceCode = (typeof POSSESSION_LOW_CONFIDENCE_CODES)[number];

export const possessionLowConfidenceSchema = z
  .object({
    code: z.enum(POSSESSION_LOW_CONFIDENCE_CODES),
    /** Human text in the job locale. */
    reason: z.string().trim().min(1).max(500),
    segments: z.array(z.number().int().nonnegative()),
  })
  .strict();

export const segmentSummarySchema = z
  .object({
    idx: z.number().int().nonnegative(),
    start_sec: seconds,
    end_sec: seconds,
    status: z.enum(SEGMENT_STATUSES),
    team_identification: llmMetric(z.enum(TEAM_IDENTIFICATION_LEVELS)),
    /** Ordinal territorial dominance for this ~15-min window; gated when teams are ambiguous. */
    dominance: llmMetric(z.enum(DOMINANCE_VALUES)),
    /** Estimated possession % (ESTIMADA_LLM, units "%"); never MEDIDA, never an official statistic. */
    possession: possessionPairSchema,
    possession_basis: z.enum(POSSESSION_BASES).nullable(),
    /** Set when this segment's possession value is kept but low-confidence (see POSSESSION_LOW_CONFIDENCE_CODES). */
    possession_low_confidence: z.enum(POSSESSION_LOW_CONFIDENCE_CODES).nullable().optional(),
    teams: z.object({ home: teamSegmentMetricsSchema, away: teamSegmentMetricsSchema }).strict(),
    not_evaluable_intervals: z.array(notEvaluableIntervalSchema),
    source_ref: z.string().min(1),
  })
  .strict();
export type SegmentSummary = z.infer<typeof segmentSummarySchema>;

export const matchObservationSchema = z
  .object({
    schema_version: z.literal(MATCH_OBSERVATION_SCHEMA_VERSION),
    segments: z.array(segmentSummarySchema),
    evidence: z.array(evidenceItemSchema),
    /** Aggregated over segments, weighted by analysed seconds; still ESTIMADA_LLM. */
    possession: possessionPairSchema,
    possession_detail: z
      .object({
        weighting: z.literal("analysed_sec"),
        segments_used: z.array(z.number().int().nonnegative()),
        segments_excluded: z.array(
          z.object({ idx: z.number().int().nonnegative(), gate_code: z.enum(MATCH_GATE_CODES) }).strict(),
        ),
        /** Low-confidence flags of the estimate (empty = none). The UI shows each reason next to the value. */
        low_confidence: z.array(possessionLowConfidenceSchema).max(POSSESSION_LOW_CONFIDENCE_CODES.length).optional(),
      })
      .strict(),
    coverage: matchCoverageSchema,
    /**
     * "n eventos citados" per evidence team. A count over LLM pointers is still
     * ESTIMADA_LLM (deterministic over LLM output ≠ DERIVADA), never an event statistic.
     */
    cited_events: z
      .object({
        home: llmMetric(z.number().int().nonnegative()),
        away: llmMetric(z.number().int().nonnegative()),
        ambiguous: llmMetric(z.number().int().nonnegative()),
      })
      .strict(),
    /** Internal audit counters (not rendered). */
    identity_guard: z
      .object({ keys_stripped: z.number().int().nonnegative(), items_dropped: z.number().int().nonnegative() })
      .strict(),
  })
  .strict();
export type MatchObservation = z.infer<typeof matchObservationSchema>;

// ═════════════════════════════════════════════════════════════════════════════
// 11 · Report v2 (Claude) — LLM output + stored report
// ═════════════════════════════════════════════════════════════════════════════

/** Output bounds of the report (design decision: cap tokens and UI length; not metric thresholds). */
export const REPORT_BOUNDS = {
  maxSummaryClaims: 8,
  maxClaimsPerList: 6,
  maxEvidencePerClaim: 8,
  maxNotEvaluated: 12,
  maxClaimChars: 400,
} as const;

const claimText = z.string().trim().min(1).max(REPORT_BOUNDS.maxClaimChars);

/** Claim as Claude returns it; evidence ids are validated afterwards by citations.ts. */
export const reportClaimInputSchema = z
  .object({ text: claimText, evidence_ids: z.array(z.string()).max(REPORT_BOUNDS.maxEvidencePerClaim) })
  .strict();

const sectionShape = <C extends z.ZodTypeAny>(claim: C) =>
  z
    .object({
      in_possession: z.array(claim).max(REPORT_BOUNDS.maxClaimsPerList),
      out_of_possession: z.array(claim).max(REPORT_BOUNDS.maxClaimsPerList),
      transitions: z.array(claim).max(REPORT_BOUNDS.maxClaimsPerList),
      set_pieces: z.array(claim).max(REPORT_BOUNDS.maxClaimsPerList),
      strengths: z.array(claim).max(REPORT_BOUNDS.maxClaimsPerList),
      areas_to_improve: z.array(claim).max(REPORT_BOUNDS.maxClaimsPerList),
      recommendations: z.array(claim).max(REPORT_BOUNDS.maxClaimsPerList),
    })
    .strict();

/**
 * Exactly what the team-report.v2 prompt asks Claude for. .strict(): an
 * overall_rating, confidence_score or data_completeness key FAILS the parse.
 */
export const matchReportLlmOutputSchema = z
  .object({
    claims: z.array(reportClaimInputSchema).min(1).max(REPORT_BOUNDS.maxSummaryClaims),
    teams: z.object({ home: sectionShape(reportClaimInputSchema), away: sectionShape(reportClaimInputSchema) }).strict(),
    not_evaluated: z.array(claimText).max(REPORT_BOUNDS.maxNotEvaluated),
  })
  .strict();
export type MatchReportLlmOutput = z.infer<typeof matchReportLlmOutputSchema>;

/** Stored claim: survived the citations validator (≥ 1 valid evidence id). */
export const reportClaimSchema = z
  .object({
    text: claimText,
    evidence_ids: z.array(z.string().regex(EVIDENCE_ID_RE)).min(1).max(REPORT_BOUNDS.maxEvidencePerClaim),
  })
  .strict();
export type ReportClaim = z.infer<typeof reportClaimSchema>;

export const reportTeamSectionSchema = sectionShape(reportClaimSchema);

export const droppedClaimsSchema = z
  .object({
    /** Rendered ("N afirmaciones descartadas sin evidencia válida"). */
    total: derivedMetric(z.number().int().nonnegative()),
    /** Internal breakdown (not rendered). */
    by_reason: z
      .object({
        missing_evidence: z.number().int().nonnegative(),
        unknown_evidence_id: z.number().int().nonnegative(),
        identity_guard: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

/**
 * Stored A-vs-B report (match_ab only; team_baseline reports come from
 * /api/team/baseline-analysis with matchAnalysisId). Deterministic parts
 * (possession, segments, evidence, coverage) are COPIED from the aggregated
 * observation at report time — never recomputed (inv #7).
 */
export const matchReportV2Schema = z
  .object({
    schema_version: z.literal(MATCH_REPORT_SCHEMA_VERSION),
    purpose: z.literal("match_ab"),
    locale: localeSchema,
    claims: z.array(reportClaimSchema).max(REPORT_BOUNDS.maxSummaryClaims),
    teams: z.object({ home: reportTeamSectionSchema, away: reportTeamSectionSchema }).strict(),
    possession: possessionPairSchema,
    /** Copied from observation.possession_detail.low_confidence (never recomputed). */
    possession_low_confidence: z.array(possessionLowConfidenceSchema).max(POSSESSION_LOW_CONFIDENCE_CODES.length).optional(),
    segments: z.array(segmentSummarySchema),
    evidence: z.array(evidenceItemSchema),
    coverage: matchCoverageSchema,
    not_evaluated: z.array(claimText).max(REPORT_BOUNDS.maxNotEvaluated),
    dropped_claims: droppedClaimsSchema,
    /** Notes are "aportado por el entrenador, no observado" and never become evidence. */
    coach_notes_provided: z.boolean(),
    source: z
      .object({
        kind: z.enum(["llm", "mock"]),
        /** The Anthropic response `model` field (fetchMessages may fall back to another model). */
        model: z.string().min(1).nullable(),
        prompt_version: z.string().min(1),
        generated_at: isoDateTime,
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.source.kind === "llm" && r.source.model === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source", "model"], message: "llm report requires the producing model id" });
    }
    const ids = new Set(r.evidence.map((e) => e.id));
    const lists: { path: (string | number)[]; claims: ReportClaim[] }[] = [{ path: ["claims"], claims: r.claims }];
    for (const side of TEAM_SIDES) {
      for (const [k, v] of Object.entries(r.teams[side])) lists.push({ path: ["teams", side, k], claims: v });
    }
    for (const l of lists) {
      l.claims.forEach((c, i) => {
        for (const id of c.evidence_ids) {
          if (!ids.has(id)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...l.path, i, "evidence_ids"], message: `unknown evidence id ${id}` });
          }
        }
      });
    }
  });
export type MatchReportV2 = z.infer<typeof matchReportV2Schema>;

// ═════════════════════════════════════════════════════════════════════════════
// 12 · Status / list responses (user JWT)
// ═════════════════════════════════════════════════════════════════════════════

const teamPublicSchema = z
  .object({ name: z.string().min(1).nullable(), kit: teamKitSchema.nullable() })
  .strict();

export const matchJobStatusResponseSchema = z
  .object({
    job: z
      .object({
        id: jobIdSchema,
        videoId: z.string().min(1),
        purpose: matchPurposeSchema,
        status: matchJobStatusSchema,
        stage: matchJobStageSchema,
        locale: localeSchema,
        category: z.enum(MATCH_CATEGORIES).nullable(),
        focusTeam: z.enum(TEAM_SIDES).nullable(),
        home: teamPublicSchema,
        away: teamPublicSchema,
        attestationVersion: z.string().min(1),
        createdAt: isoDateTime,
        updatedAt: isoDateTime,
        finishedAt: isoDateTime.nullable(),
      })
      .strict(),
    progress: z
      .object({
        segmentsDone: z.number().int().nonnegative(),
        /** null until the segments are planned (no invented total). */
        segmentsTotal: z.number().int().nonnegative().nullable(),
        currentSegmentIdx: z.number().int().nonnegative().nullable(),
        dispatchAttempts: z.number().int().nonnegative(),
      })
      .strict(),
    /** Operational, reported by Bunny (API status + encodeProgress); not a metric. */
    encode: z
      .object({
        bunnyStatus: z.number().int().nullable(),
        encodeProgressPct: z.number().int().min(0).max(100).nullable(),
      })
      .strict()
      .nullable(),
    /**
     * Server-built Bunny embed base URL for evidence chips (signed when embed token
     * auth is on). The UI appends `t=<seconds>` (Bunny embed start-time parameter).
     */
    playback: z
      .object({ embedUrl: z.string().url(), tokenExpiresAt: isoDateTime.nullable() })
      .strict()
      .nullable(),
    coverage: matchCoverageSchema.nullable(),
    observation: matchObservationSchema.nullable(),
    report: matchReportV2Schema.nullable(),
    /** Why there is no report (0 analysed segments, no engine, engine error, budget). */
    reportGate: matchGateSchema.nullable(),
    error: matchJobErrorSchema.nullable(),
    cost: z.object({ estimate: usdAmountSchema.nullable(), spend: usdAmountSchema.nullable() }).strict(),
  })
  .strict();
export type MatchJobStatusResponse = z.infer<typeof matchJobStatusResponseSchema>;

export const matchJobListItemSchema = z
  .object({
    jobId: jobIdSchema,
    videoId: z.string().min(1),
    purpose: matchPurposeSchema,
    status: matchJobStatusSchema,
    stage: matchJobStageSchema,
    homeName: z.string().min(1).nullable(),
    awayName: z.string().min(1).nullable(),
    createdAt: isoDateTime,
    finishedAt: isoDateTime.nullable(),
  })
  .strict();
export const matchJobListResponseSchema = z.object({ jobs: z.array(matchJobListItemSchema) }).strict();

// ═════════════════════════════════════════════════════════════════════════════
// 13 · Dispatch (Vercel → Modal `match_start` web endpoint)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST MODAL_MATCH_START_URL · Authorization: Bearer <MODAL_API_KEY> (worker
 * compares with hmac.compare_digest). The worker takes the step URL from its own
 * secret (VITAS_MATCH_STEP_URL), NEVER from this request.
 */
export const matchDispatchRequestSchema = z.object({ jobId: jobIdSchema, epoch: epochSchema }).strict();

/** Anything else (incl. HTTP 2xx without call_id) is a dispatch FAILURE: no spend, attempt counted. */
export const matchDispatchReplySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("spawned"), call_id: z.string().min(1) }),
  z.object({ status: z.literal("error"), reason: z.string() }),
]);

// ═════════════════════════════════════════════════════════════════════════════
// 14 · Step protocol (Modal worker → POST /api/match/step, HMAC-signed)
// ═════════════════════════════════════════════════════════════════════════════

export const STEP_OPS = ["begin", "heartbeat", "upload_session", "proxy_ready", "advance", "fail", "tick"] as const;
export type StepOp = (typeof STEP_OPS)[number];

export const WORKER_FAIL_CODES = [
  "source_forbidden",
  "source_unavailable",
  "transcode_failed",
  "duration_mismatch",
  "upload_failed",
  "deadline_exceeded",
  "internal",
] as const;

const jobRef = { jobId: jobIdSchema, epoch: epochSchema };

export const stepBeginRequestSchema = z.object({ op: z.literal("begin"), ...jobRef }).strict();

export const stepHeartbeatRequestSchema = z
  .object({
    op: z.literal("heartbeat"),
    ...jobRef,
    phase: z.enum(["transcoding", "uploading"]),
    processedSec: seconds.optional(),
    uploadedBytes: z.number().int().nonnegative().optional(),
  })
  .strict();

/** Sent AFTER ffmpeg: Gemini's resumable `start` needs the exact byte length. */
export const stepUploadSessionRequestSchema = z
  .object({
    op: z.literal("upload_session"),
    ...jobRef,
    bytes: z.number().int().positive(),
    mime: z.literal("video/mp4"),
    /** Lowercase hex SHA-256 of the proxy bytes (Gemini reports base64 sha256Hash; compare after decoding). */
    sha256: sha256HexSchema,
    /** ffprobe duration of the proxy. */
    durationSec: z.number().finite().positive(),
  })
  .strict();

export const geminiFileRefSchema = z
  .object({
    name: z.string().regex(/^files\/[A-Za-z0-9_-]+$/),
    uri: z.string().url().startsWith(`https://${GEMINI_UPLOAD_HOST}/`),
  })
  .strict();

export const stepProxyReadyRequestSchema = z
  .object({
    op: z.literal("proxy_ready"),
    ...jobRef,
    file: geminiFileRefSchema,
    bytes: z.number().int().positive(),
    sha256: sha256HexSchema,
    durationSec: z.number().finite().positive(),
  })
  .strict();

export const stepAdvanceRequestSchema = z.object({ op: z.literal("advance"), ...jobRef }).strict();

export const stepFailRequestSchema = z
  .object({
    op: z.literal("fail"),
    ...jobRef,
    code: z.enum(WORKER_FAIL_CODES),
    /** Redacted: no URLs, no query strings, no tokens. */
    reason: z.string().min(1).max(1000),
  })
  .strict();

/** The only global op: jobId/epoch are present but null. Sent by the modal.Period(5 min) driver. */
export const stepTickRequestSchema = z
  .object({ op: z.literal("tick"), jobId: z.null(), epoch: z.null(), scheduledAt: isoDateTime })
  .strict();

export const stepRequestSchema = z.discriminatedUnion("op", [
  stepBeginRequestSchema,
  stepHeartbeatRequestSchema,
  stepUploadSessionRequestSchema,
  stepProxyReadyRequestSchema,
  stepAdvanceRequestSchema,
  stepFailRequestSchema,
  stepTickRequestSchema,
]);
export type StepRequest = z.infer<typeof stepRequestSchema>;

/** Reply to ANY per-job op whose epoch is not the job's current dispatch_epoch. The worker exits. */
export const stepSupersededReplySchema = z.object({ superseded: z.literal(true) }).strict();

export const proxySpecSchema = z
  .object({
    container: z.literal("mp4"),
    videoCodec: z.literal("h264"),
    /** Always false: minors' voices never reach Google, and no audio tokens are billed. */
    audio: z.literal(false),
    fps: z.number().positive(),
    maxHeight: z.number().int().positive(),
    crf: z.number().int().min(0).max(51),
    /** |ffprobe − Bunny length| allowed; the server re-checks at upload_session. */
    durationToleranceSec: z.number().nonnegative(),
  })
  .strict();

export const stepBeginReplySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("transcode"),
      epoch: epochSchema,
      /** HLS playlist of `targetVariant`, built server-side from bunny_video_id + BUNNY_CDN_HOSTNAME only. */
      sourceUrl: z.string().url().startsWith("https://"),
      sourceUrlExpiresAt: isoDateTime.nullable(),
      targetVariant: z.string().regex(/^\d{3,4}p$/),
      /** Bunny API `length`. */
      expectedDurationSec: z.number().finite().positive(),
      proxy: proxySpecSchema,
    })
    .strict(),
  /** Gemini file still ACTIVE: skip the transcode and go straight to the advance loop. */
  z.object({ action: z.literal("advance"), epoch: epochSchema }).strict(),
  /** Job is terminal/cancelled: exit. */
  z.object({ action: z.literal("stop"), epoch: epochSchema, state: matchJobStatusSchema }).strict(),
]);

export const stepHeartbeatReplySchema = z
  .object({ action: z.enum(["continue", "stop"]), state: matchJobStatusSchema })
  .strict();

export const stepUploadSessionReplySchema = z
  .object({
    /** Capability URL (treat as a secret; never log). Contains no API key. */
    uploadUrl: z.string().url().startsWith(`https://${GEMINI_UPLOAD_HOST}/`),
    displayName: z.string().startsWith(GEMINI_DISPLAY_NAME_PREFIX),
    /** From Gemini's X-Goog-Upload-Chunk-Granularity when present. */
    chunkGranularityBytes: z.number().int().positive().nullable(),
  })
  .strict();

export const stepStateReplySchema = z.object({ state: matchJobStatusSchema }).strict();

export const stepAdvanceReplySchema = z
  .object({
    state: matchJobStatusSchema,
    /** Sleep this long before the next advance (0 = immediately). */
    retryAfterSec: z.number().int().min(0).max(300),
  })
  .strict();

export const stepTickReplySchema = z
  .object({
    dispatched: z.number().int().nonnegative(),
    redispatched: z.number().int().nonnegative(),
    failedJobs: z.number().int().nonnegative(),
    geminiFilesDeleted: z.number().int().nonnegative(),
    geminiDeleteErrors: z.number().int().nonnegative(),
    /** true ⇒ the bounded batch left work; the next tick continues. */
    more: z.boolean(),
  })
  .strict();

/** Reply `data` schema per op (inside the standard { ok:true, data } envelope). */
export const STEP_REPLY_SCHEMAS = {
  begin: z.union([stepSupersededReplySchema, stepBeginReplySchema]),
  heartbeat: z.union([stepSupersededReplySchema, stepHeartbeatReplySchema]),
  upload_session: z.union([stepSupersededReplySchema, stepUploadSessionReplySchema]),
  proxy_ready: z.union([stepSupersededReplySchema, stepStateReplySchema]),
  advance: z.union([stepSupersededReplySchema, stepAdvanceReplySchema]),
  fail: z.union([stepSupersededReplySchema, stepStateReplySchema]),
  tick: stepTickReplySchema,
} as const satisfies Record<StepOp, z.ZodTypeAny>;

// ═════════════════════════════════════════════════════════════════════════════
// 15 · Metric ids to register (config/metrics.json) — by the PR that adds calc paths
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Concrete ids (no wildcards; audit_metrics REQUIRED_FIELDS per entry). The
 * backend PR registers each one with calc_paths = api/_lib/matchJob/aggregate.ts
 * (or citations.ts) and the UI PR adds ui_paths. DERIVADA entries must declare
 * allowed_literals (e.g. 60 for mm:ss) or LIT001 fails. Not registered in this PR
 * because their calc paths do not exist yet (PATH001).
 * `path` = where the MetricResult lives in MatchObservation / MatchReportV2
 * (`*` = every segment, `{side}` = home | away).
 */
export const MATCH_METRIC_REGISTRY_PLAN = [
  { id: "match_duracion_video", provenance: "DERIVADA", units: "s", path: "coverage.duration_sec" },
  { id: "match_cobertura_analizada", provenance: "DERIVADA", units: "s", path: "coverage.analysed_sec" },
  { id: "match_cobertura_fraccion", provenance: "DERIVADA", units: null, path: "coverage.analysed_fraction" },
  { id: "match_tramos_fallidos", provenance: "DERIVADA", units: null, path: "coverage.failed_segments" },
  { id: "match_tiempo_equipos_ambiguos", provenance: "ESTIMADA_LLM", units: "s", path: "coverage.ambiguous_sec" },
  { id: "match_tiempo_no_evaluable", provenance: "ESTIMADA_LLM", units: "s", path: "coverage.not_evaluable_sec" },
  { id: "match_identificacion_equipos_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].team_identification" },
  { id: "match_dominio_territorial_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].dominance" },
  { id: "match_posesion_estimada_tramo", provenance: "ESTIMADA_LLM", units: "%", path: "segments[*].possession.{side}" },
  { id: "match_posesion_estimada_partido", provenance: "ESTIMADA_LLM", units: "%", path: "possession.{side}" },
  { id: "match_formacion_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.formation" },
  { id: "match_fase_predominante_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.phases.predominant" },
  { id: "match_salida_balon_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.build_up.style" },
  { id: "match_presion_altura_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.pressing.height" },
  { id: "match_presion_intensidad_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.pressing.intensity" },
  { id: "match_bloque_altura_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.block.height" },
  { id: "match_bloque_compactacion_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.block.compactness" },
  { id: "match_transicion_ofensiva_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.transitions.attacking" },
  { id: "match_transicion_defensiva_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.transitions.defensive" },
  { id: "match_balon_parado_tramo", provenance: "ESTIMADA_LLM", units: null, path: "segments[*].teams.{side}.set_pieces.threat" },
  { id: "match_eventos_citados", provenance: "ESTIMADA_LLM", units: null, path: "cited_events.{home|away|ambiguous}" },
  { id: "match_afirmaciones_descartadas", provenance: "DERIVADA", units: null, path: "dropped_claims.total" },
] as const satisfies readonly { id: string; provenance: Provenance; units: string | null; path: string }[];
