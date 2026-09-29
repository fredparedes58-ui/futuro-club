"""
VITAS · Match video worker — Modal app `vitas-match-worker` (Phase 1, CPU only).

The worker moves bytes and drives the full-match job. It decides nothing: the
state machine, every provider key (Gemini, Anthropic, Bunny API, Supabase) and
every tunable (proxy fps/height/crf, duration tolerance, segment length) live in
Vercel (api/match/[action].ts + config/matchVideo.json).
Contract: src/lib/shared/matchJob/contract.ts · design: docs/diseno-partido-completo.md §6.

Flow for one job and one dispatch epoch:
  match_start (web endpoint, Bearer API_KEY)   → spawn transcode_and_upload(jobId, epoch)
  transcode_and_upload (cpu=2, 4 GiB, ~2 h)
      op=begin → {action: transcode | advance | stop}
      source URL checked against the host allowlist (video_url_guard, #288)
        → HLS variant pick (or MP4) → ffmpeg proxy with the recipe of match_proxy.py
          (no audio, fps / height / crf from the begin reply, +faststart)
        → continuity check (no lost HLS segment, no repeated-frame holes)
        → ffprobe: one h264 video stream, no audio, duration vs Bunny length (± tol.)
      op=upload_session {bytes, mime, sha256, durationSec} → {uploadUrl}
      Gemini resumable 'upload, finalize' (on error: 'query' + resume from offset)
      op=proxy_ready {file, bytes, sha256, durationSec}
      a heartbeat thread posts op=heartbeat every 60 s during ffmpeg + upload
      → spawn drive(jobId, epoch)
  drive (cpu=0.25, 1 GiB, 3 h): op=advance loop honouring retryAfterSec until a
      terminal state (split out so the 2 reserved cores are not billed while
      Vercel works through the segments: https://modal.com/pricing)
  tick (modal.Period(minutes=5)): op=tick, the global durable driver.
  spike_proxy + `modal run vision-pipeline/match_worker.py::spike` (operator only):
      the same allowlist + proxy on Modal CPU from a Bunny URL, WITHOUT Vercel and
      WITHOUT Gemini (Phase 0 checks while the analysis stays off; optional copy of
      the proxy for the observation validation harness).

Whether the analysis runs is decided by Vercel (MATCH_VIDEO_ENABLED, OFF unless
the exact string "true"); the worker never reads that flag.

Every call is POST {step URL} signed with
  X-Vitas-Timestamp = unix seconds (10 digits)
  X-Vitas-Signature = hex(HMAC_SHA256(MODAL_CALLBACK_SECRET, ts + "." + rawBody))
A {superseded: true} reply, {action: "stop"} or a terminal state ends the worker
without touching anything. A fatal worker error is reported with op=fail.

Secrets (Modal secret `vitas-api-key`, NEVER from the request):
  API_KEY, MODAL_CALLBACK_SECRET, BUNNY_CDN_HOSTNAME (+ the optional allowlist keys
  read by video_url_guard), and the step URL: VITAS_MATCH_STEP_URL (full URL) or,
  if unset, VITAS_PUBLIC_URL + /api/match/step.
No Gemini, Anthropic, Supabase or Bunny API key ever reaches this worker. The
Gemini upload URL is a capability URL minted by Vercel: treated as a secret and
never logged, like the (possibly signed) Bunny source URL.

Tests (no network, no ffmpeg, no Modal): vision-pipeline/test_match_worker.py.
Deploy and operator checklist: vision-pipeline/README.md.
"""

from __future__ import annotations

import dataclasses
import hashlib
import hmac
import json
import math
import os
import re
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Protocol
from urllib.parse import urljoin, urlsplit

import httpx
import modal

# The proxy recipe and its integrity checks: ONE implementation shared with the
# local CLI of the validation harness (inv. #7). Re-exported names are used by tests.
from match_proxy import (  # noqa: F401  (re-exported)
    FFMPEG_THREADS,
    HLS_SEG_MAX_RETRY,
    ProxyError,
    ProxyFacts,
    ProxySpec,
    build_ffmpeg_cmd,
    build_ffprobe_cmd,
    check_ffmpeg_result,
    classify_ffmpeg_failure,
    detect_hls_seg_retry,
    duration_within_tolerance,
    inspect_proxy,
    parse_ffprobe,
    parse_progress_line,
    proxy_spec_json,
    run_ffmpeg,
)
from video_url_guard import (
    VideoUrlRejected,
    assert_allowed_video_url,
    is_internal_host,
    open_allowed_stream,
    video_host_policy,
)

try:  # only the web image ships FastAPI; the other containers never serve the endpoint
    from fastapi import Header
except ImportError:  # pragma: no cover - worker image / pytest without FastAPI

    def Header(default: Any = None, **_kwargs: Any) -> Any:  # type: ignore[no-redef]
        return default


# ═════════════════════════════════════════════════════════════════════════════
# Protocol constants — mirror src/lib/shared/matchJob/contract.ts.
# test_match_worker.py parses the contract and fails on any drift.
# ═════════════════════════════════════════════════════════════════════════════

MATCH_JOB_CONTRACT_VERSION = "match-job.v1"
STEP_ROUTE = "/api/match/step"  # MATCH_API_ROUTES.step
STEP_SIGNATURE_HEADER = "X-Vitas-Signature"
STEP_TIMESTAMP_HEADER = "X-Vitas-Timestamp"
WORKER_HEARTBEAT_INTERVAL_SEC = 60
MATCH_TICK_PERIOD_MIN = 5
GEMINI_UPLOAD_HOST = "generativelanguage.googleapis.com"
GEMINI_DISPLAY_NAME_PREFIX = "vitas-match-"
STEP_RETRY_AFTER_MAX_SEC = 300  # stepAdvanceReplySchema.retryAfterSec max

MATCH_JOB_STATUSES = (
    "awaiting_encode",
    "dispatched",
    "preparing",
    "uploading",
    "gemini_processing",
    "observing",
    "aggregating",
    "reporting",
    "completed",
    "failed",
    "cancelled",
)
TERMINAL_MATCH_JOB_STATUSES = ("completed", "failed", "cancelled")
WORKER_FAIL_CODES = (
    "source_forbidden",
    "source_unavailable",
    "transcode_failed",
    "duration_mismatch",
    "upload_failed",
    "deadline_exceeded",
    "internal",
)
FAIL_REASON_MAX_CHARS = 1000  # stepFailRequestSchema.reason max

# ═════════════════════════════════════════════════════════════════════════════
# Worker-side operational constants (design decisions, docs/diseno-partido-completo.md
# §6.4-6.5). None of them is a metric threshold; the worker has NO product config.
# ═════════════════════════════════════════════════════════════════════════════

APP_NAME = "vitas-match-worker"
TRANSCODE_CPU = 2.0
TRANSCODE_MEMORY_MB = 4096
TRANSCODE_TIMEOUT_SEC = 2 * 3600
DRIVE_CPU = 0.25
DRIVE_MEMORY_MB = 1024
DRIVE_TIMEOUT_SEC = 3 * 3600
LIGHT_CPU = 0.125  # Modal minimum request; match_start + tick only sign and POST
LIGHT_MEMORY_MB = 256
# Hard CPU ceilings: Modal bills max(request, usage), so a ceiling caps the bill.
TRANSCODE_CPU_LIMIT = TRANSCODE_CPU
LIGHT_CPU_LIMIT = 0.5
# Cost backstops. Vercel already caps active jobs (config maxActiveJobsGlobal = 2);
# these only stop a bug from fanning out containers.
MAX_CONCURRENT_TRANSCODES = 2
MAX_CONCURRENT_DRIVERS = 4
SCALEDOWN_WINDOW_SEC = 2  # one-shot spawns: do not keep a reserved container idle
# Room left before the Modal timeout for one last step call (Vercel maxDuration 300 s).
DEADLINE_MARGIN_SEC = 330
STEP_REQUEST_TIMEOUT_SEC = 320  # > Vercel maxDuration (300 s) of one advance unit
HEARTBEAT_REQUEST_TIMEOUT_SEC = 30
TICK_TIMEOUT_SEC = 330
# Backoff on 5xx / 504 / 429 / network errors, then 60 s until the deadline (§6.4).
STEP_BACKOFF_SEC = (5, 10, 20, 40, 60)
FAIL_REPORT_BUDGET_SEC = 120  # best-effort op=fail after a fatal error
SOURCE_FETCH_ATTEMPTS = 3
SOURCE_FETCH_TIMEOUT_SEC = 60.0
PLAYLIST_MAX_BYTES = 4 * 1024 * 1024
UPLOAD_MAX_ATTEMPTS = 5  # CLAUDE.md: at most 5 attempts per sub-problem
UPLOAD_BACKOFF_SEC = (5, 10, 20, 40)
UPLOAD_READ_CHUNK_BYTES = 1024 * 1024
# ffmpeg threads (match_proxy.FFMPEG_THREADS) = the cores reserved for the transcode.
if FFMPEG_THREADS != int(TRANSCODE_CPU):  # pragma: no cover - guards an edit to either constant
    raise RuntimeError("match_proxy.FFMPEG_THREADS must equal TRANSCODE_CPU")
# spike_proxy: largest proxy it hands back to `modal run … --save-proxy` (operator tool;
# a 90-min proxy is estimated at 30–160 MB, docs/diseno-partido-completo.md §15).
SPIKE_RETURN_MAX_BYTES = 256 * 1024 * 1024

HLS_CONTENT_TYPES = frozenset(
    {"application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl"}
)

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_TS_RE = re.compile(r"^\d{10}$")
_VARIANT_RE = re.compile(r"^(\d{3,4})p$")
_GEMINI_FILE_NAME_RE = re.compile(r"^files/[A-Za-z0-9_-]+$")
_BAD_URL_CHARS = re.compile(r"[\s\\\x00-\x1f\x7f]")
_HLS_ATTR_RE = re.compile(r'([A-Z0-9-]+)=("[^"]*"|[^,]*)')
_PATH_HEIGHT_RE = re.compile(r"(?:^|/)(\d{3,4})p(?:/|\.|$)")
_URL_IN_TEXT_RE = re.compile(r"\b[a-zA-Z][a-zA-Z0-9+.\-]*://[^\s'\"<>]+")
_SECRETISH_RE = re.compile(
    r"(?i)\b(token|bcdn_token|signature|sig|key|api_key|expires|upload_id|authorization)=[^\s&'\"]+"
)


def _log(msg: str) -> None:
    print(f"[{APP_NAME}] {msg}", flush=True)


# ═════════════════════════════════════════════════════════════════════════════
# Errors
# ═════════════════════════════════════════════════════════════════════════════


class WorkerConfigError(Exception):
    """The Modal secret lacks something the worker needs (names only, never values)."""


class StepError(Exception):
    """Base for every outcome of a step call that is not a usable reply."""


class Superseded(StepError):
    """{superseded: true}: another epoch owns the job. Exit without touching anything."""


class JobStopped(StepError):
    """{action: "stop"} or a terminal state: exit quietly."""


class StepUnauthorized(StepError):
    """401: the shared secret is misaligned. Exit (op=fail would be rejected too)."""


class StepRejected(StepError):
    """400/404/other 4xx or a redirect: exit and log (design §6.4)."""

    def __init__(self, status: int, code: Optional[str]) -> None:
        super().__init__(f"HTTP {status}" + (f" ({code})" if code else ""))
        self.status = status
        self.code = code


class StepTransientError(StepError):
    """5xx / 504 / 429 / network error on a single-attempt call (heartbeat, tick)."""


class StepDeadlineExceeded(StepError):
    """Retries ran into the overall deadline."""


class StepProtocolError(StepError):
    """A 2xx whose body does not match the contract."""


class WorkerFailure(Exception):
    """Fatal worker error reported to Vercel as op=fail {code, reason}."""

    def __init__(self, code: str, reason: str) -> None:
        if code not in WORKER_FAIL_CODES:
            code = "internal"
        super().__init__(f"{code}: {reason}")
        self.code = code
        self.reason = reason


class _UploadAborted(Exception):
    """The heartbeat thread asked the upload to stop (superseded / stop / deadline)."""


# ═════════════════════════════════════════════════════════════════════════════
# Redaction · HMAC · step URL
# ═════════════════════════════════════════════════════════════════════════════


def redact(text: object, limit: int = FAIL_REASON_MAX_CHARS) -> str:
    """No URLs, query strings or token-looking pairs; one line; ≤ limit chars."""
    s = _URL_IN_TEXT_RE.sub("<url>", str(text))
    s = _SECRETISH_RE.sub(lambda m: f"{m.group(1)}=<redacted>", s)
    s = " ".join(s.split())
    return s[:limit].strip()


def canonical_json(obj: Mapping[str, Any]) -> bytes:
    """The exact bytes that are sent AND signed (contract: never re-serialise)."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def sign_step(secret: str, ts: str, raw_body: bytes) -> str:
    """hex(HMAC_SHA256(secret, ts + "." + rawBody)), lowercase (STEP_HMAC_TEST_VECTORS)."""
    return hmac.new(secret.encode("utf-8"), ts.encode("ascii") + b"." + raw_body, hashlib.sha256).hexdigest()


def step_headers(secret: str, raw_body: bytes, now: float) -> dict[str, str]:
    ts = str(int(now))
    if not _TS_RE.match(ts):
        raise ValueError("unix timestamp must have 10 digits")
    return {
        "Content-Type": "application/json",
        STEP_TIMESTAMP_HEADER: ts,
        STEP_SIGNATURE_HEADER: sign_step(secret, ts, raw_body),
    }


def _assert_public_https(url: str, what: str) -> str:
    if not url or len(url) > 2048 or _BAD_URL_CHARS.search(url):
        raise WorkerConfigError(f"{what}: URL vacía o con caracteres no permitidos")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise WorkerConfigError(f"{what}: URL no válida") from None
    host = (parts.hostname or "").rstrip(".").lower()
    if parts.scheme != "https" or not host or is_internal_host(host):
        raise WorkerConfigError(f"{what}: debe ser https a un host público")
    if parts.username is not None or parts.password is not None or (port is not None and port != 443):
        raise WorkerConfigError(f"{what}: sin credenciales ni puerto no estándar")
    if parts.query or parts.fragment:
        raise WorkerConfigError(f"{what}: sin query ni fragmento")
    return url


def resolve_step_url(env: Mapping[str, str]) -> str:
    """VITAS_MATCH_STEP_URL, else VITAS_PUBLIC_URL + /api/match/step. Never from a request."""
    explicit = (env.get("VITAS_MATCH_STEP_URL") or "").strip()
    if explicit:
        return _assert_public_https(explicit, "VITAS_MATCH_STEP_URL")
    base = (env.get("VITAS_PUBLIC_URL") or "").strip().rstrip("/")
    if not base:
        raise WorkerConfigError("VITAS_MATCH_STEP_URL o VITAS_PUBLIC_URL no está en el secret de Modal")
    _assert_public_https(base, "VITAS_PUBLIC_URL")
    return base + STEP_ROUTE


def missing_worker_env(env: Mapping[str, str]) -> list[str]:
    """Names (never values) of what a dispatched worker would need but cannot find."""
    missing: list[str] = []
    if not (env.get("MODAL_CALLBACK_SECRET") or "").strip():
        missing.append("MODAL_CALLBACK_SECRET")
    try:
        resolve_step_url(env)
    except WorkerConfigError:
        missing.append("VITAS_MATCH_STEP_URL|VITAS_PUBLIC_URL")
    try:
        video_host_policy(env)
    except VideoUrlRejected:
        missing.append("BUNNY_CDN_HOSTNAME")
    return missing


def assert_gemini_upload_url(url: object) -> str:
    """The resumable session URL may only point at the Gemini upload host (contract)."""
    if not isinstance(url, str) or not url or len(url) > 8192 or _BAD_URL_CHARS.search(url):
        raise WorkerFailure("upload_failed", "uploadUrl vacía o con caracteres no permitidos")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise WorkerFailure("upload_failed", "uploadUrl no es una URL válida") from None
    host = (parts.hostname or "").rstrip(".").lower()
    if (
        parts.scheme != "https"
        or host != GEMINI_UPLOAD_HOST
        or parts.username is not None
        or parts.password is not None
        or (port is not None and port != 443)
    ):
        raise WorkerFailure("upload_failed", "uploadUrl fuera de https://generativelanguage.googleapis.com")
    return url


# ═════════════════════════════════════════════════════════════════════════════
# Step client (worker → Vercel)
# ═════════════════════════════════════════════════════════════════════════════


def parse_envelope(payload: object) -> dict[str, Any]:
    """{ok: true, data: {...}} → data; {superseded: true} raises Superseded."""
    if not isinstance(payload, dict) or payload.get("ok") is not True or not isinstance(payload.get("data"), dict):
        raise StepProtocolError("respuesta de step sin envoltorio {ok: true, data}")
    data: dict[str, Any] = payload["data"]
    if data.get("superseded") is True:
        raise Superseded("superseded")
    return data


def _error_code(resp: httpx.Response) -> Optional[str]:
    try:
        body = resp.json()
    except ValueError:
        return None
    err = body.get("error") if isinstance(body, dict) else None
    code = err.get("code") if isinstance(err, dict) else None
    return redact(code, 80) if isinstance(code, str) else None


class StepClient:
    """Signs and POSTs step ops; maps HTTP outcomes to the design §6.4 behaviour."""

    def __init__(
        self,
        url: str,
        secret: str,
        *,
        http: Optional[httpx.Client] = None,
        timeout: float = STEP_REQUEST_TIMEOUT_SEC,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
        backoff: tuple[int, ...] = STEP_BACKOFF_SEC,
    ) -> None:
        if not secret:
            raise WorkerConfigError("MODAL_CALLBACK_SECRET no está en el secret de Modal")
        self.url = url
        self._secret = secret
        self._owns_http = http is None
        self._http = http or httpx.Client(timeout=timeout, follow_redirects=False)
        self._clock = clock
        self._sleep = sleep
        self._backoff = backoff

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def post(self, body: Mapping[str, Any], *, deadline: Optional[float] = None, retry: bool = True) -> dict[str, Any]:
        raw = canonical_json(body)
        attempt = 0
        while True:
            headers = step_headers(self._secret, raw, self._clock())  # fresh ts per attempt
            try:
                resp = self._http.post(self.url, content=raw, headers=headers, follow_redirects=False)
            except httpx.TransportError as err:
                problem = f"error de red ({type(err).__name__})"
            else:
                status = resp.status_code
                if 200 <= status < 300:
                    try:
                        payload = resp.json()
                    except ValueError:
                        raise StepProtocolError("respuesta de step no es JSON") from None
                    return parse_envelope(payload)
                if status == 401:
                    raise StepUnauthorized("HTTP 401 (MODAL_CALLBACK_SECRET desalineado)")
                if status not in (408, 425, 429) and status < 500:
                    raise StepRejected(status, _error_code(resp))
                problem = f"HTTP {status}"
            if not retry:
                raise StepTransientError(problem)
            wait = self._backoff[min(attempt, len(self._backoff) - 1)]
            attempt += 1
            if deadline is not None and self._clock() + wait > deadline:
                raise StepDeadlineExceeded(f"plazo agotado tras {attempt} intentos ({problem})")
            _log(f"op={body.get('op')} {problem}; reintento en {wait}s")
            self._sleep(wait)


# ═════════════════════════════════════════════════════════════════════════════
# Reply parsing (lenient on extra keys, strict on what the worker relies on)
# ═════════════════════════════════════════════════════════════════════════════


def _is_int(v: object) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _is_number(v: object) -> bool:
    return (isinstance(v, (int, float)) and not isinstance(v, bool)) and math.isfinite(v)


def _state(data: Mapping[str, Any]) -> str:
    state = data.get("state")
    if state not in MATCH_JOB_STATUSES:
        raise StepProtocolError("estado de job desconocido en la respuesta")
    return state


@dataclass(frozen=True)
class TranscodePlan:
    source_url: str = field(repr=False)  # may be signed: never printed
    target_variant: str
    target_height: int
    proxy: ProxySpec
    # Bunny API `length` (always present in op=begin; None only in the operator spike).
    expected_duration_sec: Optional[float] = None
    source_url_expires_at: Optional[str] = None


@dataclass(frozen=True)
class BeginDecision:
    action: str  # "transcode" | "advance" | "stop"
    state: Optional[str] = None
    plan: Optional[TranscodePlan] = None


def parse_proxy_spec(obj: object) -> ProxySpec:
    if not isinstance(obj, dict):
        raise StepProtocolError("proxy ausente en begin")
    if obj.get("container") != "mp4" or obj.get("videoCodec") != "h264":
        raise StepProtocolError("proxy: solo mp4/h264")
    if obj.get("audio") is not False:
        # Contract pins audio:false. The worker strips audio regardless (-an), but a
        # spec asking for audio is a server bug: refuse instead of guessing.
        raise StepProtocolError("proxy.audio debe ser false")
    fps, height, crf, tol = obj.get("fps"), obj.get("maxHeight"), obj.get("crf"), obj.get("durationToleranceSec")
    if not (_is_number(fps) and fps > 0):
        raise StepProtocolError("proxy.fps inválido")
    if not (_is_int(height) and height > 0):
        raise StepProtocolError("proxy.maxHeight inválido")
    if not (_is_int(crf) and 0 <= crf <= 51):
        raise StepProtocolError("proxy.crf inválido")
    if not (_is_number(tol) and tol >= 0):
        raise StepProtocolError("proxy.durationToleranceSec inválido")
    return ProxySpec(fps=float(fps), max_height=int(height), crf=int(crf), duration_tolerance_sec=float(tol))


def parse_begin_reply(data: Mapping[str, Any], epoch: int) -> BeginDecision:
    reply_epoch = data.get("epoch")
    if not _is_int(reply_epoch):
        raise StepProtocolError("begin sin epoch")
    if reply_epoch != epoch:
        raise Superseded(f"begin respondió epoch {reply_epoch}, este worker es {epoch}")
    action = data.get("action")
    if action == "stop":
        return BeginDecision(action="stop", state=_state(data))
    if action == "advance":
        return BeginDecision(action="advance")
    if action != "transcode":
        raise StepProtocolError("begin con action desconocida")
    source_url = data.get("sourceUrl")
    if not isinstance(source_url, str) or not source_url.startswith("https://"):
        raise StepProtocolError("begin.sourceUrl no es https")
    expires = data.get("sourceUrlExpiresAt")
    if expires is not None and not isinstance(expires, str):
        raise StepProtocolError("begin.sourceUrlExpiresAt inválido")
    variant = data.get("targetVariant")
    m = _VARIANT_RE.match(variant) if isinstance(variant, str) else None
    if not m:
        raise StepProtocolError("begin.targetVariant inválido")
    expected = data.get("expectedDurationSec")
    if not (_is_number(expected) and expected > 0):
        raise StepProtocolError("begin.expectedDurationSec inválido")
    plan = TranscodePlan(
        source_url=source_url,
        source_url_expires_at=expires,
        target_variant=variant,
        target_height=int(m.group(1)),
        expected_duration_sec=float(expected),
        proxy=parse_proxy_spec(data.get("proxy")),
    )
    return BeginDecision(action="transcode", plan=plan)


@dataclass(frozen=True)
class HeartbeatReply:
    action: str
    state: str


def parse_heartbeat_reply(data: Mapping[str, Any]) -> HeartbeatReply:
    action = data.get("action")
    if action not in ("continue", "stop"):
        raise StepProtocolError("heartbeat con action desconocida")
    return HeartbeatReply(action=action, state=_state(data))


@dataclass(frozen=True)
class UploadSession:
    upload_url: str = field(repr=False)  # capability URL: never printed
    display_name: str = ""
    chunk_granularity_bytes: Optional[int] = None


def parse_upload_session_reply(data: Mapping[str, Any]) -> UploadSession:
    upload_url = assert_gemini_upload_url(data.get("uploadUrl"))
    display_name = data.get("displayName")
    if not isinstance(display_name, str) or not display_name.startswith(GEMINI_DISPLAY_NAME_PREFIX):
        raise StepProtocolError("upload_session.displayName inválido")
    granularity = data.get("chunkGranularityBytes")
    if granularity is not None and not (_is_int(granularity) and granularity > 0):
        raise StepProtocolError("upload_session.chunkGranularityBytes inválido")
    return UploadSession(upload_url=upload_url, display_name=display_name, chunk_granularity_bytes=granularity)


@dataclass(frozen=True)
class AdvanceReply:
    state: str
    retry_after_sec: int


def parse_advance_reply(data: Mapping[str, Any]) -> AdvanceReply:
    state = _state(data)
    wait = data.get("retryAfterSec")
    if not (_is_int(wait) and 0 <= wait <= STEP_RETRY_AFTER_MAX_SEC):
        raise StepProtocolError("advance.retryAfterSec fuera de 0..300")
    return AdvanceReply(state=state, retry_after_sec=wait)


def parse_state_reply(data: Mapping[str, Any]) -> str:
    return _state(data)


# ═════════════════════════════════════════════════════════════════════════════
# Source: allowlist + HLS variant selection (no product logic, no config)
# ═════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class HlsVariant:
    url: str = field(repr=False)
    height: Optional[int]
    bandwidth: Optional[int]


@dataclass(frozen=True)
class ResolvedSource:
    input_url: str = field(repr=False)  # may be signed: never printed
    kind: str = "hls"  # "hls" | "mp4"
    height: Optional[int] = None
    segments: Optional[int] = None


def _hls_attrs(line: str) -> dict[str, str]:
    body = line.split(":", 1)[1] if ":" in line else ""
    return {k: v.strip('"') for k, v in _HLS_ATTR_RE.findall(body)}


def _variant_height(attrs: Mapping[str, str], uri: str) -> Optional[int]:
    res = attrs.get("RESOLUTION", "")
    if "x" in res:
        _w, _, h = res.lower().partition("x")
        if h.isdigit():
            return int(h)
    m = _PATH_HEIGHT_RE.search(urlsplit(uri).path)
    return int(m.group(1)) if m else None


def parse_hls_playlist(text: str, base_url: str) -> tuple[str, list[Any]]:
    """("master", [HlsVariant]) or ("media", [absolute URI of every resource ffmpeg reads])."""
    lines = [ln.strip() for ln in text.splitlines()]
    if not lines or not lines[0].lstrip("﻿").startswith("#EXTM3U"):
        raise WorkerFailure("source_unavailable", "el origen no es una playlist HLS (#EXTM3U)")
    if any(ln.startswith("#EXT-X-STREAM-INF") for ln in lines):
        variants: list[HlsVariant] = []
        pending: Optional[dict[str, str]] = None
        for ln in lines[1:]:
            if ln.startswith("#EXT-X-STREAM-INF"):
                pending = _hls_attrs(ln)
            elif ln and not ln.startswith("#") and pending is not None:
                bw = pending.get("BANDWIDTH", "")
                variants.append(
                    HlsVariant(
                        url=urljoin(base_url, ln),
                        height=_variant_height(pending, ln),
                        bandwidth=int(bw) if bw.isdigit() else None,
                    )
                )
                pending = None
        return "master", variants
    uris: list[str] = []
    for ln in lines[1:]:
        if not ln:
            continue
        if ln.startswith("#"):
            if ln.startswith(("#EXT-X-KEY", "#EXT-X-MAP", "#EXT-X-SESSION-KEY")):
                uri = _hls_attrs(ln).get("URI")
                if uri:
                    uris.append(urljoin(base_url, uri))
            continue
        uris.append(urljoin(base_url, ln))
    return "media", uris


def select_variant(variants: list[HlsVariant], target_height: int) -> HlsVariant:
    """Smallest variant whose height is ≥ target (ties → lowest bandwidth). Never upscales."""
    eligible = [v for v in variants if v.height is not None and v.height >= target_height]
    if not eligible:
        raise WorkerFailure("source_unavailable", f"no hay variante HLS de al menos {target_height}p")
    return min(eligible, key=lambda v: (v.height, v.bandwidth if v.bandwidth is not None else math.inf))


def _read_text_capped(resp: httpx.Response, cap: int) -> str:
    buf = bytearray()
    for chunk in resp.iter_bytes(chunk_size=64 * 1024):
        buf.extend(chunk)
        if len(buf) > cap:
            raise WorkerFailure("source_unavailable", f"playlist HLS mayor de {cap} bytes")
    return buf.decode("utf-8", errors="replace")


def _content_type(resp: httpx.Response) -> str:
    return (resp.headers.get("content-type") or "").split(";")[0].strip().lower()


_ALLOWLIST_REASONS = frozenset({"video_url_invalid", "video_url_not_allowed", "redirect_not_allowed"})


def source_failure(err: VideoUrlRejected) -> WorkerFailure:
    """Allowlist / CDN rejection → op=fail code (contract WORKER_FAIL_CODES).

    401/403 → source_forbidden; other HTTP errors → source_unavailable; an allowlist
    rejection means Vercel built a URL this worker does not trust (config drift
    between the Vercel env and the Modal secret) → internal, with the reason code.
    """
    if err.reason == "video_hosts_not_configured":
        return WorkerFailure("internal", "BUNNY_CDN_HOSTNAME no está en el secret de Modal (allowlist vacía)")
    if err.http_status in (401, 403):
        return WorkerFailure(
            "source_forbidden", f"el CDN respondió HTTP {err.http_status} (token auth o referrer rules de Bunny)"
        )
    if err.http_status is not None:
        return WorkerFailure("source_unavailable", f"el CDN respondió HTTP {err.http_status}")
    if err.reason in _ALLOWLIST_REASONS:
        return WorkerFailure("internal", f"origen rechazado por la allowlist de hosts ({err.reason})")
    return WorkerFailure("source_unavailable", f"origen no disponible ({err.reason})")


def resolve_source(
    source_url: str,
    target_height: int,
    *,
    env: Optional[Mapping[str, str]] = None,
    client: Optional[httpx.Client] = None,
) -> ResolvedSource:
    """Validate the source, pick the HLS variant, and check every host ffmpeg will open."""
    with open_allowed_stream(source_url, env=env, client=client, timeout=SOURCE_FETCH_TIMEOUT_SEC) as (final_url, r):
        ctype = _content_type(r)
        if urlsplit(final_url).path.lower().endswith(".m3u8") or ctype in HLS_CONTENT_TYPES:
            text = _read_text_capped(r, PLAYLIST_MAX_BYTES)
        elif ctype.startswith("video/"):
            return ResolvedSource(input_url=final_url, kind="mp4")
        else:
            raise WorkerFailure("source_unavailable", f"el origen no es HLS ni vídeo (content-type {ctype or 'ausente'})")
    kind, items = parse_hls_playlist(text, final_url)
    height: Optional[int] = None
    media_url = final_url
    if kind == "master":
        variant = select_variant(items, target_height)
        height = variant.height
        with open_allowed_stream(variant.url, env=env, client=client, timeout=SOURCE_FETCH_TIMEOUT_SEC) as (
            media_url,
            r2,
        ):
            text = _read_text_capped(r2, PLAYLIST_MAX_BYTES)
        kind, items = parse_hls_playlist(text, media_url)
        if kind != "media":
            raise WorkerFailure("source_unavailable", "la variante HLS es otra playlist maestra")
    if not items:
        raise WorkerFailure("source_unavailable", "playlist HLS sin segmentos")
    for uri in items:  # ffmpeg will open each of these: same allowlist, before any byte of video
        assert_allowed_video_url(uri, env)
    return ResolvedSource(input_url=media_url, kind="hls", height=height, segments=len(items))


def resolve_source_with_retries(
    plan: TranscodePlan,
    *,
    env: Optional[Mapping[str, str]],
    client: Optional[httpx.Client],
    sleep: Callable[[float], None],
) -> ResolvedSource:
    for attempt in range(1, SOURCE_FETCH_ATTEMPTS + 1):
        try:
            return resolve_source(plan.source_url, plan.target_height, env=env, client=client)
        except VideoUrlRejected as err:
            transient = err.http_status is not None and err.http_status >= 500
            if not transient or attempt == SOURCE_FETCH_ATTEMPTS:
                raise source_failure(err) from None
            problem = f"HTTP {err.http_status}"
        except httpx.TransportError as err:
            if attempt == SOURCE_FETCH_ATTEMPTS:
                raise WorkerFailure("source_unavailable", f"error de red con el CDN ({type(err).__name__})") from None
            problem = type(err).__name__
        wait = STEP_BACKOFF_SEC[attempt - 1]
        _log(f"origen: {problem}; reintento {attempt + 1}/{SOURCE_FETCH_ATTEMPTS} en {wait}s")
        sleep(wait)
    raise WorkerFailure("source_unavailable", "origen no disponible")  # unreachable


# ═════════════════════════════════════════════════════════════════════════════
# Proxy: recipe, ffmpeg run, continuity + ffprobe checks live in match_proxy.py
# (imported above). The worker only picks the input and maps ProxyError codes.
# ═════════════════════════════════════════════════════════════════════════════


class ProxyDeps(Protocol):
    """What make_proxy needs; provided by the job's Deps and by the operator spike's SpikeDeps."""

    env: Mapping[str, str]
    http: httpx.Client
    popen: Callable[..., Any]
    run: Callable[..., Any]
    sleep: Callable[[float], None]


def make_proxy(
    plan: TranscodePlan, out_dir: str, deps: ProxyDeps, state: RunState, tag: str
) -> tuple[ResolvedSource, ProxyFacts, str]:
    """Allowlisted source → proxy.mp4 in out_dir → checks. WorkerFailure on any problem."""
    source = resolve_source_with_retries(plan, env=deps.env, client=deps.http, sleep=deps.sleep)
    state.raise_if_stopped()
    seg_retry = source.kind == "hls" and detect_hls_seg_retry(deps.run)
    _log(
        f"{tag} origen {source.kind}"
        + (f" {source.height}p" if source.height else "")
        + (f" · {source.segments} segmentos" if source.segments else "")
        + (f" · seg_max_retry={HLS_SEG_MAX_RETRY}" if seg_retry else "")
    )
    proxy_path = os.path.join(out_dir, "proxy.mp4")
    cmd = build_ffmpeg_cmd(
        source.input_url,
        proxy_path,
        plan.proxy,
        hls_seg_max_retry=HLS_SEG_MAX_RETRY if seg_retry else None,
    )

    def _progress(sec: float) -> None:
        state.processed_sec = sec

    rc, log = run_ffmpeg(
        cmd, popen=deps.popen, on_start=state.attach_process, on_exit=state.detach_process, on_progress=_progress
    )
    state.raise_if_stopped()  # a kill requested by the heartbeat is not a transcode failure
    try:
        check_ffmpeg_result(rc, log, plan.proxy, hls_seg_retry=seg_retry)
        facts = inspect_proxy(proxy_path, plan.proxy, plan.expected_duration_sec, log, run=deps.run)
    except ProxyError as err:
        raise WorkerFailure(err.code, err.reason) from None
    if log.corrupt_packets:
        _log(f"{tag} aviso: {log.corrupt_packets} líneas de paquetes corruptos en el origen (el decodificador los oculta)")
    _log(f"{tag} proxy {facts.bytes} B · {facts.duration_sec:.1f} s · {facts.repeated_frames} fotogramas repetidos")
    return source, facts, proxy_path


# ═════════════════════════════════════════════════════════════════════════════
# Gemini resumable upload (the URL is minted by Vercel; no key here)
# ═════════════════════════════════════════════════════════════════════════════


def parse_upload_query(headers: Mapping[str, str], total_bytes: int) -> tuple[str, Optional[int]]:
    """'query' reply → (status, bytes received). status ∈ active | final | cancelled."""
    h = {str(k).lower(): str(v).strip() for k, v in headers.items()}
    status = h.get("x-goog-upload-status", "").lower()
    if status not in ("active", "final", "cancelled"):
        raise WorkerFailure("upload_failed", "estado de subida desconocido en la respuesta de Gemini")
    if status != "active":
        return status, None
    received = h.get("x-goog-upload-size-received", "")
    if not received.isdigit() or int(received) > total_bytes:
        raise WorkerFailure("upload_failed", "X-Goog-Upload-Size-Received ausente o fuera de rango")
    return status, int(received)


def parse_gemini_file(payload: object) -> dict[str, str]:
    """Finalize reply → {name, uri} exactly as geminiFileRefSchema requires."""
    f = payload.get("file") if isinstance(payload, dict) else None
    name = f.get("name") if isinstance(f, dict) else None
    uri = f.get("uri") if isinstance(f, dict) else None
    if not isinstance(name, str) or not _GEMINI_FILE_NAME_RE.match(name):
        raise WorkerFailure("upload_failed", "Gemini no devolvió file.name válido")
    if not isinstance(uri, str) or not uri.startswith(f"https://{GEMINI_UPLOAD_HOST}/") or _BAD_URL_CHARS.search(uri):
        raise WorkerFailure("upload_failed", "Gemini no devolvió file.uri en generativelanguage.googleapis.com")
    return {"name": name, "uri": uri}


def _iter_file(
    path: str,
    offset: int,
    on_progress: Callable[[int], None],
    should_abort: Callable[[], bool],
) -> Iterator[bytes]:
    with open(path, "rb") as f:
        f.seek(offset)
        sent = offset
        for chunk in iter(lambda: f.read(UPLOAD_READ_CHUNK_BYTES), b""):
            if should_abort():
                raise _UploadAborted()
            yield chunk
            sent += len(chunk)
            on_progress(sent)


def upload_proxy(
    path: str,
    upload_url: str,
    total_bytes: int,
    *,
    http: httpx.Client,
    should_abort: Callable[[], bool],
    on_progress: Callable[[int], None],
    sleep: Callable[[float], None],
    max_attempts: int = UPLOAD_MAX_ATTEMPTS,
) -> dict[str, str]:
    """Stream the proxy with 'upload, finalize'; on error, 'query' and resume from the offset."""
    assert_gemini_upload_url(upload_url)
    offset = 0
    problem = ""
    for attempt in range(max_attempts):
        if attempt > 0:
            wait = UPLOAD_BACKOFF_SEC[min(attempt - 1, len(UPLOAD_BACKOFF_SEC) - 1)]
            _log(f"subida: {problem}; consulta y reanudación {attempt + 1}/{max_attempts} en {wait}s")
            sleep(wait)
            if should_abort():
                raise _UploadAborted()
            try:
                q = http.post(
                    upload_url,
                    content=b"",
                    headers={"X-Goog-Upload-Command": "query", "Content-Length": "0"},
                    follow_redirects=False,
                )
            except httpx.TransportError as err:
                problem = f"query: error de red ({type(err).__name__})"
                continue
            if not 200 <= q.status_code < 300:
                if q.status_code in (408, 429) or q.status_code >= 500:
                    problem = f"query: HTTP {q.status_code}"
                    continue
                raise WorkerFailure("upload_failed", f"Gemini rechazó la consulta de subida: HTTP {q.status_code}")
            status, received = parse_upload_query(q.headers, total_bytes)
            if status == "final":
                try:
                    return parse_gemini_file(q.json())
                except ValueError:
                    raise WorkerFailure("upload_failed", "subida finalizada sin fichero en la respuesta") from None
            if status == "cancelled":
                raise WorkerFailure("upload_failed", "Gemini canceló la sesión de subida")
            offset = received or 0
        remaining = total_bytes - offset
        headers = {
            "Content-Length": str(remaining),
            "X-Goog-Upload-Offset": str(offset),
            "X-Goog-Upload-Command": "upload, finalize",
        }
        content: Any = b"" if remaining == 0 else _iter_file(path, offset, on_progress, should_abort)
        try:
            resp = http.post(upload_url, content=content, headers=headers, follow_redirects=False)
        except _UploadAborted:
            raise
        except httpx.TransportError as err:
            if should_abort():
                raise _UploadAborted() from None
            problem = f"error de red ({type(err).__name__})"
            continue
        if should_abort():
            raise _UploadAborted()
        if 200 <= resp.status_code < 300:
            try:
                return parse_gemini_file(resp.json())
            except ValueError:
                raise WorkerFailure("upload_failed", "respuesta de Gemini no es JSON") from None
        if resp.status_code in (408, 429) or resp.status_code >= 500:
            problem = f"HTTP {resp.status_code}"
            continue
        raise WorkerFailure("upload_failed", f"Gemini rechazó la subida: HTTP {resp.status_code}")
    raise WorkerFailure("upload_failed", f"subida fallida tras {max_attempts} intentos ({problem})")


# ═════════════════════════════════════════════════════════════════════════════
# Run state + heartbeat thread
# ═════════════════════════════════════════════════════════════════════════════


class RunState:
    """Shared between the main thread (ffmpeg / upload) and the heartbeat thread."""

    def __init__(self, phase: str = "transcoding") -> None:
        self._lock = threading.Lock()
        self.phase = phase
        self.processed_sec: Optional[float] = None
        self.uploaded_bytes: Optional[int] = None
        self._stop_reason: Optional[str] = None
        self._proc: Any = None

    @property
    def stop_reason(self) -> Optional[str]:
        return self._stop_reason

    def stopped(self) -> bool:
        return self._stop_reason is not None

    def attach_process(self, proc: Any) -> None:
        with self._lock:
            self._proc = proc
            kill_now = self._stop_reason is not None
        if kill_now:
            _kill(proc)

    def detach_process(self) -> None:
        with self._lock:
            self._proc = None

    def request_stop(self, reason: str) -> None:
        with self._lock:
            if self._stop_reason is None:
                self._stop_reason = reason
            proc = self._proc
        if proc is not None:
            _kill(proc)

    def raise_if_stopped(self) -> None:
        reason = self._stop_reason
        if reason is None:
            return
        if reason == "superseded":
            raise Superseded("heartbeat: superseded")
        if reason == "unauthorized":
            raise StepUnauthorized("heartbeat: HTTP 401")
        if reason == "deadline":
            raise StepDeadlineExceeded("plazo global agotado durante la transcodificación o la subida")
        raise JobStopped(f"heartbeat: {reason}")

    def heartbeat_body(self, job_id: str, epoch: int) -> dict[str, Any]:
        body: dict[str, Any] = {"op": "heartbeat", "jobId": job_id, "epoch": epoch, "phase": self.phase}
        if self.phase == "transcoding" and self.processed_sec is not None:
            body["processedSec"] = round(max(0.0, self.processed_sec), 3)
        if self.phase == "uploading" and self.uploaded_bytes is not None:
            body["uploadedBytes"] = max(0, int(self.uploaded_bytes))
        return body


def _kill(proc: Any) -> None:
    try:
        if proc.poll() is None:
            proc.kill()
    except Exception:  # noqa: BLE001 - best effort; the process may already be gone
        pass


class Heartbeat(threading.Thread):
    """op=heartbeat every interval; stop/superseded/deadline kill the running ffmpeg."""

    def __init__(
        self,
        step: StepClient,
        job_id: str,
        epoch: int,
        state: RunState,
        *,
        deadline: float,
        interval: float = WORKER_HEARTBEAT_INTERVAL_SEC,
        clock: Callable[[], float] = time.time,
    ) -> None:
        super().__init__(name=f"heartbeat-{job_id[:8]}", daemon=True)
        self._step = step
        self._job_id = job_id
        self._epoch = epoch
        self._state = state
        self._deadline = deadline
        self._interval = interval
        self._clock = clock
        self._halt = threading.Event()

    def halt(self) -> None:
        self._halt.set()

    def run(self) -> None:
        while not self._halt.wait(self._interval):
            if self._clock() > self._deadline:
                self._state.request_stop("deadline")
                return
            try:
                data = self._step.post(self._state.heartbeat_body(self._job_id, self._epoch), retry=False)
                reply = parse_heartbeat_reply(data)
            except Superseded:
                self._state.request_stop("superseded")
                return
            except StepUnauthorized:
                self._state.request_stop("unauthorized")
                return
            except StepError as err:  # transient / rejected / protocol: the main flow decides
                _log(f"heartbeat no entregado: {err}")
                continue
            if reply.action == "stop" or reply.state in TERMINAL_MATCH_JOB_STATUSES:
                self._state.request_stop("stop")
                return


# ═════════════════════════════════════════════════════════════════════════════
# Orchestration (pure over injected dependencies → fully testable)
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class Deps:
    step: StepClient
    heartbeat_step: StepClient
    http: httpx.Client
    env: Mapping[str, str]
    spawn_drive: Callable[[str, int], None]
    popen: Callable[..., Any] = subprocess.Popen
    run: Callable[..., Any] = subprocess.run
    clock: Callable[[], float] = time.time
    sleep: Callable[[float], None] = time.sleep
    heartbeat_interval: float = WORKER_HEARTBEAT_INTERVAL_SEC
    tmp_root: Optional[str] = None

    def close(self) -> None:
        self.step.close()
        self.heartbeat_step.close()
        self.http.close()


def build_deps(env: Mapping[str, str], *, spawn_drive: Callable[[str, int], None]) -> Deps:
    step_url = resolve_step_url(env)
    secret = (env.get("MODAL_CALLBACK_SECRET") or "").strip()
    return Deps(
        step=StepClient(step_url, secret, timeout=STEP_REQUEST_TIMEOUT_SEC),
        heartbeat_step=StepClient(step_url, secret, timeout=HEARTBEAT_REQUEST_TIMEOUT_SEC),
        http=httpx.Client(follow_redirects=False, timeout=httpx.Timeout(300.0, connect=30.0)),
        env=env,
        spawn_drive=spawn_drive,
    )


def _job_ref(job_id: str, epoch: int) -> dict[str, Any]:
    return {"jobId": job_id, "epoch": epoch}


def report_fail(deps: Deps, job_id: str, epoch: int, code: str, reason: str) -> None:
    """Best-effort op=fail (never raises)."""
    if code not in WORKER_FAIL_CODES:
        code = "internal"
    body = {"op": "fail", **_job_ref(job_id, epoch), "code": code, "reason": redact(reason) or code}
    try:
        deps.step.post(body, deadline=deps.clock() + FAIL_REPORT_BUDGET_SEC)
        _log(f"job={job_id} epoch={epoch} op=fail code={code}")
    except StepError as err:
        _log(f"job={job_id} epoch={epoch} op=fail no entregado ({type(err).__name__}: {err})")


def _hand_off_to_driver(deps: Deps, job_id: str, epoch: int) -> str:
    """spawn drive; a failed spawn is NOT a job failure: the stale heartbeat makes the tick
    re-dispatch, begin answers action=advance (Gemini file still ACTIVE) and no work is lost."""
    try:
        deps.spawn_drive(job_id, epoch)
    except Exception as err:  # noqa: BLE001 - Modal control-plane error; recovery is by re-dispatch
        _log(f"job={job_id} epoch={epoch} no se pudo lanzar el driver ({type(err).__name__}); el tick re-despachará")
        return "drive_spawn_failed"
    return "handed_to_driver"


def _transcode_upload_and_hand_off(job_id: str, epoch: int, plan: TranscodePlan, deps: Deps, deadline: float) -> str:
    ref = _job_ref(job_id, epoch)
    tag = f"job={job_id} epoch={epoch}"
    state = RunState("transcoding")
    hb = Heartbeat(
        deps.heartbeat_step, job_id, epoch, state, deadline=deadline, interval=deps.heartbeat_interval, clock=deps.clock
    )
    hb.start()
    try:
        with tempfile.TemporaryDirectory(prefix="vitas-match-", dir=deps.tmp_root) as tmp:
            _source, facts, proxy_path = make_proxy(plan, tmp, deps, state, tag)
            upload_session = {
                "op": "upload_session",
                **ref,
                "bytes": facts.bytes,
                "mime": "video/mp4",
                "sha256": facts.sha256,
                "durationSec": facts.duration_sec,
            }
            session = parse_upload_session_reply(deps.step.post(upload_session, deadline=deadline))
            state.raise_if_stopped()
            state.phase = "uploading"
            state.uploaded_bytes = 0

            def _progress(n: int) -> None:
                state.uploaded_bytes = n

            try:
                file_ref = upload_proxy(
                    proxy_path,
                    session.upload_url,
                    facts.bytes,
                    http=deps.http,
                    should_abort=state.stopped,
                    on_progress=_progress,
                    sleep=deps.sleep,
                )
            except _UploadAborted:
                state.raise_if_stopped()
                raise
            state.raise_if_stopped()
    finally:
        # Stop the heartbeat and wait for an in-flight POST before the caller closes its client.
        hb.halt()
        hb.join(timeout=HEARTBEAT_REQUEST_TIMEOUT_SEC + 5)
    proxy_ready = {
        "op": "proxy_ready",
        **ref,
        "file": file_ref,
        "bytes": facts.bytes,
        "sha256": facts.sha256,
        "durationSec": facts.duration_sec,
    }
    state_after = parse_state_reply(deps.step.post(proxy_ready, deadline=deadline))
    if state_after in TERMINAL_MATCH_JOB_STATUSES:  # e.g. cancelled while uploading: no driver
        _log(f"{tag} proxy_ready: el job ya está {state_after}; no lanzo el driver")
        return "stopped"
    outcome = _hand_off_to_driver(deps, job_id, epoch)
    _log(f"{tag} proxy_ready → {outcome}")
    return outcome


def run_transcode_job(job_id: str, epoch: int, deps: Deps) -> str:
    """begin → transcode → upload → proxy_ready → spawn the driver. Returns an outcome tag."""
    deadline = deps.clock() + TRANSCODE_TIMEOUT_SEC - DEADLINE_MARGIN_SEC
    try:
        begin = parse_begin_reply(deps.step.post({"op": "begin", **_job_ref(job_id, epoch)}, deadline=deadline), epoch)
        if begin.action == "stop":
            _log(f"job={job_id} epoch={epoch} begin: stop ({begin.state})")
            return "stopped"
        if begin.action == "advance":  # Gemini file still ACTIVE: skip the transcode
            return _hand_off_to_driver(deps, job_id, epoch)
        assert begin.plan is not None
        return _transcode_upload_and_hand_off(job_id, epoch, begin.plan, deps, deadline)
    except Superseded:
        _log(f"job={job_id} epoch={epoch} superseded: salgo sin tocar nada")
        return "superseded"
    except JobStopped:
        return "stopped"
    except StepUnauthorized:
        _log(f"job={job_id} epoch={epoch} HTTP 401 del step: secreto desalineado, salgo")
        return "unauthorized"
    except StepRejected as err:
        _log(f"job={job_id} epoch={epoch} step rechazado: {err}; salgo")
        return "rejected"
    except StepDeadlineExceeded as err:
        report_fail(deps, job_id, epoch, "deadline_exceeded", str(err))
        return "failed:deadline_exceeded"
    except WorkerFailure as err:
        report_fail(deps, job_id, epoch, err.code, err.reason)
        return f"failed:{err.code}"
    except StepProtocolError as err:
        report_fail(deps, job_id, epoch, "internal", f"respuesta de step inválida: {err}")
        return "failed:internal"
    except Exception as err:  # noqa: BLE001 - any crash must still reach Vercel as op=fail
        report_fail(deps, job_id, epoch, "internal", f"{type(err).__name__}: {err}")
        return "failed:internal"


def run_drive_loop(job_id: str, epoch: int, deps: Deps) -> str:
    """op=advance until a terminal state, honouring retryAfterSec, under an overall deadline."""
    deadline = deps.clock() + DRIVE_TIMEOUT_SEC - DEADLINE_MARGIN_SEC
    ref = _job_ref(job_id, epoch)
    try:
        while True:
            if deps.clock() > deadline:
                raise StepDeadlineExceeded("plazo global del bucle advance agotado")
            reply = parse_advance_reply(deps.step.post({"op": "advance", **ref}, deadline=deadline))
            if reply.state in TERMINAL_MATCH_JOB_STATUSES:
                _log(f"job={job_id} epoch={epoch} terminal: {reply.state}")
                return f"terminal:{reply.state}"
            if reply.retry_after_sec:
                if deps.clock() + reply.retry_after_sec > deadline:
                    raise StepDeadlineExceeded("plazo global del bucle advance agotado")
                deps.sleep(reply.retry_after_sec)
    except Superseded:
        _log(f"job={job_id} epoch={epoch} superseded: el driver sale")
        return "superseded"
    except StepUnauthorized:
        return "unauthorized"
    except StepRejected as err:
        _log(f"job={job_id} epoch={epoch} advance rechazado: {err}; salgo")
        return "rejected"
    except StepDeadlineExceeded as err:
        report_fail(deps, job_id, epoch, "deadline_exceeded", str(err))
        return "failed:deadline_exceeded"
    except StepProtocolError as err:
        report_fail(deps, job_id, epoch, "internal", f"respuesta de advance inválida: {err}")
        return "failed:internal"
    except Exception as err:  # noqa: BLE001
        report_fail(deps, job_id, epoch, "internal", f"{type(err).__name__}: {err}")
        return "failed:internal"


def tick_body(now: Optional[datetime] = None) -> dict[str, Any]:
    at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(microsecond=0)
    return {"op": "tick", "jobId": None, "epoch": None, "scheduledAt": at.isoformat()}


def run_tick(step: StepClient, now: Optional[datetime] = None) -> Optional[dict[str, Any]]:
    """Single attempt: the next tick (5 min) is the retry."""
    try:
        data = step.post(tick_body(now), retry=False)
    except StepError as err:
        _log(f"tick no entregado: {type(err).__name__}: {err}")
        return None
    counts = {k: data.get(k) for k in ("dispatched", "redispatched", "failedJobs", "geminiFilesDeleted", "geminiDeleteErrors", "more")}
    _log(f"tick: {json.dumps(counts, separators=(',', ':'))}")
    return data


# ═════════════════════════════════════════════════════════════════════════════
# Operator spike (Phase 0 checks on Modal, no Vercel, no Gemini)
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class SpikeDeps:
    env: Mapping[str, str]
    http: httpx.Client
    popen: Callable[..., Any] = subprocess.Popen
    run: Callable[..., Any] = subprocess.run
    sleep: Callable[[float], None] = time.sleep
    clock: Callable[[], float] = time.time
    tmp_root: Optional[str] = None


def spike_plan(
    source_url: str,
    target_variant: str,
    *,
    fps: float,
    max_height: int,
    crf: int,
    duration_tolerance_sec: float,
    expected_duration_sec: Optional[float],
) -> TranscodePlan:
    """The operator's flags validated by the SAME parser as a real op=begin reply."""
    reply = {
        "action": "transcode",
        "epoch": 1,
        "sourceUrl": source_url,
        "sourceUrlExpiresAt": None,
        "targetVariant": target_variant,
        "expectedDurationSec": expected_duration_sec if expected_duration_sec else 1,
        "proxy": {
            "container": "mp4",
            "videoCodec": "h264",
            "audio": False,
            "fps": fps,
            "maxHeight": max_height,
            "crf": crf,
            "durationToleranceSec": duration_tolerance_sec,
        },
    }
    plan = parse_begin_reply(reply, 1).plan
    assert plan is not None
    if not expected_duration_sec:  # no Bunny length given: measure, do not compare
        plan = dataclasses.replace(plan, expected_duration_sec=None)
    return plan


def run_spike(plan: TranscodePlan, deps: SpikeDeps, *, return_proxy: bool = False) -> dict[str, Any]:
    """Allowlist + HLS variant + proxy + checks on Modal CPU; reports facts, never URLs."""
    t0 = deps.clock()
    state = RunState("transcoding")  # no heartbeat: there is no job to report to
    try:
        with tempfile.TemporaryDirectory(prefix="vitas-match-spike-", dir=deps.tmp_root) as tmp:
            source, facts, path = make_proxy(plan, tmp, deps, state, "spike")
            result: dict[str, Any] = {
                "ok": True,
                "source": {"kind": source.kind, "variantHeight": source.height, "hlsSegments": source.segments},
                "proxy": {
                    "mime": "video/mp4",
                    "bytes": facts.bytes,
                    "sha256": facts.sha256,
                    "durationSec": facts.duration_sec,
                    "repeatedFrames": facts.repeated_frames,
                    "recipe": proxy_spec_json(plan.proxy),
                },
                "expectedDurationSec": plan.expected_duration_sec,
                "elapsedSec": round(deps.clock() - t0, 1),
            }
            if return_proxy:
                if facts.bytes > SPIKE_RETURN_MAX_BYTES:
                    result["proxyNotReturned"] = f"proxy de {facts.bytes} B > {SPIKE_RETURN_MAX_BYTES} B"
                else:
                    with open(path, "rb") as f:
                        result["proxyData"] = f.read()
            return result
    except WorkerFailure as err:
        return {
            "ok": False,
            "error": {"code": err.code, "reason": redact(err.reason)},
            "elapsedSec": round(deps.clock() - t0, 1),
        }


# ═════════════════════════════════════════════════════════════════════════════
# match_start (Vercel → Modal dispatch)
# ═════════════════════════════════════════════════════════════════════════════


def bearer_matches(authorization: object, api_key: str) -> bool:
    if not isinstance(authorization, str) or not api_key:
        return False
    return hmac.compare_digest(authorization.encode("utf-8"), f"Bearer {api_key}".encode("utf-8"))


def parse_dispatch_request(payload: object) -> tuple[str, int]:
    """matchDispatchRequestSchema: exactly {jobId: uuid, epoch: int ≥ 1}."""
    if not isinstance(payload, dict) or set(payload) != {"jobId", "epoch"}:
        raise ValueError("se espera exactamente {jobId, epoch}")
    job_id, epoch = payload["jobId"], payload["epoch"]
    if not isinstance(job_id, str) or not _UUID_RE.match(job_id):
        raise ValueError("jobId no es un uuid")
    if not _is_int(epoch) or epoch < 1:
        raise ValueError("epoch debe ser un entero ≥ 1")
    return job_id, epoch


def handle_match_start(
    payload: object,
    authorization: object,
    *,
    env: Mapping[str, str],
    spawn: Callable[[str, int], str],
) -> dict[str, str]:
    """Reply per matchDispatchReplySchema: {status:"spawned", call_id} | {status:"error", reason}."""
    api_key = (env.get("API_KEY") or "").strip()
    if not api_key:
        return {"status": "error", "reason": "server_misconfigured"}
    if not bearer_matches(authorization, api_key):
        return {"status": "error", "reason": "unauthorized"}
    try:
        job_id, epoch = parse_dispatch_request(payload)
    except ValueError:
        return {"status": "error", "reason": "invalid_request"}
    missing = missing_worker_env(env)
    if missing:  # fail the dispatch now instead of spawning a worker that cannot report back
        _log(f"match_start: faltan claves en el secret: {', '.join(missing)}")
        return {"status": "error", "reason": "server_misconfigured"}
    call_id = spawn(job_id, epoch)
    _log(f"match_start: job={job_id} epoch={epoch} spawned")
    return {"status": "spawned", "call_id": call_id}


# ═════════════════════════════════════════════════════════════════════════════
# Modal app
# ═════════════════════════════════════════════════════════════════════════════

_base_image = modal.Image.debian_slim(python_version="3.12").pip_install("httpx==0.27.2")
# Local modules shipped in every image (Modal 1.x does not automount): the shared URL
# allowlist and the proxy recipe. add_local_* must stay the LAST image step.
_LOCAL_MODULES = ("video_url_guard", "match_proxy")
# transcode_and_upload + spike_proxy: ffmpeg (Debian package) + httpx only.
worker_image = _base_image.apt_install("ffmpeg").add_local_python_source(*_LOCAL_MODULES)
# match_start (FastAPI endpoint), drive and tick: no ffmpeg.
light_image = _base_image.pip_install("fastapi[standard]==0.115.5").add_local_python_source(*_LOCAL_MODULES)

app = modal.App(APP_NAME)
# Same secret as vitas-vision. required_keys fails the deploy early if these are missing;
# the step URL (VITAS_MATCH_STEP_URL | VITAS_PUBLIC_URL) is checked at runtime.
worker_secret = modal.Secret.from_name(
    "vitas-api-key", required_keys=["API_KEY", "MODAL_CALLBACK_SECRET", "BUNNY_CDN_HOSTNAME"]
)


@app.function(
    image=worker_image,
    secrets=[worker_secret],
    cpu=(TRANSCODE_CPU, TRANSCODE_CPU_LIMIT),
    memory=TRANSCODE_MEMORY_MB,
    timeout=TRANSCODE_TIMEOUT_SEC,
    retries=0,  # resume is driven by Vercel state (epoch re-dispatch), never by Modal retries
    max_containers=MAX_CONCURRENT_TRANSCODES,
    scaledown_window=SCALEDOWN_WINDOW_SEC,
)
def transcode_and_upload(job_id: str, epoch: int) -> str:
    try:
        deps = build_deps(os.environ, spawn_drive=lambda j, e: drive.spawn(j, e))
    except WorkerConfigError as err:  # cannot even reach Vercel: log names only and exit
        _log(f"job={job_id} epoch={epoch} secret incompleto: {err}")
        return "misconfigured"
    try:
        return run_transcode_job(job_id, epoch, deps)
    finally:
        deps.close()


@app.function(
    image=light_image,
    secrets=[worker_secret],
    cpu=(DRIVE_CPU, LIGHT_CPU_LIMIT),
    memory=DRIVE_MEMORY_MB,
    timeout=DRIVE_TIMEOUT_SEC,
    retries=0,
    max_containers=MAX_CONCURRENT_DRIVERS,
    scaledown_window=SCALEDOWN_WINDOW_SEC,
)
def drive(job_id: str, epoch: int) -> str:
    try:
        deps = build_deps(os.environ, spawn_drive=lambda j, e: None)
    except WorkerConfigError as err:
        _log(f"job={job_id} epoch={epoch} secret incompleto: {err}")
        return "misconfigured"
    try:
        return run_drive_loop(job_id, epoch, deps)
    finally:
        deps.close()


@app.function(
    image=light_image,
    secrets=[worker_secret],
    schedule=modal.Period(minutes=MATCH_TICK_PERIOD_MIN),
    cpu=(LIGHT_CPU, LIGHT_CPU_LIMIT),
    memory=LIGHT_MEMORY_MB,
    timeout=TICK_TIMEOUT_SEC,
    retries=0,
    max_containers=1,
    scaledown_window=SCALEDOWN_WINDOW_SEC,
)
def tick() -> Optional[dict]:
    try:
        step = StepClient(
            resolve_step_url(os.environ),
            (os.environ.get("MODAL_CALLBACK_SECRET") or "").strip(),
            timeout=TICK_TIMEOUT_SEC - 20,
        )
    except WorkerConfigError as err:
        _log(f"tick: secret incompleto: {err}")
        return None
    try:
        return run_tick(step)
    finally:
        step.close()


@app.function(
    image=light_image,
    secrets=[worker_secret],
    cpu=(LIGHT_CPU, LIGHT_CPU_LIMIT),
    memory=LIGHT_MEMORY_MB,
    timeout=30,
    scaledown_window=SCALEDOWN_WINDOW_SEC,
)
@modal.fastapi_endpoint(method="POST")
def match_start(payload: dict, authorization: Optional[str] = Header(default=None)) -> dict:
    """POST {jobId, epoch} with Authorization: Bearer <API_KEY> → {status:"spawned", call_id}."""
    return handle_match_start(
        payload,
        authorization,
        env=os.environ,
        spawn=lambda j, e: transcode_and_upload.spawn(j, e).object_id,
    )


@app.function(
    image=worker_image,
    secrets=[worker_secret],
    cpu=(TRANSCODE_CPU, TRANSCODE_CPU_LIMIT),
    memory=TRANSCODE_MEMORY_MB,
    timeout=TRANSCODE_TIMEOUT_SEC,
    retries=0,
    max_containers=1,
    scaledown_window=SCALEDOWN_WINDOW_SEC,
)
def spike_proxy(
    source_url: str,
    target_variant: str,
    fps: float,
    max_height: int,
    crf: int,
    duration_tolerance_sec: float,
    expected_duration_sec: float = 0.0,
    return_proxy: bool = False,
) -> dict:
    """Operator only (never called by Vercel): same allowlist + proxy as a job, on Modal CPU."""
    try:
        plan = spike_plan(
            source_url,
            target_variant,
            fps=fps,
            max_height=max_height,
            crf=crf,
            duration_tolerance_sec=duration_tolerance_sec,
            expected_duration_sec=expected_duration_sec or None,
        )
    except StepProtocolError as err:
        return {"ok": False, "error": {"code": "invalid_input", "reason": str(err)}}
    http = httpx.Client(follow_redirects=False, timeout=httpx.Timeout(300.0, connect=30.0))
    try:
        return run_spike(plan, SpikeDeps(env=os.environ, http=http), return_proxy=return_proxy)
    finally:
        http.close()


@app.local_entrypoint()
def spike(
    source_url: str,
    target_variant: str,
    fps: float,
    max_height: int,
    crf: int,
    duration_tolerance_sec: float,
    expected_duration_sec: float = 0.0,
    save_proxy: str = "",
) -> None:
    """modal run vision-pipeline/match_worker.py::spike --source-url … (see README)."""
    result = spike_proxy.remote(
        source_url,
        target_variant,
        fps,
        max_height,
        crf,
        duration_tolerance_sec,
        expected_duration_sec,
        bool(save_proxy),
    )
    data = result.pop("proxyData", None)
    if save_proxy and data is not None:
        with open(save_proxy, "wb") as f:
            f.write(data)
        result["savedTo"] = save_proxy
    print(json.dumps(result, ensure_ascii=False, indent=2))
