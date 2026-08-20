-- 055 · RLS de propiedad para las tablas tácticas (cierra el IDOR entre usuarios)
--
-- La migración 048 habilitó RLS en tactical_phases / phase_heatmaps /
-- tactical_insights, PERO con políticas permisivas: `auth.role() = 'authenticated'`
-- dejaba que CUALQUIER usuario logueado leyera/escribiera TODAS las filas de
-- CUALQUIER equipo (IDOR entre usuarios autenticados) en las lecturas directas
-- del frontend (tacticalHeatmapService usa el cliente supabase → sujeto a RLS).
--
-- Modelo de propiedad: no existe tabla `matches`; en el flujo real
-- match_id == analyses.id. Así que scopeamos vía JOIN a `analyses`, reusando
-- EXACTAMENTE el mismo predicado que `analyses_tenant_isolation` (migración 004):
--   tenant_id = public.tenant_id() OR public.is_admin()
-- Sin columna nueva ni backfill: la propiedad se deriva de la analysis dueña.
--
-- Nota: el service_role BYPASSA RLS por diseño (los endpoints de api/tactical/
-- usan SERVICE_ROLE_KEY), así que su autorización a nivel de objeto se hace en
-- código con ownsMatch() (api/_lib/ownership.ts). Esta migración protege la
-- ruta de LECTURA DIRECTA del frontend. Defensa en profundidad: ambas capas.
--
-- Fail-closed: si match_id no corresponde a ninguna analysis (p.ej. match
-- sintético sin analysis asociada), el EXISTS es false → sin acceso. Correcto.

BEGIN;

-- ── tactical_phases ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tactical_phases_auth_read   ON tactical_phases;
DROP POLICY IF EXISTS tactical_phases_auth_write  ON tactical_phases;
DROP POLICY IF EXISTS tactical_phases_owner_read  ON tactical_phases;  -- idempotencia (re-run)
DROP POLICY IF EXISTS tactical_phases_owner_write ON tactical_phases;

CREATE POLICY tactical_phases_owner_read ON tactical_phases
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = tactical_phases.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  );

CREATE POLICY tactical_phases_owner_write ON tactical_phases
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = tactical_phases.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = tactical_phases.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  );

-- ── phase_heatmaps ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS phase_heatmaps_auth_read   ON phase_heatmaps;
DROP POLICY IF EXISTS phase_heatmaps_auth_write  ON phase_heatmaps;
DROP POLICY IF EXISTS phase_heatmaps_owner_read  ON phase_heatmaps;  -- idempotencia (re-run)
DROP POLICY IF EXISTS phase_heatmaps_owner_write ON phase_heatmaps;

CREATE POLICY phase_heatmaps_owner_read ON phase_heatmaps
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = phase_heatmaps.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  );

CREATE POLICY phase_heatmaps_owner_write ON phase_heatmaps
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = phase_heatmaps.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = phase_heatmaps.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  );

-- ── tactical_insights ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS tactical_insights_auth_read   ON tactical_insights;
DROP POLICY IF EXISTS tactical_insights_auth_write  ON tactical_insights;
DROP POLICY IF EXISTS tactical_insights_owner_read  ON tactical_insights;  -- idempotencia (re-run)
DROP POLICY IF EXISTS tactical_insights_owner_write ON tactical_insights;

CREATE POLICY tactical_insights_owner_read ON tactical_insights
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = tactical_insights.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  );

CREATE POLICY tactical_insights_owner_write ON tactical_insights
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = tactical_insights.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM analyses a
      WHERE a.id = tactical_insights.match_id
        AND (a.tenant_id = public.tenant_id() OR public.is_admin())
    )
  );

COMMENT ON POLICY tactical_phases_owner_read   ON tactical_phases   IS 'Solo el tenant dueño de la analysis (match_id) lee sus fases.';
COMMENT ON POLICY phase_heatmaps_owner_read    ON phase_heatmaps    IS 'Solo el tenant dueño de la analysis (match_id) lee sus heatmaps.';
COMMENT ON POLICY tactical_insights_owner_read ON tactical_insights IS 'Solo el tenant dueño de la analysis (match_id) lee sus insights.';

COMMIT;
