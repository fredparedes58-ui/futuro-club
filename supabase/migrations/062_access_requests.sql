-- =====================================================================
-- 062 · access_requests — solicitudes de acceso a un club (Rama B)
-- =====================================================================
-- Flujo INVERSO al de team_invitations (que es director→invita): aquí un
-- usuario SOLICITA unirse a un club identificándolo por su join_code, y un
-- DIRECTOR de ese club aprueba o rechaza. Al aprobar se crea el team_members
-- (misma sink que _accept), incluido org_id (que _accept histórico no rellenaba).
--
-- Ancla = org_owner_id (el director dueño del club), consistente con
-- team_invitations / team_members / update-role. NO se usa org_id como ancla
-- (la capa organizations tiene RLS inconsistente); org_id se rellena como
-- respaldo para la RLS de datos de la migración 038.
--
-- SEGURO: solo crea objetos nuevos + añade una columna nullable a user_profiles.

-- ── join_code: código corto que un director comparte para que le soliciten
--    acceso. Único; se genera bajo demanda desde el endpoint join-code. ──────
alter table public.user_profiles
  add column if not exists join_code text unique;

-- Backfill: un código para los directores existentes (pgcrypto ya está en uso).
update public.user_profiles
  set join_code = encode(gen_random_bytes(6), 'hex')
  where role = 'director' and join_code is null;

-- ── Tabla de solicitudes ─────────────────────────────────────────────
create table if not exists public.access_requests (
  id              uuid        primary key default gen_random_uuid(),
  org_owner_id    uuid        not null references auth.users(id) on delete cascade,
  requester_id    uuid        not null references auth.users(id) on delete cascade,
  requester_email text,
  requested_role  text        not null default 'scout'
                    check (requested_role in ('scout','coach','viewer')),
  status          text        not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  message         text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid        references auth.users(id) on delete set null,
  -- Una fila por (club, solicitante): re-solicitar hace UPSERT y vuelve a pending.
  unique (org_owner_id, requester_id)
);

create index if not exists access_requests_org_idx       on public.access_requests (org_owner_id);
create index if not exists access_requests_requester_idx on public.access_requests (requester_id);
create index if not exists access_requests_status_idx    on public.access_requests (status);

alter table public.access_requests enable row level security;

-- El solicitante ve y crea sus propias solicitudes.
drop policy if exists "Requester manages own requests" on public.access_requests;
create policy "Requester manages own requests"
  on public.access_requests for all to authenticated
  using  (auth.uid() = requester_id)
  with check (auth.uid() = requester_id);

-- El dueño del club ve/gestiona las solicitudes dirigidas a su org. (Los demás
-- directores del club se autorizan a nivel de API; el service_role salta RLS.)
drop policy if exists "Org owner manages incoming requests" on public.access_requests;
create policy "Org owner manages incoming requests"
  on public.access_requests for all to authenticated
  using  (auth.uid() = org_owner_id)
  with check (auth.uid() = org_owner_id);

drop policy if exists "Service role full access access_requests" on public.access_requests;
create policy "Service role full access access_requests"
  on public.access_requests for all to service_role using (true) with check (true);
