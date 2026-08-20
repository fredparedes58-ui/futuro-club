-- 057 · Custom Access Token Hook — sube tenant_id de app_metadata al claim RAÍZ
--
-- CONTEXTO (verificado contra la BD el 2026-08-20 con scripts/diag-jwt-tenant.mjs):
-- Toda la RLS multi-tenant usa `public.tenant_id()` (migración 003), que lee el
-- claim de NIVEL RAÍZ `tenant_id` del JWT:
--     current_setting('request.jwt.claims')::json ->> 'tenant_id'
-- Pero Supabase NO pone tenant_id en la raíz por defecto. Los usuarios lo tienen
-- en `app_metadata.tenant_id` (9/9 usuarios reales lo tienen), NO en la raíz.
-- Resultado: hoy `public.tenant_id()` = NULL para todos → TODA la RLS por tenant
-- (003 parental_consents/analyses/reports/subscriptions, 004, 055 tácticas) falla
-- CERRADA: las lecturas directas del front (cliente supabase → sujeto a RLS) no
-- devuelven nada. La app sigue funcionando porque cae a la API (service_role) o a
-- localStorage, pero la capa de aislamiento por RLS está INERTE.
--
-- Este hook copia app_metadata.tenant_id → claim raíz `tenant_id`, activando esa
-- capa de defensa (la que pretendía la migración 055 / PR #134).
--
-- IMPORTANTE: los ENDPOINTS de api/tactical NO dependen de este hook —
-- `ownsMatch` (api/_lib/ownership.ts) ya lee app_metadata.tenant_id como fallback
-- en verifyAuth. Esta migración arregla la RLS de las LECTURAS DIRECTAS del front.
--
-- ── ACTIVACIÓN (paso manual, NO lo hace esta migración) ─────────────────────
-- Tras aplicar esta migración, activar el hook en el panel de Supabase:
--   Authentication → Hooks → "Customize Access Token (JWT) Claims" →
--   seleccionar la función  public.custom_access_token_hook  → Enable.
-- (Local/CLI: ya queda declarado en supabase/config.toml [auth.hook.custom_access_token].)
-- Los tokens ya emitidos adquieren el claim al refrescarse (~1 h); los logins
-- nuevos, al instante.
-- ROLLBACK: desactivar el hook en el panel → la RLS vuelve a fallar cerrada
-- (estado actual), sin romper la app.
--
-- TRAS ACTIVAR, verificar con:  node scripts/diag-jwt-tenant.mjs
-- (debe pasar de [PARCIAL] a [OK] · claim RAÍZ tenant_id presente: true)

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb := event -> 'claims';
  tenant text := claims -> 'app_metadata' ->> 'tenant_id';
begin
  -- Fuente de verdad: app_metadata (solo la escribe el service_role; el usuario
  -- NO puede tocarla, a diferencia de user_metadata). Si falta, no inventamos
  -- nada: el claim raíz queda ausente y la RLS sigue fallando cerrada para ese
  -- usuario (correcto — no se le da un tenant que no tiene).
  if tenant is not null and tenant <> '' then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant));
    event := jsonb_set(event, '{claims}', claims);
  end if;
  return event;
end;
$$;

-- GoTrue ejecuta el hook como el rol `supabase_auth_admin`; debe poder ejecutarlo.
-- Nadie más (authenticated/anon/public) debe poder invocarlo.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

comment on function public.custom_access_token_hook(jsonb) is
  'Access token hook: copia app_metadata.tenant_id al claim raíz tenant_id que consume public.tenant_id() (RLS multi-tenant). Activar en Authentication → Hooks.';
