#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# VITAS · RAG Knowledge Base Seed Script
#
# ⚠️  DESTRUCTIVO SOBRE EL DESPLIEGUE INDICADO (por defecto PRODUCCIÓN):
#     cada endpoint de seed BORRA sus filas previas de knowledge_base
#     (drills: metadata.drillId · docs: metadata.docId) y las RE-INSERTA.
#     Si el embedding falla, la fila entra SIN embedding (búsqueda semántica
#     degradada). Ejecutar solo a propósito, nunca en cada push (CS-12).
#
# Seeds the RAG knowledge base:
#   1. GET /api/rag/seed           → drills
#   2. GET /api/rag/seed-knowledge → knowledge docs (scouting methodology,
#      youth development, tactical systems, performance benchmarks, etc.)
#
# Prerequisites (Vercel env vars of the target deployment):
#   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
#   - VOYAGE_API_KEY (for embeddings)
#   - INTERNAL_API_TOKEN or CRON_SECRET (service token accepted by withHandler)
#   - knowledge_base table created (migration 015+)
#
# Auth: INTERNAL_API_TOKEN (preferred) or CRON_SECRET, same value as in Vercel.
# ADMIN_SECRET is NOT accepted any more (CS-01: it leaked as VITE_ADMIN_SECRET).
#
# Usage:
#   INTERNAL_API_TOKEN=... bash scripts/seed-rag.sh
#   CRON_SECRET=...        bash scripts/seed-rag.sh https://futuro-club-xxxx.vercel.app
#
# Exit code: 0 only if BOTH seeds return success with indexed == total and no
# errors; 1 otherwise (it no longer swallows failures).
# Manual CI entry point: .github/workflows/rag-seed.yml (workflow_dispatch only).
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="${1:-https://futuro-club.vercel.app}"

SECRET="${INTERNAL_API_TOKEN:-${CRON_SECRET:-}}"
if [ -z "$SECRET" ]; then
  echo "ERROR: Set INTERNAL_API_TOKEN or CRON_SECRET (same value as in Vercel) to authenticate with the serviceOnly seed endpoints."
  echo "  Example: INTERNAL_API_TOKEN=... bash scripts/seed-rag.sh"
  exit 1
fi
AUTH_HEADER="Authorization: Bearer $SECRET"

green(){ printf "\033[32m%s\033[0m\n" "$*"; }
red(){   printf "\033[31m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

# Validates one seed response: HTTP 200 + data.success === true +
# data.indexed === data[<total field>] + no errors. Never prints the token.
# $1 label · $2 HTTP status · $3 body · $4 total field (totalDrills | totalDocs)
validate_seed() {
  local label="$1" status="$2" body="$3" total_field="$4"
  if [ "$status" != "200" ]; then
    red "  ❌ $label failed (HTTP $status)"
    echo "     Response: ${body:0:300}"
    return 1
  fi
  if SEED_BODY="$body" TOTAL_FIELD="$total_field" node -e '
    let j;
    try { j = JSON.parse(process.env.SEED_BODY || ""); } catch { console.log("     response is not JSON"); process.exit(1); }
    const d = (j && j.data) || j || {};
    const total = d[process.env.TOTAL_FIELD];
    const errs = Array.isArray(d.errors) ? d.errors : [];
    console.log(`     indexed=${d.indexed} total=${total} errors=${errs.length}`);
    for (const e of errs.slice(0, 5)) console.log("       - " + String(e).slice(0, 200));
    const ok = d.success === true && typeof total === "number" && d.indexed === total && errs.length === 0;
    process.exit(ok ? 0 : 1);
  '; then
    green "  ✅ $label seeded (HTTP 200, indexed == total)"
    return 0
  fi
  red "  ❌ $label incomplete (success=false, indexed < total or errors)"
  return 1
}

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        VITAS · RAG Knowledge Base Seed                      ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Target: $BASE"
echo "║  Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "╚══════════════════════════════════════════════════════════════╝"
yellow "  ⚠️  Deletes and re-inserts the RAG knowledge base of this target."
echo ""

FAILED=0

# ── Step 1: Seed Drills ─────────────────────────────────────────────────────
echo "▸ Step 1/2: Seeding drills..."
DRILL_RESP=$(curl -s -w "\n%{http_code}" -X GET \
  -H "$AUTH_HEADER" \
  -m 120 \
  "${BASE}/api/rag/seed" 2>/dev/null) || true

DRILL_STATUS=$(echo "$DRILL_RESP" | tail -1)
DRILL_BODY=$(echo "$DRILL_RESP" | sed '$d')
validate_seed "Drills" "$DRILL_STATUS" "$DRILL_BODY" "totalDrills" || FAILED=1
echo ""

# ── Step 2: Seed Knowledge Docs ─────────────────────────────────────────────
echo "▸ Step 2/2: Seeding knowledge docs..."
KNOW_RESP=$(curl -s -w "\n%{http_code}" -X GET \
  -H "$AUTH_HEADER" \
  -m 180 \
  "${BASE}/api/rag/seed-knowledge" 2>/dev/null) || true

KNOW_STATUS=$(echo "$KNOW_RESP" | tail -1)
KNOW_BODY=$(echo "$KNOW_RESP" | sed '$d')
validate_seed "Knowledge docs" "$KNOW_STATUS" "$KNOW_BODY" "totalDocs" || FAILED=1
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
# (La verificación antigua llamaba a /api/rag/query con el token de servicio,
# pero ese endpoint es requireAuth (JWT de usuario) → siempre 401 y un aviso
# engañoso sobre VOYAGE_API_KEY. Retirada.)
echo "══════════════════════════════════════════════════════════════"
if [ "$FAILED" = "0" ]; then
  green "  🎉 RAG Knowledge Base seeded (both seeds: success, indexed == total)."
else
  red "  ❌ Seed failed or incomplete — check Vercel env vars of the target:"
  echo "     - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
  echo "     - VOYAGE_API_KEY"
  echo "     - INTERNAL_API_TOKEN / CRON_SECRET (must match the token used here)"
fi
echo ""
echo "  Read-only check of rows without embedding (Supabase SQL editor):"
echo "    select count(*) filter (where embedding is null) as sin_embedding, count(*) as total from knowledge_base;"
echo "══════════════════════════════════════════════════════════════"
echo ""
exit "$FAILED"
