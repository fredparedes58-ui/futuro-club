"""
VITAS · Opt-in integration test of the proxy recipe against a REAL ffmpeg.

Skipped unless VITAS_FFMPEG_IT=1 and ffmpeg/ffprobe are on PATH (CI runs the
pure tests only: no ffmpeg, no network). Everything is synthetic and local
(lavfi test pattern + sine tone, local HLS on disk); no footage, no network.

It pins the behaviour the unit tests mock:
  - the proxy is h264, 1 video stream, NO audio, at the requested fps/height,
    moov before mdat (+faststart), duration within tolerance;
  - an HLS with a missing segment makes ffmpeg exit 0 with a full-length proxy of
    frozen frames → match_proxy must refuse it;
  - a source with a hole in its timeline (TS segments concatenated around a gap)
    → refused through the repeated-frames check.

Run:  VITAS_FFMPEG_IT=1 python -m pytest vision-pipeline/test_match_proxy_ffmpeg.py -q
"""

from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
from pathlib import Path

import pytest

import match_proxy as mp

pytestmark = pytest.mark.skipif(
    os.environ.get("VITAS_FFMPEG_IT") != "1" or not (shutil.which("ffmpeg") and shutil.which("ffprobe")),
    reason="opt-in: set VITAS_FFMPEG_IT=1 with ffmpeg/ffprobe on PATH",
)

SOURCE_SEC = 21.5


def _ff(*args: str, cwd: Path) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], cwd=cwd, check=True, timeout=120)


@pytest.fixture(scope="module")
def media(tmp_path_factory) -> Path:
    d = tmp_path_factory.mktemp("proxy-it")
    _ff(
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
        "-t", str(SOURCE_SEC), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "src.mp4",
        cwd=d,
    )  # fmt: skip
    (d / "hls").mkdir()
    _ff(
        "-i", "src.mp4", "-vf", "scale=-2:360", "-c:v", "libx264", "-c:a", "aac",
        "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
        "-hls_segment_filename", "hls/video%d.ts", "hls/video.m3u8",
        cwd=d,
    )  # fmt: skip
    gap = d / "gap"
    shutil.copytree(d / "hls", gap)
    (gap / "video1.ts").unlink()  # a segment the CDN could not serve
    # A timeline hole without any read error: segment 0 + segment 2 back to back.
    (d / "hole.ts").write_bytes((d / "hls" / "video0.ts").read_bytes() + (d / "hls" / "video2.ts").read_bytes())
    return d


def _cli(media: Path, capsys, src: str, *extra: str, fps: str = "1", height: str = "360") -> tuple[int, dict]:
    out = media / f"out-{src.replace('/', '_')}-{fps}.mp4"
    code = mp.main(
        ["--input", str(media / src), "--output", str(out), "--fps", fps, "--max-height", height, "--crf", "30",
         "--duration-tolerance-sec", "2", *extra]
    )  # fmt: skip
    return code, json.loads(capsys.readouterr().out)


def _atoms(path: str) -> list[str]:
    data = Path(path).read_bytes()
    names, i = [], 0
    while i + 8 <= len(data) and len(names) < 8:
        size = struct.unpack(">I", data[i : i + 4])[0]
        names.append(data[i + 4 : i + 8].decode("latin-1"))
        if size < 8:
            break
        i += size
    return names


def _stream_rate(path: str) -> str:
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "json", path],
        capture_output=True, text=True, timeout=60, check=True,
    )  # fmt: skip
    return json.loads(res.stdout)["streams"][0]["r_frame_rate"]


@pytest.mark.parametrize("src", ["src.mp4", "hls/video.m3u8"])
def test_real_proxy_matches_the_contract(media, capsys, src):
    code, summary = _cli(media, capsys, src, "--expected-duration-sec", "21")
    assert code == 0, summary
    out = summary["output"]
    probe = mp.parse_ffprobe(
        subprocess.run(mp.build_ffprobe_cmd(out), capture_output=True, text=True, timeout=60, check=True).stdout
    )
    assert probe.streams == (mp.ProbedStream(codec_type="video", codec_name="h264", height=360),)  # no audio
    assert _stream_rate(out) == "1/1"
    assert abs(summary["durationSec"] - 21) <= 2 and summary["repeatedFrames"] == 0
    assert _atoms(out).index("moov") < _atoms(out).index("mdat")  # +faststart


def test_real_fractional_fps_and_other_height(media, capsys):
    code, summary = _cli(media, capsys, "src.mp4", fps="0.5", height="240")
    assert code == 0, summary
    assert _stream_rate(summary["output"]) == "1/2"
    assert summary["recipe"]["maxHeight"] == 240


def test_real_missing_hls_segment_is_refused(media, capsys):
    code, summary = _cli(media, capsys, "gap/video.m3u8", "--expected-duration-sec", "21")
    assert code == 1 and summary["error"]["code"] == "source_unavailable", summary


def test_real_timeline_hole_is_refused(media, capsys):
    code, summary = _cli(media, capsys, "hole.ts")
    assert code == 1 and summary["error"]["code"] == "transcode_failed", summary
    assert "repitió" in summary["error"]["reason"]
