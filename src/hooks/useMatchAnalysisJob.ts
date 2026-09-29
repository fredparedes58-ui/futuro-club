/**
 * VITAS · useMatchAnalysisJob — drives one full-match video job from the UI.
 *
 *   start(req)  → POST /api/match/start, then ?job=<id> in the URL
 *   polling     → GET /api/match/status every 10 s; while nothing changes the
 *                 interval grows ×1.5 up to 30 s; any progress resets it to 10 s
 *                 (config/matchVideoUi.json). Stops at a terminal status.
 *   resume      → ?job=<id> survives reloads; without it, GET /api/match/list
 *                 re-opens the newest ACTIVE job of this purpose (a Bunny encode
 *                 can take hours, the coach will close the tab).
 *   cancel()    → POST /api/match/cancel, then one status refresh.
 *
 * `enabled: false` (IS_DEMO) ⇒ zero network: no list, no status, no start.
 * The status GET is read-only on the server (CWE-650), so polling never spends.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  TERMINAL_MATCH_JOB_STATUSES,
  type MatchJobStatus,
  type MatchJobStatusResponse,
  type MatchPurpose,
  type MatchStartRequest,
  type MatchStartResponse,
} from "@/lib/shared/matchJob/contract";
import { MatchAnalysisService, MatchApiError, type MatchJobListItem } from "@/services/real/matchAnalysisService";
import { MATCH_UI_CONFIG } from "@/lib/match/matchUiConfig";

/** URL search param that keeps the job across reloads. */
export const MATCH_JOB_URL_PARAM = "job";

/** Errors after which polling stops (retrying cannot fix them). */
const FATAL_STATUS_ERRORS = new Set(["not_found", "unauthorized", "not_owner", "invalid_request", "invalid_response"]);

export function isTerminalMatchStatus(s: MatchJobStatus | null | undefined): boolean {
  return !!s && (TERMINAL_MATCH_JOB_STATUSES as readonly string[]).includes(s);
}

/**
 * Next poll delay (s). Progress ⇒ back to the initial interval; no progress or a
 * transient error ⇒ grow by the factor, capped. Pure (tested).
 */
export function nextPollDelaySec(
  prevDelaySec: number | null,
  progressed: boolean,
  cfg: { initial: number; max: number; factor: number } = {
    initial: MATCH_UI_CONFIG.statusPollInitialSec,
    max: MATCH_UI_CONFIG.statusPollMaxSec,
    factor: MATCH_UI_CONFIG.statusPollBackoffFactor,
  },
): number {
  if (progressed || prevDelaySec === null) return cfg.initial;
  return Math.min(cfg.max, Math.round(prevDelaySec * cfg.factor));
}

/** What counts as progress for the backoff (heartbeats alone are not progress). */
export function progressSignature(r: MatchJobStatusResponse | null): string {
  if (!r) return "";
  return [
    r.job?.status,
    r.job?.stage,
    r.progress?.segmentsDone,
    r.progress?.segmentsTotal,
    r.progress?.currentSegmentIdx,
    r.encode?.encodeProgressPct ?? "",
  ].join("|");
}

export interface UseMatchAnalysisJobOptions {
  purpose: MatchPurpose;
  /** false ⇒ no network at all (IS_DEMO). */
  enabled?: boolean;
  /** Re-open the newest active job of this purpose when the URL has no ?job=. Default true. */
  resumeFromList?: boolean;
}

export interface UseMatchAnalysisJobResult {
  jobId: string | null;
  data: MatchJobStatusResponse | null;
  /** Last status/cancel error (start errors go to startError). */
  error: MatchApiError | null;
  startError: MatchApiError | null;
  starting: boolean;
  cancelling: boolean;
  isTerminal: boolean;
  /** Seconds until the next status poll (null when not polling). */
  nextPollInSec: number | null;
  /** Owner's recent jobs of this purpose (newest first), from /api/match/list. */
  recentJobs: MatchJobListItem[];
  start: (req: Omit<MatchStartRequest, "purpose">) => Promise<MatchStartResponse | null>;
  cancel: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Switch to an existing job (sets ?job=). */
  open: (jobId: string) => void;
  /** Forget the current job (removes ?job=) to start a new one. */
  clear: () => void;
}

export function useMatchAnalysisJob(opts: UseMatchAnalysisJobOptions): UseMatchAnalysisJobResult {
  const { purpose, enabled = true, resumeFromList = true } = opts;
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = enabled ? searchParams.get(MATCH_JOB_URL_PARAM) : null;

  const [data, setData] = useState<MatchJobStatusResponse | null>(null);
  const [error, setError] = useState<MatchApiError | null>(null);
  const [startError, setStartError] = useState<MatchApiError | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [nextPollInSec, setNextPollInSec] = useState<number | null>(null);
  const [recentJobs, setRecentJobs] = useState<MatchJobListItem[]>([]);
  // Bumped to force an immediate poll (refresh / after cancel) without changing the job.
  const [pollNonce, setPollNonce] = useState(0);

  const setJobParam = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set(MATCH_JOB_URL_PARAM, id);
          else next.delete(MATCH_JOB_URL_PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ── Resume via list (only when the URL has no job) ─────────────────────────
  const resumedRef = useRef(false);
  // Latest job in the URL (the list may resolve after the coach already started one).
  const jobIdRef = useRef<string | null>(jobId);
  jobIdRef.current = jobId;
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    MatchAnalysisService.list({ signal: ctrl.signal })
      .then((jobs) => {
        const mine = jobs.filter((j) => j.purpose === purpose);
        setRecentJobs(mine);
        if (!resumeFromList || resumedRef.current) return;
        resumedRef.current = true;
        if (jobIdRef.current) return;
        const active = mine.find((j) => !isTerminalMatchStatus(j.status));
        if (active) setJobParam(active.jobId);
      })
      .catch(() => {
        // Backend not deployed / feature disabled / offline: the page keeps working
        // (notes-only report), there is simply nothing to resume.
        setRecentJobs([]);
      });
    return () => ctrl.abort();
    // Only on mount / purpose change: resuming must not fight a job the user opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, purpose]);

  // ── Polling loop for the current job ───────────────────────────────────────
  useEffect(() => {
    if (!jobId) {
      setData(null);
      setError(null);
      setNextPollInSec(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay: number | null = null;
    let lastSig = "";
    const ctrl = new AbortController();

    const tick = async () => {
      if (cancelled) return;
      setNextPollInSec(null);
      let progressed = false;
      try {
        const r = await MatchAnalysisService.status(jobId, { signal: ctrl.signal });
        if (cancelled) return;
        setData(r);
        setError(null);
        const sig = progressSignature(r);
        progressed = sig !== lastSig;
        lastSig = sig;
        if (isTerminalMatchStatus(r.job?.status)) return; // done: stop polling
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        const e = err instanceof MatchApiError ? err : new MatchApiError("network", String(err));
        setError(e);
        if (FATAL_STATUS_ERRORS.has(e.code)) return; // retrying cannot fix it
      }
      delay = nextPollDelaySec(delay, progressed);
      setNextPollInSec(delay);
      timer = setTimeout(() => void tick(), delay * 1000);
    };

    void tick();
    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, pollNonce]);

  // Data belongs to the job it was fetched for (switching jobs never shows the old one).
  const current = data && data.job?.id === jobId ? data : null;

  const start = useCallback<UseMatchAnalysisJobResult["start"]>(
    async (req) => {
      if (!enabled) return null;
      setStarting(true);
      setStartError(null);
      try {
        const res = await MatchAnalysisService.start({ ...req, purpose } as MatchStartRequest);
        setJobParam(res.jobId);
        return res;
      } catch (err) {
        setStartError(err instanceof MatchApiError ? err : new MatchApiError("network", String(err)));
        return null;
      } finally {
        setStarting(false);
      }
    },
    [enabled, purpose, setJobParam],
  );

  const cancel = useCallback(async () => {
    if (!enabled || !jobId) return;
    setCancelling(true);
    try {
      await MatchAnalysisService.cancel(jobId);
      setPollNonce((n) => n + 1);
    } catch (err) {
      setError(err instanceof MatchApiError ? err : new MatchApiError("network", String(err)));
    } finally {
      setCancelling(false);
    }
  }, [enabled, jobId]);

  const refresh = useCallback(async () => {
    if (!enabled || !jobId) return;
    setPollNonce((n) => n + 1);
  }, [enabled, jobId]);

  const open = useCallback(
    (id: string) => {
      if (!enabled) return;
      setStartError(null);
      setJobParam(id);
    },
    [enabled, setJobParam],
  );

  const clear = useCallback(() => {
    setStartError(null);
    setError(null);
    setData(null);
    setJobParam(null);
  }, [setJobParam]);

  return useMemo(
    () => ({
      jobId,
      data: current,
      error,
      startError,
      starting,
      cancelling,
      isTerminal: isTerminalMatchStatus(current?.job?.status),
      nextPollInSec,
      recentJobs,
      start,
      cancel,
      refresh,
      open,
      clear,
    }),
    [jobId, current, error, startError, starting, cancelling, nextPollInSec, recentJobs, start, cancel, refresh, open, clear],
  );
}
