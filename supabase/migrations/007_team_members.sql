-- ─── Team Members — Multi-usuario plan Club ──────────────────────────────────

create table if not exists team_members (
  id            uuid        primary key default gen_random_uuid(),
  org_owner_id  uuid        not null references auth.users(id) on delete cascade,
  member_id     uuid        not null references auth.users(id) on delete cascade,
  role          text        not null default 'scout'
                  check (role in ('director','scout','coach','viewer')),
  joined_at     timestamptz not null default now(),
  unique (org_owner_id, member_id)
);

create index if not exists team_members_org_idx    on team_members (org_owner_id);
create index if not exists team_members_member_idx on team_members (member_id);

alter table team_members enable row level security;

-- El director ve todos los miembros de su org
drop policy if exists "Director reads own team" on team_members;
create policy "Director reads own team"
  on team_members for select to authenticated
  using (auth.uid() = org_owner_id or auth.uid() = member_id);

-- Solo el director puede gestionar el equipo
drop policy if exists "Director manages team" on team_members;
create policy "Director manages team"
  on team_members for all to authenticated
  using  (auth.uid() = org_owner_id)
  with check (auth.uid() = org_owner_id);

drop policy if exists "Service role full access" on team_members;
create policy "Service role full access"
  on team_members for all to service_role using (true);
