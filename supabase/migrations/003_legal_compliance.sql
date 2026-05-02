-- ════════════════════════════════════════════════════════════════════════════
-- VITAS · Migration 003 · Legal Compliance (LOPD/GDPR)
-- Sprint 1 · Día 1-2
-- ════════════════════════════════════════════════════════════════════════════
-- Crea:
--   1. Tabla parental_consents (doble consentimiento, requisito GDPR Art. 8)
--   2. Tabla data_retention_policies (políticas configurables)
--   3. Tabla legal_acceptances (T&Cs aceptados con timestamp + IP)
--   4. Tabla deletion_requests (solicitudes de borrado, derecho al olvido)
--   5. RLS multi-tenant en todas las tablas relevantes
--   6. Función helper public.tenant_id() para obtener tenant del JWT
--   7. Triggers de auditoría
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PARENTAL CONSENTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parental_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       text NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- text para compatibilidad con players.id existente
  tenant_id       uuid NOT NULL,
  parent_email    text NOT NULL,
  parent_name     text NOT NULL,
  parent_dni_hash text,                                  -- hash SHA-256 del DNI (no DNI en claro)
  child_birthdate date NOT NULL,
  signed_at       timestamptz NOT NULL DEFAULT now(),
  signed_ip       inet,
  signature_hash  text NOT NULL,                          -- hash de los datos firmados
  email_verified  boolean NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  verification_token text UNIQUE,
  verification_expires_at timestamptz,
  consent_version text NOT NULL DEFAULT 'v1.0',
  withdrawn_at    timestamptz,                            -- el consentimiento se puede retirar
  withdrawn_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_email_verified CHECK (
    (email_verified = false) OR (email_verified_at IS NOT NULL)
  )
);

CREATE INDEX idx_consents_player ON parental_consents(player_id);
CREATE INDEX idx_consents_tenant ON parental_consents(tenant_id);
CREATE INDEX idx_consents_token ON parental_consents(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX idx_consents_active ON parental_consents(player_id) WHERE withdrawn_at IS NULL AND email_verified = true;

COMMENT ON TABLE parental_consents IS 'Consentimientos parentales para procesamiento de datos de menores (GDPR Art. 8 + LOPD Art. 7)';
COMMENT ON COLUMN parental_consents.parent_dni_hash IS 'Hash SHA-256 del DNI · nunca guardar DNI en claro';

-- ── 2. DATA RETENTION POLICIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type    text NOT NULL UNIQUE,
  retention_days integer NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO data_retention_policies (data_type, retention_days, description) VALUES
  ('raw_video',         90,    'Vídeos brutos subidos por usuarios'),
  ('processed_metrics', 1825,  'Métricas anonimizadas · 5 años'),
  ('embeddings',        1825,  'Embeddings VideoMAE · 5 años'),
  ('reports',           1825,  'Reportes generados · 5 años'),
  ('audit_logs',        2555,  'Logs de auditoría · 7 años (obligación legal)'),
  ('deleted_users',     30,    'Datos en período de retención post-borrado')
ON CONFLICT (data_type) DO NOTHING;

-- ── 3. LEGAL ACCEPTANCES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy', 'cookies', 'consent_minor')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_ip inet,
  user_agent  text,
  CONSTRAINT uq_user_doc_version UNIQUE (user_id, document_type, document_version)
);

CREATE INDEX idx_legal_user ON legal_acceptances(user_id);
CREATE INDEX idx_legal_tenant ON legal_acceptances(tenant_id);

-- ── 4. DELETION REQUESTS (derecho al olvido GDPR Art. 17) ─────────────────────
CREATE TABLE IF NOT EXISTS deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  tenant_id     uuid NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  requested_ip  inet,
  scheduled_for timestamptz NOT NULL,                    -- 72h post solicitud
  completed_at  timestamptz,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  cancellation_token text UNIQUE,                        -- por si el usuario se arrepiente <72h
  records_deleted_summary jsonb,
  CONSTRAINT chk_completion CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR (status != 'completed')
  )
);

CREATE INDEX idx_deletions_user ON deletion_requests(user_id);
CREATE INDEX idx_deletions_pending ON deletion_requests(scheduled_for) WHERE status = 'pending';

-- ── 5. AUDIT LOG (GDPR Art. 30 · registro de actividades de tratamiento) ──────
CREATE TABLE IF NOT EXISTS gdpr_audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid,
  tenant_id   uuid,
  action      text NOT NULL,                              -- ej. 'consent_signed', 'data_exported', 'data_deleted'
  resource_type text,
  resource_id text,
  metadata    jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user ON gdpr_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON gdpr_audit_log(action, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCIONES HELPER
-- ════════════════════════════════════════════════════════════════════════════

-- ── public.tenant_id() · extrae tenant del JWT ─────────────────────────────────
-- Funciones helper en schema public (Supabase no permite crear en auth)
CREATE OR REPLACE FUNCTION public.tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> 'tenant_id',
    ''
  )::uuid;
$$;

-- ── public.is_admin() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT (current_setting('request.jwt.claims', true)::json ->> 'role') = 'admin';
$$;

-- ── log_gdpr_action() · helper para auditar acciones GDPR ────────────────────
CREATE OR REPLACE FUNCTION log_gdpr_action(
  p_user_id uuid,
  p_tenant_id uuid,
  p_action text,
  p_resource_type text DEFAULT NULL,
  p_resource_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_ip inet DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  log_id bigint;
BEGIN
  INSERT INTO gdpr_audit_log (user_id, tenant_id, action, resource_type, resource_id, metadata, ip)
  VALUES (p_user_id, p_tenant_id, p_action, p_resource_type, p_resource_id, p_metadata, p_ip)
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY (RLS) MULTI-TENANT
-- ════════════════════════════════════════════════════════════════════════════

-- ── parental_consents ────────────────────────────────────────────────────────
ALTER TABLE parental_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_tenant_isolation ON parental_consents
  FOR ALL TO authenticated
  USING (tenant_id = public.tenant_id() OR public.is_admin())
  WITH CHECK (tenant_id = public.tenant_id() OR public.is_admin());

-- ── data_retention_policies (read-only para todos los autenticados) ──────────
ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY retention_read_all ON data_retention_policies
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY retention_admin_write ON data_retention_policies
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── legal_acceptances ────────────────────────────────────────────────────────
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_user_own ON legal_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY legal_user_insert ON legal_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── deletion_requests ────────────────────────────────────────────────────────
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY deletions_user_own ON deletion_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid());

-- ── gdpr_audit_log (insertable por todos, leíble solo admin/usuario) ─────────
ALTER TABLE gdpr_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_read_own ON gdpr_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY audit_insert_authenticated ON gdpr_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- APLICAR RLS MULTI-TENANT A TABLAS EXISTENTES VITAS
-- (asumimos que estas tablas existen ya en migrations anteriores)
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: añadir tenant_id si no existe
DO $$
DECLARE
  t text;
  tables_to_secure text[] := ARRAY['players', 'videos', 'analyses', 'reports', 'subscriptions'];
BEGIN
  FOREACH t IN ARRAY tables_to_secure LOOP
    -- Verificar si la tabla existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      -- Añadir tenant_id si no existe
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid',
        t
      );

      -- Activar RLS
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

      -- Crear policy de aislamiento (si no existe)
      EXECUTE format(
        $POLICY$
        CREATE POLICY %I ON %I
          FOR ALL TO authenticated
          USING (tenant_id = public.tenant_id() OR public.is_admin())
          WITH CHECK (tenant_id = public.tenant_id() OR public.is_admin())
        $POLICY$,
        t || '_tenant_isolation', t
      );

      RAISE NOTICE 'RLS activado en tabla: %', t;
    END IF;
  END LOOP;
EXCEPTION WHEN duplicate_object THEN
  -- Policy ya existe, ignorar
  RAISE NOTICE 'Policy ya existía para alguna tabla, continuando...';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- CRON JOBS (configurar en Vercel/Supabase scheduler)
-- ════════════════════════════════════════════════════════════════════════════

-- Función a ejecutar cada noche (Vercel cron llama a /api/crons/data-retention)
CREATE OR REPLACE FUNCTION run_data_retention_purge() RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  policy record;
  rows_affected bigint;
BEGIN
  -- Para cada política activa, purgar datos antiguos
  FOR policy IN SELECT * FROM data_retention_policies LOOP
    IF policy.data_type = 'raw_video' THEN
      DELETE FROM videos
      WHERE created_at < now() - (policy.retention_days || ' days')::interval
        AND deleted_at IS NULL;
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      result := result || jsonb_build_object('raw_video_purged', rows_affected);
    END IF;
    -- Añadir más tipos según necesidad
  END LOOP;

  -- Auditar la ejecución
  PERFORM log_gdpr_action(
    NULL, NULL, 'retention_cron_executed', 'system', NULL, result, NULL
  );

  RETURN result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGERS DE AUDITORÍA
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION audit_consent_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_gdpr_action(
      NULL, NEW.tenant_id, 'consent_signed',
      'parental_consents', NEW.id::text,
      jsonb_build_object('player_id', NEW.player_id, 'parent_email', NEW.parent_email),
      NEW.signed_ip
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL THEN
    PERFORM log_gdpr_action(
      NULL, NEW.tenant_id, 'consent_withdrawn',
      'parental_consents', NEW.id::text,
      jsonb_build_object('reason', NEW.withdrawn_reason),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_audit_consents
AFTER INSERT OR UPDATE ON parental_consents
FOR EACH ROW EXECUTE FUNCTION audit_consent_changes();

-- ════════════════════════════════════════════════════════════════════════════
-- FIN MIGRATION 003
-- ════════════════════════════════════════════════════════════════════════════
