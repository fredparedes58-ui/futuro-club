/**
 * VITAS · Match video job — client service (start / status / list / cancel).
 *
 * Talks to the user-facing routes of the shared contract
 * (src/lib/shared/matchJob/contract.ts → MATCH_API_ROUTES). DETERMINISTIC: no AI
 * runs here; the job itself runs server-side (Vercel + Modal + Gemini + Claude).
 *
 * Honesty rules applied on the client:
 *   - the start request is validated with the SAME strict zod schema the server
 *     uses (kit colours, attestation, no per-player keys) before any request;
 *   - every response is parsed with the contract schemas. A payload that does not
 *     match (e.g. coverage 100 % with a failed segment, a report with an
 *     overall_rating, a MEDIDA value) is REJECTED as `invalid_response` — never
 *     rendered half-trusted;
 *   - errors keep the server code (attestation_required, match_video_disabled,
 *     budget_exceeded…) so the UI can explain them; env var names in
 *     `details.missing` are never shown to the coach.
 *
 * Fallback rule (CLAUDE.md): nothing here throws past the caller's try/catch;
 * the pages keep the notes-only report available whatever this service returns.
 */

import { z } from "zod";
import { getAuthHeaders } from "@/lib/apiAuth";
import {
  MATCH_API_ROUTES,
  matchCancelResponseSchema,
  matchJobListResponseSchema,
  matchJobStatusResponseSchema,
  matchStartRequestSchema,
  matchStartResponseSchema,
  type MatchJobStatus,
  type MatchJobStatusResponse,
  type MatchStartRequest,
  type MatchStartResponse,
} from "@/lib/shared/matchJob/contract";

export type MatchJobListItem = z.infer<typeof matchJobListResponseSchema>["jobs"][number];

/** Client-side codes added to the server's MATCH_START_ERROR_CODES. */
export type MatchClientErrorCode = "invalid_request" | "invalid_response" | "network" | "not_found" | "http_error";

export class MatchApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: Record<string, unknown> | null;

  constructor(code: string, message: string, status: number | null = null, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = "MatchApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Server codes that name the same condition as a client code, so the UI explains
 * them with one message. The raw code is still kept on the error (`code`); this
 * only feeds `canonicalMatchErrorCode`. Sources: api/match/_status.ts and _cancel.ts
 * answer a missing or foreign job with 404 `job_not_found`; withHandler
 * (api/_lib/withHandler.ts) answers a missing / expired session with 401
 * `UNAUTHORIZED`; the match routes answer a bad id with 400 `invalid_input`.
 */
const SERVER_CODE_ALIASES: Readonly<Record<string, string>> = {
  job_not_found: "not_found",
  UNAUTHORIZED: "unauthorized",
  invalid_input: "invalid_request",
};

/** The client vocabulary for a server code (matchErrorMessage, fatal classification). */
export function canonicalMatchErrorCode(code: string): string {
  return SERVER_CODE_ALIASES[code] ?? code;
}

/** Codes after which repeating the same request cannot succeed. */
const FATAL_CODES = new Set(["not_found", "unauthorized", "not_owner", "invalid_request", "invalid_response"]);

/**
 * True when retrying the same request cannot fix the error, so polling must stop:
 * by HTTP status (4xx except 408 Request Timeout and 429 Too Many Requests: a
 * missing or foreign job, an expired session, a refused role, a bad id) as well as
 * by code (client-side refusals and contract violations have no HTTP status).
 * Network errors, 408, 429 and 5xx are transient: polling keeps backing off.
 */
export function isFatalMatchError(err: Pick<MatchApiError, "code" | "status">): boolean {
  const s = err.status;
  if (s !== null && s >= 400 && s < 500 && s !== 408 && s !== 429) return true;
  return FATAL_CODES.has(canonicalMatchErrorCode(err.code));
}

const jobIdSchema = z.string().uuid();

interface Envelope {
  data: unknown;
}

function readErrorEnvelope(json: unknown, status: number): MatchApiError {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const detail = (o.errorDetail && typeof o.errorDetail === "object" ? o.errorDetail : null) as Record<string, unknown> | null;
  const errObj = (o.error && typeof o.error === "object" ? o.error : null) as Record<string, unknown> | null;
  const code =
    (typeof detail?.code === "string" && detail.code) ||
    (typeof errObj?.code === "string" && errObj.code) ||
    (status === 404 ? "not_found" : "http_error");
  const message =
    (typeof detail?.message === "string" && detail.message) ||
    (typeof o.error === "string" && o.error) ||
    (typeof errObj?.message === "string" && errObj.message) ||
    `HTTP ${status}`;
  const details = detail ?? (errObj?.details && typeof errObj.details === "object" ? (errObj.details as Record<string, unknown>) : null);
  return new MatchApiError(code, message, status, details);
}

async function request(path: string, init: RequestInit & { signal?: AbortSignal }): Promise<Envelope> {
  let res: Response;
  try {
    const headers = await getAuthHeaders();
    res = await fetch(path, { ...init, headers: { ...headers, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new MatchApiError("network", err instanceof Error ? err.message : "network error");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (!res.ok || o.ok === false || o.success === false) throw readErrorEnvelope(json, res.status);
  return { data: o.data };
}

function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, what: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const where = r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    // Never render a payload that breaks the contract (it could mislabel provenance).
    console.warn(`[matchAnalysisService] ${what} does not match the contract`, where);
    throw new MatchApiError("invalid_response", `${what} does not match the contract`, null, { issues: where });
  }
  return r.data;
}

function assertJobId(jobId: string): void {
  if (!jobIdSchema.safeParse(jobId).success) {
    throw new MatchApiError("invalid_request", "jobId is not a valid id");
  }
}

export const MatchAnalysisService = {
  /** POST /api/match/start — validated locally with the strict contract schema first. */
  async start(req: MatchStartRequest, opts: { signal?: AbortSignal } = {}): Promise<MatchStartResponse> {
    const valid = matchStartRequestSchema.safeParse(req);
    if (!valid.success) {
      const where = valid.error.issues.slice(0, 5).map((i) => i.path.join("."));
      const code = where.some((p) => p.startsWith("attestation")) ? "attestation_required" : "invalid_request";
      throw new MatchApiError(code, "start request does not match the contract", null, { fields: where });
    }
    const { data } = await request(MATCH_API_ROUTES.start, {
      method: "POST",
      body: JSON.stringify(valid.data),
      signal: opts.signal,
    });
    return parseOrThrow(matchStartResponseSchema, data, "start response");
  },

  /** GET /api/match/status?jobId= — read-only on the server (never dispatches or spends). */
  async status(jobId: string, opts: { signal?: AbortSignal } = {}): Promise<MatchJobStatusResponse> {
    assertJobId(jobId);
    const { data } = await request(`${MATCH_API_ROUTES.status}?jobId=${encodeURIComponent(jobId)}`, {
      method: "GET",
      signal: opts.signal,
    });
    return parseOrThrow(matchJobStatusResponseSchema, data, "status response");
  },

  /** GET /api/match/list — the owner's recent jobs, newest first. */
  async list(opts: { signal?: AbortSignal } = {}): Promise<MatchJobListItem[]> {
    const { data } = await request(MATCH_API_ROUTES.list, { method: "GET", signal: opts.signal });
    const jobs = parseOrThrow(matchJobListResponseSchema, data, "list response").jobs ?? [];
    return [...jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  },

  /** POST /api/match/cancel — any non-terminal state → cancelled (the server deletes the Gemini file). */
  async cancel(jobId: string, opts: { signal?: AbortSignal } = {}): Promise<{ jobId: string; status: MatchJobStatus }> {
    assertJobId(jobId);
    const { data } = await request(MATCH_API_ROUTES.cancel, {
      method: "POST",
      body: JSON.stringify({ jobId }),
      signal: opts.signal,
    });
    const r = parseOrThrow(matchCancelResponseSchema, data, "cancel response");
    return { jobId: r.jobId, status: r.status };
  },
};
