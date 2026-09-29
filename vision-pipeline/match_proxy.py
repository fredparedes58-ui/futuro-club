"""
VITAS · Proxy recipe of the full-match video job — ONE implementation (inv. #7).

This file decides what Gemini sees: the first video stream only, NO audio,
subtitles or data, `fps` + `scale=-2:<maxHeight>` + libx264 `crf` from the proxy
spec that Vercel sends in op=begin, yuv420p, +faststart. The values live in
config/matchVideo.json (backend PR) with "_source" / "pendiente de validar";
there are NO defaults here (the CLI makes every value a required flag), so 1 fps
is never hard-coded.

Used by:
  - match_worker.py (Modal app `vitas-match-worker`, production): the input is the
    Bunny HLS/MP4 over https only;
  - the CLI at the bottom (operator, local): builds the SAME proxy from a local
    clip, so the observation validation harness (backend PR) scores exactly what
    production would send to Gemini.

Integrity checks. Verified with ffmpeg 8.1 on a local HLS with one segment
removed: ffmpeg exits 0 and the fps filter fills the hole with repeated frames,
so the proxy has the right duration but seconds of frozen picture. Gemini would
"observe" those seconds. Hence, after ffmpeg:
  - any HLS segment that could not be read ⇒ fail (never a proxy with holes);
  - more repeated frames than floor(fps × durationToleranceSec) ⇒ fail (a gap in
    the source timeline); the fps filter statistics missing ⇒ fail (continuity
    cannot be verified: abstain, do not assume);
  - ffprobe: exactly one stream, video, h264, height ≤ maxHeight and NO audio
    (minors' voices never reach Google); duration within ± durationToleranceSec
    of the Bunny length.

Stdlib only (no Modal, no httpx) → testable anywhere: vision-pipeline/test_match_worker.py.

CLI (local clip → proxy; prints one JSON line; exit 1 on a failed check):
  python vision-pipeline/match_proxy.py --input clip.mp4 --output proxy.mp4 \\
      --fps <proxyFps> --max-height <proxyHeight> --crf <proxyCrf> \\
      --duration-tolerance-sec <durationToleranceSec> [--expected-duration-sec <s>]
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Optional

# ═════════════════════════════════════════════════════════════════════════════
# Operational constants (design decisions, not metric thresholds)
# ═════════════════════════════════════════════════════════════════════════════

# libx264 speed preset: the proxy is tiny (few fps, small height); the CPU time is
# dominated by decoding the source, so a faster preset changes nothing that matters.
X264_PRESET = "veryfast"
# = the cores reserved by match_worker.transcode_and_upload (cpu=2). The local CLI
# uses the same count so its proxy is encoded the same way as production's.
FFMPEG_THREADS = 2
# Production: ffmpeg may only open these protocols (no file:, no plain http:, no
# data:), so a playlist cannot make it read local files or leave TLS.
REMOTE_PROTOCOL_WHITELIST = "https,tls,tcp,crypto"
# Local CLI: local files only (an .m3u8 on disk opens its segments with file:).
LOCAL_PROTOCOL_WHITELIST = "file,crypto"
# ffmpeg gives up on a network read/write stalled longer than this (microseconds);
# the worker's global deadline stays as the backstop.
NETWORK_RW_TIMEOUT_US = 60_000_000
# Re-read a failing HLS segment this many times before ffmpeg gives up on it, only
# when the installed ffmpeg supports the hls demuxer option (probed at runtime).
HLS_SEG_MAX_RETRY = 3
# [level] tags on every line: warnings/errors go to the failure reason, and the
# fps filter statistics used by the continuity check are logged at "verbose".
FFMPEG_LOGLEVEL = "level+verbose"
LOG_TAIL_LINES = 40
FFPROBE_TIMEOUT_SEC = 120
FFMPEG_HELP_TIMEOUT_SEC = 30
HASH_CHUNK_BYTES = 1024 * 1024

PROXY_MIME = "video/mp4"
PROXY_CONTAINER = "mp4"
PROXY_VIDEO_CODEC = "h264"


@dataclass(frozen=True)
class ProxySpec:
    """contract.ts proxySpecSchema (container/codec/audio are pinned: mp4, h264, false)."""

    fps: float
    max_height: int
    crf: int
    duration_tolerance_sec: float


class ProxyError(Exception):
    """A proxy that must not reach Gemini. `code` ∈ contract WORKER_FAIL_CODES."""

    def __init__(self, code: str, reason: str) -> None:
        super().__init__(f"{code}: {reason}")
        self.code = code
        self.reason = reason


# ═════════════════════════════════════════════════════════════════════════════
# Commands
# ═════════════════════════════════════════════════════════════════════════════


def _fmt_num(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else repr(float(x))


def build_ffmpeg_cmd(
    input_url: str,
    output_path: str,
    spec: ProxySpec,
    *,
    threads: int = FFMPEG_THREADS,
    protocol_whitelist: str = REMOTE_PROTOCOL_WHITELIST,
    rw_timeout_us: Optional[int] = NETWORK_RW_TIMEOUT_US,
    hls_seg_max_retry: Optional[int] = None,
) -> list[str]:
    """The proxy for Gemini: first video stream only, NO audio / subtitles / data."""
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-loglevel", FFMPEG_LOGLEVEL,
        "-nostats",
        "-progress", "pipe:1",
        "-protocol_whitelist", protocol_whitelist,
    ]  # fmt: skip
    if rw_timeout_us:
        cmd += ["-rw_timeout", str(int(rw_timeout_us))]
    if hls_seg_max_retry:  # hls demuxer option: "Option not found" (fatal) on an MP4 input
        cmd += ["-seg_max_retry", str(int(hls_seg_max_retry))]
    cmd += [
        "-threads", str(threads),
        "-i", input_url,
        "-map", "0:v:0",
        "-an", "-sn", "-dn",
        "-vf", f"fps={_fmt_num(spec.fps)},scale=-2:{spec.max_height}",
        "-c:v", "libx264",
        "-preset", X264_PRESET,
        "-crf", str(spec.crf),
        "-pix_fmt", "yuv420p",
        "-threads", str(threads),
        "-movflags", "+faststart",
        "-f", PROXY_CONTAINER,
        output_path,
    ]  # fmt: skip
    return cmd


def build_hls_demuxer_help_cmd() -> list[str]:
    return ["ffmpeg", "-hide_banner", "-h", "demuxer=hls"]


def hls_demuxer_supports(help_text: str, option: str) -> bool:
    """`ffmpeg -h demuxer=hls` lists `  -seg_max_retry <int> …` when the build has it."""
    return re.search(rf"^\s*-{re.escape(option)}\s", help_text or "", re.MULTILINE) is not None


def detect_hls_seg_retry(run: Callable[..., Any]) -> bool:
    """True when this ffmpeg build accepts -seg_max_retry (never raises)."""
    try:
        res = run(build_hls_demuxer_help_cmd(), capture_output=True, text=True, timeout=FFMPEG_HELP_TIMEOUT_SEC)
    except Exception:  # noqa: BLE001 - missing option support just means "do not use it"
        return False
    out = f"{getattr(res, 'stdout', '') or ''}\n{getattr(res, 'stderr', '') or ''}"
    return getattr(res, "returncode", 1) == 0 and hls_demuxer_supports(out, "seg_max_retry")


def build_ffprobe_cmd(path: str) -> list[str]:
    return [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height",
        "-of", "json",
        path,
    ]  # fmt: skip


# ═════════════════════════════════════════════════════════════════════════════
# ffmpeg output parsing
# ═════════════════════════════════════════════════════════════════════════════

_HMS_RE = re.compile(r"^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$")
_LEVEL_RE = re.compile(r"\[(panic|fatal|error|warning|info|verbose|debug|trace)\] ")
_PROBLEM_LEVELS = frozenset({"panic", "fatal", "error", "warning"})
_FPS_STATS_RE = re.compile(r"(\d+) frames in, (\d+) frames out; (\d+) frames dropped, (\d+) frames duplicated")
_SEGMENT_OPEN_FAILED_RE = re.compile(r"Failed to open segment", re.IGNORECASE)
_SEGMENT_SKIPPED_RE = re.compile(r"failed too many times, skipping", re.IGNORECASE)
_CORRUPT_RE = re.compile(r"\bcorrupt\b", re.IGNORECASE)
# Anchored on ffmpeg's HTTP phrases ("HTTP error 403 Forbidden", "Server returned 404
# Not Found", "Server returned 5XX Server Error reply") so a stray number such as
# "dts = 403" never decides the code.
_FORBIDDEN_RE = re.compile(
    r"(HTTP error|Server returned) 40[13]\b|\bunauthori[sz]ed\b|\bforbidden\b|access denied", re.IGNORECASE
)
_UNAVAILABLE_RE = re.compile(
    r"(HTTP error|Server returned) (40[48]|410|429|5\d\d|5XX)\b|\bnot found\b|server error|connection refused"
    r"|connection reset|timed out|failed to resolve|name or service not known|network is unreachable"
    r"|not on whitelist",
    re.IGNORECASE,
)


def parse_progress_line(line: str) -> Optional[float]:
    """Seconds of output written, from one `-progress` key=value line (else None)."""
    key, sep, value = line.strip().partition("=")
    if not sep:
        return None
    value = value.strip()
    if key in ("out_time_us", "out_time_ms"):  # both are microseconds in ffmpeg
        return int(value) / 1_000_000 if value.isdigit() else None
    if key == "out_time":
        m = _HMS_RE.match(value)
        if m:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return None


@dataclass(frozen=True)
class FpsStats:
    """`[Parsed_fps_0] N frames in, M frames out; D frames dropped, R frames duplicated.`"""

    frames_in: int
    frames_out: int
    dropped: int
    duplicated: int


class FfmpegLog:
    """Scans ffmpeg's stderr (`-loglevel level+verbose`) line by line.

    Keeps a tail of warning/error lines for the failure reason (info lines, which
    carry every segment URL, are never kept), counts HLS segment failures and
    corrupt packets, and records the fps filter statistics.
    """

    def __init__(self, tail_lines: int = LOG_TAIL_LINES) -> None:
        self.problems: collections.deque[str] = collections.deque(maxlen=tail_lines)
        self.segment_open_failures = 0
        self.segments_skipped = 0
        self.corrupt_packets = 0
        self.fps_stats: Optional[FpsStats] = None

    def feed(self, line: str) -> None:
        line = line.strip()
        if not line:
            return
        stats = _FPS_STATS_RE.search(line)
        if stats:
            s = FpsStats(*(int(g) for g in stats.groups()))
            # ffmpeg first configures a probe graph that reports "0 frames in, 0 out";
            # every real filter-graph instance (one, unless the graph is reconfigured
            # mid-stream) reports its own counts, so they are added up.
            if self.fps_stats is None or self.fps_stats.frames_in == 0:
                self.fps_stats = s
            elif s.frames_in > 0:
                prev = self.fps_stats
                self.fps_stats = FpsStats(
                    frames_in=prev.frames_in + s.frames_in,
                    frames_out=prev.frames_out + s.frames_out,
                    dropped=prev.dropped + s.dropped,
                    duplicated=prev.duplicated + s.duplicated,
                )
            return
        if _SEGMENT_OPEN_FAILED_RE.search(line):
            self.segment_open_failures += 1
        if _SEGMENT_SKIPPED_RE.search(line):
            self.segments_skipped += 1
        if _CORRUPT_RE.search(line):
            self.corrupt_packets += 1
        m = _LEVEL_RE.search(line)
        if m is None or m.group(1) in _PROBLEM_LEVELS:  # untagged = ffmpeg could not even parse its options
            self.problems.append(line)

    @property
    def tail(self) -> str:
        return "\n".join(self.problems)

    def last_problem(self) -> str:
        return self.problems[-1] if self.problems else "sin salida de error"


def classify_ffmpeg_failure(stderr_tail: str) -> str:
    if _FORBIDDEN_RE.search(stderr_tail):
        return "source_forbidden"
    if _UNAVAILABLE_RE.search(stderr_tail):
        return "source_unavailable"
    return "transcode_failed"


def allowed_repeated_frames(spec: ProxySpec) -> int:
    """Repeated frames tolerated = the duration tolerance expressed in frames (no new threshold)."""
    return int(math.floor(spec.fps * spec.duration_tolerance_sec + 1e-9))


def check_ffmpeg_result(rc: int, log: FfmpegLog, spec: ProxySpec, *, hls_seg_retry: bool) -> None:
    """Raise ProxyError unless ffmpeg succeeded AND the output timeline has no holes."""
    if rc != 0:
        raise ProxyError(classify_ffmpeg_failure(log.tail), f"ffmpeg salió con código {rc}: {log.last_problem()}")
    # With -seg_max_retry every retry logs "Failed to open segment"; only the final
    # "skipping" means data was lost. Without it, each failed open is a lost segment.
    lost = log.segments_skipped if hls_seg_retry else max(log.segments_skipped, log.segment_open_failures)
    if lost:
        code = "source_forbidden" if _FORBIDDEN_RE.search(log.tail) else "source_unavailable"
        raise ProxyError(
            code,
            f"{lost} segmento(s) HLS no se pudieron leer: el proxy tendría huecos rellenos con fotogramas repetidos",
        )
    stats = log.fps_stats
    if stats is None or stats.frames_out == 0:
        raise ProxyError(
            "transcode_failed",
            "no se pudo verificar la continuidad del vídeo (ffmpeg no dio las estadísticas del filtro fps)",
        )
    allowed = allowed_repeated_frames(spec)
    if stats.duplicated > allowed:
        raise ProxyError(
            "transcode_failed",
            f"el origen tiene huecos: ffmpeg repitió {stats.duplicated} fotogramas "
            f"(máximo {allowed} = fps × tolerancia de duración)",
        )


def run_ffmpeg(
    cmd: Sequence[str],
    *,
    popen: Callable[..., Any] = subprocess.Popen,
    on_start: Optional[Callable[[Any], None]] = None,
    on_exit: Optional[Callable[[], None]] = None,
    on_progress: Optional[Callable[[float], None]] = None,
) -> tuple[int, FfmpegLog]:
    """Run ffmpeg, stream `-progress` from stdout and scan stderr in a thread."""
    proc = popen(
        list(cmd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    if on_start is not None:
        on_start(proc)
    log = FfmpegLog()

    def _drain_stderr() -> None:
        for line in proc.stderr:
            log.feed(line)

    reader = threading.Thread(target=_drain_stderr, name="ffmpeg-stderr", daemon=True)
    reader.start()
    try:
        for line in proc.stdout:
            sec = parse_progress_line(line)
            if sec is not None and on_progress is not None:
                on_progress(sec)
        rc = proc.wait()
    finally:
        if on_exit is not None:
            on_exit()
    reader.join(timeout=5)
    return rc, log


# ═════════════════════════════════════════════════════════════════════════════
# ffprobe + final checks
# ═════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class ProbedStream:
    codec_type: str
    codec_name: Optional[str]
    height: Optional[int]


@dataclass(frozen=True)
class ProbeResult:
    duration_sec: Optional[float]
    streams: tuple[ProbedStream, ...]


def parse_ffprobe(stdout: str) -> Optional[ProbeResult]:
    """`ffprobe -of json` output → ProbeResult (None when it is not ffprobe JSON)."""
    try:
        data = json.loads(stdout or "")
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    duration: Optional[float] = None
    fmt = data.get("format")
    raw = fmt.get("duration") if isinstance(fmt, dict) else None
    try:
        v = float(raw) if raw is not None else None
    except (TypeError, ValueError):
        v = None
    if v is not None and math.isfinite(v) and v > 0:
        duration = v
    streams: list[ProbedStream] = []
    for s in data.get("streams") or []:
        if not isinstance(s, dict):
            continue
        h = s.get("height")
        streams.append(
            ProbedStream(
                codec_type=str(s.get("codec_type") or "unknown"),
                codec_name=s.get("codec_name") if isinstance(s.get("codec_name"), str) else None,
                height=h if isinstance(h, int) and not isinstance(h, bool) else None,
            )
        )
    return ProbeResult(duration_sec=duration, streams=tuple(streams))


def proxy_stream_problem(probe: ProbeResult, spec: ProxySpec) -> Optional[tuple[str, str]]:
    """(code, reason) when the proxy is not exactly one h264 video stream ≤ maxHeight with no audio."""
    if any(s.codec_type == "audio" for s in probe.streams):
        return "internal", "el proxy contiene audio: no se sube (las voces de menores nunca llegan a Google)"
    if len(probe.streams) != 1 or probe.streams[0].codec_type != "video":
        return "transcode_failed", f"el proxy debe tener exactamente una pista de vídeo (tiene {len(probe.streams)})"
    video = probe.streams[0]
    if video.codec_name != PROXY_VIDEO_CODEC:
        return "transcode_failed", f"el proxy no es {PROXY_VIDEO_CODEC} ({video.codec_name or 'códec desconocido'})"
    if video.height is None or video.height > spec.max_height:
        return "transcode_failed", f"altura del proxy {video.height} fuera de maxHeight {spec.max_height}"
    return None


def duration_within_tolerance(probe_sec: float, expected_sec: float, tolerance_sec: float) -> bool:
    return abs(probe_sec - expected_sec) <= tolerance_sec


def file_sha256_and_size(path: str) -> tuple[str, int]:
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(HASH_CHUNK_BYTES), b""):
            h.update(chunk)
            size += len(chunk)
    return h.hexdigest(), size


@dataclass(frozen=True)
class ProxyFacts:
    """What op=upload_session / proxy_ready report (bytes, sha256 hex, ffprobe duration)."""

    bytes: int
    sha256: str
    duration_sec: float
    repeated_frames: int


def inspect_proxy(
    path: str,
    spec: ProxySpec,
    expected_duration_sec: Optional[float],
    log: FfmpegLog,
    *,
    run: Callable[..., Any] = subprocess.run,
) -> ProxyFacts:
    """ffprobe the proxy and check streams + duration; raise ProxyError on any problem."""
    try:
        probe = run(build_ffprobe_cmd(path), capture_output=True, text=True, timeout=FFPROBE_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        raise ProxyError("transcode_failed", f"ffprobe no respondió en {FFPROBE_TIMEOUT_SEC} s") from None
    result = parse_ffprobe(probe.stdout) if probe.returncode == 0 else None
    if result is None or result.duration_sec is None:
        raise ProxyError("transcode_failed", "ffprobe no devolvió la duración del proxy")
    problem = proxy_stream_problem(result, spec)
    if problem is not None:
        raise ProxyError(*problem)
    duration = result.duration_sec
    if expected_duration_sec is not None and not duration_within_tolerance(
        duration, expected_duration_sec, spec.duration_tolerance_sec
    ):
        raise ProxyError(
            "duration_mismatch",
            f"proxy de {duration:.1f} s frente a {expected_duration_sec:.1f} s esperados "
            f"(tolerancia ±{_fmt_num(spec.duration_tolerance_sec)} s)",
        )
    sha256, size = file_sha256_and_size(path)
    if size <= 0:
        raise ProxyError("transcode_failed", "ffmpeg produjo un proxy vacío")
    repeated = log.fps_stats.duplicated if log.fps_stats is not None else 0
    return ProxyFacts(bytes=size, sha256=sha256, duration_sec=duration, repeated_frames=repeated)


# ═════════════════════════════════════════════════════════════════════════════
# CLI: the same proxy from a local clip (operator; validation harness input)
# ═════════════════════════════════════════════════════════════════════════════


def build_local_proxy(
    input_path: str,
    output_path: str,
    spec: ProxySpec,
    *,
    expected_duration_sec: Optional[float] = None,
    popen: Callable[..., Any] = subprocess.Popen,
    run: Callable[..., Any] = subprocess.run,
) -> dict[str, Any]:
    """Local clip → proxy with the production recipe. Returns the JSON summary."""
    is_hls = input_path.lower().endswith(".m3u8")
    seg_retry = is_hls and detect_hls_seg_retry(run)
    cmd = build_ffmpeg_cmd(
        input_path,
        output_path,
        spec,
        protocol_whitelist=LOCAL_PROTOCOL_WHITELIST,
        rw_timeout_us=None,
        hls_seg_max_retry=HLS_SEG_MAX_RETRY if seg_retry else None,
    )
    rc, log = run_ffmpeg(cmd, popen=popen)
    check_ffmpeg_result(rc, log, spec, hls_seg_retry=seg_retry)
    facts = inspect_proxy(output_path, spec, expected_duration_sec, log, run=run)
    return {
        "output": output_path,
        "mime": PROXY_MIME,
        "bytes": facts.bytes,
        "sha256": facts.sha256,
        "durationSec": facts.duration_sec,
        "repeatedFrames": facts.repeated_frames,
        "recipe": proxy_spec_json(spec),
    }


def proxy_spec_json(spec: ProxySpec) -> dict[str, Any]:
    """The spec in contract.ts proxySpecSchema shape (camelCase, pinned fields included)."""
    return {
        "container": PROXY_CONTAINER,
        "videoCodec": PROXY_VIDEO_CODEC,
        "audio": False,
        "fps": spec.fps,
        "maxHeight": spec.max_height,
        "crf": spec.crf,
        "durationToleranceSec": spec.duration_tolerance_sec,
    }


def _positive_float(s: str) -> float:
    v = float(s)
    if not math.isfinite(v) or v <= 0:
        raise argparse.ArgumentTypeError("debe ser > 0")
    return v


def _nonnegative_float(s: str) -> float:
    v = float(s)
    if not math.isfinite(v) or v < 0:
        raise argparse.ArgumentTypeError("debe ser ≥ 0")
    return v


def _positive_int(s: str) -> int:
    v = int(s)
    if v <= 0:
        raise argparse.ArgumentTypeError("debe ser > 0")
    return v


def _crf(s: str) -> int:
    v = int(s)
    if not 0 <= v <= 51:
        raise argparse.ArgumentTypeError("debe estar en 0..51")
    return v


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="match_proxy.py",
        description=(
            "Proxy de partido (receta de producción de vitas-match-worker) desde un clip LOCAL. "
            "Los valores salen de config/matchVideo.json: no hay valores por defecto."
        ),
    )
    p.add_argument("--input", required=True, help="clip local (.mp4/.mov/… o .m3u8 en disco); nunca una URL")
    p.add_argument("--output", required=True, help="ruta del proxy .mp4 a escribir")
    p.add_argument("--fps", required=True, type=_positive_float, help="proxyFps de config/matchVideo.json")
    p.add_argument("--max-height", required=True, type=_positive_int, help="proxyHeight de config/matchVideo.json")
    p.add_argument("--crf", required=True, type=_crf, help="proxyCrf de config/matchVideo.json")
    p.add_argument(
        "--duration-tolerance-sec",
        required=True,
        type=_nonnegative_float,
        help="durationToleranceSec de config/matchVideo.json",
    )
    p.add_argument("--expected-duration-sec", type=_positive_float, default=None, help="duración esperada (opcional)")
    return p


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    popen: Callable[..., Any] = subprocess.Popen,
    run: Callable[..., Any] = subprocess.run,
) -> int:
    args = _parser().parse_args(argv)
    if "://" in args.input:
        print("match_proxy: --input debe ser un fichero local, no una URL", file=sys.stderr)
        return 2
    if not os.path.isfile(args.input):
        print(f"match_proxy: no existe el fichero de entrada {args.input}", file=sys.stderr)
        return 2
    if os.path.abspath(args.input) == os.path.abspath(args.output):
        print("match_proxy: --output no puede ser el mismo fichero que --input", file=sys.stderr)
        return 2
    spec = ProxySpec(
        fps=args.fps, max_height=args.max_height, crf=args.crf, duration_tolerance_sec=args.duration_tolerance_sec
    )
    try:
        summary = build_local_proxy(
            args.input, args.output, spec, expected_duration_sec=args.expected_duration_sec, popen=popen, run=run
        )
    except ProxyError as err:
        print(json.dumps({"error": {"code": err.code, "reason": err.reason}}, ensure_ascii=False))
        return 1
    except FileNotFoundError as err:  # ffmpeg / ffprobe not installed
        print(f"match_proxy: no se encontró {err.filename or 'ffmpeg'} en el PATH", file=sys.stderr)
        return 2
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":  # pragma: no cover - thin CLI wrapper
    sys.exit(main())
