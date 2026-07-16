-- ============================================================================
-- VITAS · Migration 052 · tracking_jobs — async GPU tracking queue (Vision V4)
-- ============================================================================
-- Convierte el tracking de vídeos largos (partidos 90 min) en un flujo async:
--   enqueue (track-async) → spawn Modal → callback (webhook) → poll (track-status)
-- Espeja el patrón de la cola de `analyses` (004 + 040) y el aislamiento
-- multi-academia de 038 (org_id NULLable + user_org_ids()).
-- Diseño completo: docs/roadmap-async-tracking-v4.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS tracking_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- vídeo origen: id lógico (Bunny/local, text como players.id) + URL reproducible
  video_id       text,
  video_url      text NOT NULL,
  player_id      text,                 -- NULL = trackear a todos los jugadores
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id         uuid REFERENCES organizations(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','processing','done','failed')),
  sample_fps     int  NOT NULL DEFAULT 5,
  duration_sec   int,
  modal_call_id  text,                 -- id del spawn en Modal (observabilidad/retry)
  result         jsonb,                -- TrackingResponse camelCase cuando done
  error          text,
  attempts       int  NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz
);

-- Índice parcial para el drenaje de cola / limpieza de colgados (patrón 004)
CREATE INDEX IF NOT EXISTS idx_tracking_jobs_status
  ON tracking_jobs(status, created_at)
  WHERE status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS idx_tracking_jobs_user  ON tracking_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_jobs_org   ON tracking_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_tracking_jobs_video ON tracking_jobs(video_id);

-- ── RPC atómica de claim (patrón 040: FOR UPDATE SKIP LOCKED) ───────────────
-- La usa el cron de red de seguridad (V4.5) para re-lanzar jobs 'queued' cuyo
-- spawn falló, sin doble-despacho si dos invocaciones solapan.
CREATE OR REPLACE FUNCTION claim_queued_tracking_jobs(batch_size INT DEFAULT 3)
RETURNS SETOF tracking_jobs
LANGUAGE sql
VOLATILE
AS $$
  UPDATE tracking_jobs
  SET status = 'processing',
      started_at = now(),
      attempts = attempts + 1
  WHERE id IN (
    SELECT id
    FROM tracking_jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_size
  )
  RETURNING *;
$$;

COMMENT ON FUNCTION claim_queued_tracking_jobs IS
  'Atomically claims queued tracking jobs. FOR UPDATE SKIP LOCKED prevents '
  'double-dispatch when cron invocations overlap (mirror of claim_queued_analyses).';

-- ── RLS (patrón 038) ─────────────────────────────────────────────────────────
-- La API escribe siempre con service_role (bypassa RLS); estas policies son la
-- red de seguridad para acceso directo desde el cliente (anon/authenticated).
ALTER TABLE tracking_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_jobs_select ON tracking_jobs;
CREATE POLICY tracking_jobs_select ON tracking_jobs
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (org_id IS NOT NULL AND org_id IN (SELECT user_org_ids()))
  );

DROP POLICY IF EXISTS tracking_jobs_insert ON tracking_jobs;
CREATE POLICY tracking_jobs_insert ON tracking_jobs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE/DELETE: sin policy → denegado para roles de cliente.
-- Solo service_role (API/webhook/cron) muta jobs.

COMMENT ON TABLE tracking_jobs IS
  'Cola async de tracking GPU (Vision V4). Flujo: track-async inserta queued → '
  'Modal spawn procesa → webhook modal-tracking escribe result/done → cliente '
  'hace polling por track-status. attempts>3 con status failed = job muerto.';
