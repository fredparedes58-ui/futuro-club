-- ════════════════════════════════════════════════════════════════════════════
-- VITAS · Migration 041 · Analyses: observation_packet + composite index
-- Sprint 5 (Polish y Persistencia)
-- ════════════════════════════════════════════════════════════════════════════
-- Adds:
--   1. observation_packet JSONB column for Gemini video observations
--   2. Composite index on (player_id, status) for cron queue queries
--   3. Updates status CHECK to include 'processing_reports' state
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add observation_packet column (Gemini raw observations for re-processing)
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS observation_packet jsonb;

COMMENT ON COLUMN analyses.observation_packet
  IS 'Raw Gemini video observations (GeminiObservation) — kept for re-processing reports without re-analyzing video';

-- 2. Composite index for queue processing (cron picks queued by player)
CREATE INDEX IF NOT EXISTS idx_analyses_player_status
  ON analyses(player_id, status);

-- 3. Update status CHECK to allow 'processing_reports' (Gemini done, reports pending)
-- Drop old check and recreate with expanded set
ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_status_check;
ALTER TABLE analyses ADD CONSTRAINT analyses_status_check
  CHECK (status IN ('queued', 'processing', 'processing_reports', 'completed', 'failed', 'cancelled'));
