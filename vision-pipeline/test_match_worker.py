"""
VITAS · Tests of the Modal match worker (vision-pipeline/match_worker.py).

No network, no ffmpeg, no Modal: `modal` and `fastapi` are replaced by stubs (the
worker only uses them to declare the app), HTTP goes through httpx.MockTransport,
and subprocess is replaced by fakes. The HMAC vectors and the protocol constants
are cross-checked against src/lib/shared/matchJob/contract.ts so the two sides
cannot drift apart silently.

Run:  python -m pytest vision-pipeline/test_match_worker.py -q
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
import threading
import types
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

HERE = Path(__file__).resolve().parent
WORKER_PATH = HERE / "match_worker.py"
CONTRACT_PATH = HERE.parent / "src" / "lib" / "shared" / "matchJob" / "contract.ts"


class _Anything:
    """Generic stub: attributes and calls return stubs; as a decorator, identity."""

    def __init__(self, *args, **kwargs) -> None:
        pass

    def __call__(self, *args, **kwargs):
        if len(args) == 1 and callable(args[0]) and not kwargs:
            return args[0]
        return _Anything()

    def __getattr__(self, name: str):
        return _Anything()


def _stub_module(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    mod.__getattr__ = lambda attr: _Anything()  # type: ignore[attr-defined]
    return mod


def _load_worker():
    stubs = {"modal": _stub_module("modal"), "fastapi": _stub_module("fastapi")}
    saved = {k: sys.modules.get(k) for k in stubs}
    sys.modules.update(stubs)
    try:
        spec = importlib.util.spec_from_file_location("vitas_match_worker_under_test", WORKER_PATH)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module  # dataclasses resolve string annotations via sys.modules
        spec.loader.exec_module(module)
        return module
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


mw = _load_worker()
import match_proxy as mp  # noqa: E402  (the same module object match_worker imported)

JOB ="8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f"
CDN = "vz-abc123-456.b-cdn.net"
ENV = {"BUNNY_CDN_HOSTNAME": CDN}
MASTER_URL = f"https://{CDN}/0f1e2d3c-guid/playlist.m3u8"
VARIANT_360_URL = f"https://{CDN}/0f1e2d3c-guid/360p/video.m3u8"
UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=abc&upload_protocol=resumable"
GEMINI_FILE = {
    "name": "files/abc123xyz",
    "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz",
}
PROXY = {
    "container": "mp4",
    "videoCodec": "h264",
    "audio": False,
    "fps": 1,
    "maxHeight": 360,
    "crf": 30,
    "durationToleranceSec": 2,
}
SPEC = mw.ProxySpec(fps=1.0, max_height=360, crf=30, duration_tolerance_sec=2.0)

MASTER = """#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=520000,RESOLUTION=426x240,NAME="240"
240p/video.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1240000,RESOLUTION=640x360,NAME="360"
360p/video.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=2400000,RESOLUTION=854x480,NAME="480"
480p/video.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=4600000,RESOLUTION=1280x720,NAME="720"
720p/video.m3u8
"""

MEDIA = """#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:4.000000,
video0.ts
#EXTINF:4.000000,
video1.ts
#EXTINF:2.500000,
video2.ts
#EXT-X-ENDLIST
"""


def _begin_transcode(**overrides):
    reply = {
        "action": "transcode",
        "epoch": 1,
        "sourceUrl": MASTER_URL,
        "sourceUrlExpiresAt": None,
        "targetVariant": "360p",
        "expectedDurationSec": 5400,
        "proxy": dict(PROXY),
    }
    reply.update(overrides)
    return reply


# ─────────────────────────────────────────────────────────────────────────────
# HMAC · contract test vectors (STEP_HMAC_TEST_VECTORS)
# ─────────────────────────────────────────────────────────────────────────────

HMAC_SECRET = "vitas-test-secret-not-a-real-key"
HMAC_VECTORS = [
    (
        "1790000000",
        '{"op":"advance","jobId":"8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f","epoch":1}',
        73,
        "98ae526b57a69637dcfee55258c077005abc9ed955c868cef3627a7d3b82353c",
    ),
    (
        "1790000300",
        '{"op":"fail","jobId":"8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f","epoch":2,"code":"transcode_failed",'
        '"reason":"ffmpeg salió con código 1: sin señal de vídeo"}',
        157,
        "b1b460ada7e65771fc55ef6ba67cf9c4c3f7600101f0be53b773905d3db127d2",
    ),
]


@pytest.mark.parametrize("ts,body,n_bytes,signature", HMAC_VECTORS)
def test_hmac_vectors_reproduce_the_published_signature(ts, body, n_bytes, signature):
    raw = body.encode("utf-8")
    assert len(raw) == n_bytes
    assert mw.sign_step(HMAC_SECRET, ts, raw) == signature
    # The worker's own serialiser produces exactly these bytes from the object.
    assert mw.canonical_json(json.loads(body)) == raw


def test_hmac_pins_utf8_and_ts_prefix():
    ts, body, _n, signature = HMAC_VECTORS[1]
    obj = json.loads(body)
    ascii_escaped = json.dumps(obj, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    assert ascii_escaped != body.encode("utf-8")
    assert mw.sign_step(HMAC_SECRET, ts, ascii_escaped) != signature
    # A body-only HMAC (modal-tracking scheme) never verifies as a step signature.
    import hmac as _hmac

    assert _hmac.new(HMAC_SECRET.encode(), body.encode("utf-8"), hashlib.sha256).hexdigest() != signature


def test_step_headers_carry_ts_and_signature():
    raw = HMAC_VECTORS[0][1].encode("utf-8")
    headers = mw.step_headers(HMAC_SECRET, raw, 1790000000.9)
    assert headers["X-Vitas-Timestamp"] == "1790000000"
    assert headers["X-Vitas-Signature"] == HMAC_VECTORS[0][3]
    assert headers["Content-Type"] == "application/json"


def test_hmac_vectors_are_the_contract_ones():
    text = CONTRACT_PATH.read_text(encoding="utf-8")
    secret = re.search(r'STEP_HMAC_TEST_VECTORS = \{\s*secret: "([^"]+)"', text)
    found = re.findall(
        r'ts: "(\d{10})",\s*body: \'([^\']*)\',\s*bodyBytes: (\d+),\s*signature: "([0-9a-f]{64})"', text
    )
    assert secret and secret.group(1) == HMAC_SECRET
    assert [(ts, body, int(n), sig) for ts, body, n, sig in found] == HMAC_VECTORS


# ─────────────────────────────────────────────────────────────────────────────
# Protocol constants · drift check against the contract
# ─────────────────────────────────────────────────────────────────────────────


def _contract() -> str:
    return CONTRACT_PATH.read_text(encoding="utf-8")


def _const(name: str) -> str:
    m = re.search(rf"export const {name} = ([^;\n]+?)(?: as const)?;", _contract())
    assert m, f"{name} not found in contract.ts"
    return m.group(1).strip().strip('"')


def _string_array(name: str) -> list[str]:
    m = re.search(rf"export const {name} = \[(.*?)\]", _contract(), re.DOTALL)
    assert m, f"{name} not found in contract.ts"
    body = re.sub(r"//[^\n]*", "", m.group(1))
    return re.findall(r'"([^"]+)"', body)


def test_protocol_constants_match_the_contract():
    assert int(_const("WORKER_HEARTBEAT_INTERVAL_SEC")) == mw.WORKER_HEARTBEAT_INTERVAL_SEC
    assert int(_const("MATCH_TICK_PERIOD_MIN")) == mw.MATCH_TICK_PERIOD_MIN
    assert _const("GEMINI_UPLOAD_HOST") == mw.GEMINI_UPLOAD_HOST
    assert _const("STEP_SIGNATURE_HEADER") == mw.STEP_SIGNATURE_HEADER
    assert _const("STEP_TIMESTAMP_HEADER") == mw.STEP_TIMESTAMP_HEADER
    assert _const("GEMINI_DISPLAY_NAME_PREFIX") == mw.GEMINI_DISPLAY_NAME_PREFIX
    assert _const("MATCH_JOB_CONTRACT_VERSION") == mw.MATCH_JOB_CONTRACT_VERSION
    assert re.search(r'step: "([^"]+)"', _contract()).group(1) == mw.STEP_ROUTE
    assert tuple(_string_array("MATCH_JOB_STATUSES")) == mw.MATCH_JOB_STATUSES
    assert tuple(_string_array("TERMINAL_MATCH_JOB_STATUSES")) == mw.TERMINAL_MATCH_JOB_STATUSES
    assert tuple(_string_array("WORKER_FAIL_CODES")) == mw.WORKER_FAIL_CODES
    retry_max = re.search(r"retryAfterSec: z\.number\(\)\.int\(\)\.min\(0\)\.max\((\d+)\)", _contract())
    assert int(retry_max.group(1)) == mw.STEP_RETRY_AFTER_MAX_SEC


def test_modal_resources_follow_the_phase1_decisions():
    assert mw.APP_NAME == "vitas-match-worker"
    assert (mw.TRANSCODE_CPU, mw.TRANSCODE_MEMORY_MB, mw.TRANSCODE_TIMEOUT_SEC) == (2.0, 4096, 7200)
    assert (mw.DRIVE_CPU, mw.DRIVE_MEMORY_MB, mw.DRIVE_TIMEOUT_SEC) == (0.25, 1024, 10800)
    assert mw.TRANSCODE_CPU_LIMIT >= mw.TRANSCODE_CPU
    assert mw.DEADLINE_MARGIN_SEC > 300  # room for one last step call (Vercel maxDuration 300 s)
    assert mw.STEP_REQUEST_TIMEOUT_SEC > 300
    assert mp.FFMPEG_THREADS == int(mw.TRANSCODE_CPU)  # ffmpeg threads = reserved cores (billing)


def test_every_image_ships_the_local_modules():
    src = WORKER_PATH.read_text(encoding="utf-8")
    assert mw._LOCAL_MODULES == ("video_url_guard", "match_proxy")
    assert src.count("add_local_python_source(*_LOCAL_MODULES)") == 2  # worker_image + light_image


@pytest.mark.parametrize("name", ["match_worker.py", "match_proxy.py", "video_url_guard.py"])
def test_worker_never_references_provider_keys(name):
    src = (HERE / name).read_text(encoding="utf-8")
    for forbidden in (
        "GEMINI_API_KEY",
        "ANTHROPIC_API_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "BUNNY_STREAM_API_KEY",
        "x-goog-api-key",
        "?key=",
    ):
        assert forbidden not in src, forbidden


# ─────────────────────────────────────────────────────────────────────────────
# Step client (Vercel)
# ─────────────────────────────────────────────────────────────────────────────


class _Clock:
    def __init__(self, t: float = 1_790_000_000.0) -> None:
        self.t = t
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.t

    def sleep(self, s: float) -> None:
        self.sleeps.append(s)
        self.t += s


def _ok(data):
    return httpx.Response(200, json={"ok": True, "success": True, "data": data})


def _step_client(handler, clock=None):
    clock = clock or _Clock()
    seen: list[httpx.Request] = []

    def wrapped(request: httpx.Request):
        seen.append(request)
        return handler(request)

    http = httpx.Client(transport=httpx.MockTransport(wrapped), follow_redirects=False)
    client = mw.StepClient(
        "https://futuro-club.vercel.app/api/match/step", HMAC_SECRET, http=http, clock=clock, sleep=clock.sleep
    )
    return client, seen, clock


def test_step_client_signs_the_exact_bytes_it_sends():
    def handler(request):
        ts = request.headers["X-Vitas-Timestamp"]
        assert re.fullmatch(r"\d{10}", ts)
        assert request.headers["X-Vitas-Signature"] == mw.sign_step(HMAC_SECRET, ts, request.content)
        assert request.content == HMAC_VECTORS[0][1].encode("utf-8")
        return _ok({"state": "observing", "retryAfterSec": 15})

    client, seen, _ = _step_client(handler, _Clock(1790000000))
    data = client.post({"op": "advance", "jobId": JOB, "epoch": 1})
    assert data == {"state": "observing", "retryAfterSec": 15}
    assert seen[0].headers["X-Vitas-Signature"] == HMAC_VECTORS[0][3]


def test_step_client_superseded_raises():
    client, _, _ = _step_client(lambda r: _ok({"superseded": True}))
    with pytest.raises(mw.Superseded):
        client.post({"op": "advance", "jobId": JOB, "epoch": 1})


def test_step_client_retries_5xx_429_and_network_with_backoff_and_fresh_ts():
    outcomes = iter(["503", "429", "net", "ok"])

    def handler(request):
        o = next(outcomes)
        if o == "net":
            raise httpx.ConnectError("boom", request=request)
        if o == "ok":
            return _ok({"state": "observing", "retryAfterSec": 0})
        return httpx.Response(int(o))

    client, seen, clock = _step_client(handler)
    client.post({"op": "advance", "jobId": JOB, "epoch": 1})
    assert clock.sleeps == [5, 10, 20]
    stamps = [r.headers["X-Vitas-Timestamp"] for r in seen]
    assert len(set(stamps)) == len(stamps) == 4  # re-signed on every attempt


@pytest.mark.parametrize("status,exc", [(401, "StepUnauthorized"), (400, "StepRejected"), (404, "StepRejected"), (307, "StepRejected")])
def test_step_client_does_not_retry_4xx_or_redirects(status, exc):
    def handler(request):
        headers = {"location": "https://evil.example.com/x"} if status == 307 else {}
        return httpx.Response(status, headers=headers, json={"ok": False, "error": {"code": "invalid_input", "message": "x"}})

    client, seen, clock = _step_client(handler)
    with pytest.raises(getattr(mw, exc)) as err:
        client.post({"op": "begin", "jobId": JOB, "epoch": 1})
    assert len(seen) == 1 and clock.sleeps == []
    if exc == "StepRejected" and status == 400:
        assert err.value.code == "invalid_input"


def test_step_client_deadline_stops_the_retries():
    client, seen, clock = _step_client(lambda r: httpx.Response(504))
    with pytest.raises(mw.StepDeadlineExceeded):
        client.post({"op": "advance", "jobId": JOB, "epoch": 1}, deadline=clock() + 12)
    assert clock.sleeps == [5]  # 5 fits, the next 10 would cross the deadline
    assert len(seen) == 2


def test_step_client_single_attempt_mode():
    client, seen, clock = _step_client(lambda r: httpx.Response(503))
    with pytest.raises(mw.StepTransientError):
        client.post({"op": "tick", "jobId": None, "epoch": None, "scheduledAt": "2026-09-28T10:00:00+00:00"}, retry=False)
    assert len(seen) == 1 and clock.sleeps == []


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="<html>"),
        httpx.Response(200, json={"ok": False}),
        httpx.Response(200, json={"ok": True, "data": None}),
    ],
)
def test_step_client_rejects_bodies_outside_the_envelope(response):
    client, _, _ = _step_client(lambda r: response)
    with pytest.raises(mw.StepProtocolError):
        client.post({"op": "advance", "jobId": JOB, "epoch": 1})


# ─────────────────────────────────────────────────────────────────────────────
# Reply parsing
# ─────────────────────────────────────────────────────────────────────────────


def test_parse_begin_transcode_plan():
    d = mw.parse_begin_reply(_begin_transcode(), 1)
    assert d.action == "transcode"
    assert d.plan.target_height == 360
    assert d.plan.expected_duration_sec == 5400.0
    assert d.plan.proxy == SPEC


def test_parse_begin_advance_and_stop():
    assert mw.parse_begin_reply({"action": "advance", "epoch": 3}, 3).action == "advance"
    stop = mw.parse_begin_reply({"action": "stop", "epoch": 3, "state": "cancelled"}, 3)
    assert (stop.action, stop.state) == ("stop", "cancelled")


def test_parse_begin_other_epoch_is_superseded():
    with pytest.raises(mw.Superseded):
        mw.parse_begin_reply(_begin_transcode(epoch=2), 1)


@pytest.mark.parametrize(
    "override",
    [
        {"proxy": {**PROXY, "audio": True}},  # audio is pinned to false by the contract
        {"proxy": {**PROXY, "container": "mkv"}},
        {"proxy": {**PROXY, "crf": 60}},
        {"proxy": {**PROXY, "fps": 0}},
        {"targetVariant": "360"},
        {"sourceUrl": "http://insecure.example.com/a.m3u8"},
        {"expectedDurationSec": 0},
        {"expectedDurationSec": True},
        {"action": "download"},
    ],
)
def test_parse_begin_refuses_out_of_contract_replies(override):
    with pytest.raises(mw.StepProtocolError):
        mw.parse_begin_reply(_begin_transcode(**override), 1)


@pytest.mark.parametrize("wait", [-1, 301, 1.5, True, None])
def test_parse_advance_bounds(wait):
    with pytest.raises(mw.StepProtocolError):
        mw.parse_advance_reply({"state": "observing", "retryAfterSec": wait})


def test_parse_advance_and_unknown_state():
    assert mw.parse_advance_reply({"state": "reporting", "retryAfterSec": 300}).retry_after_sec == 300
    with pytest.raises(mw.StepProtocolError):
        mw.parse_advance_reply({"state": "done", "retryAfterSec": 0})


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.example.com/upload?upload_id=1",
        "http://generativelanguage.googleapis.com/upload",
        "https://generativelanguage.googleapis.com.evil.com/upload",
        "https://user@generativelanguage.googleapis.com/upload",
        "https://generativelanguage.googleapis.com:8443/upload",
        None,
    ],
)
def test_upload_session_url_must_be_the_gemini_host(url):
    with pytest.raises(mw.WorkerFailure) as err:
        mw.parse_upload_session_reply({"uploadUrl": url, "displayName": f"vitas-match-{JOB}-1", "chunkGranularityBytes": None})
    assert err.value.code == "upload_failed"


def test_upload_session_reply_ok():
    s = mw.parse_upload_session_reply(
        {"uploadUrl": UPLOAD_URL, "displayName": f"vitas-match-{JOB}-1", "chunkGranularityBytes": 8388608}
    )
    assert s.chunk_granularity_bytes == 8388608
    assert "upload_id" not in repr(s)  # the capability URL is never printed


# ─────────────────────────────────────────────────────────────────────────────
# HLS variant selection + source resolution (allowlist)
# ─────────────────────────────────────────────────────────────────────────────


def test_parse_master_playlist_resolves_variants():
    kind, variants = mw.parse_hls_playlist(MASTER, MASTER_URL)
    assert kind == "master"
    assert [v.height for v in variants] == [240, 360, 480, 720]
    assert variants[1].url == VARIANT_360_URL
    assert variants[1].bandwidth == 1240000


def test_select_variant_picks_the_smallest_at_or_above_target():
    _, variants = mw.parse_hls_playlist(MASTER, MASTER_URL)
    assert mw.select_variant(variants, 360).height == 360
    without_360 = [v for v in variants if v.height != 360]
    assert mw.select_variant(without_360, 360).height == 480  # never the 240p (no upscaling)


def test_select_variant_without_any_eligible_variant_fails_honestly():
    _, variants = mw.parse_hls_playlist(MASTER, MASTER_URL)
    with pytest.raises(mw.WorkerFailure) as err:
        mw.select_variant(variants, 1080)
    assert err.value.code == "source_unavailable"


def test_select_variant_uses_path_height_and_bandwidth_tie_break():
    master = (
        "#EXTM3U\n"
        "#EXT-X-STREAM-INF:BANDWIDTH=900000\nhigh/360p/video.m3u8\n"
        "#EXT-X-STREAM-INF:BANDWIDTH=600000\nlow/360p/video.m3u8\n"
    )
    _, variants = mw.parse_hls_playlist(master, MASTER_URL)
    assert [v.height for v in variants] == [360, 360]
    assert mw.select_variant(variants, 360).url.endswith("/low/360p/video.m3u8")


def test_media_playlist_lists_every_resource_ffmpeg_opens():
    media = MEDIA.replace(
        "#EXT-X-VERSION:3", '#EXT-X-VERSION:3\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"'
    )
    kind, uris = mw.parse_hls_playlist(media, VARIANT_360_URL)
    assert kind == "media"
    base = VARIANT_360_URL.rsplit("/", 1)[0]
    assert uris == [f"{base}/key.bin", f"{base}/init.mp4", f"{base}/video0.ts", f"{base}/video1.ts", f"{base}/video2.ts"]


def test_non_playlist_is_rejected():
    with pytest.raises(mw.WorkerFailure) as err:
        mw.parse_hls_playlist("<html>", MASTER_URL)
    assert err.value.code == "source_unavailable"


def _cdn_client(routes: dict, calls: list):
    def handler(request):
        calls.append(str(request.url))
        route = routes.get(str(request.url))
        if route is None:
            return httpx.Response(404)
        return route(request) if callable(route) else route

    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)


def _m3u8(text):
    return httpx.Response(200, headers={"content-type": "application/x-mpegURL"}, text=text)


def _plan(**overrides):
    return mw.parse_begin_reply(_begin_transcode(**overrides), 1).plan


def test_resolve_source_master_to_variant_and_checks_segment_hosts():
    calls: list[str] = []
    client = _cdn_client({MASTER_URL: _m3u8(MASTER), VARIANT_360_URL: _m3u8(MEDIA)}, calls)
    src = mw.resolve_source(MASTER_URL, 360, env=ENV, client=client)
    assert (src.kind, src.height, src.segments) == ("hls", 360, 3)
    assert src.input_url == VARIANT_360_URL
    assert calls == [MASTER_URL, VARIANT_360_URL]


def test_resolve_source_rejects_a_playlist_that_points_elsewhere():
    evil_media = MEDIA.replace("video1.ts", "https://evil.example.com/steal.ts")
    client = _cdn_client({MASTER_URL: _m3u8(MASTER), VARIANT_360_URL: _m3u8(evil_media)}, [])
    with pytest.raises(mw.WorkerFailure) as err:
        mw.resolve_source_with_retries(_plan(), env=ENV, client=client, sleep=lambda s: None)
    assert err.value.code == "internal"
    assert "allowlist" in err.value.reason


def test_resolve_source_refuses_a_source_outside_the_allowlist_before_any_request():
    calls: list[str] = []
    client = _cdn_client({}, calls)
    with pytest.raises(mw.WorkerFailure) as err:
        mw.resolve_source_with_retries(
            _plan(sourceUrl="https://169.254.169.254/latest/meta-data/"), env=ENV, client=client, sleep=lambda s: None
        )
    assert err.value.code == "internal" and calls == []


def test_resolve_source_fails_closed_without_cdn_env():
    with pytest.raises(mw.WorkerFailure) as err:
        mw.resolve_source_with_retries(_plan(), env={}, client=_cdn_client({}, []), sleep=lambda s: None)
    assert err.value.code == "internal"
    assert "BUNNY_CDN_HOSTNAME" in err.value.reason


@pytest.mark.parametrize("status,code", [(403, "source_forbidden"), (401, "source_forbidden"), (404, "source_unavailable")])
def test_resolve_source_maps_cdn_status_without_retrying_4xx(status, code):
    calls: list[str] = []
    client = _cdn_client({MASTER_URL: httpx.Response(status)}, calls)
    sleeps: list[float] = []
    with pytest.raises(mw.WorkerFailure) as err:
        mw.resolve_source_with_retries(_plan(), env=ENV, client=client, sleep=sleeps.append)
    assert err.value.code == code
    assert calls == [MASTER_URL] and sleeps == []


def test_resolve_source_retries_cdn_5xx():
    outcomes = iter([httpx.Response(503), _m3u8(MASTER)])
    calls: list[str] = []
    client = _cdn_client({MASTER_URL: lambda r: next(outcomes), VARIANT_360_URL: _m3u8(MEDIA)}, calls)
    sleeps: list[float] = []
    src = mw.resolve_source_with_retries(_plan(), env=ENV, client=client, sleep=sleeps.append)
    assert src.input_url == VARIANT_360_URL and sleeps == [5]


def test_resolve_source_direct_mp4_and_non_video():
    mp4 = f"https://{CDN}/guid/play_360p.mp4"
    client = _cdn_client({mp4: httpx.Response(200, headers={"content-type": "video/mp4"}, content=b"\x00" * 16)}, [])
    assert mw.resolve_source(mp4, 360, env=ENV, client=client).kind == "mp4"
    html = f"https://{CDN}/guid/index.html"
    client = _cdn_client({html: httpx.Response(200, headers={"content-type": "text/html"}, text="<h1>")}, [])
    with pytest.raises(mw.WorkerFailure) as err:
        mw.resolve_source(html, 360, env=ENV, client=client)
    assert err.value.code == "source_unavailable"


# ─────────────────────────────────────────────────────────────────────────────
# ffmpeg / ffprobe command construction + parsing
# ─────────────────────────────────────────────────────────────────────────────


def test_ffmpeg_command_builds_the_contract_proxy():
    cmd = mw.build_ffmpeg_cmd(VARIANT_360_URL, "/tmp/x/proxy.mp4", SPEC)
    assert cmd[0] == "ffmpeg" and cmd[-1] == "/tmp/x/proxy.mp4"
    assert cmd[cmd.index("-i") + 1] == VARIANT_360_URL
    assert {"-an", "-sn", "-dn"} <= set(cmd)  # no audio: minors' voices never reach Google
    assert cmd[cmd.index("-map") + 1] == "0:v:0"
    assert cmd[cmd.index("-vf") + 1] == "fps=1,scale=-2:360"
    assert cmd[cmd.index("-c:v") + 1] == "libx264"
    assert cmd[cmd.index("-crf") + 1] == "30"
    assert cmd[cmd.index("-movflags") + 1] == "+faststart"
    assert cmd[cmd.index("-f") + 1] == "mp4"
    assert cmd[cmd.index("-progress") + 1] == "pipe:1"
    assert not any(a in cmd for a in ("-c:a", "-acodec", "-b:a"))
    # [level]-tagged verbose log: the fps filter statistics feed the continuity check.
    assert cmd[cmd.index("-loglevel") + 1] == "level+verbose"
    # Network stall guard on the input, and no hls-only option unless asked for.
    assert cmd.index("-rw_timeout") < cmd.index("-i") and cmd[cmd.index("-rw_timeout") + 1] == "60000000"
    assert "-seg_max_retry" not in cmd


def test_ffmpeg_hls_segment_retry_is_an_input_option_only_when_requested():
    cmd = mw.build_ffmpeg_cmd(VARIANT_360_URL, "/tmp/p.mp4", SPEC, hls_seg_max_retry=mw.HLS_SEG_MAX_RETRY)
    assert cmd.index("-seg_max_retry") < cmd.index("-i")
    assert cmd[cmd.index("-seg_max_retry") + 1] == "3"


def test_ffmpeg_protocol_whitelist_excludes_file_and_plain_http():
    cmd = mw.build_ffmpeg_cmd(VARIANT_360_URL, "/tmp/p.mp4", SPEC)
    i = cmd.index("-protocol_whitelist")
    assert i < cmd.index("-i")
    protocols = set(cmd[i + 1].split(","))
    assert "https" in protocols and not protocols & {"file", "http", "data", "concat", "subfile"}


def test_local_cli_recipe_differs_only_in_io_options():
    remote = mw.build_ffmpeg_cmd(VARIANT_360_URL, "/tmp/p.mp4", SPEC)
    local = mp.build_ffmpeg_cmd(
        "clip.mp4", "/tmp/p.mp4", SPEC, protocol_whitelist=mp.LOCAL_PROTOCOL_WHITELIST, rw_timeout_us=None
    )

    def encode_part(cmd):
        return cmd[cmd.index("-map") :]

    assert encode_part(local) == encode_part(remote)  # same proxy recipe (inv. #7)
    assert local[local.index("-protocol_whitelist") + 1] == "file,crypto" and "-rw_timeout" not in local


def test_ffmpeg_threads_match_the_reserved_cores():
    cmd = mw.build_ffmpeg_cmd(VARIANT_360_URL, "/tmp/p.mp4", SPEC)
    assert [cmd[i + 1] for i, a in enumerate(cmd) if a == "-threads"] == ["2", "2"]


def test_ffmpeg_fractional_fps_and_other_height():
    spec = mw.ProxySpec(fps=0.5, max_height=240, crf=28, duration_tolerance_sec=2.0)
    cmd = mw.build_ffmpeg_cmd(VARIANT_360_URL, "/tmp/p.mp4", spec)
    assert cmd[cmd.index("-vf") + 1] == "fps=0.5,scale=-2:240"
    assert cmd[cmd.index("-crf") + 1] == "28"


@pytest.mark.parametrize(
    "line,expected",
    [
        ("out_time_us=90500000\n", 90.5),
        ("out_time_ms=1000000", 1.0),
        ("out_time=00:01:30.500000", 90.5),
        ("out_time=01:00:00.000000", 3600.0),
        ("out_time=N/A", None),
        ("out_time_us=N/A", None),
        ("progress=continue", None),
        ("frame=12", None),
        ("garbage", None),
    ],
)
def test_parse_progress_line(line, expected):
    assert mw.parse_progress_line(line) == expected


def _probe_json(duration="5401.000000", streams=None):
    streams = [{"index": 0, "codec_name": "h264", "codec_type": "video", "width": 640, "height": 360}] if streams is None else streams
    return json.dumps({"programs": [], "stream_groups": [], "streams": streams, "format": {"duration": duration}})


def test_ffprobe_command_and_json_parsing():
    cmd = mw.build_ffprobe_cmd("/tmp/p.mp4")
    assert cmd[0] == "ffprobe" and cmd[-1] == "/tmp/p.mp4" and cmd[cmd.index("-of") + 1] == "json"
    assert "codec_type" in cmd[cmd.index("-show_entries") + 1]
    probe = mw.parse_ffprobe(_probe_json())
    assert probe.duration_sec == 5401.0
    assert probe.streams == (mp.ProbedStream(codec_type="video", codec_name="h264", height=360),)
    assert mw.parse_ffprobe(_probe_json(duration="N/A")).duration_sec is None
    assert mw.parse_ffprobe(_probe_json(duration="0.000")).duration_sec is None
    assert mw.parse_ffprobe("") is None and mw.parse_ffprobe("5401.0") is None and mw.parse_ffprobe("[]") is None


@pytest.mark.parametrize(
    "streams,code",
    [
        (
            [
                {"codec_type": "video", "codec_name": "h264", "height": 360},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
            "internal",  # audio must never reach Google, whatever the command said
        ),
        ([], "transcode_failed"),
        ([{"codec_type": "video", "codec_name": "hevc", "height": 360}], "transcode_failed"),
        ([{"codec_type": "video", "codec_name": "h264", "height": 480}], "transcode_failed"),
        ([{"codec_type": "video", "codec_name": "h264"}], "transcode_failed"),
        ([{"codec_type": "video", "codec_name": "h264", "height": 360}, {"codec_type": "data"}], "transcode_failed"),
    ],
)
def test_proxy_stream_problems(streams, code):
    problem = mp.proxy_stream_problem(mw.parse_ffprobe(_probe_json(streams=streams)), SPEC)
    assert problem is not None and problem[0] == code


def test_proxy_stream_ok():
    assert mp.proxy_stream_problem(mw.parse_ffprobe(_probe_json()), SPEC) is None


@pytest.mark.parametrize("probe,ok", [(5401.0, True), (5398.0, True), (5402.1, False), (5397.9, False)])
def test_duration_tolerance_vs_bunny_length(probe, ok):
    assert mw.duration_within_tolerance(probe, 5400.0, 2.0) is ok


@pytest.mark.parametrize(
    "stderr,code",
    [
        ("<url>: Server returned 403 Forbidden (access denied)", "source_forbidden"),
        ("[https @ 0x55] HTTP error 401 Unauthorized", "source_forbidden"),
        ("[hls @ 0x55] HTTP error 404 Not Found", "source_unavailable"),
        ("Server returned 5XX Server Error reply", "source_unavailable"),
        ("Protocol 'file' not on whitelist 'https,tls,tcp,crypto'!", "source_unavailable"),
        ("[https @ 0x55] [error] HTTP error 503 Service Unavailable", "source_unavailable"),
        ("Invalid data found when processing input", "transcode_failed"),
        # A stray number is not an HTTP status (the old regex took "dts = 403" as a 403).
        ("[mpegts @ 0x55] [warning] Packet corrupt (stream = 0, dts = 403).", "transcode_failed"),
        ("[h264 @ 0x55] [error] error while decoding MB 12 503", "transcode_failed"),
    ],
)
def test_classify_ffmpeg_failure(stderr, code):
    assert mw.classify_ffmpeg_failure(stderr) == code


# ─────────────────────────────────────────────────────────────────────────────
# ffmpeg log scan + continuity (a lost HLS segment must never become frozen frames)
# ─────────────────────────────────────────────────────────────────────────────

# Literal lines from ffmpeg 8.1 (`-loglevel level+verbose`) on a local HLS with segment 1 deleted:
# ffmpeg exits 0 and the fps filter repeats 9 frames to fill the hole.
FPS_PROBE_LINE = "[Parsed_fps_0 @ 0000018f3387dd80] [verbose] 0 frames in, 0 frames out; 0 frames dropped, 0 frames duplicated."
FPS_OK_LINE = "[Parsed_fps_0 @ 0000018f35e11bc0] [verbose] 537 frames in, 21 frames out; 516 frames dropped, 0 frames duplicated."
FPS_GAP_LINE = "[Parsed_fps_0 @ 00000278c1551000] [verbose] 287 frames in, 21 frames out; 275 frames dropped, 9 frames duplicated."
SEGMENT_FAILED = "[in#0/hls @ 000001bddfa60480] [warning] Failed to open segment 1 of playlist 0"
SEGMENT_SKIPPED = "[in#0/hls @ 000001bddfa60480] [warning] Segment 1 of playlist 0 failed too many times, skipping"
OPENING_INFO = f"[in#0/hls @ 000001bddfa60480] [info] Opening 'https://{CDN}/g/360p/video7.ts?token=secret' for reading"


def _log(*lines):
    log = mp.FfmpegLog()
    for line in lines:
        log.feed(line + "\n")
    return log


def test_log_scan_keeps_problems_and_the_real_fps_stats():
    log = _log(FPS_PROBE_LINE, OPENING_INFO, SEGMENT_FAILED, SEGMENT_SKIPPED, FPS_GAP_LINE, "Invalid loglevel")
    assert log.fps_stats == mp.FpsStats(frames_in=287, frames_out=21, dropped=275, duplicated=9)
    assert (log.segment_open_failures, log.segments_skipped) == (1, 1)
    assert list(log.problems) == [SEGMENT_FAILED, SEGMENT_SKIPPED, "Invalid loglevel"]
    assert "token" not in log.tail  # info lines (segment URLs) are never kept


def test_log_scan_probe_instance_does_not_hide_the_real_stats():
    assert _log(FPS_PROBE_LINE).fps_stats.frames_in == 0
    assert _log(FPS_PROBE_LINE, FPS_OK_LINE, FPS_PROBE_LINE).fps_stats.frames_in == 537


def test_log_scan_adds_up_reconfigured_filter_graphs():
    # A graph rebuilt mid-stream reports twice: a hole in the first part must not be forgotten.
    stats = _log(FPS_PROBE_LINE, FPS_GAP_LINE, FPS_OK_LINE).fps_stats
    assert stats == mp.FpsStats(frames_in=287 + 537, frames_out=42, dropped=275 + 516, duplicated=9)


def test_continuity_ok():
    mp.check_ffmpeg_result(0, _log(FPS_PROBE_LINE, FPS_OK_LINE), SPEC, hls_seg_retry=True)


@pytest.mark.parametrize(
    "lines,seg_retry,code,needle",
    [
        ((SEGMENT_FAILED, SEGMENT_SKIPPED, FPS_GAP_LINE), True, "source_unavailable", "1 segmento"),
        ((SEGMENT_FAILED, FPS_OK_LINE), False, "source_unavailable", "1 segmento"),  # ffmpeg without seg_max_retry
        (
            ("[https @ 0x1] [error] HTTP error 403 Forbidden", SEGMENT_FAILED, SEGMENT_SKIPPED, FPS_GAP_LINE),
            True,
            "source_forbidden",
            "segmento",
        ),
        ((FPS_GAP_LINE,), True, "transcode_failed", "repitió 9 fotogramas"),  # timeline hole, no lost segment
        ((FPS_PROBE_LINE,), True, "transcode_failed", "continuidad"),  # stats missing → cannot verify → fail
        ((), True, "transcode_failed", "continuidad"),
    ],
)
def test_continuity_failures(lines, seg_retry, code, needle):
    with pytest.raises(mp.ProxyError) as err:
        mp.check_ffmpeg_result(0, _log(*lines), SPEC, hls_seg_retry=seg_retry)
    assert err.value.code == code and needle in err.value.reason


def test_transient_segment_failure_recovered_by_retry_is_not_a_loss():
    mp.check_ffmpeg_result(0, _log(SEGMENT_FAILED, SEGMENT_FAILED, FPS_OK_LINE), SPEC, hls_seg_retry=True)


def test_repeated_frames_allowance_is_the_duration_tolerance_in_frames():
    assert mp.allowed_repeated_frames(SPEC) == 2
    assert mp.allowed_repeated_frames(mp.ProxySpec(fps=0.5, max_height=360, crf=30, duration_tolerance_sec=2)) == 1
    assert mp.allowed_repeated_frames(mp.ProxySpec(fps=2, max_height=360, crf=30, duration_tolerance_sec=0)) == 0
    two_dups = FPS_OK_LINE.replace("0 frames duplicated", "2 frames duplicated")
    mp.check_ffmpeg_result(0, _log(two_dups), SPEC, hls_seg_retry=True)
    with pytest.raises(mp.ProxyError):
        mp.check_ffmpeg_result(0, _log(two_dups.replace("2 frames duplicated", "3 frames duplicated")), SPEC, hls_seg_retry=True)


def test_nonzero_exit_uses_the_last_problem_line():
    with pytest.raises(mp.ProxyError) as err:
        mp.check_ffmpeg_result(8, _log(OPENING_INFO, "[fatal] Error opening input files: Server returned 404 Not Found"), SPEC, hls_seg_retry=False)
    assert err.value.code == "source_unavailable"
    assert err.value.reason == "ffmpeg salió con código 8: [fatal] Error opening input files: Server returned 404 Not Found"


HLS_HELP = """Demuxer hls [Apple HTTP Live Streaming]:
hls demuxer AVOptions:
  -max_reload        <int>        .D......... Maximum number of times a insufficient list is attempted to be reloaded
  -seg_max_retry     <int>        .D......... Maximum number of times to reload a segment on error. (default 0)
"""


def test_hls_seg_retry_detection():
    assert mp.hls_demuxer_supports(HLS_HELP, "seg_max_retry")
    assert not mp.hls_demuxer_supports(HLS_HELP.replace("seg_max_retry", "other_option"), "seg_max_retry")
    assert mp.detect_hls_seg_retry(lambda cmd, **k: FakeCompleted(HLS_HELP))
    assert not mp.detect_hls_seg_retry(lambda cmd, **k: FakeCompleted(HLS_HELP, returncode=1))

    def boom(cmd, **k):
        raise FileNotFoundError("ffmpeg")

    assert not mp.detect_hls_seg_retry(boom)


def test_redact_strips_urls_and_tokens():
    raw = (
        f"https://{CDN}/g/360p/video.m3u8?token=abc123&expires=17: Server returned 403\n"
        "retry with bcdn_token=zzz and upload_id=qq"
    )
    out = mw.redact(raw)
    assert "https://" not in out and "abc123" not in out and "zzz" not in out and "qq" not in out
    assert "<url>" in out and "\n" not in out
    assert len(mw.redact("x" * 5000)) == 1000


# ─────────────────────────────────────────────────────────────────────────────
# Gemini resumable upload: resume offset parsing + resume loop
# ─────────────────────────────────────────────────────────────────────────────


def test_parse_upload_query_active_offset():
    assert mw.parse_upload_query(
        {"X-Goog-Upload-Status": "active", "X-Goog-Upload-Size-Received": "8388608"}, 20_000_000
    ) == ("active", 8388608)
    assert mw.parse_upload_query(
        {"x-goog-upload-status": "ACTIVE", "x-goog-upload-size-received": " 0 "}, 10
    ) == ("active", 0)
    assert mw.parse_upload_query({"X-Goog-Upload-Status": "final"}, 10) == ("final", None)


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Goog-Upload-Status": "active"},
        {"X-Goog-Upload-Status": "active", "X-Goog-Upload-Size-Received": "-1"},
        {"X-Goog-Upload-Status": "active", "X-Goog-Upload-Size-Received": "11"},
        {"X-Goog-Upload-Status": "weird", "X-Goog-Upload-Size-Received": "1"},
        {},
    ],
)
def test_parse_upload_query_rejects_bad_offsets(headers):
    with pytest.raises(mw.WorkerFailure) as err:
        mw.parse_upload_query(headers, 10)
    assert err.value.code == "upload_failed"


@pytest.fixture()
def proxy_file(tmp_path):
    data = bytes(range(256)) * (3 * 4096 + 7)  # ~3 MiB, not a multiple of the read chunk
    p = tmp_path / "proxy.mp4"
    p.write_bytes(data)
    return str(p), data


def _gemini_client(handler, seen):
    def wrapped(request):
        seen.append(
            {
                "cmd": request.headers.get("x-goog-upload-command"),
                "offset": request.headers.get("x-goog-upload-offset"),
                "length": request.headers.get("content-length"),
                "chunked": "transfer-encoding" in request.headers,
                "body": request.content,
            }
        )
        return handler(request)

    return httpx.Client(transport=httpx.MockTransport(wrapped), follow_redirects=False)


def test_upload_resumes_from_the_queried_offset(proxy_file):
    path, data = proxy_file
    resume_at = 2 * 1024 * 1024
    script = iter(["fail", "query", "final"])

    def handler(request):
        step = next(script)
        if step == "fail":
            return httpx.Response(503)
        if step == "query":
            assert request.headers["x-goog-upload-command"] == "query"
            return httpx.Response(
                200, headers={"X-Goog-Upload-Status": "active", "X-Goog-Upload-Size-Received": str(resume_at)}
            )
        return httpx.Response(200, json={"file": {**GEMINI_FILE, "state": "PROCESSING"}})

    seen: list[dict] = []
    progress: list[int] = []
    sleeps: list[float] = []
    ref = mw.upload_proxy(
        path,
        UPLOAD_URL,
        len(data),
        http=_gemini_client(handler, seen),
        should_abort=lambda: False,
        on_progress=progress.append,
        sleep=sleeps.append,
    )
    assert ref == GEMINI_FILE
    first, query, resumed = seen
    assert (first["cmd"], first["offset"], first["length"]) == ("upload, finalize", "0", str(len(data)))
    assert first["body"] == data and not first["chunked"]
    assert query["cmd"] == "query"
    assert (resumed["cmd"], resumed["offset"], resumed["length"]) == (
        "upload, finalize",
        str(resume_at),
        str(len(data) - resume_at),
    )
    assert resumed["body"] == data[resume_at:] and not resumed["chunked"]
    assert sleeps == [5] and progress[-1] == len(data)


def test_upload_query_final_returns_the_file_without_reuploading(proxy_file):
    path, data = proxy_file
    script = iter([httpx.Response(502), httpx.Response(200, headers={"X-Goog-Upload-Status": "final"}, json={"file": GEMINI_FILE})])
    seen: list[dict] = []
    ref = mw.upload_proxy(
        path, UPLOAD_URL, len(data), http=_gemini_client(lambda r: next(script), seen),
        should_abort=lambda: False, on_progress=lambda n: None, sleep=lambda s: None,
    )  # fmt: skip
    assert ref == GEMINI_FILE and [s["cmd"] for s in seen] == ["upload, finalize", "query"]


def test_upload_4xx_is_fatal_without_retry(proxy_file):
    path, data = proxy_file
    seen: list[dict] = []
    with pytest.raises(mw.WorkerFailure) as err:
        mw.upload_proxy(
            path, UPLOAD_URL, len(data), http=_gemini_client(lambda r: httpx.Response(400), seen),
            should_abort=lambda: False, on_progress=lambda n: None, sleep=lambda s: None,
        )  # fmt: skip
    assert err.value.code == "upload_failed" and len(seen) == 1


def test_upload_gives_up_after_the_attempt_cap(proxy_file):
    path, data = proxy_file

    def handler(request):
        if request.headers.get("x-goog-upload-command") == "query":
            return httpx.Response(200, headers={"X-Goog-Upload-Status": "active", "X-Goog-Upload-Size-Received": "0"})
        return httpx.Response(503)

    seen: list[dict] = []
    with pytest.raises(mw.WorkerFailure) as err:
        mw.upload_proxy(
            path, UPLOAD_URL, len(data), http=_gemini_client(handler, seen),
            should_abort=lambda: False, on_progress=lambda n: None, sleep=lambda s: None,
        )  # fmt: skip
    assert err.value.code == "upload_failed"
    assert sum(1 for s in seen if s["cmd"] == "upload, finalize") == mw.UPLOAD_MAX_ATTEMPTS


def test_upload_rejects_an_invalid_file_reference(proxy_file):
    path, data = proxy_file
    bad = {"file": {"name": "../etc", "uri": "https://evil.example.com/f"}}
    with pytest.raises(mw.WorkerFailure):
        mw.upload_proxy(
            path, UPLOAD_URL, len(data), http=_gemini_client(lambda r: httpx.Response(200, json=bad), []),
            should_abort=lambda: False, on_progress=lambda n: None, sleep=lambda s: None,
        )  # fmt: skip


def test_upload_refuses_a_foreign_upload_host_before_sending(proxy_file):
    path, data = proxy_file
    seen: list[dict] = []
    with pytest.raises(mw.WorkerFailure):
        mw.upload_proxy(
            path, "https://evil.example.com/upload", len(data), http=_gemini_client(lambda r: httpx.Response(200), seen),
            should_abort=lambda: False, on_progress=lambda n: None, sleep=lambda s: None,
        )  # fmt: skip
    assert seen == []


def test_upload_aborts_when_asked(proxy_file):
    path, data = proxy_file
    with pytest.raises(mw._UploadAborted):
        mw.upload_proxy(
            path, UPLOAD_URL, len(data), http=_gemini_client(lambda r: httpx.Response(200, json={"file": GEMINI_FILE}), []),
            should_abort=lambda: True, on_progress=lambda n: None, sleep=lambda s: None,
        )  # fmt: skip


# ─────────────────────────────────────────────────────────────────────────────
# Orchestration: transcode job, superseded handling, driver loop, tick
# ─────────────────────────────────────────────────────────────────────────────


class FakeStep:
    """Scripted Vercel: per op, a list of replies (data dicts or exceptions) or a callable."""

    def __init__(self, script: dict) -> None:
        self.script = script
        self.calls: list[dict] = []
        self._lock = threading.Lock()

    def post(self, body, *, deadline=None, retry=True):
        with self._lock:
            self.calls.append(json.loads(mw.canonical_json(body)))
            entry = self.script[body["op"]]
            reply = entry(body) if callable(entry) else entry.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return mw.parse_envelope({"ok": True, "data": reply})

    def ops(self) -> list[str]:
        return [c["op"] for c in self.calls]

    def close(self) -> None:
        pass


FFMPEG_OK_STDERR = (FPS_PROBE_LINE + "\n", OPENING_INFO + "\n", FPS_OK_LINE + "\n")


class FakeProc:
    """subprocess.Popen fake for ffmpeg: writes the output file, emits -progress + stderr."""

    def __init__(self, cmd, *, payload=b"", rc=0, stderr=FFMPEG_OK_STDERR, block=False, started=None):
        self.cmd = cmd
        self._rc = rc
        self.returncode = None
        self.killed = threading.Event()
        self.stderr = iter(stderr)
        self._block = block
        if payload:
            Path(cmd[-1]).write_bytes(payload)
        if started is not None:
            started.set()
        self.stdout = self._stdout()

    def _stdout(self):
        yield "out_time_us=1000000\n"
        yield "progress=continue\n"
        if self._block:
            self.killed.wait(timeout=5)

    def wait(self):
        self.returncode = -9 if self.killed.is_set() else self._rc
        return self.returncode

    def poll(self):
        return self.returncode

    def kill(self):
        self.killed.set()


class FakeCompleted:
    def __init__(self, stdout: str, returncode: int = 0) -> None:
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = ""


class FakeRun:
    """subprocess.run fake: fmpeg -h demuxer=hls → help text; ffprobe → JSON."""

    def __init__(self, probe=None, help_text=HLS_HELP):
        self.probe = _probe_json() if probe is None else probe
        self.help_text = help_text
        self.calls: list[list[str]] = []

    def __call__(self, cmd, **kwargs):
        self.calls.append(list(cmd))
        assert kwargs.get("timeout"), "every subprocess.run call must be bounded"
        if cmd[0] == "ffmpeg":
            return FakeCompleted(self.help_text)
        if cmd[0] == "ffprobe":
            return FakeCompleted(self.probe)
        pytest.fail(f"unexpected command {cmd[0]}")


def _deps(step, *, http=None, popen=None, run=None, clock=None, interval=3600.0, tmp_root=None, env=ENV, spawn=None):
    clock = clock or _Clock()
    spawned: list[tuple] = []
    deps = mw.Deps(
        step=step,
        heartbeat_step=step,
        http=http or httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(599))),
        env=env,
        spawn_drive=spawn or (lambda j, e: spawned.append((j, e))),
        popen=popen or (lambda *a, **k: pytest.fail("ffmpeg must not run")),
        run=run or (lambda *a, **k: pytest.fail("ffprobe must not run")),
        clock=clock,
        sleep=clock.sleep,
        heartbeat_interval=interval,
        tmp_root=tmp_root,
    )
    return deps, spawned


def _world_http(gemini_seen: list, cdn_calls: list):
    def handler(request):
        url = str(request.url)
        if request.url.host == mw.GEMINI_UPLOAD_HOST:
            gemini_seen.append(request)
            return httpx.Response(200, json={"file": GEMINI_FILE})
        cdn_calls.append(url)
        if url == MASTER_URL:
            return _m3u8(MASTER)
        if url == VARIANT_360_URL:
            return _m3u8(MEDIA)
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)


PAYLOAD = b"\x00\x00\x00\x18ftypisom" + b"proxy" * 50_000
SESSION = {"uploadUrl": UPLOAD_URL, "displayName": f"vitas-match-{JOB}-1", "chunkGranularityBytes": 8388608}


def test_transcode_job_happy_path(tmp_path):
    step = FakeStep(
        {
            "begin": [_begin_transcode()],
            "upload_session": [dict(SESSION)],
            "proxy_ready": [{"state": "gemini_processing"}],
        }
    )
    procs: list[FakeProc] = []
    gemini_seen: list[httpx.Request] = []
    cdn_calls: list[str] = []

    def popen(cmd, **kwargs):
        assert kwargs["stdout"] is not None and kwargs["text"] is True
        procs.append(FakeProc(cmd, payload=PAYLOAD))
        return procs[-1]

    run = FakeRun(probe=_probe_json("5401.000000"))
    deps, spawned = _deps(step, http=_world_http(gemini_seen, cdn_calls), popen=popen, run=run, tmp_root=str(tmp_path))
    assert mw.run_transcode_job(JOB, 1, deps) == "handed_to_driver"

    assert step.ops() == ["begin", "upload_session", "proxy_ready"]
    assert cdn_calls == [MASTER_URL, VARIANT_360_URL]
    cmd = procs[0].cmd
    assert cmd[cmd.index("-i") + 1] == VARIANT_360_URL and MASTER_URL not in cmd
    # HLS source + an ffmpeg that supports it → segment retry on; then ffprobe of the proxy.
    assert cmd[cmd.index("-seg_max_retry") + 1] == "3"
    assert [c[0] for c in run.calls] == ["ffmpeg", "ffprobe"] and run.calls[0][-1] == "demuxer=hls"

    sha = hashlib.sha256(PAYLOAD).hexdigest()
    session_body = step.calls[1]
    assert session_body == {
        "op": "upload_session",
        "jobId": JOB,
        "epoch": 1,
        "bytes": len(PAYLOAD),
        "mime": "video/mp4",
        "sha256": sha,
        "durationSec": 5401.0,
    }
    assert step.calls[2] == {
        "op": "proxy_ready",
        "jobId": JOB,
        "epoch": 1,
        "file": GEMINI_FILE,
        "bytes": len(PAYLOAD),
        "sha256": sha,
        "durationSec": 5401.0,
    }
    (upload,) = gemini_seen
    assert upload.headers["x-goog-upload-command"] == "upload, finalize"
    assert upload.headers["x-goog-upload-offset"] == "0"
    assert upload.content == PAYLOAD
    assert spawned == [(JOB, 1)]
    assert list(tmp_path.iterdir()) == []  # the proxy is deleted after the upload


def test_ffmpeg_without_segment_retry_support_does_not_get_the_option(tmp_path):
    step = FakeStep({"begin": [_begin_transcode()], "upload_session": [{"superseded": True}]})
    procs: list[FakeProc] = []

    def popen(cmd, **k):
        procs.append(FakeProc(cmd, payload=PAYLOAD))
        return procs[-1]

    run = FakeRun(probe=_probe_json("5400.0"), help_text=HLS_HELP.replace("seg_max_retry", "max_retry_x"))
    deps, _ = _deps(step, http=_world_http([], []), popen=popen, run=run, tmp_root=str(tmp_path))
    assert mw.run_transcode_job(JOB, 1, deps) == "superseded"
    assert "-seg_max_retry" not in procs[0].cmd


def test_direct_mp4_source_never_probes_hls_options(tmp_path):
    mp4 = f"https://{CDN}/guid/play_360p.mp4"
    http = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, headers={"content-type": "video/mp4"}, content=b"x"))
    )
    step = FakeStep({"begin": [_begin_transcode(sourceUrl=mp4)], "upload_session": [{"superseded": True}]})
    procs: list[FakeProc] = []

    def popen(cmd, **k):
        procs.append(FakeProc(cmd, payload=PAYLOAD))
        return procs[-1]

    run = FakeRun(probe=_probe_json("5400.0"))
    deps, _ = _deps(step, http=http, popen=popen, run=run, tmp_root=str(tmp_path))
    assert mw.run_transcode_job(JOB, 1, deps) == "superseded"
    assert procs[0].cmd[procs[0].cmd.index("-i") + 1] == mp4 and "-seg_max_retry" not in procs[0].cmd
    assert [c[0] for c in run.calls] == ["ffprobe"]


def test_duration_mismatch_fails_before_upload(tmp_path):
    step = FakeStep({"begin": [_begin_transcode()], "fail": [{"state": "failed"}]})
    deps, spawned = _deps(
        step,
        http=_world_http([], []),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD),
        run=FakeRun(probe=_probe_json("5410.000000")),
        tmp_root=str(tmp_path),
    )
    assert mw.run_transcode_job(JOB, 1, deps) == "failed:duration_mismatch"
    assert step.ops() == ["begin", "fail"]
    fail = step.calls[1]
    assert set(fail) == {"op", "jobId", "epoch", "code", "reason"}
    assert fail["code"] == "duration_mismatch" and "5410.0" in fail["reason"] and "5400.0" in fail["reason"]
    assert spawned == []


@pytest.mark.parametrize(
    "stderr,probe,code",
    [
        # A lost HLS segment: ffmpeg exits 0 with a full-length proxy (frozen frames) → never uploaded.
        ((FPS_PROBE_LINE, SEGMENT_FAILED, SEGMENT_FAILED, SEGMENT_FAILED, SEGMENT_FAILED, SEGMENT_SKIPPED, FPS_GAP_LINE), None, "source_unavailable"),
        ((FPS_PROBE_LINE, FPS_GAP_LINE), None, "transcode_failed"),  # a hole in the source timeline
        ((FPS_PROBE_LINE,), None, "transcode_failed"),  # continuity cannot be verified
        (FFMPEG_OK_STDERR, _probe_json(streams=[{"codec_type": "video", "codec_name": "h264", "height": 360}, {"codec_type": "audio", "codec_name": "aac"}]), "internal"),
    ],
)
def test_integrity_failures_never_reach_gemini(tmp_path, stderr, probe, code):
    gemini_seen: list[httpx.Request] = []
    step = FakeStep({"begin": [_begin_transcode()], "fail": [{"state": "failed"}]})
    deps, spawned = _deps(
        step,
        http=_world_http(gemini_seen, []),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD, stderr=[line + "\n" for line in stderr]),
        run=FakeRun(probe=probe),
        tmp_root=str(tmp_path),
    )
    assert mw.run_transcode_job(JOB, 1, deps) == f"failed:{code}"
    assert step.ops() == ["begin", "fail"] and step.calls[-1]["code"] == code
    assert gemini_seen == [] and spawned == []
    assert "token" not in step.calls[-1]["reason"] and "https://" not in step.calls[-1]["reason"]


def test_proxy_ready_on_a_terminal_job_does_not_start_the_driver(tmp_path):
    step = FakeStep(
        {"begin": [_begin_transcode()], "upload_session": [dict(SESSION)], "proxy_ready": [{"state": "cancelled"}]}
    )
    deps, spawned = _deps(
        step,
        http=_world_http([], []),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD),
        run=FakeRun(probe=_probe_json("5400.0")),
        tmp_root=str(tmp_path),
    )
    assert mw.run_transcode_job(JOB, 1, deps) == "stopped"
    assert spawned == [] and "fail" not in step.ops()


def test_driver_spawn_failure_is_left_to_the_tick_not_reported_as_a_job_failure(tmp_path):
    def spawn(j, e):
        raise RuntimeError("modal control plane unavailable")

    step = FakeStep(
        {"begin": [_begin_transcode()], "upload_session": [dict(SESSION)], "proxy_ready": [{"state": "gemini_processing"}]}
    )
    deps, _ = _deps(
        step,
        http=_world_http([], []),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD),
        run=FakeRun(probe=_probe_json("5400.0")),
        tmp_root=str(tmp_path),
        spawn=spawn,
    )
    assert mw.run_transcode_job(JOB, 1, deps) == "drive_spawn_failed"
    assert "fail" not in step.ops()
    step2 = FakeStep({"begin": [{"action": "advance", "epoch": 2}]})
    deps2, _ = _deps(step2, spawn=spawn)
    assert mw.run_transcode_job(JOB, 2, deps2) == "drive_spawn_failed" and step2.ops() == ["begin"]


def test_ffmpeg_403_is_reported_as_source_forbidden_with_a_redacted_reason(tmp_path):
    stderr = [
        f"[https @ 0x55] [error] https://{CDN}/g/360p/video0.ts?token=secret123: Server returned 403 Forbidden (access denied)\n"
    ]
    step = FakeStep({"begin": [_begin_transcode()], "fail": [{"state": "failed"}]})
    deps, _ = _deps(
        step,
        http=_world_http([], []),
        popen=lambda cmd, **k: FakeProc(cmd, rc=1, stderr=stderr),
        run=FakeRun(),
        tmp_root=str(tmp_path),
    )
    assert mw.run_transcode_job(JOB, 1, deps) == "failed:source_forbidden"
    reason = step.calls[-1]["reason"]
    assert "https://" not in reason and "secret123" not in reason and "403" in reason


def test_begin_advance_skips_the_transcode():
    step = FakeStep({"begin": [{"action": "advance", "epoch": 2}]})
    deps, spawned = _deps(step)
    assert mw.run_transcode_job(JOB, 2, deps) == "handed_to_driver"
    assert spawned == [(JOB, 2)] and step.ops() == ["begin"]


def test_begin_stop_exits_quietly():
    step = FakeStep({"begin": [{"action": "stop", "epoch": 1, "state": "cancelled"}]})
    deps, spawned = _deps(step)
    assert mw.run_transcode_job(JOB, 1, deps) == "stopped"
    assert spawned == [] and step.ops() == ["begin"]


def test_superseded_at_begin_touches_nothing():
    step = FakeStep({"begin": [{"superseded": True}]})
    deps, spawned = _deps(step)
    assert mw.run_transcode_job(JOB, 1, deps) == "superseded"
    assert step.ops() == ["begin"] and spawned == []


def test_superseded_at_upload_session_never_uploads(tmp_path):
    gemini_seen: list[httpx.Request] = []
    step = FakeStep({"begin": [_begin_transcode()], "upload_session": [{"superseded": True}]})
    deps, spawned = _deps(
        step,
        http=_world_http(gemini_seen, []),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD),
        run=FakeRun(probe=_probe_json("5400.5")),
        tmp_root=str(tmp_path),
    )
    assert mw.run_transcode_job(JOB, 1, deps) == "superseded"
    assert step.ops() == ["begin", "upload_session"]  # no op=fail
    assert gemini_seen == [] and spawned == []


def test_unauthorized_step_exits_without_fail():
    step = FakeStep({"begin": [mw.StepUnauthorized("HTTP 401")]})
    deps, _ = _deps(step)
    assert mw.run_transcode_job(JOB, 1, deps) == "unauthorized"
    assert step.ops() == ["begin"]


@pytest.mark.parametrize("hb_reply,outcome", [({"superseded": True}, "superseded"), ({"action": "stop", "state": "cancelled"}, "stopped")])
def test_heartbeat_stop_kills_ffmpeg(tmp_path, hb_reply, outcome):
    started = threading.Event()

    def heartbeat(body):
        assert body["phase"] == "transcoding"
        return hb_reply if started.is_set() else {"action": "continue", "state": "preparing"}

    step = FakeStep({"begin": [_begin_transcode()], "heartbeat": heartbeat})
    procs: list[FakeProc] = []

    def popen(cmd, **k):
        procs.append(FakeProc(cmd, block=True, started=started))
        return procs[-1]

    deps, spawned = _deps(step, http=_world_http([], []), popen=popen, run=FakeRun(), interval=0.01, tmp_root=str(tmp_path))
    assert mw.run_transcode_job(JOB, 1, deps) == outcome
    assert procs and procs[0].killed.is_set()
    assert "fail" not in step.ops() and "upload_session" not in step.ops() and spawned == []


def test_heartbeat_body_shapes():
    state = mw.RunState("transcoding")
    assert state.heartbeat_body(JOB, 1) == {"op": "heartbeat", "jobId": JOB, "epoch": 1, "phase": "transcoding"}
    state.processed_sec = 12.34567
    assert state.heartbeat_body(JOB, 1)["processedSec"] == 12.346
    state.phase = "uploading"
    state.uploaded_bytes = 1024
    body = state.heartbeat_body(JOB, 1)
    assert body["uploadedBytes"] == 1024 and "processedSec" not in body


def test_drive_loop_honours_retry_after_until_terminal():
    replies = [
        {"state": "gemini_processing", "retryAfterSec": 15},
        {"state": "observing", "retryAfterSec": 0},
        {"state": "observing", "retryAfterSec": 30},
        {"state": "completed", "retryAfterSec": 0},
    ]
    step = FakeStep({"advance": replies})
    deps, _ = _deps(step)
    assert mw.run_drive_loop(JOB, 1, deps) == "terminal:completed"
    assert step.ops() == ["advance"] * 4
    assert deps.clock.sleeps == [15, 30]
    assert all(set(c) == {"op", "jobId", "epoch"} for c in step.calls)


def test_drive_loop_superseded_exits_without_fail():
    step = FakeStep({"advance": [{"state": "observing", "retryAfterSec": 5}, {"superseded": True}]})
    deps, _ = _deps(step)
    assert mw.run_drive_loop(JOB, 1, deps) == "superseded"
    assert step.ops() == ["advance", "advance"]


def test_drive_loop_deadline_reports_deadline_exceeded():
    step = FakeStep({"advance": lambda body: {"state": "observing", "retryAfterSec": 300}, "fail": [{"state": "failed"}]})
    deps, _ = _deps(step)
    assert mw.run_drive_loop(JOB, 1, deps) == "failed:deadline_exceeded"
    assert step.ops()[-1] == "fail" and step.calls[-1]["code"] == "deadline_exceeded"
    assert sum(deps.clock.sleeps) <= mw.DRIVE_TIMEOUT_SEC - mw.DEADLINE_MARGIN_SEC


def test_drive_loop_invalid_reply_reports_internal():
    step = FakeStep({"advance": [{"state": "observing", "retryAfterSec": 999}], "fail": [{"state": "failed"}]})
    deps, _ = _deps(step)
    assert mw.run_drive_loop(JOB, 1, deps) == "failed:internal"
    assert step.calls[-1]["code"] == "internal"


def test_tick_body_and_single_attempt():
    at = datetime(2026, 9, 28, 10, 0, 5, 123456, tzinfo=timezone.utc)
    body = mw.tick_body(at)
    assert mw.canonical_json(body) == b'{"op":"tick","jobId":null,"epoch":null,"scheduledAt":"2026-09-28T10:00:05+00:00"}'
    counts = {"dispatched": 1, "redispatched": 0, "failedJobs": 0, "geminiFilesDeleted": 2, "geminiDeleteErrors": 0, "more": False}
    assert mw.run_tick(FakeStep({"tick": [counts]}), at) == counts
    assert mw.run_tick(FakeStep({"tick": [mw.StepTransientError("HTTP 503")]}), at) is None


# ─────────────────────────────────────────────────────────────────────────────
# match_start (Vercel → Modal) + step URL from the secret only
# ─────────────────────────────────────────────────────────────────────────────

FULL_ENV = {
    "API_KEY": "k-test-not-real",
    "MODAL_CALLBACK_SECRET": "s-test-not-real",
    "VITAS_PUBLIC_URL": "https://futuro-club.vercel.app",
    "BUNNY_CDN_HOSTNAME": CDN,
}


def _start(payload, authorization, env=FULL_ENV):
    spawned: list[tuple] = []

    def spawn(j, e):
        spawned.append((j, e))
        return "fc-01TESTCALL"

    return mw.handle_match_start(payload, authorization, env=env, spawn=spawn), spawned


def test_match_start_spawns_and_returns_call_id(monkeypatch):
    compared: list[tuple] = []
    real = mw.hmac.compare_digest
    monkeypatch.setattr(mw.hmac, "compare_digest", lambda a, b: compared.append((a, b)) or real(a, b))
    reply, spawned = _start({"jobId": JOB, "epoch": 2}, "Bearer k-test-not-real")
    assert reply == {"status": "spawned", "call_id": "fc-01TESTCALL"}
    assert spawned == [(JOB, 2)]
    assert compared  # constant-time comparison


@pytest.mark.parametrize("auth", [None, "", "Bearer wrong", "bearer k-test-not-real", "k-test-not-real", "Bearer k-test-not-real "])
def test_match_start_rejects_bad_bearer(auth):
    reply, spawned = _start({"jobId": JOB, "epoch": 1}, auth)
    assert reply == {"status": "error", "reason": "unauthorized"} and spawned == []


@pytest.mark.parametrize(
    "payload",
    [
        {"jobId": JOB},
        {"jobId": JOB, "epoch": 0},
        {"jobId": JOB, "epoch": True},
        {"jobId": JOB, "epoch": "1"},
        {"jobId": "not-a-uuid", "epoch": 1},
        {"jobId": JOB, "epoch": 1, "stepUrl": "https://evil.example.com/step"},  # never from the request
        [JOB, 1],
    ],
)
def test_match_start_rejects_invalid_payloads(payload):
    reply, spawned = _start(payload, "Bearer k-test-not-real")
    assert reply == {"status": "error", "reason": "invalid_request"} and spawned == []


@pytest.mark.parametrize("drop", ["API_KEY", "MODAL_CALLBACK_SECRET", "VITAS_PUBLIC_URL", "BUNNY_CDN_HOSTNAME"])
def test_match_start_refuses_to_spawn_a_worker_that_cannot_report(drop):
    env = {k: v for k, v in FULL_ENV.items() if k != drop}
    reply, spawned = _start({"jobId": JOB, "epoch": 1}, "Bearer k-test-not-real", env)
    assert reply == {"status": "error", "reason": "server_misconfigured"} and spawned == []


def test_step_url_resolution():
    assert mw.resolve_step_url({"VITAS_PUBLIC_URL": "https://futuro-club.vercel.app/"}) == (
        "https://futuro-club.vercel.app/api/match/step"
    )
    assert mw.resolve_step_url(
        {"VITAS_PUBLIC_URL": "https://futuro-club.vercel.app", "VITAS_MATCH_STEP_URL": "https://x.example.com/api/match/step"}
    ) == "https://x.example.com/api/match/step"


@pytest.mark.parametrize(
    "env",
    [
        {},
        {"VITAS_PUBLIC_URL": "http://futuro-club.vercel.app"},
        {"VITAS_PUBLIC_URL": "https://localhost:3000"},
        {"VITAS_PUBLIC_URL": "https://10.0.0.5"},
        {"VITAS_MATCH_STEP_URL": "https://futuro-club.vercel.app/api/match/step?x=1"},
        {"VITAS_MATCH_STEP_URL": "https://user:pw@futuro-club.vercel.app/api/match/step"},
    ],
)
def test_step_url_must_be_public_https_from_the_secret(env):
    with pytest.raises(mw.WorkerConfigError):
        mw.resolve_step_url(env)


# ─────────────────────────────────────────────────────────────────────────────
# Operator spike (Modal, no Vercel, no Gemini) + local CLI (validation harness input)
# ─────────────────────────────────────────────────────────────────────────────


def _spike_args(**overrides):
    args = dict(fps=1, max_height=360, crf=30, duration_tolerance_sec=2, expected_duration_sec=5400.0)
    args.update(overrides)
    return args


def test_spike_plan_reuses_the_begin_validation():
    plan = mw.spike_plan(MASTER_URL, "360p", **_spike_args())
    assert (plan.target_height, plan.expected_duration_sec, plan.proxy) == (360, 5400.0, SPEC)
    assert mw.spike_plan(MASTER_URL, "360p", **_spike_args(expected_duration_sec=None)).expected_duration_sec is None
    for bad in (_spike_args(crf=99), _spike_args(fps=0), _spike_args(max_height=0)):
        with pytest.raises(mw.StepProtocolError):
            mw.spike_plan(MASTER_URL, "360p", **bad)
    with pytest.raises(mw.StepProtocolError):
        mw.spike_plan("http://insecure.example.com/a.m3u8", "360p", **_spike_args())
    with pytest.raises(mw.StepProtocolError):
        mw.spike_plan(MASTER_URL, "360", **_spike_args())


def _spike_deps(tmp_path, *, http, popen, run):
    clock = _Clock()
    return mw.SpikeDeps(env=ENV, http=http, popen=popen, run=run, sleep=clock.sleep, clock=clock, tmp_root=str(tmp_path))


def test_spike_reports_facts_without_urls_and_can_return_the_proxy(tmp_path):
    cdn_calls: list[str] = []
    deps = _spike_deps(
        tmp_path,
        http=_world_http([], cdn_calls),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD),
        run=FakeRun(probe=_probe_json("5400.4")),
    )
    plan = mw.spike_plan(MASTER_URL, "360p", **_spike_args())
    result = mw.run_spike(plan, deps, return_proxy=True)
    data = result.pop("proxyData")
    assert data == PAYLOAD
    assert result["ok"] is True and result["source"] == {"kind": "hls", "variantHeight": 360, "hlsSegments": 3}
    assert result["proxy"]["bytes"] == len(PAYLOAD) and result["proxy"]["sha256"] == hashlib.sha256(PAYLOAD).hexdigest()
    assert result["proxy"]["recipe"] == PROXY and result["proxy"]["repeatedFrames"] == 0
    assert "https://" not in json.dumps(result)  # never the (possibly signed) source URL
    assert cdn_calls == [MASTER_URL, VARIANT_360_URL] and list(tmp_path.iterdir()) == []


def test_spike_failure_is_reported_not_raised(tmp_path):
    deps = _spike_deps(
        tmp_path,
        http=_world_http([], []),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD, stderr=[SEGMENT_FAILED, SEGMENT_SKIPPED, FPS_GAP_LINE]),
        run=FakeRun(),
    )
    result = mw.run_spike(mw.spike_plan(MASTER_URL, "360p", **_spike_args()), deps)
    assert result["ok"] is False and result["error"]["code"] == "source_unavailable"
    forbidden = _spike_deps(tmp_path, http=_cdn_client({MASTER_URL: httpx.Response(403)}, []), popen=None, run=None)
    result = mw.run_spike(mw.spike_plan(MASTER_URL, "360p", **_spike_args()), forbidden)
    assert result["error"]["code"] == "source_forbidden"  # check (h): Bunny 403 from a Modal IP


def test_spike_without_expected_length_measures_instead_of_comparing(tmp_path):
    deps = _spike_deps(
        tmp_path,
        http=_world_http([], []),
        popen=lambda cmd, **k: FakeProc(cmd, payload=PAYLOAD),
        run=FakeRun(probe=_probe_json("61.0")),
    )
    result = mw.run_spike(mw.spike_plan(MASTER_URL, "360p", **_spike_args(expected_duration_sec=None)), deps)
    assert result["ok"] is True and result["proxy"]["durationSec"] == 61.0 and result["expectedDurationSec"] is None


def _cli_popen(calls):
    def popen(cmd, **k):
        calls.append(cmd)
        return FakeProc(cmd, payload=PAYLOAD)

    return popen


def test_cli_builds_the_production_recipe_from_a_local_clip(tmp_path, capsys):
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"source")
    out = tmp_path / "proxy.mp4"
    calls: list[list[str]] = []
    run = FakeRun(probe=_probe_json("900.0"))
    argv = ["--input", str(clip), "--output", str(out), "--fps", "1", "--max-height", "360", "--crf", "30",
            "--duration-tolerance-sec", "2", "--expected-duration-sec", "900"]  # fmt: skip
    assert mp.main(argv, popen=_cli_popen(calls), run=run) == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["recipe"] == PROXY and summary["durationSec"] == 900.0 and summary["bytes"] == len(PAYLOAD)
    (cmd,) = calls
    assert cmd[cmd.index("-protocol_whitelist") + 1] == "file,crypto" and "-rw_timeout" not in cmd
    production = mw.build_ffmpeg_cmd(str(clip), str(out), SPEC)
    assert cmd[cmd.index("-map") :] == production[production.index("-map") :]  # same recipe as the worker
    assert [c[0] for c in run.calls] == ["ffprobe"]  # not an .m3u8: no hls option probe


def test_cli_reports_a_failed_check_as_json_and_exit_1(tmp_path, capsys):
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"source")
    argv = ["--input", str(clip), "--output", str(tmp_path / "p.mp4"), "--fps", "1", "--max-height", "360",
            "--crf", "30", "--duration-tolerance-sec", "2", "--expected-duration-sec", "1000"]  # fmt: skip
    assert mp.main(argv, popen=_cli_popen([]), run=FakeRun(probe=_probe_json("900.0"))) == 1
    assert json.loads(capsys.readouterr().out)["error"]["code"] == "duration_mismatch"


@pytest.mark.parametrize(
    "argv",
    [
        ["--output", "p.mp4", "--fps", "1", "--max-height", "360", "--crf", "30", "--duration-tolerance-sec", "2"],
        ["--input", "c.mp4", "--output", "p.mp4", "--max-height", "360", "--crf", "30", "--duration-tolerance-sec", "2"],
        ["--input", "c.mp4", "--output", "p.mp4", "--fps", "1", "--max-height", "360", "--crf", "30"],
        ["--input", "c.mp4", "--output", "p.mp4", "--fps", "0", "--max-height", "360", "--crf", "30", "--duration-tolerance-sec", "2"],
        ["--input", "c.mp4", "--output", "p.mp4", "--fps", "1", "--max-height", "360", "--crf", "52", "--duration-tolerance-sec", "2"],
    ],
)
def test_cli_has_no_defaults_for_the_recipe(argv):
    with pytest.raises(SystemExit) as err:  # argparse: missing/invalid flag, nothing hard-coded
        mp.main(argv, popen=lambda *a, **k: pytest.fail("ffmpeg must not run"), run=lambda *a, **k: pytest.fail("no run"))
    assert err.value.code == 2


def test_cli_refuses_urls_missing_files_and_overwriting_the_input(tmp_path):
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"x")
    common = ["--fps", "1", "--max-height", "360", "--crf", "30", "--duration-tolerance-sec", "2"]
    never = dict(popen=lambda *a, **k: pytest.fail("ffmpeg must not run"), run=lambda *a, **k: pytest.fail("no run"))
    assert mp.main(["--input", MASTER_URL, "--output", str(tmp_path / "p.mp4"), *common], **never) == 2
    assert mp.main(["--input", str(tmp_path / "nope.mp4"), "--output", str(tmp_path / "p.mp4"), *common], **never) == 2
    assert mp.main(["--input", str(clip), "--output", str(clip), *common], **never) == 2

