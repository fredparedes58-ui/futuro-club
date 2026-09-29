"""pytest config for vision-pipeline/ (no Modal, no network).

app.py and match_worker.py import the shared `video_url_guard` module by name, as
they do inside the Modal container (/root). Put this directory on sys.path so the
tests resolve it the same way under any pytest import mode.
"""

import sys
from pathlib import Path

_HERE = str(Path(__file__).resolve().parent)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
