-- =====================================================================
-- 026: Tabla organizations — concepto de club/academia como entidad
-- SEGURO: Solo crea objetos nuevos. No modifica tablas existentes.
-- =====================================================================

-- ── Tabla principal ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE,
  logo_url    text,
  plan        text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'club')),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Índices ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug  ON public.organizations(slug);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Owner puede hacer todo con su org
CREATE POLICY "org_owner_all" ON public.organizations
  FOR ALL USING (owner_id = auth.uid());

-- Miembros del equipo pueden leer la org
CREATE POLICY "org_member_read" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT tm.org_owner_id FROM public.team_members tm
      WHERE tm.member_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );

-- ── Tabla de membresía org (extiende team_members con org_id) ───────
-- Agrega org_id a team_members para vincular con organizations
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_team_members_org ON public.team_members(org_id);

-- ── Trigger para updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_org_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_org_updated_at();

-- ── Función helper: obtener org_id del usuario actual ───────────────
CREATE OR REPLACE FUNCTION get_user_org_id(p_user_id uuid)
RETURNS uuid AS $$
  SELECT COALESCE(
    -- Primero buscar como owner
    (SELECT id FROM public.organizations WHERE owner_id = p_user_id AND active = true LIMIT 1),
    -- Luego como miembro
    (SELECT org_id FROM public.team_members WHERE member_id = p_user_id LIMIT 1)
  );
$$ LANGUAGE sql STABLE;
