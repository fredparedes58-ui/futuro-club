"""
VITAS · Tests de la allowlist de video_url del pipeline Modal (SSRF + coste).

Espejo de api/_lib/__tests__/videoUrlGuard.test.ts. Sin red y sin Modal: `modal`
y `fastapi` se sustituyen por stubs (app.py solo los usa para declarar la app);
la descarga se prueba con httpx.MockTransport (sin sockets).

Run:  python -m pytest vision-pipeline/test_video_url_guard.py -q
"""

from __future__ import annotations

import importlib.util
import io
import sys
import types
from pathlib import Path

import pytest

APP_PATH = Path(__file__).with_name("app.py")


class _Anything:
    """Stub genérico: atributos y llamadas devuelven stubs; como decorador, identidad."""

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


def _load_app():
    stubs = {"modal": _stub_module("modal"), "fastapi": _stub_module("fastapi")}
    try:
        import pydantic  # noqa: F401
    except ImportError:  # entorno mínimo: basta con clases vacías
        pyd = types.ModuleType("pydantic")
        pyd.BaseModel = type("BaseModel", (), {})  # type: ignore[attr-defined]
        pyd.Field = lambda *a, **k: None  # type: ignore[attr-defined]
        stubs["pydantic"] = pyd
    saved = {k: sys.modules.get(k) for k in stubs}
    sys.modules.update(stubs)
    try:
        spec = importlib.util.spec_from_file_location("vitas_vision_app_under_test", APP_PATH)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


app = _load_app()

CDN = "vz-abc123-456.b-cdn.net"
ENV = {
    "BUNNY_CDN_HOSTNAME": CDN,
    "BUNNY_STORAGE_CDN_URL": "https://vitas-storage.b-cdn.net",
    "BUNNY_STREAM_LIBRARY_ID": "123456",
}
GOOD = f"https://{CDN}/0f1e2d3c-guid/play_720p.mp4"


def reason_of(url, env=ENV) -> str:
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.assert_allowed_video_url(url, env)
    return exc.value.reason


# ── Validador (sin red) ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        GOOD,
        f"https://{CDN.upper()}/guid/play_480p.mp4",
        f"https://{CDN}:443/guid/play_720p.mp4",
        "https://vitas-storage.b-cdn.net/clips/a.mp4",
        "https://video.bunnycdn.com/library/123456/videos/guid/play.mp4",
    ],
)
def test_allows_our_bunny_hosts(url):
    assert app.assert_allowed_video_url(url, ENV) == url


def test_vite_alias_and_env_normalisation():
    env = {"VITE_BUNNY_CDN_HOSTNAME": f"https://{CDN.upper()}/"}
    assert app.assert_allowed_video_url(GOOD, env) == GOOD


def test_extra_hosts_csv():
    env = {**ENV, "VIDEO_URL_EXTRA_HOSTS": " legacy-zone.b-cdn.net , https://other.example.com/x "}
    assert app.assert_allowed_video_url("https://legacy-zone.b-cdn.net/v.mp4", env)
    assert app.assert_allowed_video_url("https://other.example.com/v.mp4", env)


def test_fails_closed_without_cdn_hostname():
    assert reason_of(GOOD, {}) == "video_hosts_not_configured"
    # storage/library solos NO bastan: sin host de CDN no sabemos qué es nuestro
    only_storage = {k: v for k, v in ENV.items() if k != "BUNNY_CDN_HOSTNAME"}
    assert reason_of("https://vitas-storage.b-cdn.net/a.mp4", only_storage) == "video_hosts_not_configured"


@pytest.mark.parametrize("bad_env_host", ["169.254.169.254", "127.0.0.1", "localhost", "[::1]", "metadata.internal"])
def test_ip_or_internal_env_host_is_ignored_and_fails_closed(bad_env_host):
    assert reason_of(f"https://{bad_env_host}/a.mp4", {"BUNNY_CDN_HOSTNAME": bad_env_host}) in {
        "video_hosts_not_configured",
        "video_url_not_allowed",
    }
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.video_host_policy({"BUNNY_CDN_HOSTNAME": bad_env_host})
    assert exc.value.reason == "video_hosts_not_configured"


@pytest.mark.parametrize(
    "url,reason",
    [
        (f"http://{CDN}/guid/play_720p.mp4", "video_url_not_allowed"),
        ("https://evil.example.com/play_720p.mp4", "video_url_not_allowed"),
        ("https://attacker-zone.b-cdn.net/big.mp4", "video_url_not_allowed"),  # sin comodín *.b-cdn.net
        (f"https://{CDN}.evil.com/a.mp4", "video_url_not_allowed"),
        (f"https://evil-{CDN}/a.mp4", "video_url_not_allowed"),
        (f"https://{CDN}@evil.com/a.mp4", "video_url_not_allowed"),
        (f"https://user:pw@{CDN}/a.mp4", "video_url_not_allowed"),
        (f"https://{CDN}:8443/a.mp4", "video_url_not_allowed"),
        ("https://169.254.169.254/latest/meta-data/", "video_url_not_allowed"),
        ("https://127.0.0.1/a.mp4", "video_url_not_allowed"),
        ("https://10.0.0.8/a.mp4", "video_url_not_allowed"),
        ("https://[::1]/a.mp4", "video_url_not_allowed"),
        ("https://2130706433/a.mp4", "video_url_not_allowed"),
        ("https://0x7f.1/a.mp4", "video_url_not_allowed"),
        ("https://localhost/a.mp4", "video_url_not_allowed"),
        ("https://metadata.google.internal/computeMetadata/v1/", "video_url_not_allowed"),
        ("https://video.bunnycdn.com/library/999/videos/guid/play.mp4", "video_url_not_allowed"),
        ("https://video.bunnycdn.com/library/123456/videos/../../999/videos/x", "video_url_not_allowed"),
        ("https://video.bunnycdn.com/library/123456/videos/%2e%2e/x", "video_url_not_allowed"),
        ("file:///etc/passwd", "video_url_not_allowed"),
        ("ftp://" + CDN + "/a.mp4", "video_url_not_allowed"),
        (f"https://{CDN}\\@evil.com/a.mp4", "video_url_invalid"),
        (f"https://{CDN}/a b.mp4", "video_url_invalid"),
        (f"https://{CDN}:99999/a.mp4", "video_url_invalid"),
        ("", "video_url_invalid"),
        (None, "video_url_invalid"),
        (12345, "video_url_invalid"),
        ("https://" + CDN + "/" + "a" * 3000, "video_url_invalid"),
    ],
)
def test_blocks_everything_else(url, reason):
    assert reason_of(url) == reason


def test_max_video_bytes_env():
    assert app.max_video_bytes({}) == app.DEFAULT_MAX_VIDEO_BYTES
    assert app.max_video_bytes({"VIDEO_FETCH_MAX_BYTES": "1024"}) == 1024
    assert app.max_video_bytes({"VIDEO_FETCH_MAX_BYTES": "nope"}) == app.DEFAULT_MAX_VIDEO_BYTES
    assert app.max_video_bytes({"VIDEO_FETCH_MAX_BYTES": "-5"}) == app.DEFAULT_MAX_VIDEO_BYTES


# ── Descarga (httpx.MockTransport, sin sockets) ───────────────────────

httpx = pytest.importorskip("httpx")


def _client(handler, calls):
    def wrapped(request):
        calls.append(str(request.url))
        return handler(request)

    return httpx.Client(transport=httpx.MockTransport(wrapped), follow_redirects=False)


def _video(body=b"\x00\x00\x00\x18ftypmp42", **headers):
    return httpx.Response(200, headers={"content-type": "video/mp4", **headers}, content=body)


def test_download_happy_path_writes_bytes():
    calls: list[str] = []
    dest = io.BytesIO()
    n = app.download_allowed_video(GOOD, dest, env=ENV, client=_client(lambda r: _video(), calls))
    assert n == len(dest.getvalue()) > 0
    assert calls == [GOOD]


def test_download_rejects_before_any_request():
    calls: list[str] = []
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(
            "https://169.254.169.254/latest/meta-data/", io.BytesIO(), env=ENV, client=_client(lambda r: _video(), calls)
        )
    assert exc.value.reason == "video_url_not_allowed"
    assert calls == []


def test_download_fails_closed_without_env():
    calls: list[str] = []
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(GOOD, io.BytesIO(), env={}, client=_client(lambda r: _video(), calls))
    assert exc.value.reason == "video_hosts_not_configured"
    assert calls == []


def test_redirect_to_allowed_host_is_followed():
    target = "https://vitas-storage.b-cdn.net/moved.mp4"

    def handler(request):
        if request.url.host == CDN:
            return httpx.Response(302, headers={"location": target})
        return _video()

    calls: list[str] = []
    assert app.download_allowed_video(GOOD, io.BytesIO(), env=ENV, client=_client(handler, calls)) > 0
    assert calls == [GOOD, target]


def test_relative_redirect_is_resolved_and_revalidated():
    def handler(request):
        if request.url.path.endswith("play_720p.mp4"):
            return httpx.Response(301, headers={"location": "/guid/play_480p.mp4"})
        return _video()

    calls: list[str] = []
    app.download_allowed_video(GOOD, io.BytesIO(), env=ENV, client=_client(handler, calls))
    assert calls == [GOOD, f"https://{CDN}/guid/play_480p.mp4"]


@pytest.mark.parametrize(
    "location",
    [
        "https://evil.example.com/x.mp4",
        "http://169.254.169.254/latest/meta-data/",
        f"http://{CDN}/downgrade.mp4",
        "//evil.example.com/x.mp4",
    ],
)
def test_redirect_to_other_host_is_blocked_without_following(location):
    calls: list[str] = []
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(
            GOOD,
            io.BytesIO(),
            env=ENV,
            client=_client(lambda r: httpx.Response(302, headers={"location": location}), calls),
        )
    assert exc.value.reason == "redirect_not_allowed"
    assert calls == [GOOD]


def test_more_than_three_redirects_is_rejected():
    counter = {"n": 0}

    def handler(request):
        counter["n"] += 1
        return httpx.Response(302, headers={"location": f"/hop{counter['n']}.mp4"})

    calls: list[str] = []
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(GOOD, io.BytesIO(), env=ENV, client=_client(handler, calls))
    assert exc.value.reason == "too_many_redirects"
    assert len(calls) == app.MAX_VIDEO_REDIRECTS + 1


def test_non_video_content_type_is_rejected():
    calls: list[str] = []
    dest = io.BytesIO()
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(
            GOOD,
            dest,
            env=ENV,
            client=_client(lambda r: httpx.Response(200, headers={"content-type": "text/html"}, content=b"<h1>"), calls),
        )
    assert exc.value.reason == "not_a_video"
    assert dest.getvalue() == b""


def test_declared_content_length_over_cap_is_rejected_before_reading():
    calls: list[str] = []
    dest = io.BytesIO()
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(
            GOOD,
            dest,
            env=ENV,
            max_bytes=10,
            client=_client(lambda r: _video(body=b"x" * 50, **{"content-length": "50"}), calls),
        )
    assert exc.value.reason == "video_too_large"
    assert dest.getvalue() == b""


def test_stream_over_cap_without_content_length_is_cut():
    def handler(request):
        # Sin Content-Length (stream por chunks): el techo se aplica mientras se escribe.
        return httpx.Response(200, headers={"content-type": "video/mp4"}, content=iter([b"x" * 8, b"y" * 8]))

    calls: list[str] = []
    dest = io.BytesIO()
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(GOOD, dest, env=ENV, max_bytes=10, client=_client(handler, calls))
    assert exc.value.reason == "video_too_large"
    assert len(dest.getvalue()) <= 10


def test_http_error_is_download_failed():
    calls: list[str] = []
    with pytest.raises(app.VideoUrlRejected) as exc:
        app.download_allowed_video(GOOD, io.BytesIO(), env=ENV, client=_client(lambda r: httpx.Response(404), calls))
    assert exc.value.reason == "download_failed"
