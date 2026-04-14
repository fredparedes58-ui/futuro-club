-- =====================================================================
-- 027: Aislamiento por organización — org_id en entidades principales
-- SEGURO: Solo agrega columnas y políticas. No elimina ni modifica datos.
-- Las columnas son nullable para no romper datos existentes.
-- =====================================================================

-- ── Agregar org_id a players ─────────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_players_org ON public.players(org_id);

-- ── Agregar org_id a videos ──────────────────────────────────────────
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_videos_org ON public.videos(org_id);

-- ── Agregar org_id a player_analyses ─────────────────────────────────
ALTER TABLE public.player_analyses
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analyses_org ON public.player_analyses(org_id);

-- ── Agregar org_id a scout_insights ──────────────────────────────────
ALTER TABLE public.scout_insights
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ── Agregar org_id a tracking_sessions ───────────────────────────────
ALTER TABLE public.tracking_sessions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ── Agregar org_id a analyses_used (consumo por org) ─────────────────
ALTER TABLE public.analyses_used
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ── RLS: players visibles solo dentro de la misma org ────────────────
-- Nota: no eliminamos políticas existentes (user_id based) para no romper nada.
-- Agregamos políticas adicionales que permiten acceso por org membership.

CREATE POLICY "players_org_read" ON public.players
  FOR SELECT USING (
    -- El owner del jugador siempre puede verlo (backward compat)
    user_id = auth.uid()
    OR
    -- Miembros de la misma org pueden verlo
    org_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
      UNION
      SELECT org_id FROM public.team_members WHERE member_id = auth.uid()
    )
  );

CREATE POLICY "players_org_insert" ON public.players
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "players_org_update" ON public.players
  FOR UPDATE USING (
    user_id = auth.uid()
    OR
    org_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- ── RLS: videos visibles dentro de la misma org ─────────────────────
CREATE POLICY "videos_org_read" ON public.videos
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    org_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
      UNION
      SELECT org_id FROM public.team_members WHERE member_id = auth.uid()
    )
  );

-- ── RLS: analyses visibles dentro de la misma org ───────────────────
CREATE POLICY "analyses_org_read" ON public.player_analyses
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    org_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
      UNION
      SELECT org_id FROM public.team_members WHERE member_id = auth.uid()
    )
  );

-- ── Helper: backfill org_id para datos existentes ───────────────────
-- Ejecutar manualmente después de crear organizaciones:
-- UPDATE players SET org_id = (SELECT get_user_org_id(user_id)) WHERE org_id IS NULL;
-- UPDATE videos SET org_id = (SELECT get_user_org_id(user_id)) WHERE org_id IS NULL;
-- UPDATE player_analyses SET org_id = (SELECT get_user_org_id(user_id)) WHERE org_id IS NULL;
