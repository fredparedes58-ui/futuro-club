-- ─────────────────────────────────────────────────────────────────────────
-- VITAS · IDP (Individual Development Plan) — monthly per-player plans
-- Hybrid generation: AI architect proposes, coach edits and approves.
-- Granularity: MONTH (4 weekly milestones per month, 1 checkin at month end)
-- ─────────────────────────────────────────────────────────────────────────

-- ── Development plans (1 active per player at any time) ─────────────────
CREATE TABLE IF NOT EXISTS development_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id        UUID,                                          -- nullable while approving
  tenant_id       UUID,                                          -- snapshot at creation

  -- Time window (monthly)
  month_start     DATE NOT NULL,                                 -- YYYY-MM-01
  month_end       DATE NOT NULL,                                 -- last day of month

  -- Status lifecycle
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'completed', 'abandoned')),

  -- Plan-level narrative
  overall_focus   TEXT,                                           -- 1-line headline (e.g. "explosividad + scanning")
  context_notes   TEXT,                                           -- coach notes / team context
  agent_summary   TEXT,                                           -- AI architect's executive summary

  -- Generation provenance
  generated_by    TEXT NOT NULL DEFAULT 'hybrid'
                  CHECK (generated_by IN ('coach', 'agent', 'hybrid')),
  agent_version   TEXT,                                           -- prompt version of _idp-architect
  approved_by     UUID,                                           -- coach user_id who approved
  approved_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idp_player_month
  ON development_plans (player_id, month_start DESC);

CREATE INDEX IF NOT EXISTS idx_idp_status
  ON development_plans (status)
  WHERE status IN ('draft', 'active');

-- Only one active plan per player per month (soft-enforced; coach can re-draft)
CREATE UNIQUE INDEX IF NOT EXISTS uq_idp_player_month_active
  ON development_plans (player_id, month_start)
  WHERE status IN ('draft', 'active');

-- ── Goals (3-5 per plan, one per dimension) ─────────────────────────────
CREATE TABLE IF NOT EXISTS idp_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES development_plans(id) ON DELETE CASCADE,

  dimension       TEXT NOT NULL
                  CHECK (dimension IN ('technical', 'tactical', 'physical', 'mental', 'maturation')),

  title           TEXT NOT NULL,                                  -- "Mejorar 1ª tocada bajo presión"
  description     TEXT,                                           -- coach-friendly explanation
  rationale       TEXT,                                           -- WHY this goal — AI-generated, editable

  -- Measurement: baseline vs target
  baseline_metric JSONB NOT NULL DEFAULT '{}',                    -- {metric:"vsi_technical", value:65}
  target_metric   JSONB NOT NULL DEFAULT '{}',                    -- {metric:"vsi_technical", value:72}
  current_value   REAL,                                           -- updated by progress tracker

  -- Drill assignment (FKs to drillsLibrary, soft via TEXT[] since drillsLibrary is in code)
  drills_assigned TEXT[] NOT NULL DEFAULT '{}',                   -- array of drill_id strings

  weight          INTEGER NOT NULL DEFAULT 3 CHECK (weight BETWEEN 1 AND 5),  -- priority

  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'achieved', 'missed', 'cancelled')),

  ai_proposed     BOOLEAN NOT NULL DEFAULT true,                  -- false if coach added manually
  coach_edited    BOOLEAN NOT NULL DEFAULT false,                 -- true if coach modified after AI

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idp_goals_plan ON idp_goals (plan_id);
CREATE INDEX IF NOT EXISTS idx_idp_goals_dimension ON idp_goals (dimension);

-- ── Milestones (weekly, 4 per month per goal) ───────────────────────────
CREATE TABLE IF NOT EXISTS idp_milestones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID NOT NULL REFERENCES development_plans(id) ON DELETE CASCADE,
  goal_id            UUID NOT NULL REFERENCES idp_goals(id) ON DELETE CASCADE,

  due_date           DATE NOT NULL,
  week_number        INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 5),  -- of the month

  title              TEXT NOT NULL,                               -- "Completar 3 rondos a alta intensidad"
  success_criteria   TEXT,                                        -- how we know it's done

  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'completed', 'missed', 'partial')),

  evidence           JSONB DEFAULT '{}',                          -- {video_ids:[], session_ids:[], metrics:{}}
  completed_at       TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idp_milestones_goal ON idp_milestones (goal_id);
CREATE INDEX IF NOT EXISTS idx_idp_milestones_plan_date
  ON idp_milestones (plan_id, due_date);

-- ── Check-ins (coach's monthly review) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS idp_checkins (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               UUID NOT NULL REFERENCES development_plans(id) ON DELETE CASCADE,
  goal_id               UUID REFERENCES idp_goals(id) ON DELETE CASCADE,  -- NULL = plan-level checkin

  reviewer_id           UUID,                                     -- coach user_id
  reviewed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Quantitative
  progress_score        INTEGER CHECK (progress_score BETWEEN 0 AND 100),

  -- Qualitative (from coach questionnaire at month-end)
  qualitative_notes     TEXT,
  questionnaire_answers JSONB DEFAULT '{}',                       -- raw form responses

  -- Forward-looking
  adjustments_proposed  JSONB DEFAULT '{}',                       -- {next_month_focus:"...", drills_to_change:[...]}

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idp_checkins_plan ON idp_checkins (plan_id, reviewed_at DESC);

-- ── updated_at triggers ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_idp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dev_plans_updated_at ON development_plans;
CREATE TRIGGER trg_dev_plans_updated_at
  BEFORE UPDATE ON development_plans
  FOR EACH ROW EXECUTE FUNCTION touch_idp_updated_at();

DROP TRIGGER IF EXISTS trg_idp_goals_updated_at ON idp_goals;
CREATE TRIGGER trg_idp_goals_updated_at
  BEFORE UPDATE ON idp_goals
  FOR EACH ROW EXECUTE FUNCTION touch_idp_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE development_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE idp_goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE idp_milestones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE idp_checkins     ENABLE ROW LEVEL SECURITY;

-- Coaches see plans for their players (via tenant_id); parents see their own
-- minor's plan via the family link table. Service role bypasses all.
CREATE POLICY idp_plans_owner_read ON development_plans
  FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    OR coach_id = auth.uid()
  );

CREATE POLICY idp_plans_coach_write ON development_plans
  FOR ALL
  USING (coach_id = auth.uid() OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (coach_id = auth.uid() OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY idp_goals_via_plan ON idp_goals
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM development_plans p
    WHERE p.id = plan_id
      AND (p.coach_id = auth.uid() OR p.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  ));

CREATE POLICY idp_milestones_via_plan ON idp_milestones
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM development_plans p
    WHERE p.id = plan_id
      AND (p.coach_id = auth.uid() OR p.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  ));

CREATE POLICY idp_checkins_via_plan ON idp_checkins
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM development_plans p
    WHERE p.id = plan_id
      AND (p.coach_id = auth.uid() OR p.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  ));

-- ── Helpful view: active plans summary ─────────────────────────────────
CREATE OR REPLACE VIEW v_active_idp_summary AS
SELECT
  p.id AS plan_id,
  p.player_id,
  p.month_start,
  p.month_end,
  p.overall_focus,
  p.status,
  COUNT(g.id) FILTER (WHERE g.status = 'achieved') AS goals_achieved,
  COUNT(g.id) FILTER (WHERE g.status IN ('pending', 'in_progress')) AS goals_open,
  COUNT(g.id) AS goals_total,
  AVG(g.current_value) FILTER (WHERE g.current_value IS NOT NULL) AS avg_progress
FROM development_plans p
LEFT JOIN idp_goals g ON g.plan_id = p.id
WHERE p.status IN ('draft', 'active')
GROUP BY p.id;

COMMENT ON TABLE development_plans IS 'IDP root: 1 monthly plan per player. Hybrid AI + coach generation.';
COMMENT ON TABLE idp_goals IS '3-5 dimension-tagged goals per plan with baseline/target/current metrics.';
COMMENT ON TABLE idp_milestones IS 'Weekly checkpoints (4/month) per goal with evidence.';
COMMENT ON TABLE idp_checkins IS 'Coach month-end review with questionnaire + forward proposals.';
