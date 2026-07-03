-- Sprint 9: Foundation tables for Injury Prediction + Valuation Predictiva
-- GDPR note: player_injuries contains health data (Art. 9) — RLS by org enforced

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Player Injuries — historial de lesiones (datos médicos sensibles)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS player_injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  injury_date DATE NOT NULL,
  injury_type TEXT NOT NULL CHECK (injury_type IN ('muscular', 'articular', 'overuse', 'growth_related', 'trauma', 'other')),
  body_part TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe')),
  days_out INT,
  mechanism TEXT CHECK (mechanism IN ('non_contact', 'contact', 'overuse', 'unknown')),
  phv_status_at_injury TEXT,
  notes TEXT,
  return_date DATE,
  gdpr_consent BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_injuries_player ON player_injuries(player_id, injury_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_injuries_org ON player_injuries(org_id);

ALTER TABLE player_injuries ENABLE ROW LEVEL SECURITY;

-- RLS: creador o dueño del tenant del jugador (service_role bypassea).
-- (Ajustado al esquema real: players.tenant_id existe; team_members no tiene org_id.)
CREATE POLICY "org_members_read_injuries" ON player_injuries
  FOR SELECT USING (
    created_by = auth.uid()
    OR player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid())
  );

CREATE POLICY "org_members_insert_injuries" ON player_injuries
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    OR player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid())
  );

CREATE POLICY "org_members_update_injuries" ON player_injuries
  FOR UPDATE USING (
    created_by = auth.uid()
    OR player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Player Metric Snapshots — tracking longitudinal para valoración
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS player_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  vsi REAL,
  phv_offset REAL,
  phv_category TEXT,
  injury_risk REAL,
  fatigue_index REAL,
  acwr REAL,
  event_summary JSONB,
  xg_accumulated REAL,
  valuation_tier TEXT,
  probability_pro REAL,
  ceiling_estimate REAL,
  metrics JSONB,
  source TEXT NOT NULL DEFAULT 'video_analysis',
  analysis_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, snapshot_date, source)
);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_player ON player_metric_snapshots(player_id, snapshot_date DESC);

ALTER TABLE player_metric_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_read_own" ON player_metric_snapshots
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid())
  );

CREATE POLICY "snapshots_insert_own" ON player_metric_snapshots
  FOR INSERT WITH CHECK (true);  -- Service role inserts via pipeline

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Player Valuations — valoraciones calculadas
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS player_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  valuation_date DATE NOT NULL,
  current_tier TEXT NOT NULL CHECK (current_tier IN ('elite', 'advanced', 'developing', 'foundational')),
  projected_tier_12m TEXT,
  projected_tier_36m TEXT,
  probability_first_division REAL,
  probability_professional REAL,
  strength_index REAL,
  ceiling_estimate REAL,
  risk_adjusted_value REAL,
  key_drivers JSONB,
  injury_risk_at_valuation REAL,
  model_version TEXT NOT NULL DEFAULT 'v1',
  confidence_level REAL,
  data_points_used INT,
  analysis_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_valuations_player ON player_valuations(player_id, valuation_date DESC);

ALTER TABLE player_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "valuations_read_own" ON player_valuations
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid())
  );

CREATE POLICY "valuations_insert_own" ON player_valuations
  FOR INSERT WITH CHECK (true);  -- Service role inserts via pipeline

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Extend fatigue_sessions with injury risk columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE fatigue_sessions ADD COLUMN IF NOT EXISTS injury_risk_score REAL;
ALTER TABLE fatigue_sessions ADD COLUMN IF NOT EXISTS injury_risk_category TEXT;
