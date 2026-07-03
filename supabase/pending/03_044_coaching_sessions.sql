-- VITAS · Migration 044: Coaching Sessions
-- Sprint 14: Coaching Assistant — Segmentation & Metrics
--
-- Tables:
--   training_sessions     — one row per analyzed training session video
--   player_session_metrics — per-player participation data per session
--   parent_reports         — monthly parent reports (Sprint 15)

-- ─── Training Sessions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_sessions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id       UUID NOT NULL,                   -- soft ref (no existe tabla teams en este esquema)
  coach_id      UUID NOT NULL REFERENCES auth.users(id),
  org_id        UUID REFERENCES organizations(id),
  video_id      TEXT,                            -- Bunny Stream video ID (nullable for manual entry)
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_min  REAL NOT NULL DEFAULT 0,

  -- Segmenter output
  segments      JSONB NOT NULL DEFAULT '[]',     -- TrainingSegment[]
  -- Drill classifier output
  drills        JSONB NOT NULL DEFAULT '[]',     -- ClassifiedDrill[]
  -- Session balance analysis (Sprint 15)
  balance       JSONB DEFAULT NULL,              -- SessionAnalysis

  -- Aggregate metrics
  total_load    REAL DEFAULT 0,                  -- total session load score
  drill_count   INT DEFAULT 0,
  player_count  INT DEFAULT 0,

  -- Processing state
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_sessions_team
  ON training_sessions(team_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_training_sessions_coach
  ON training_sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_org
  ON training_sessions(org_id) WHERE org_id IS NOT NULL;

-- RLS
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can manage own sessions"
  ON training_sessions
  FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- (Política org-view eliminada: team_members no tiene user_id/org_id en este
--  esquema. El coach ve las suyas vía coach_id; el servidor usa service_role.)

-- ─── Player Session Metrics ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_session_metrics (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL,                   -- matches Track.stableId or player UUID
  org_id        UUID REFERENCES organizations(id),

  -- Aggregated metrics
  total_touches       INT DEFAULT 0,
  touches_per_minute  REAL DEFAULT 0,
  active_pct          REAL DEFAULT 0,            -- % time in active movement
  idle_pct            REAL DEFAULT 0,            -- % time idle
  avg_intensity       REAL DEFAULT 0,            -- 0-100

  -- Per-drill breakdown (PlayerDrillMetrics[])
  per_drill     JSONB NOT NULL DEFAULT '[]',

  -- Alerts (ParticipationAlert[])
  alerts        JSONB NOT NULL DEFAULT '[]',

  -- Trend vs previous session
  trend         JSONB DEFAULT NULL,              -- { touchesDelta, intensityDelta, participationDelta }

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_player_session_metrics_session
  ON player_session_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_player_session_metrics_player
  ON player_session_metrics(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_session_metrics_org
  ON player_session_metrics(org_id) WHERE org_id IS NOT NULL;

-- RLS
ALTER TABLE player_session_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via session ownership"
  ON player_session_metrics
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE coach_id = auth.uid()
    )
  );

-- (Política org-view eliminada: team_members no tiene user_id/org_id.)

-- ─── Parent Reports (prepared for Sprint 15) ──────────────────────────────

CREATE TABLE IF NOT EXISTS parent_reports (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id     TEXT NOT NULL,
  team_id       UUID NOT NULL,                   -- soft ref (no existe tabla teams)
  org_id        UUID REFERENCES organizations(id),
  report_month  DATE NOT NULL,                   -- first day of the month
  report_data   JSONB NOT NULL DEFAULT '{}',     -- ParentReport
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(player_id, team_id, report_month)
);

CREATE INDEX IF NOT EXISTS idx_parent_reports_player
  ON parent_reports(player_id, report_month DESC);

ALTER TABLE parent_reports ENABLE ROW LEVEL SECURITY;

-- parent_reports: RLS on sin policy de cliente → solo service_role (el servidor
-- los genera/lee). Son datos de menores; añadir policy cliente cuando el modelo
-- de equipo esté definido.

-- ─── Updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_training_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_training_sessions_updated_at
  BEFORE UPDATE ON training_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_training_sessions_updated_at();
