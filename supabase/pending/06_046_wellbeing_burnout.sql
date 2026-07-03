-- ─────────────────────────────────────────────────────────────────────────
-- VITAS · Sprint 21 — Wellbeing & Burnout Detection
-- Tables for attendance, engagement, questionnaires, dropout risk.
-- ─────────────────────────────────────────────────────────────────────────

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance_records (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('video', 'manual', 'auto')),
  session_id  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_player_date
  ON attendance_records (player_id, date DESC);

-- Engagement snapshots
CREATE TABLE IF NOT EXISTS engagement_snapshots (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id  UUID,
  date        DATE NOT NULL,
  physical    REAL NOT NULL DEFAULT 0,
  social      REAL NOT NULL DEFAULT 0,
  emotional   REAL NOT NULL DEFAULT 0,
  composite   REAL NOT NULL DEFAULT 0,
  trend       TEXT DEFAULT 'stable',
  weekly_avg  REAL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagement_player_date
  ON engagement_snapshots (player_id, date DESC);

-- Wellbeing questionnaires
CREATE TABLE IF NOT EXISTS wellbeing_questionnaires (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  respondent  TEXT NOT NULL CHECK (respondent IN ('player', 'coach', 'parent')),
  responses   JSONB NOT NULL DEFAULT '{}',
  score       REAL,
  filled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questionnaires_player
  ON wellbeing_questionnaires (player_id, filled_at DESC);

-- Dropout risk assessments
CREATE TABLE IF NOT EXISTS dropout_risk_assessments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  risk_score  REAL NOT NULL DEFAULT 0,
  risk_level  TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  factors     JSONB NOT NULL DEFAULT '{}',
  intervention JSONB,
  model_version TEXT NOT NULL DEFAULT 'v1.0.0',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dropout_risk_player_date
  ON dropout_risk_assessments (player_id, assessed_at DESC);

-- RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellbeing_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropout_risk_assessments ENABLE ROW LEVEL SECURITY;
