#!/usr/bin/env bash
# Local test script for the Modal vision pipeline.
#
# Usage:
#   chmod +x vision-pipeline/test_local.sh
#   ./vision-pipeline/test_local.sh
#
# This spins up `modal serve` and prints curl commands you can copy.

set -euo pipefail

if ! command -v modal &> /dev/null; then
    echo "ERROR: modal CLI not found. Install with: pip install modal==0.66.0"
    exit 1
fi

if [ -z "${VITAS_API_KEY:-}" ]; then
    echo "ERROR: VITAS_API_KEY env var not set."
    echo "Run: export VITAS_API_KEY=\$(openssl rand -hex 32)"
    exit 1
fi

echo "🚀 Starting modal serve..."
echo ""
echo "Once Modal prints the temp URLs, test with:"
echo ""
echo "  curl https://<temp-url>--vitas-vision-health.modal.run"
echo ""
echo "  curl -X POST https://<temp-url>--vitas-vision-track.modal.run \\"
echo "    -H 'Authorization: Bearer $VITAS_API_KEY' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"video_url\": \"https://download.blender.org/durian/movies/sintel_trailer-480p.mp4\", \"sample_fps\": 2}'"
echo ""
echo "Press Ctrl-C to stop."
echo ""

modal serve vision-pipeline/app.py
