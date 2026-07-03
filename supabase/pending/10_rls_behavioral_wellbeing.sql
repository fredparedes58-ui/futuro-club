-- ─────────────────────────────────────────────────────────────────────────
-- VITAS · 050 — RLS policies para behavioral_profiles + wellbeing (Sprint 0.1)
--
-- Las migraciones 045/046 activaron RLS pero SIN policies → esas tablas solo
-- eran accesibles por service_role (servidor). Esto añade lectura/escritura
-- para el DUEÑO del jugador desde el cliente (ADN Mental + Radar de Retención
-- leen frescos desde el navegador). service_role sigue bypasseando RLS.
--
-- Aislamiento: el jugador pertenece al tenant del usuario autenticado
--   player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid())
-- (players.id es text, players.tenant_id es uuid — ver esquema real.)
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE → re-ejecutable.
-- ─────────────────────────────────────────────────────────────────────────

-- ── behavioral_profiles (045) ────────────────────────────────────────────
ALTER TABLE behavioral_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "behavioral_owner_all" ON behavioral_profiles;
CREATE POLICY "behavioral_owner_all" ON behavioral_profiles
  FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()));

-- ── wellbeing (046) ──────────────────────────────────────────────────────
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_owner_all" ON attendance_records;
CREATE POLICY "attendance_owner_all" ON attendance_records
  FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()));

ALTER TABLE engagement_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "engagement_owner_all" ON engagement_snapshots;
CREATE POLICY "engagement_owner_all" ON engagement_snapshots
  FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()));

ALTER TABLE wellbeing_questionnaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "questionnaires_owner_all" ON wellbeing_questionnaires;
CREATE POLICY "questionnaires_owner_all" ON wellbeing_questionnaires
  FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()));

ALTER TABLE dropout_risk_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dropout_owner_all" ON dropout_risk_assessments;
CREATE POLICY "dropout_owner_all" ON dropout_risk_assessments
  FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()));
