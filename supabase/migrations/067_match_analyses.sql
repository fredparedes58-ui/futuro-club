-- ============================================================================
-- VITAS · Migration 067 · match_analyses — job de partido completo por vídeo (Fase 1)
-- ============================================================================
-- Contrato: src/lib/shared/matchJob/contract.ts · Diseño: docs/diseno-partido-completo.md
--
-- SEGURIDAD (revisión adversarial, bloqueante "IDOR + saltarse el presupuesto por RLS"):
--   - El cliente SOLO puede LEER (SELECT) sus jobs: dueño (user_id) o mismo tenant.
--   - NINGUNA política INSERT/UPDATE/DELETE para clientes: un INSERT vía PostgREST
--     saltaría ownsVideo, el flag, la declaración, la concurrencia, la reserva de
--     presupuesto y el dedup de POST /api/match/start. Toda escritura va por service
--     role desde api/match (que además comprueba la propiedad EN CÓDIGO).
--   - match_analysis_segments: RLS activo y SIN políticas (ningún acceso de cliente).
--   - Las RPC son SECURITY DEFINER y solo las ejecuta service_role: EXECUTE revocado de
--     PUBLIC, anon Y authenticated (Supabase concede EXECUTE a anon/authenticated por
--     default privileges; revocar solo de PUBLIC no basta).
--
-- RGPD / retención:
--   - video_id REFERENCES videos(id) ON DELETE CASCADE: la purga de vídeos no se rompe
--     (una FK restrictiva la bloquearía) y no quedan informes huérfanos. OJO: el cron
--     data-retention hace soft-delete de videos → borra explícitamente los jobs de esos
--     vídeos (api/_lib/matchJob/retention.ts).
--   - user_id REFERENCES auth.users ON DELETE CASCADE; segmentos ON DELETE CASCADE.
--
-- Idempotente (IF NOT EXISTS / DROP ... IF EXISTS). No toca ninguna tabla existente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS match_analyses (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id                    uuid REFERENCES organizations(id) ON DELETE SET NULL,
  tenant_id                 uuid,
  video_id                  text NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  bunny_video_id            text NOT NULL,              -- copiado en servidor de la fila `videos` propia
  purpose                   text NOT NULL CHECK (purpose IN ('match_ab','team_baseline')),
  home                      jsonb NOT NULL,             -- {name?, kit?{shirt{hex,label?},shorts?,gk?}}
  away                      jsonb NOT NULL,
  focus_team                text CHECK (focus_team IN ('home','away')),
  attacking_dir_1h          text CHECK (attacking_dir_1h IN ('left_to_right','right_to_left')),
  notes                     text CHECK (notes IS NULL OR char_length(notes) <= 1000),  -- "aportado por el entrenador, no observado"
  category                  text CHECK (category IN ('youth','senior')),              -- explícita; NULL = sin directiva (nunca "youth" por defecto)
  locale                    text NOT NULL,
  kit_fingerprint           text NOT NULL,              -- dedup: mismo vídeo + purpose + kits
  -- Declaración del entrenador (decisión 1 del owner). attested_by = usuario del JWT verificado.
  attested_by               uuid NOT NULL,
  attested_at               timestamptz NOT NULL,
  attestation_version       text NOT NULL,
  -- Máquina de estados (MATCH_JOB_STATUSES del contrato)
  status                    text NOT NULL DEFAULT 'awaiting_encode' CHECK (status IN (
                              'awaiting_encode','dispatched','preparing','uploading','gemini_processing',
                              'observing','aggregating','reporting','completed','failed','cancelled')),
  stage_detail              text,
  dispatch_epoch            int  NOT NULL DEFAULT 0 CHECK (dispatch_epoch >= 0),
  dispatch_attempts         int  NOT NULL DEFAULT 0 CHECK (dispatch_attempts >= 0),
  modal_call_id             text,
  dispatched_at             timestamptz,
  heartbeat_at              timestamptz,
  duration_sec              numeric CHECK (duration_sec IS NULL OR duration_sec > 0),  -- Bunny `length` (nunca videos.duration)
  bunny_status              int,
  target_variant            text,
  proxy                     jsonb,                      -- {bytes, sha256, durationSec, mime}
  gemini_file_name          text,
  gemini_file_uri           text,
  gemini_file_display_name  text,
  gemini_file_expires_at    timestamptz,
  gemini_file_deleted_at    timestamptz,
  segments_total            int CHECK (segments_total IS NULL OR segments_total >= 0),
  segments_done             int NOT NULL DEFAULT 0,
  observation               jsonb,
  coverage                  jsonb,
  report                    jsonb,
  report_gate               jsonb,
  report_model              text,                       -- campo `model` de la respuesta de Anthropic
  report_lease_until        timestamptz,
  prompt_versions           jsonb,
  model_ids                 jsonb,
  -- Coste (dinero operativo, no métrica de producto)
  estimate                  jsonb,                      -- UsdAmount del contrato
  estimate_usd              numeric(10,4) NOT NULL DEFAULT 0 CHECK (estimate_usd >= 0),
  reservation_usd           numeric(10,4) NOT NULL DEFAULT 0 CHECK (reservation_usd >= 0),  -- 0 al llegar a terminal (liberada)
  spend_usd                 numeric(10,4) NOT NULL DEFAULT 0 CHECK (spend_usd >= 0),        -- gasto real acumulado (también en ai_spend_ledger)
  spend_detail              jsonb NOT NULL DEFAULT '{}'::jsonb,
  error                     jsonb,                      -- {code, message} (matchJobErrorSchema)
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  finished_at               timestamptz
);

-- 1 job ACTIVO por usuario: cierra la carrera entre dos POST /start simultáneos.
CREATE UNIQUE INDEX IF NOT EXISTS match_analyses_one_active_per_user
  ON match_analyses(user_id)
  WHERE status NOT IN ('completed','failed','cancelled');

CREATE INDEX IF NOT EXISTS idx_match_analyses_active
  ON match_analyses(status, updated_at)
  WHERE status NOT IN ('completed','failed','cancelled');
CREATE INDEX IF NOT EXISTS idx_match_analyses_user    ON match_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_analyses_tenant  ON match_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_match_analyses_video   ON match_analyses(video_id);
CREATE INDEX IF NOT EXISTS idx_match_analyses_bunny   ON match_analyses(bunny_video_id);
CREATE INDEX IF NOT EXISTS idx_match_analyses_gemini_cleanup
  ON match_analyses(finished_at)
  WHERE gemini_file_name IS NOT NULL AND gemini_file_deleted_at IS NULL;

DROP TRIGGER IF EXISTS match_analyses_updated_at ON match_analyses;
CREATE TRIGGER match_analyses_updated_at
  BEFORE UPDATE ON match_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS match_analysis_segments (
  match_analysis_id  uuid NOT NULL REFERENCES match_analyses(id) ON DELETE CASCADE,
  idx                int  NOT NULL CHECK (idx >= 0),
  start_sec          numeric NOT NULL CHECK (start_sec >= 0),
  end_sec            numeric NOT NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','skipped')),
  lease_until        timestamptz,
  lease_epoch        int,
  attempts           int  NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  invalid_attempts   int  NOT NULL DEFAULT 0 CHECK (invalid_attempts >= 0),
  result             jsonb,                     -- NormalizedSegment (salida de Gemini tras identityGuard + zod)
  usage              jsonb,                     -- usageMetadata real
  cost_usd           numeric(10,4) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  error              jsonb,                     -- {kind, attempts, message}
  finished_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_analysis_id, idx),
  CHECK (end_sec > start_sec)
);

-- ── Claim atómico del siguiente tramo (FOR UPDATE SKIP LOCKED + lease) ────────
-- Fencing dentro del claim: solo el epoch VIGENTE de un job en `observing` reclama.
-- Un tramo `running` con lease caducado vuelve a ser reclamable (el advance murió);
-- si además agotó los intentos, pasa a `failed` (nunca queda colgado).
CREATE OR REPLACE FUNCTION claim_next_match_segment(
  p_job_id uuid,
  p_epoch int,
  p_lease_sec int,
  p_max_attempts int
)
RETURNS SETOF match_analysis_segments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM match_analyses
    WHERE id = p_job_id AND dispatch_epoch = p_epoch AND status = 'observing'
  ) THEN
    RETURN;
  END IF;

  UPDATE match_analysis_segments
  SET status = 'failed',
      lease_until = NULL,
      finished_at = now(),
      error = jsonb_build_object('kind', 'interrupted', 'attempts', attempts)
  WHERE match_analysis_id = p_job_id
    AND status = 'running'
    AND lease_until < now()
    AND attempts >= p_max_attempts;

  RETURN QUERY
  UPDATE match_analysis_segments s
  SET status = 'running',
      lease_until = now() + make_interval(secs => p_lease_sec),
      lease_epoch = p_epoch,
      attempts = s.attempts + 1
  WHERE (s.match_analysis_id, s.idx) = (
    SELECT c.match_analysis_id, c.idx
    FROM match_analysis_segments c
    WHERE c.match_analysis_id = p_job_id
      AND c.attempts < p_max_attempts
      AND (c.status = 'pending' OR (c.status = 'running' AND c.lease_until < now()))
    ORDER BY c.idx
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING s.*;
END;
$$;

-- ── Gasto real acumulado en el job (atómico; el ledger global va aparte) ───────
CREATE OR REPLACE FUNCTION add_match_spend(p_job_id uuid, p_service text, p_usd numeric)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  UPDATE match_analyses
  SET spend_usd = spend_usd + GREATEST(p_usd, 0),
      spend_detail = jsonb_set(
        spend_detail,
        ARRAY[p_service],
        to_jsonb(COALESCE((spend_detail ->> p_service)::numeric, 0) + GREATEST(p_usd, 0))
      )
  WHERE id = p_job_id
  RETURNING spend_usd INTO v_total;
  RETURN v_total;
END;
$$;

-- ── Reservas vigentes (jobs NO terminales): lo reservado que aún no se ha gastado ──
CREATE OR REPLACE FUNCTION match_active_reservations_usd(p_exclude_job uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(GREATEST(reservation_usd - spend_usd, 0)), 0)
  FROM match_analyses
  WHERE status NOT IN ('completed','failed','cancelled')
    AND (p_exclude_job IS NULL OR id <> p_exclude_job);
$$;

-- En Supabase los default privileges del esquema public conceden EXECUTE sobre cada
-- función nueva a anon y authenticated EXPLÍCITAMENTE (no vía PUBLIC). Revocar solo de
-- PUBLIC las dejaría invocables por /rest/v1/rpc/* y, al ser SECURITY DEFINER (saltan
-- RLS), un cliente podría inflar spend_usd (anulando la reserva por partido), bloquear
-- o re-facturar tramos y leer segmentos o reservas globales. Linter Supabase 0028/0029;
-- mismo patrón que 057_custom_access_token_hook.sql.
REVOKE EXECUTE ON FUNCTION claim_next_match_segment(uuid, int, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION add_match_spend(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION match_active_reservations_usd(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_next_match_segment(uuid, int, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION add_match_spend(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION match_active_reservations_usd(uuid) TO service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE match_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_analysis_segments ENABLE ROW LEVEL SECURITY;

-- Solo lectura para el dueño o su tenant (mismo predicado que ownsMatchAnalysis en código).
DROP POLICY IF EXISTS match_analyses_select_owner ON match_analyses;
CREATE POLICY match_analyses_select_owner ON match_analyses
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (tenant_id IS NOT NULL AND tenant_id = public.tenant_id())
  );

-- Sin políticas INSERT / UPDATE / DELETE ⇒ denegado para anon/authenticated.
-- Defensa en profundidad: además se retiran los privilegios de escritura.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON match_analyses FROM anon, authenticated;
REVOKE ALL ON match_analysis_segments FROM anon, authenticated;
-- match_analysis_segments: RLS activo y SIN políticas (ningún acceso de cliente).

COMMENT ON TABLE match_analyses IS
  'Job de partido completo por vídeo (Fase 1). Clientes: solo SELECT (dueño/tenant). '
  'Escribe solo service_role desde api/match. Todo valor de Gemini/Claude es ESTIMADA_LLM; '
  'cobertura DERIVADA; nada por jugador.';
COMMENT ON TABLE match_analysis_segments IS
  'Tramos de 15 min de un match_analyses. Sin acceso de cliente (RLS sin políticas).';

COMMIT;
