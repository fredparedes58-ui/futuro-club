#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# VITAS · QA Deployment Test Suite
# Ejecutar después de cada deploy: bash scripts/qa-deploy.sh [BASE_URL]
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="${1:-https://futuro-club.vercel.app}"
PASS=0
FAIL=0
TOTAL=0
RESULTS=()

green(){ printf "\033[32m%s\033[0m\n" "$*"; }
red(){   printf "\033[31m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

# ── Test runner ──────────────────────────────────────────────────────────────
run_test(){
  local name="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local expected_status="${5:-200}"
  local body_check="${6:-}"

  TOTAL=$((TOTAL + 1))
  local url="${BASE}${path}"
  local start_ms
  start_ms=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo 0)

  local args=(-s -o /tmp/qa_body.txt -w "%{http_code}" -m 30)
  if [ "$method" = "POST" ]; then
    args+=(-X POST -H "Content-Type: application/json")
    if [ -n "$body" ]; then
      args+=(-d "$body")
    fi
  fi

  local status
  status=$(curl "${args[@]}" "$url" 2>/dev/null) || status="000"

  local end_ms
  end_ms=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo 0)
  local elapsed="?"
  if [ "$start_ms" != "0" ] && [ "$end_ms" != "0" ]; then
    elapsed=$(( (end_ms - start_ms) / 1000000 ))ms
  fi

  local resp_body
  resp_body=$(cat /tmp/qa_body.txt 2>/dev/null || echo "")

  # Check status
  local ok=true
  if [ "$status" != "$expected_status" ]; then
    ok=false
  fi

  # Check body content if specified
  if [ -n "$body_check" ] && $ok; then
    if ! echo "$resp_body" | grep -q "$body_check"; then
      ok=false
    fi
  fi

  if $ok; then
    PASS=$((PASS + 1))
    green "  ✅ TEST $TOTAL: $name → HTTP $status ($elapsed)"
    RESULTS+=("PASS|$name|$status|$elapsed")
  else
    FAIL=$((FAIL + 1))
    red   "  ❌ TEST $TOTAL: $name → HTTP $status (expected $expected_status) ($elapsed)"
    if [ -n "$body_check" ]; then
      red "     Expected body to contain: $body_check"
    fi
    # Show first 200 chars of response for debugging
    local snippet="${resp_body:0:200}"
    if [ -n "$snippet" ]; then
      yellow "     Response: $snippet"
    fi
    RESULTS+=("FAIL|$name|$status|$elapsed")
  fi
}

# ── Pre-flight checks ────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        VITAS · QA Deployment Test Suite                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Target: $BASE"
echo "║  Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "▸ Pre-flight: Type Check"
if npx tsc --noEmit 2>&1; then
  green "  ✅ TypeScript: sin errores"
else
  red "  ❌ TypeScript: errores de tipos detectados"
  echo "  ⚠️  Continuando con QA tests..."
fi
echo ""

echo "▸ Pre-flight: Unit Tests"
if npx vitest run 2>&1 | tail -3; then
  green "  ✅ Unit tests: pasaron"
else
  red "  ❌ Unit tests: fallos detectados"
  echo "  ⚠️  Continuando con QA tests..."
fi
echo ""

# ── Category 1: API Edge Functions ───────────────────────────────────────────
echo "▸ API Edge Functions"
run_test "Pipeline: empty body → 400"          POST "/api/pipeline/start"  "{}"                                        "400" "required"
run_test "Pipeline: valid payload → 200"       POST "/api/pipeline/start"  '{"videoId":"test-qa","playerId":"test-qa"}' "200" "success"
run_test "Tracking save: no auth → 401"        POST "/api/tracking/save"   '{"playerId":"x"}'                          "401"
run_test "Video init → 200"                    POST "/api/upload/video-init" '{"title":"qa-test","libraryId":"1"}'      "200"
run_test "Videos list → 200"                   GET  "/api/videos/list"      ""                                          "200"
run_test "Audit endpoint → 200"                GET  "/api/audit"            ""                                          "200"

echo ""
echo "▸ Player Search API"
run_test "Player search: no params → 200"      GET  "/api/players/search"          ""   "200" "players"
run_test "Player search: query → 200"          GET  "/api/players/search?q=pedri"  ""   "200" "players"
run_test "Player search: filters → 200"        GET  "/api/players/search?position=CM&league=La+Liga" "" "200" "players"

echo ""
echo "▸ AI Agent Endpoints (POST, expect non-504)"
run_test "Video Intelligence → non-timeout"    POST "/api/agents/video-intelligence" '{"playerContext":{"name":"QA","age":18,"position":"CM"},"keyframes":[],"videoId":"qa"}' "200"
run_test "Scout Insight → responds"            POST "/api/agents/scout-insight"      '{"player":{"id":"qa","name":"QA Test","age":18,"position":"CM","vsi":72,"vsiTrend":"up","phvCategory":"ontme","recentMetrics":{"speed":70,"technique":65,"vision":68,"stamina":72,"shooting":60,"defending":55}},"context":"general"}' "200"

echo ""
echo "▸ SPA Routes (HTML responses)"
run_test "Landing page → 200 HTML"             GET  "/"                              ""   "200" "html"
run_test "Lab page → 200 HTML"                 GET  "/lab"                           ""   "200" "html"
run_test "Scout feed → 200 HTML"               GET  "/scout"                         ""   "200" "html"
run_test "Player intelligence → 200 SPA"       GET  "/players/test/intelligence"     ""   "200" "html"
run_test "Player intelligence alias → 200"     GET  "/player/test/intelligence"      ""   "200" "html"

echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
  green "  🎉 ALL $TOTAL TESTS PASSED ($PASS/$TOTAL)"
else
  red   "  ⚠️  $FAIL/$TOTAL TESTS FAILED  |  $PASS passed"
fi
echo "══════════════════════════════════════════════════════════════"
echo ""

# Write report file
REPORT_FILE="/tmp/vitas-qa-report-$(date +%Y%m%d_%H%M%S).txt"
{
  echo "VITAS QA Report — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Target: $BASE"
  echo "Result: $PASS/$TOTAL passed, $FAIL failed"
  echo ""
  for r in "${RESULTS[@]}"; do
    echo "  $r"
  done
} > "$REPORT_FILE"
echo "Report saved: $REPORT_FILE"

# Exit with error code if any test failed
[ $FAIL -eq 0 ] || exit 1
