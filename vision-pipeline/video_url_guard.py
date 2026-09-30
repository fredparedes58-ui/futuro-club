"""
VITAS · Allowlist de URLs de vídeo para los workers Modal (SSRF + coste).

Módulo compartido (inv. #7: una sola implementación) por:
  - vision-pipeline/app.py          (app vitas-vision, GPU tracking; PR #288)
  - vision-pipeline/match_worker.py (app vitas-match-worker, CPU; partido completo)
Cada imagen Modal lo incluye con `Image.add_local_python_source("video_url_guard")`.

Espejo de api/_lib/videoUrlGuard.ts: MISMA env y MISMAS reglas.
  - Solo https, sin credenciales ni puerto no estándar, nunca IPs/hosts internos.
  - Host EXACTO de la env: BUNNY_CDN_HOSTNAME / VITE_BUNNY_CDN_HOSTNAME,
    BUNNY_STORAGE_CDN_URL, VIDEO_URL_EXTRA_HOSTS (CSV) + video.bunnycdn.com solo
    bajo /library/<BUNNY_STREAM_LIBRARY_ID>/videos/. Sin comodín *.b-cdn.net.
  - Sin BUNNY_CDN_HOSTNAME → falla CERRADO (reason video_hosts_not_configured).
  - Redirecciones manuales re-validadas (máx. 3), content-type video/*, techo de
    tamaño por Content-Length y mientras se escribe (VIDEO_FETCH_MAX_BYTES).
La env llega en el secret vitas-api-key (claves extra, como MODAL_CALLBACK_SECRET).

Solo stdlib a nivel de módulo (httpx se importa perezoso) → testeable sin red ni
Modal: vision-pipeline/test_video_url_guard.py y test_match_worker.py.
"""

from __future__ import annotations

import os
import re
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import IO, Any, Optional
from urllib.parse import urljoin, urlsplit

VIDEO_LIBRARY_API_HOST = "video.bunnycdn.com"
MAX_VIDEO_REDIRECTS = 3
# Se descarga en streaming a DISCO (no a memoria como en Vercel) → techo mayor:
# 4 GiB cubre un partido completo a 720p. Override: VIDEO_FETCH_MAX_BYTES.
DEFAULT_MAX_VIDEO_BYTES = 4 * 1024 ** 3
_MAX_VIDEO_URL_LEN = 2048
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_BAD_URL_CHARS = re.compile(r"[\s\\\x00-\x1f\x7f]")
_IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
_NUMERIC_LABEL_RE = re.compile(r"^(0x[0-9a-f]*|\d+)$")
_DOT_SEGMENT_RE = re.compile(r"(^|/)(\.|%2e){1,2}(/|$)", re.IGNORECASE)


class VideoUrlRejected(Exception):
    """URL de vídeo rechazada por la allowlist; `reason` viaja tal cual al caller.

    `http_status` solo se rellena cuando el CDN respondió con un estado no 2xx
    (el worker de partido lo usa para distinguir 401/403 de 404/5xx).
    """

    def __init__(self, reason: str, detail: str, http_status: Optional[int] = None) -> None:
        super().__init__(f"{reason}: {detail}")
        self.reason = reason
        self.detail = detail
        self.http_status = http_status


def _is_internal_host(host: str) -> bool:
    """IP literal (v4/v6, incl. formas numéricas/hex) o nombre de red privada."""
    h = host.strip("[]").rstrip(".").lower()
    if not h or ":" in h or _IPV4_RE.match(h):
        return True
    if _NUMERIC_LABEL_RE.match(h.rsplit(".", 1)[-1]):
        return True  # 127.1, 2130706433, 0x7f000001… (getaddrinfo los resuelve)
    if h == "localhost" or h.endswith(".localhost"):
        return True
    return h.endswith(".local") or h.endswith(".internal")


def is_internal_host(host: str) -> bool:
    """Público: mismo criterio para otras URLs de salida del worker (p. ej. la URL de step)."""
    return _is_internal_host(host)


def _host_from_env_value(value: Optional[str]) -> Optional[str]:
    v = (value or "").strip()
    if not v:
        return None
    try:
        host = urlsplit(v if "://" in v else f"https://{v}").hostname or ""
    except ValueError:
        return None
    host = host.rstrip(".").lower()
    if not host or _is_internal_host(host):
        return None
    return host


def video_host_policy(env: Optional[Mapping[str, str]] = None) -> tuple[frozenset[str], Optional[str]]:
    """(hosts exactos, prefijo de librería | None). Sin host de CDN → falla cerrado."""
    env = os.environ if env is None else env
    cdn_hosts = {
        h
        for h in (
            _host_from_env_value(env.get("BUNNY_CDN_HOSTNAME")),
            _host_from_env_value(env.get("VITE_BUNNY_CDN_HOSTNAME")),
        )
        if h
    }
    if not cdn_hosts:
        raise VideoUrlRejected(
            "video_hosts_not_configured",
            "BUNNY_CDN_HOSTNAME no está configurado en el secret de Modal (allowlist vacía)",
        )
    hosts = set(cdn_hosts)
    storage = _host_from_env_value(env.get("BUNNY_STORAGE_CDN_URL"))
    if storage:
        hosts.add(storage)
    for extra in (env.get("VIDEO_URL_EXTRA_HOSTS") or "").split(","):
        h = _host_from_env_value(extra)
        if h:
            hosts.add(h)
    library_id = (env.get("BUNNY_STREAM_LIBRARY_ID") or "").strip()
    prefix = f"/library/{library_id}/videos/" if library_id.isdigit() else None
    return frozenset(hosts), prefix


def assert_allowed_video_url(url: object, env: Optional[Mapping[str, str]] = None) -> str:
    """Valida (sin red) que `url` es un vídeo de nuestro CDN. Devuelve la URL."""
    if not isinstance(url, str) or not url.strip():
        raise VideoUrlRejected("video_url_invalid", "video_url debe ser una URL https no vacía")
    if len(url) > _MAX_VIDEO_URL_LEN:
        raise VideoUrlRejected("video_url_invalid", "video_url demasiado larga")
    if _BAD_URL_CHARS.search(url):
        raise VideoUrlRejected("video_url_invalid", "video_url contiene caracteres no permitidos")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise VideoUrlRejected("video_url_invalid", "video_url no es una URL válida") from None
    if parts.scheme != "https":
        raise VideoUrlRejected("video_url_not_allowed", "solo se admiten URLs https")
    if parts.username is not None or parts.password is not None:
        raise VideoUrlRejected("video_url_not_allowed", "video_url no puede llevar credenciales")
    if port is not None and port != 443:
        raise VideoUrlRejected("video_url_not_allowed", "puerto no estándar")
    host = (parts.hostname or "").rstrip(".").lower()
    if _is_internal_host(host):
        raise VideoUrlRejected("video_url_not_allowed", "IP o host interno")

    hosts, library_prefix = video_host_policy(env)
    if host in hosts:
        return url
    if (
        host == VIDEO_LIBRARY_API_HOST
        and library_prefix is not None
        and parts.path.startswith(library_prefix)
        and not _DOT_SEGMENT_RE.search(parts.path)
    ):
        return url
    raise VideoUrlRejected("video_url_not_allowed", f"host de vídeo no permitido: {host}")


def max_video_bytes(env: Optional[Mapping[str, str]] = None) -> int:
    env = os.environ if env is None else env
    try:
        n = int(str(env.get("VIDEO_FETCH_MAX_BYTES") or "").strip())
    except ValueError:
        return DEFAULT_MAX_VIDEO_BYTES
    return n if n > 0 else DEFAULT_MAX_VIDEO_BYTES


@contextmanager
def open_allowed_stream(
    url: str,
    *,
    env: Optional[Mapping[str, str]] = None,
    client: Any = None,
    max_redirects: int = MAX_VIDEO_REDIRECTS,
    timeout: float = 180.0,
) -> Iterator[tuple[str, Any]]:
    """GET en streaming con allowlist + redirecciones manuales re-validadas.

    Cede `(url_final, respuesta_2xx)` sin leer el cuerpo; el caller decide qué leer.
    Lanza VideoUrlRejected (reason estable; `http_status` si el CDN dio un no-2xx)
    ante cualquier violación; errores de red de httpx se propagan tal cual.
    """
    import httpx  # type: ignore  # imagen Modal; perezoso → el módulo carga sin httpx

    current = assert_allowed_video_url(url, env)
    owns_client = client is None
    http = httpx.Client(follow_redirects=False, timeout=timeout) if owns_client else client
    try:
        for hop in range(max_redirects + 1):
            # Validador (urlsplit) y cliente (httpx) deben ver el MISMO host.
            expected = (urlsplit(current).hostname or "").rstrip(".").lower()
            if (httpx.URL(current).host or "").rstrip(".").lower() != expected:
                raise VideoUrlRejected("video_url_not_allowed", "host ambiguo entre parsers")
            with http.stream("GET", current, follow_redirects=False) as r:
                if r.status_code in _REDIRECT_STATUSES:
                    if hop >= max_redirects:
                        raise VideoUrlRejected("too_many_redirects", f"más de {max_redirects} redirecciones")
                    location = r.headers.get("location")
                    if not location:
                        raise VideoUrlRejected("download_failed", f"redirección HTTP {r.status_code} sin Location")
                    try:
                        current = assert_allowed_video_url(urljoin(current, location), env)
                    except VideoUrlRejected as err:
                        if err.reason == "video_hosts_not_configured":
                            raise
                        raise VideoUrlRejected(
                            "redirect_not_allowed", "el CDN redirigió a un host no permitido"
                        ) from None
                    continue
                if not 200 <= r.status_code < 300:
                    raise VideoUrlRejected("download_failed", f"HTTP {r.status_code}", http_status=r.status_code)
                yield current, r
                return
        raise VideoUrlRejected("too_many_redirects", f"más de {max_redirects} redirecciones")
    finally:
        if owns_client:
            http.close()


def download_allowed_video(
    url: str,
    dest: IO[bytes],
    *,
    env: Optional[Mapping[str, str]] = None,
    client: Any = None,
    max_bytes: Optional[int] = None,
    max_redirects: int = MAX_VIDEO_REDIRECTS,
    timeout: float = 180.0,
) -> int:
    """Descarga en streaming a `dest` con allowlist + redirecciones manuales + techo.

    Devuelve los bytes escritos. Lanza VideoUrlRejected (reason estable) ante
    cualquier violación; errores de red de httpx se propagan tal cual.
    """
    cap = max_video_bytes(env) if max_bytes is None else max_bytes
    with open_allowed_stream(url, env=env, client=client, max_redirects=max_redirects, timeout=timeout) as (_final, r):
        ctype = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
        if not ctype.startswith("video/"):
            raise VideoUrlRejected("not_a_video", f"content-type {ctype or 'ausente'}")
        declared = (r.headers.get("content-length") or "").strip()
        if declared.isdigit() and int(declared) > cap:
            raise VideoUrlRejected("video_too_large", f"{declared} bytes > máximo {cap}")
        written = 0
        for chunk in r.iter_bytes(chunk_size=1024 * 1024):
            written += len(chunk)
            if written > cap:
                raise VideoUrlRejected("video_too_large", f"supera el máximo de {cap} bytes")
            dest.write(chunk)
        if written == 0:
            raise VideoUrlRejected("download_failed", "el CDN devolvió un vídeo vacío")
        return written
