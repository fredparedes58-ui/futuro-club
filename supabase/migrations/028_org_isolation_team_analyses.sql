-- =====================================================================
-- 028: Aislamiento por organización — org_id en team_analyses
-- SEGURO: Solo agrega columna nullable y política de lectura.
-- =====================================================================

-- ── Agregar org_id a team_analyses ──────────────────────────────────
ALTER TABLE public.team_analyses
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_analyses_org ON public.team_analyses(org_id);

-- ── RLS: team_analyses visibles dentro de la misma org ──────────────
CREATE POLICY "team_analyses_org_read" ON public.team_analyses
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    org_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
      UNION
      SELECT org_id FROM public.team_members WHERE member_id = auth.uid()
    )
  );
