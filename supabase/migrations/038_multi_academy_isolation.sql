-- ============================================================================
-- VITAS · Migration 038 · Multi-Academy Isolation
-- ============================================================================
-- Ensures each academy (organization) can ONLY see their own data.
-- Uses Supabase RLS (Row-Level Security) with org_id on all core tables.
--
-- Architecture:
--   organizations (already exists) → org_id FK added to players, videos, etc.
--   team_members (already exists) → used to check membership
--   RLS policies → enforce isolation at database level
-- ============================================================================

-- 1. Add org_id to core tables (NULL = personal/unaffiliated)
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE player_analyses
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE tracking_sessions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE consent_audit_log
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- 2. Create indexes for org_id lookups (critical for RLS performance)
CREATE INDEX IF NOT EXISTS idx_players_org ON players(org_id);
CREATE INDEX IF NOT EXISTS idx_videos_org ON videos(org_id);
CREATE INDEX IF NOT EXISTS idx_player_analyses_org ON player_analyses(org_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_org ON tracking_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_org ON consent_audit_log(org_id);

-- 3. Helper function: get org IDs where user is a member
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF UUID AS $$
BEGIN
  -- User is owner
  RETURN QUERY
    SELECT id FROM organizations WHERE owner_id = auth.uid() AND active = true;
  -- User is team member
  RETURN QUERY
    SELECT org_id FROM team_members WHERE member_id = auth.uid();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION user_org_ids() IS 'Returns all org IDs where the current user is owner or member';

-- 4. Helper function: check if user belongs to a specific org
CREATE OR REPLACE FUNCTION user_in_org(p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RETURN TRUE; -- NULL org = personal data, owned by user
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM organizations WHERE id = p_org_id AND owner_id = auth.uid() AND active = true
    UNION ALL
    SELECT 1 FROM team_members WHERE org_id = p_org_id AND member_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. RLS Policies for PLAYERS
-- Drop existing policies first (safe if they don't exist)
DROP POLICY IF EXISTS "Users see own players" ON players;
DROP POLICY IF EXISTS "Users see org players" ON players;
DROP POLICY IF EXISTS "Users insert own players" ON players;
DROP POLICY IF EXISTS "Users update own players" ON players;

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Select: see own players OR players in your org
CREATE POLICY "Users see own or org players" ON players
  FOR SELECT USING (
    user_id = auth.uid()
    OR org_id IN (SELECT user_org_ids())
  );

-- Insert: can create players for self or own org
CREATE POLICY "Users insert players" ON players
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR user_in_org(org_id))
  );

-- Update: own players or org players (if member)
CREATE POLICY "Users update players" ON players
  FOR UPDATE USING (
    user_id = auth.uid()
    OR org_id IN (SELECT user_org_ids())
  );

-- Delete: only own players
CREATE POLICY "Users delete own players" ON players
  FOR DELETE USING (user_id = auth.uid());

-- 6. RLS Policies for VIDEOS
DROP POLICY IF EXISTS "Users see own videos" ON videos;
DROP POLICY IF EXISTS "Users see org videos" ON videos;

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own or org videos" ON videos
  FOR SELECT USING (
    user_id = auth.uid()
    OR org_id IN (SELECT user_org_ids())
  );

CREATE POLICY "Users insert videos" ON videos
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR user_in_org(org_id))
  );

CREATE POLICY "Users update videos" ON videos
  FOR UPDATE USING (
    user_id = auth.uid()
    OR org_id IN (SELECT user_org_ids())
  );

-- 7. RLS Policies for PLAYER_ANALYSES
DROP POLICY IF EXISTS "Users see own analyses" ON player_analyses;

ALTER TABLE player_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own or org analyses" ON player_analyses
  FOR SELECT USING (
    user_id = auth.uid()
    OR org_id IN (SELECT user_org_ids())
  );

CREATE POLICY "Users insert analyses" ON player_analyses
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR user_in_org(org_id))
  );

-- 8. RLS Policies for TRACKING_SESSIONS
DROP POLICY IF EXISTS "Users see own tracking" ON tracking_sessions;

ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own or org tracking" ON tracking_sessions
  FOR SELECT USING (
    user_id = auth.uid()
    OR org_id IN (SELECT user_org_ids())
  );

CREATE POLICY "Users insert tracking" ON tracking_sessions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR user_in_org(org_id))
  );

-- 9. Update consent_audit_log RLS to include org
DROP POLICY IF EXISTS "Users see own consent logs" ON consent_audit_log;

CREATE POLICY "Users see own or org consent logs" ON consent_audit_log
  FOR SELECT USING (
    player_id IN (
      SELECT id FROM players
      WHERE user_id = auth.uid()
         OR org_id IN (SELECT user_org_ids())
    )
  );

-- 10. Organization-level aggregate view (each academy sees their stats)
CREATE OR REPLACE VIEW v_org_dashboard AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.plan,
  COUNT(DISTINCT p.id) AS total_players,
  COUNT(DISTINCT p.id) FILTER (WHERE p.vsi > 0) AS evaluated_players,
  ROUND(AVG(p.vsi) FILTER (WHERE p.vsi > 0)::NUMERIC, 1) AS avg_vsi,
  COUNT(DISTINCT v.id) AS total_videos,
  COUNT(DISTINCT pa.id) AS total_analyses,
  COUNT(DISTINCT tm.member_id) AS team_size
FROM organizations o
LEFT JOIN players p ON p.org_id = o.id
LEFT JOIN videos v ON v.org_id = o.id
LEFT JOIN player_analyses pa ON pa.org_id = o.id
LEFT JOIN team_members tm ON tm.org_id = o.id
WHERE o.active = true
GROUP BY o.id, o.name, o.plan;

COMMENT ON VIEW v_org_dashboard IS 'Per-organization dashboard stats — each academy sees their own numbers';

-- 11. Auto-assign org_id trigger
-- When a user creates a player, auto-assign their primary org_id
CREATE OR REPLACE FUNCTION auto_assign_org_id()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- If org_id already set, skip
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find user's primary org (owner first, then member)
  SELECT id INTO v_org_id
  FROM organizations
  WHERE owner_id = auth.uid() AND active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT org_id INTO v_org_id
    FROM team_members
    WHERE member_id = auth.uid()
    ORDER BY joined_at ASC
    LIMIT 1;
  END IF;

  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_org_players ON players;
CREATE TRIGGER trg_auto_org_players
  BEFORE INSERT ON players
  FOR EACH ROW EXECUTE FUNCTION auto_assign_org_id();

DROP TRIGGER IF EXISTS trg_auto_org_videos ON videos;
CREATE TRIGGER trg_auto_org_videos
  BEFORE INSERT ON videos
  FOR EACH ROW EXECUTE FUNCTION auto_assign_org_id();

DROP TRIGGER IF EXISTS trg_auto_org_analyses ON player_analyses;
CREATE TRIGGER trg_auto_org_analyses
  BEFORE INSERT ON player_analyses
  FOR EACH ROW EXECUTE FUNCTION auto_assign_org_id();

COMMENT ON FUNCTION auto_assign_org_id() IS 'Auto-assigns org_id on insert based on user primary org';
