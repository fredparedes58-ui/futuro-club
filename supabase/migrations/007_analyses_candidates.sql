-- ════════════════════════════════════════════════════════════════════
-- VITAS · Migration 007 · Analyses candidates column
-- Sprint 3 · Día 3 · UI identificación de jugador
-- ════════════════════════════════════════════════════════════════════
-- Añade columna 'candidates' a analyses para almacenar los crops de
-- personas detectadas por Modal, que el padre/coach selecciona.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS candidates jsonb;

COMMENT ON COLUMN analyses.candidates IS 'Crops de personas detectadas por Modal · usado en pantalla de identificación · se borra tras seleccionar';
