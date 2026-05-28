-- ============================================================================
-- VITAS · Migration 043: Fatigue Sessions
--
-- Stores per-session fatigue analysis results for ACWR computation
-- (multi-session workload tracking) and fatigue trend analysis.
-- ============================================================================

-- Table: fatigue_sessions
CREATE TABLE IF NOT EXISTS fatigue_sessions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  video_id      uuid REFERENCES videos(id) ON DELETE SET NULL,
  session_date  date NOT NULL DEFAULT CURRENT_DATE,

  -- Core metrics
  duration_min     smallint NOT NULL DEFAULT 0,
  total_distance_m real NOT NULL DEFAULT 0,
  total_load       real NOT NULL DEFAULT 0,   -- distance × avg metabolic power (for ACWR)
  fatigue_index    real,                        -- composite FI score 0-100
  fatigue_severity text CHECK (fatigue_severity IN ('normal', 'moderate', 'high', 'critical')),

  -- ACWR computed at time of session
  acwr_value       real,
  acwr_zone        text CHECK (acwr_zone IN ('undertrained', 'optimal', 'caution', 'danger')),

  -- Detailed data (JSONB for flexibility)
  window_metrics   jsonb,    -- FatigueWindowMetrics[] (per 15-min window)
  posture_signals  jsonb,    -- PostureFatigueResult (MediaPipe signals)
  decay_metrics    jsonb,    -- DecayMetrics (sprint/speed/HID decay %)
  alerts           jsonb,    -- FatigueAlert[]

  -- PHV context
  phv_offset       real,     -- PHV offset at time of session
  maturation_band  text CHECK (maturation_band IN ('pre_phv', 'circa_phv', 'post_phv')),

  -- Metadata
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for ACWR lookups: last 28 days per player, sorted by date
CREATE INDEX IF NOT EXISTS idx_fatigue_sessions_player_date
  ON fatigue_sessions (player_id, session_date DESC);

-- Index for user isolation (RLS)
CREATE INDEX IF NOT EXISTS idx_fatigue_sessions_user
  ON fatigue_sessions (user_id);

-- RLS policies
ALTER TABLE fatigue_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own fatigue sessions"
  ON fatigue_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fatigue sessions"
  ON fatigue_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fatigue sessions"
  ON fatigue_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do everything (for API routes)
CREATE POLICY "Service role full access on fatigue_sessions"
  ON fatigue_sessions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_fatigue_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fatigue_sessions_updated_at
  BEFORE UPDATE ON fatigue_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_fatigue_sessions_updated_at();
