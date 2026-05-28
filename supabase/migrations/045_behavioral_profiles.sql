-- ─────────────────────────────────────────────────────────────────────────
-- VITAS · Sprint 17 — Behavioral Profiles
-- Stores computed behavioral profiles per player.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS behavioral_profiles (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  analyzed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 7 dimension scores (0-100)
  decision_speed        REAL NOT NULL DEFAULT 0,
  scanning_intelligence REAL NOT NULL DEFAULT 0,
  resilience            REAL NOT NULL DEFAULT 0,
  clutch_factor         REAL NOT NULL DEFAULT 0,
  leadership            REAL NOT NULL DEFAULT 0,
  mental_fatigue        REAL NOT NULL DEFAULT 0,
  unpredictability      REAL NOT NULL DEFAULT 0,

  -- Composite
  mental_composite_score REAL NOT NULL DEFAULT 0,
  personality_archetype  TEXT NOT NULL DEFAULT 'unknown',

  -- Full profile JSONB (all detector outputs, correlations, events)
  full_profile   JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  confidence       REAL NOT NULL DEFAULT 0,
  videos_analyzed  INT NOT NULL DEFAULT 0,
  model_version    TEXT NOT NULL DEFAULT 'v1.0.0',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_behavioral_profiles_player_date
  ON behavioral_profiles (player_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_behavioral_profiles_composite
  ON behavioral_profiles (mental_composite_score DESC);

-- RLS
ALTER TABLE behavioral_profiles ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (reuse existing function from prior migrations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_behavioral_profiles'
  ) THEN
    CREATE TRIGGER set_updated_at_behavioral_profiles
      BEFORE UPDATE ON behavioral_profiles
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
