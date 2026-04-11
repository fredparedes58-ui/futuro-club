#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# VITAS · RAG Knowledge Base Seed Script
#
# Seeds the RAG knowledge base in production/preview:
#   1. POST /api/rag/seed          → 82 drills with embeddings
#   2. POST /api/rag/seed-knowledge → 22+ knowledge docs (scouting methodology,
#      youth development, tactical systems, performance benchmarks, etc.)
#
# Prerequisites (Vercel env vars):
#   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
#   - VOYAGE_API_KEY (for embeddings)
#   - CRON_SECRET or ADMIN_SECRET (for serviceOnly auth)
#   - knowledge_base table created (migration 015+)
#
# Usage:
#   CRON_SECRET=your-secret bash scripts/seed-rag.sh
#   CRON_SECRET=your-secret bash scripts/seed-rag.sh https://preview.vercel.app
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="${1:-https://futuro-club.vercel.app}"

# Auth: serviceOnly endpoints require CRON_SECRET or ADMIN_SECRET
SECRET="${CRON_SECRET:-${ADMIN_SECRET:-}}"
if [ -z "$SECRET" ]; then
  echo "ERROR: Set CRON_SECRET or ADMIN_SECRET env var to authenticate with serviceOnly endpoints."
  echo "  Example: CRON_SECRET=your-secret bash scripts/seed-rag.sh"
  exit 1
fi
AUTH_HEADER="Authorization: Bearer $SECRET"

green(){ printf "\033[32m%s\033[0m\n" "$*"; }
red(){   printf "\033[31m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        VITAS · RAG Knowledge Base Seed                      ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Target: $BASE"
echo "║  Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Seed Drills ─────────────────────────────────────────────────────
echo "▸ Step 1/2: Seeding drills (82 entries)..."
DRILL_RESP=$(curl -s -w "\n%{http_code}" -X GET \
  -H "$AUTH_HEADER" \
  -m 120 \
  "${BASE}/api/rag/seed" 2>/dev/null) || true

DRILL_STATUS=$(echo "$DRILL_RESP" | tail -1)
DRILL_BODY=$(echo "$DRILL_RESP" | sed '$d')

if [ "$DRILL_STATUS" = "200" ]; then
  green "  ✅ Drills seeded (HTTP $DRILL_STATUS)"
  echo "     Response: ${DRILL_BODY:0:200}"
elif [ "$DRILL_STATUS" = "409" ]; then
  yellow "  ⚠️  Drills already seeded (HTTP 409 — skipping)"
else
  red "  ❌ Drill seed failed (HTTP $DRILL_STATUS)"
  echo "     Response: ${DRILL_BODY:0:300}"
fi
echo ""

# ── Step 2: Seed Knowledge Docs ─────────────────────────────────────────────
echo "▸ Step 2/2: Seeding knowledge docs (22+ entries)..."
KNOW_RESP=$(curl -s -w "\n%{http_code}" -X GET \
  -H "$AUTH_HEADER" \
  -m 180 \
  "${BASE}/api/rag/seed-knowledge" 2>/dev/null) || true

KNOW_STATUS=$(echo "$KNOW_RESP" | tail -1)
KNOW_BODY=$(echo "$KNOW_RESP" | sed '$d')

if [ "$KNOW_STATUS" = "200" ]; then
  green "  ✅ Knowledge docs seeded (HTTP $KNOW_STATUS)"
  echo "     Response: ${KNOW_BODY:0:200}"
elif [ "$KNOW_STATUS" = "409" ]; then
  yellow "  ⚠️  Knowledge docs already seeded (HTTP 409 — skipping)"
else
  red "  ❌ Knowledge seed failed (HTTP $KNOW_STATUS)"
  echo "     Response: ${KNOW_BODY:0:300}"
fi
echo ""

# ── Verification ────────────────────────────────────────────────────────────
echo "▸ Verification: querying RAG..."
QUERY_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"query":"drill for improving first touch and ball control","topK":3}' \
  -m 30 \
  "${BASE}/api/rag/query" 2>/dev/null) || true

QUERY_STATUS=$(echo "$QUERY_RESP" | tail -1)
QUERY_BODY=$(echo "$QUERY_RESP" | sed '$d')

if [ "$QUERY_STATUS" = "200" ]; then
  green "  ✅ RAG query works (HTTP $QUERY_STATUS)"
  echo "     Response: ${QUERY_BODY:0:200}"
else
  yellow "  ⚠️  RAG query returned HTTP $QUERY_STATUS (may need VOYAGE_API_KEY)"
  echo "     Response: ${QUERY_BODY:0:200}"
fi
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════"
if [ "$DRILL_STATUS" = "200" ] || [ "$DRILL_STATUS" = "409" ]; then
  if [ "$KNOW_STATUS" = "200" ] || [ "$KNOW_STATUS" = "409" ]; then
    green "  🎉 RAG Knowledge Base seeded successfully!"
    echo ""
    echo "  Next steps:"
    echo "    1. Verify in Supabase: SELECT count(*) FROM knowledge_base;"
    echo "    2. Test Scout Feed insights (they'll now include RAG context)"
    echo "    3. Test Intelligence reports (recommendations from KB)"
  else
    yellow "  ⚠️  Drills OK, but knowledge docs need attention"
  fi
else
  red "  ❌ Seed failed — check env vars in Vercel:"
  echo "     - SUPABASE_URL"
  echo "     - SUPABASE_SERVICE_ROLE_KEY"
  echo "     - VOYAGE_API_KEY"
fi
echo "══════════════════════════════════════════════════════════════"
echo ""
