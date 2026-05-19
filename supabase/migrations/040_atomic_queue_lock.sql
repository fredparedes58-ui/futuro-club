-- ═══════════════════════════════════════════════════════════════════════════════
-- 040: Atomic queue lock for analysis processing
-- Prevents double-dispatch when cron overlaps
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION claim_queued_analyses(batch_size INT DEFAULT 5)
RETURNS SETOF analyses
LANGUAGE sql
VOLATILE
AS $$
  UPDATE analyses
  SET status = 'processing',
      started_at = now()
  WHERE id IN (
    SELECT id
    FROM analyses
    WHERE status = 'queued'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_size
  )
  RETURNING *;
$$;

COMMENT ON FUNCTION claim_queued_analyses IS
  'Atomically claims queued analyses for processing. Uses FOR UPDATE SKIP LOCKED '
  'to prevent double-dispatch when multiple cron invocations overlap.';
