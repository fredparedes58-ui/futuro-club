-- ════════════════════════════════════════════════════════════════════════════
-- VITAS · Migration 004 · Analyses + Reports + Prompt Versions
-- Sprint 2 · Día 2
-- ════════════════════════════════════════════════════════════════════════════
-- Crea:
--   1. analyses        · 1 análisis por vídeo (resultado pipeline GPU)
--   2. reports         · los 6 reportes generados por análisis
--   3. prompt_versions · trazabilidad de qué prompt se usó en cada reporte
--
-- Todas con tenant_id + RLS multi-tenant.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. ANALYSES ───────────────────────────────────────────────────────────────
-- Un análisis por (player, video). Almacena los outputs deterministas:
-- biomecánica, PHV, VSI, embedding, similarity matches.
CREATE TABLE IF NOT EXISTS analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  player_id       text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  video_id        text NOT NULL,                    -- referencia a videos.id (text)
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Estado
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  status_message  text,
  started_at      timestamptz,
  completed_at    timestamptz,

  -- Outputs deterministas
  biomechanics    jsonb,           -- métricas MMPose (ángulos, asimetrías, sprint)
  phv             jsonb,           -- maturity offset Mirwald
  vsi             jsonb,           -- score 0-100 + tier + subscores
  similarity      jsonb,           -- top-5 best-match pros
  embedding       vector(768),     -- VideoMAE v2 embedding (si pgvector está)

  -- Metadata pipeline
  modal_run_id    text,            -- ID de la ejecución Modal
  pipeline_version text NOT NULL DEFAULT 'v1.0',
  total_latency_ms int,
  cost_eur        numeric(10, 6),  -- coste real medido (€0.109 esperado)

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyses_tenant ON analyses(tenant_id);
CREATE INDEX idx_analyses_player ON analyses(player_id);
CREATE INDEX idx_analyses_video ON analyses(video_id);
CREATE INDEX idx_analyses_status ON analyses(status) WHERE status IN ('queued','processing');
CREATE INDEX idx_analyses_created ON analyses(created_at DESC);

COMMENT ON TABLE analyses IS 'Resultado del pipeline GPU (Modal) por video · 1 fila por análisis';
COMMENT ON COLUMN analyses.embedding IS 'VideoMAE v2 768-dim · usado para similarity y best-match';

-- ── 2. PROMPT VERSIONS ────────────────────────────────────────────────────────
-- Versionado de prompts LLM (Claude). Cada cambio de prompt → nueva versión.
-- Permite trazabilidad ("¿qué prompt generó este reporte hace 3 semanas?")
-- y rollback ("vuelve a la versión v2.1.0 del player-report").
CREATE TABLE IF NOT EXISTS prompt_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      text NOT NULL,                    -- ej. 'player-report'
  version         text NOT NULL,                    -- semver: 'v1.0.0'
  prompt_hash     text NOT NULL,                    -- SHA-256 del prompt completo
  system_prompt   text NOT NULL,                    -- el prompt sistémico
  model           text NOT NULL,                    -- 'claude-sonnet-4-5' | 'claude-haiku-4-5'
  max_tokens      int NOT NULL DEFAULT 2000,
  temperature     numeric(3,2) DEFAULT 0,
  notes           text,                              -- por qué este cambio
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_agent_version UNIQUE (agent_name, version)
);

CREATE INDEX idx_prompts_agent ON prompt_versions(agent_name);
CREATE INDEX idx_prompts_active ON prompt_versions(agent_name, is_active) WHERE is_active = true;

COMMENT ON TABLE prompt_versions IS 'Versionado semver de prompts LLM · permite trazabilidad y rollback';

-- Seed: versiones iniciales de los 6 agentes
INSERT INTO prompt_versions (agent_name, version, prompt_hash, system_prompt, model, max_tokens, notes) VALUES
  ('player-report',     'v2.0.0', 'pending-hash', 'Ver _player-report.ts',     'claude-sonnet-4-5', 2500, 'Refactor inicial post scout-insight'),
  ('lab-biomechanics',  'v1.0.0', 'pending-hash', 'Ver _lab-biomechanics.ts',  'claude-sonnet-4-5', 2500, 'Reporte LAB inicial'),
  ('dna-profile',       'v1.0.0', 'pending-hash', 'Ver _dna-profile.ts',       'claude-haiku-4-5',  1500, 'Fusion tactical+role inicial'),
  ('best-match',        'v1.0.0', 'pending-hash', 'Ver _best-match.ts',        'claude-haiku-4-5',  1500, 'Narrador best-match inicial'),
  ('projection',        'v1.0.0', 'pending-hash', 'Ver _projection.ts',        'claude-haiku-4-5',  1500, 'Curva 3 anos inicial'),
  ('development-plan',  'v1.0.0', 'pending-hash', 'Ver _development-plan.ts',  'claude-haiku-4-5',  2000, 'Plan 12 semanas inicial')
ON CONFLICT (agent_name, version) DO NOTHING;

-- ── 3. REPORTS ────────────────────────────────────────────────────────────────
-- Los 6 reportes generados por cada análisis (Player, LAB, DNA, BestMatch,
-- Projection, DevelopmentPlan). 1 análisis → 6 reports.
CREATE TABLE IF NOT EXISTS reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  analysis_id       uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  player_id         text NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Tipo de reporte
  report_type       text NOT NULL CHECK (report_type IN (
    'player-report','lab-biomechanics','dna-profile',
    'best-match','projection','development-plan'
  )),

  -- Contenido
  content           jsonb NOT NULL,                 -- el JSON estructurado del reporte
  rendered_markdown text,                            -- versión renderizada para UI/email

  -- Trazabilidad LLM
  prompt_version_id uuid REFERENCES prompt_versions(id),
  prompt_version    text NOT NULL,                  -- duplicado para query rápida (ej. 'v1.0.0')
  model             text NOT NULL,
  input_tokens      int,
  output_tokens     int,
  cache_hits        int DEFAULT 0,
  cost_eur          numeric(10, 6),

  -- Estado
  generated_at      timestamptz NOT NULL DEFAULT now(),
  is_latest         boolean NOT NULL DEFAULT true,   -- false si fue regenerado

  -- Feedback usuario
  feedback_useful   boolean,                          -- 👍 / 👎 (Sprint 7)
  feedback_comment  text,
  feedback_at       timestamptz,

  CONSTRAINT uq_analysis_type UNIQUE (analysis_id, report_type, prompt_version)
);

CREATE INDEX idx_reports_tenant ON reports(tenant_id);
CREATE INDEX idx_reports_analysis ON reports(analysis_id);
CREATE INDEX idx_reports_player ON reports(player_id);
CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_latest ON reports(player_id, report_type) WHERE is_latest = true;

COMMENT ON TABLE reports IS '6 reportes generados por analisis · trazables a prompt_version';

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGERS · updated_at en analyses
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_analyses_updated_at
BEFORE UPDATE ON analyses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY analyses_tenant_isolation ON analyses
  FOR ALL TO authenticated
  USING (tenant_id = public.tenant_id() OR public.is_admin())
  WITH CHECK (tenant_id = public.tenant_id() OR public.is_admin());

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_tenant_isolation ON reports
  FOR ALL TO authenticated
  USING (tenant_id = public.tenant_id() OR public.is_admin())
  WITH CHECK (tenant_id = public.tenant_id() OR public.is_admin());

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompts_read_all ON prompt_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY prompts_admin_write ON prompt_versions
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- VISTAS útiles para el frontend
-- ════════════════════════════════════════════════════════════════════════════

-- Vista: último análisis por jugador (con todos los reports)
CREATE OR REPLACE VIEW player_latest_analysis AS
SELECT
  a.id AS analysis_id,
  a.tenant_id,
  a.player_id,
  a.video_id,
  a.status,
  a.vsi,
  a.phv,
  a.completed_at,
  COUNT(r.id) FILTER (WHERE r.is_latest = true) AS reports_count
FROM analyses a
LEFT JOIN reports r ON r.analysis_id = a.id
WHERE a.status = 'completed'
GROUP BY a.id;

COMMENT ON VIEW player_latest_analysis IS 'Vista rápida del último análisis completado por jugador';

-- ════════════════════════════════════════════════════════════════════════════
-- FIN MIGRATION 004
-- ════════════════════════════════════════════════════════════════════════════
