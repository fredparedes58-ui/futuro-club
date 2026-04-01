-- ─── Team Invitations — Sistema de invitaciones ──────────────────────────────

create table if not exists team_invitations (
  id            uuid        primary key default gen_random_uuid(),
  org_owner_id  uuid        not null references auth.users(id) on delete cascade,
  email         text        not null,
  role          text        not null default 'scout'
                  check (role in ('scout','coach','viewer')),
  token         text        not null unique default encode(gen_random_bytes(32), 'hex'),
  status        text        not null default 'pending'
                  check (status in ('pending','accepted','expired')),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  created_at    timestamptz not null default now()
);

create index if not exists team_invitations_token_idx      on team_invitations (token);
create index if not exists team_invitations_org_idx        on team_invitations (org_owner_id);
create index if not exists team_invitations_email_idx      on team_invitations (email);

alter table team_invitations enable row level security;

create policy "Director manages invitations"
  on team_invitations for all to authenticated
  using  (auth.uid() = org_owner_id)
  with check (auth.uid() = org_owner_id);

-- Cualquier usuario autenticado puede leer su invitación por token
create policy "Invitee reads own invitation"
  on team_invitations for select to authenticated
  using (true);

create policy "Service role full access"
  on team_invitations for all to service_role using (true);
