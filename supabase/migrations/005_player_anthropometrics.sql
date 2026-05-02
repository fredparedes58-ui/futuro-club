-- ════════════════════════════════════════════════════════════════════════════
-- VITAS · Migration 005 · Player Anthropometrics (PHV inputs)
-- Sprint 2 · Día 2
-- ════════════════════════════════════════════════════════════════════════════
-- Almacena medidas antropométricas históricas (altura, peso, altura sentado)
-- usadas por el PHV Calculator (Mirwald formula).
--
-- DISEÑO: histórico, NO un único valor por jugador.
-- Cada vez que un padre actualiza, se inserta una nueva fila. Esto permite:
--   - Ver evolución del crecimiento
--   - Re-calcular PHV con la última medida disponible
--   - Auditar cambios
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS player_anthropometrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  player_id       text NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Medidas obligatorias (formula Mirwald)
  height_cm       numeric(5,1) NOT NULL CHECK (height_cm BETWEEN 80 AND 230),
  weight_kg       numeric(5,1) NOT NULL CHECK (weight_kg BETWEEN 15 AND 150),

  -- Medidas opcionales (mejoran precisión PHV)
  -- Si faltan, se estiman: sitting_height ≈ height × 0.52, leg_length ≈ height × 0.48
  sitting_height_cm numeric(5,1) CHECK (sitting_height_cm IS NULL OR sitting_height_cm BETWEEN 40 AND 130),
  leg_length_cm     numeric(5,1) CHECK (leg_length_cm IS NULL OR leg_length_cm BETWEEN 30 AND 130),

  -- Edad cronológica al momento de la medida (calculada en frontend)
  chronological_age numeric(4,2) NOT NULL CHECK (chronological_age BETWEEN 5 AND 25),

  -- Outputs PHV calculados (cache · evita recalcular en cada query)
  maturity_offset   numeric(4,2),
  biological_age    numeric(4,2),
  phv_category      text CHECK (phv_category IN ('early','ontime','late')),
  phv_status        text CHECK (phv_status IN ('pre_phv','during_phv','post_phv')),
  development_window text CHECK (development_window IN ('critical','active','stable')),

  -- Quién registró la medida
  measured_by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  measured_at      timestamptz NOT NULL DEFAULT now(),
  notes            text,

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_anthro_player ON player_anthropometrics(player_id, measured_at DESC);
CREATE INDEX idx_anthro_tenant ON player_anthropometrics(tenant_id);
-- Nota: no se puede crear partial index con now() (function not IMMUTABLE).
-- El index principal idx_anthro_player ya es suficiente para queries por jugador.

COMMENT ON TABLE player_anthropometrics IS 'Histórico de medidas antropométricas para cálculo PHV (Mirwald)';
COMMENT ON COLUMN player_anthropometrics.maturity_offset IS 'Offset Mirwald · cache del cálculo · re-calcular si cambian inputs';

-- ── Vista: última medida por jugador ─────────────────────────────────────────
CREATE OR REPLACE VIEW player_latest_anthropometrics AS
SELECT DISTINCT ON (player_id)
  id,
  tenant_id,
  player_id,
  height_cm,
  weight_kg,
  sitting_height_cm,
  leg_length_cm,
  chronological_age,
  maturity_offset,
  biological_age,
  phv_category,
  phv_status,
  development_window,
  measured_at
FROM player_anthropometrics
ORDER BY player_id, measured_at DESC;

COMMENT ON VIEW player_latest_anthropometrics IS 'Última medida antropométrica por jugador';

-- ── RLS multi-tenant ──────────────────────────────────────────────────────────
ALTER TABLE player_anthropometrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY anthro_tenant_isolation ON player_anthropometrics
  FOR ALL TO authenticated
  USING (tenant_id = public.tenant_id() OR public.is_admin())
  WITH CHECK (tenant_id = public.tenant_id() OR public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- FIN MIGRATION 005
-- ════════════════════════════════════════════════════════════════════════════
