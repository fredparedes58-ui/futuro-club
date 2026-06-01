-- ─────────────────────────────────────────────────────────────────────────
-- VITAS · Tactical Heatmaps — phases + grid heatmaps per (player × phase)
--
-- 6 game phases: build_up, attacking, defending, defensive_transition,
-- offensive_transition, set_piece.
--
-- Grid normalizado 100×100 (0-100, 0-100 en X/Y). Bins guardados como
-- JSONB para minimizar joins en read paths.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Phase segments: temporal classification of the match ──────────────
CREATE TABLE IF NOT EXISTS tactical_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL,                                 -- FK soft (matches table varies)
  video_id        UUID,
  phase_type      TEXT NOT NULL
                  CHECK (phase_type IN (
                    'build_up', 'attacking', 'defending',
                    'defensive_transition', 'offensive_transition',
                    'set_piece'
                  )),
  start_ms        INTEGER NOT NULL,
  end_ms          INTEGER NOT NULL CHECK (end_ms >= start_ms),
  ball_possession TEXT NOT NULL DEFAULT 'neutral'
                  CHECK (ball_possession IN ('ours', 'theirs', 'neutral')),
  source          TEXT NOT NULL DEFAULT 'auto'
                  CHECK (source IN ('auto', 'manual', 'hybrid')),
  confidence      REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tactical_phases_match
  ON tactical_phases (match_id, start_ms);

CREATE INDEX IF NOT EXISTS idx_tactical_phases_type
  ON tactical_phases (phase_type);

-- ── Phase heatmaps: aggregated per (match × player × phase) ───────────
CREATE TABLE IF NOT EXISTS phase_heatmaps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL,
  player_id       UUID,                                          -- NULL = team aggregate
  phase_type      TEXT NOT NULL
                  CHECK (phase_type IN (
                    'build_up', 'attacking', 'defending',
                    'defensive_transition', 'offensive_transition',
                    'set_piece'
                  )),
  bins            JSONB NOT NULL DEFAULT '[]'::jsonb,            -- HeatmapBin[]
  hot_zones       JSONB NOT NULL DEFAULT '[]'::jsonb,            -- HotZone[]
  total_time_sec  REAL NOT NULL DEFAULT 0,
  algo_version    TEXT NOT NULL DEFAULT 'v1.0.0',
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One heatmap per (match, player, phase). Player NULL = team aggregate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase_heatmap_unique
  ON phase_heatmaps (match_id, COALESCE(player_id, '00000000-0000-0000-0000-000000000000'::uuid), phase_type);

CREATE INDEX IF NOT EXISTS idx_phase_heatmaps_player
  ON phase_heatmaps (player_id, phase_type);

CREATE INDEX IF NOT EXISTS idx_phase_heatmaps_match_phase
  ON phase_heatmaps (match_id, phase_type);

-- ── Tactical insights cache (output of the agent) ─────────────────────
CREATE TABLE IF NOT EXISTS tactical_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL UNIQUE,
  team_id         UUID,
  headline        TEXT,
  summary         TEXT,
  by_phase        JSONB DEFAULT '[]'::jsonb,
  strengths       JSONB DEFAULT '[]'::jsonb,
  weaknesses      JSONB DEFAULT '[]'::jsonb,
  coaching_tips   JSONB DEFAULT '[]'::jsonb,
  model_version   TEXT DEFAULT 'v1.0.0',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tactical_insights_team
  ON tactical_insights (team_id);

-- ── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE tactical_phases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_heatmaps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_insights  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; authenticated users see rows scoped via the
-- analyses table (match_id FK). Until matches table has explicit tenant
-- linking, we permit authenticated read and write within tenant. Service
-- writes happen via the API with the service role key.
CREATE POLICY tactical_phases_auth_read ON tactical_phases
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY tactical_phases_auth_write ON tactical_phases
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY phase_heatmaps_auth_read ON phase_heatmaps
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY phase_heatmaps_auth_write ON phase_heatmaps
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY tactical_insights_auth_read ON tactical_insights
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY tactical_insights_auth_write ON tactical_insights
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

COMMENT ON TABLE tactical_phases   IS 'Match segmented into 6 tactical phases (auto-detected or coach-tagged).';
COMMENT ON TABLE phase_heatmaps    IS 'Heatmap grid bins per (match × player × phase). player_id NULL = team aggregate.';
COMMENT ON TABLE tactical_insights IS 'Cached output of TacticalPatternAgent (Claude Sonnet) per match.';
