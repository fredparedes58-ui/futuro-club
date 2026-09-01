-- =====================================================================
-- 061 · increment_analyses_used — incremento atómico de la cuota mensual
-- =====================================================================
-- El cliente incrementaba con read-modify-write (SELECT count → POST count+1),
-- que bajo concurrencia pierde actualizaciones (dos requests leen N, ambas
-- escriben N+1 → se cuenta 1 en vez de 2) y, en runtime edge, se disparaba sin
-- await y se perdía del todo. Esta función hace el incremento en el servidor de
-- forma atómica vía INSERT ... ON CONFLICT DO UPDATE count = count + 1.
--
-- La cuota mensual protege un límite de coste real (llamadas a IA de pago); un
-- incremento perdido = análisis servidos gratis por encima del plan.

create or replace function public.increment_analyses_used(
  p_user_id uuid,
  p_month   text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.analyses_used (user_id, month, count, updated_at)
  values (p_user_id, p_month, 1, now())
  on conflict (user_id, month)
  do update set count = public.analyses_used.count + 1, updated_at = now()
  returning count into new_count;

  return new_count;
end;
$$;

-- Solo el service_role (llamadas server-side desde usageGuard) puede ejecutarla.
revoke all on function public.increment_analyses_used(uuid, text) from public;
grant execute on function public.increment_analyses_used(uuid, text) to service_role;
