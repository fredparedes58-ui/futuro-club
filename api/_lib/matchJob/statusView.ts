/**
 * VITAS · Match job — vista pública (status / list) construida desde la fila
 *
 * PURO. Lo guardado se re-valida con los schemas del contrato: un JSON almacenado que no
 * cumple el contrato se devuelve como null (y se registra), nunca se "arregla" ni se inventa.
 */
import { z } from "zod";
import {
  MATCH_STATUS_TO_STAGE,
  matchCoverageSchema,
  matchGateSchema,
  matchJobErrorSchema,
  matchJobListItemSchema,
  matchJobStatusResponseSchema,
  matchObservationSchema,
  matchReportV2Schema,
  teamKitSchema,
  usdAmountSchema,
  type MatchJobStatusResponse,
} from "../../../src/lib/shared/matchJob/contract";
import { normalizeLocale } from "../../../src/lib/shared/locale";
import { ledgerAmount } from "./costing";
import type { MatchJobRow, SegmentRow } from "./repo";

function safe<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, what: string, jobId: string): T | null {
  if (value === null || value === undefined) return null;
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  console.error(`[match/status] ${what} almacenado no cumple el contrato (job ${jobId})`);
  return null;
}

function teamPublic(t: MatchJobRow["home"]) {
  const kit = t?.kit ? teamKitSchema.safeParse(t.kit) : null;
  return { name: t?.name && t.name.trim() ? t.name : null, kit: kit && kit.success ? kit.data : null };
}

export interface StatusViewInput {
  job: MatchJobRow;
  segments: readonly SegmentRow[];
  encode: { bunnyStatus: number | null; encodeProgressPct: number | null } | null;
  playback: { embedUrl: string; tokenExpiresAt: string | null } | null;
}

export function buildStatusView({ job, segments, encode, playback }: StatusViewInput): MatchJobStatusResponse {
  const running = segments.find((s) => s.status === "running");
  const view = {
    job: {
      id: job.id,
      videoId: job.video_id,
      purpose: job.purpose,
      status: job.status,
      stage: MATCH_STATUS_TO_STAGE[job.status],
      locale: normalizeLocale(job.locale),
      category: job.category,
      focusTeam: job.focus_team,
      home: teamPublic(job.home),
      away: teamPublic(job.away),
      attestationVersion: job.attestation_version,
      createdAt: new Date(job.created_at).toISOString(),
      updatedAt: new Date(job.updated_at).toISOString(),
      finishedAt: job.finished_at ? new Date(job.finished_at).toISOString() : null,
    },
    progress: {
      segmentsDone: segments.filter((s) => s.status === "done").length,
      segmentsTotal: job.segments_total,
      currentSegmentIdx: running ? running.idx : null,
      dispatchAttempts: job.dispatch_attempts,
    },
    encode,
    playback,
    coverage: safe(matchCoverageSchema, job.coverage, "coverage", job.id),
    observation: safe(matchObservationSchema, job.observation, "observation", job.id),
    report: safe(matchReportV2Schema, job.report, "report", job.id),
    reportGate: safe(matchGateSchema, job.report_gate, "report_gate", job.id),
    error: safe(matchJobErrorSchema, job.error, "error", job.id),
    cost: {
      estimate: safe(usdAmountSchema, job.estimate, "estimate", job.id),
      spend: ledgerAmount(job.spend_usd),
    },
  };
  return matchJobStatusResponseSchema.parse(view);
}

export function buildListItem(job: MatchJobRow) {
  return matchJobListItemSchema.parse({
    jobId: job.id,
    videoId: job.video_id,
    purpose: job.purpose,
    status: job.status,
    stage: MATCH_STATUS_TO_STAGE[job.status],
    homeName: job.home?.name && job.home.name.trim() ? job.home.name : null,
    awayName: job.away?.name && job.away.name.trim() ? job.away.name : null,
    createdAt: new Date(job.created_at).toISOString(),
    finishedAt: job.finished_at ? new Date(job.finished_at).toISOString() : null,
  });
}
