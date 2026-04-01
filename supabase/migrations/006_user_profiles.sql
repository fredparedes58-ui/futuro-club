-- ─── User Profiles — Tipo de perfil y rol ────────────────────────────────────

create table if not exists user_profiles (
  user_id               uuid        primary key references auth.users(id) on delete cascade,
  profile_type          text        not null default 'scout'
                          check (profile_type in ('scout','parent','academy','club')),
  role                  text        not null default 'scout'
                          check (role in ('director','scout','coach','viewer')),
  organization_name     text,
  onboarding_completed  boolean     not null default false,
  created_at            timestamptz not null default now()
);

-- RLS
alter table user_profiles enable row level security;

create policy "Users read own profile"
  on user_profiles for select to authenticated
  using (auth.uid() = user_id);

create policy "Users write own profile"
  on user_profiles for all to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access"
  on user_profiles for all to service_role using (true);
