-- ============================================================================
-- VITAS · Migration 036 · RGPD Minor Consent
-- ============================================================================
-- Adds parental consent tracking for minors (<14 years old per Spanish RGPD).
-- Required before processing any PII through external AI services.
-- ============================================================================

-- 1. Parental consent status on players
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS parental_consent_status TEXT DEFAULT 'pending'
    CHECK (parental_consent_status IN ('pending', 'granted', 'denied', 'not_required')),
  ADD COLUMN IF NOT EXISTS parental_consent_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parental_consent_guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS parental_consent_guardian_email TEXT;

COMMENT ON COLUMN players.parental_consent_status IS 'RGPD consent for minors <14: pending/granted/denied/not_required';

-- 2. Function to check if player is a minor requiring consent
CREATE OR REPLACE FUNCTION is_minor_requiring_consent(p_birth_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_birth_date IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN (EXTRACT(YEAR FROM AGE(NOW(), p_birth_date)) < 14);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Auto-set parental_consent_status based on age
CREATE OR REPLACE FUNCTION check_parental_consent()
RETURNS TRIGGER AS $$
BEGIN
  -- If birth_date is set and player is under 14, require consent
  IF NEW.birth_date IS NOT NULL THEN
    IF is_minor_requiring_consent(NEW.birth_date) THEN
      -- Only set to pending if not already granted
      IF NEW.parental_consent_status IS NULL OR NEW.parental_consent_status = 'not_required' THEN
        NEW.parental_consent_status := 'pending';
      END IF;
    ELSE
      NEW.parental_consent_status := 'not_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_parental_consent ON players;
CREATE TRIGGER trg_check_parental_consent
  BEFORE INSERT OR UPDATE OF birth_date ON players
  FOR EACH ROW EXECUTE FUNCTION check_parental_consent();

-- 4. Block AI processing for minors without consent
-- This view shows which players are blocked from AI analysis
CREATE OR REPLACE VIEW v_players_ai_blocked AS
SELECT
  p.id,
  p.name,
  p.birth_date,
  EXTRACT(YEAR FROM AGE(NOW(), p.birth_date))::INT AS age_years,
  p.parental_consent_status,
  p.user_id,
  CASE
    WHEN p.birth_date IS NULL THEN 'no_birth_date'
    WHEN NOT is_minor_requiring_consent(p.birth_date) THEN 'adult_no_consent_needed'
    WHEN p.parental_consent_status = 'granted' THEN 'consent_granted'
    WHEN p.parental_consent_status = 'denied' THEN 'BLOCKED_consent_denied'
    ELSE 'BLOCKED_consent_pending'
  END AS ai_processing_status
FROM players p
WHERE p.birth_date IS NOT NULL
  AND is_minor_requiring_consent(p.birth_date)
  AND p.parental_consent_status != 'granted';

-- 5. DSAR (Data Subject Access Request) export function
-- Right of access: export all data for a specific player
CREATE OR REPLACE FUNCTION dsar_export_player_data(p_player_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'export_date', NOW(),
    'export_type', 'DSAR_access_request',
    'player', (
      SELECT to_jsonb(p.*) FROM players p WHERE p.id = p_player_id
    ),
    'analyses', (
      SELECT COALESCE(jsonb_agg(to_jsonb(pa.*)), '[]'::jsonb)
      FROM player_analyses pa WHERE pa.player_id = p_player_id
    ),
    'videos', (
      SELECT COALESCE(jsonb_agg(to_jsonb(v.*)), '[]'::jsonb)
      FROM videos v WHERE v.player_id = p_player_id
    ),
    'tracking_sessions', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ts.*)), '[]'::jsonb)
      FROM tracking_sessions ts WHERE ts.player_id = p_player_id
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Right to erasure (soft delete — marks for deletion, admin reviews)
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_by TEXT;

CREATE OR REPLACE FUNCTION dsar_request_deletion(p_player_id UUID, p_requested_by TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE players
  SET deletion_requested_at = NOW(),
      deletion_requested_by = p_requested_by
  WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Consent audit log
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('consent_requested', 'consent_granted', 'consent_denied', 'consent_revoked', 'data_exported', 'deletion_requested')),
  actor_email TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_audit_player ON consent_audit_log(player_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_action ON consent_audit_log(action);

-- RLS on consent_audit_log
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own consent logs" ON consent_audit_log
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

COMMENT ON TABLE consent_audit_log IS 'RGPD audit trail for consent actions on minor players';
