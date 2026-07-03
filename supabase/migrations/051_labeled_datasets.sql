-- ─────────────────────────────────────────────────────────────────────────
-- VITAS · 051 — Flywheel: labeled_datasets (Sprint 5.3)
--
-- Cada análisis de cliente CON consentimiento alimenta un dataset etiquetado
-- (features → labels) para entrenar modelos propios en el futuro. Es el foso
-- Tier 3: nadie más acumula datos juveniles con corrección PHV + consent RGPD.
--
-- Solo el servidor (service_role) escribe/lee: dataset de entrenamiento, sin
-- acceso de cliente. player_id es TEXT (players.id es text en este esquema).
-- Idempotente (IF NOT EXISTS + DROP POLICY IF EXISTS) → re-ejecutable sin error.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labeled_datasets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  analysis_id       uuid,
  player_id         text REFERENCES players(id) ON DELETE CASCADE,

  -- Contexto de maduración (el diferencial)
  chronological_age real,
  biological_age    real,
  phv_offset        real,
  phv_category      text,
  position          text,

  -- Features (entrada del modelo) y labels (salida)
  features          jsonb NOT NULL DEFAULT '{}',   -- biomechanics, scanning, similarity, subscores
  labels            jsonb NOT NULL DEFAULT '{}',   -- vsi, injury_risk, valuation, report types

  -- Base legal para incluir la muestra (RGPD)
  consent_basis     text NOT NULL CHECK (consent_basis IN ('not_required', 'parental_verified')),

  model_version     text NOT NULL DEFAULT 'v1',
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (analysis_id)   -- una muestra por análisis (upsert idempotente)
);

CREATE INDEX IF NOT EXISTS idx_labeled_datasets_created ON labeled_datasets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_labeled_datasets_player  ON labeled_datasets (player_id);

-- RLS on, sin policy de cliente → solo service_role accede (dataset interno).
ALTER TABLE labeled_datasets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE labeled_datasets IS 'Flywheel Sprint 5.3: muestras etiquetadas (features→labels) de análisis con consent, para entrenar modelos propios. Solo service_role.';
