#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# VITAS — SQL Migration Runner
# Aplica todas las migraciones en orden a Supabase (nuevo ambiente).
#
# Requisitos:
#   - SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env
#   - curl disponible
#
# Uso:
#   bash scripts/migrate.sh              # aplica todas
#   bash scripts/migrate.sh --dry-run    # solo lista sin ejecutar
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# Cargar .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "ERROR: Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env"
  exit 1
fi

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  echo "=== DRY RUN — solo lista, no ejecuta ==="
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  VITAS — SQL Migration Runner"
echo "  Supabase: ${SUPABASE_URL}"
echo "═══════════════════════════════════════════════"
echo ""

TOTAL=0
OK=0
FAIL=0

for sql_file in "$MIGRATIONS_DIR"/*.sql; do
  filename="$(basename "$sql_file")"
  TOTAL=$((TOTAL + 1))

  if [ "$DRY_RUN" = true ]; then
    echo "  [$TOTAL] $filename (pendiente)"
    continue
  fi

  echo -n "  [$TOTAL] $filename ... "

  # Leer SQL
  SQL_CONTENT="$(cat "$sql_file")"

  # Ejecutar via Supabase REST SQL endpoint
  HTTP_CODE=$(curl -s -o /tmp/migrate_response.txt -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$SQL_CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$SQL_CONTENT\"")}" \
    2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
    echo "OK"
    OK=$((OK + 1))
  else
    # Intentar con el endpoint de management API
    HTTP_CODE2=$(curl -s -o /tmp/migrate_response2.txt -w "%{http_code}" \
      -X POST "${SUPABASE_URL}/pg/query" \
      -H "apikey: ${SUPABASE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"query\": $(echo "$SQL_CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$SQL_CONTENT\"")}" \
      2>/dev/null || echo "000")

    if [ "$HTTP_CODE2" = "200" ] || [ "$HTTP_CODE2" = "204" ]; then
      echo "OK (fallback)"
      OK=$((OK + 1))
    else
      echo "WARN (HTTP $HTTP_CODE) — aplica manualmente en Supabase SQL Editor"
      FAIL=$((FAIL + 1))
    fi
  fi
done

echo ""
echo "═══════════════════════════════════════════════"
echo "  Total: $TOTAL | OK: $OK | Warn: $FAIL"
echo ""
echo "  Si alguna migración falló, copia el .sql y"
echo "  ejecútalo en: Supabase Dashboard > SQL Editor"
echo "═══════════════════════════════════════════════"
