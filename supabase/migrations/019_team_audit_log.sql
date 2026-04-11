-- ─── Team Audit Log — Tracks all team management actions ────────────────────

create table if not exists team_audit_log (
  id                uuid        primary key default gen_random_uuid(),
  org_owner_id      uuid        not null references auth.users(id) on delete cascade,
  actor_id          uuid        not null references auth.users(id) on delete cascade,
  action            text        not null,  -- 'invite_sent', 'invite_accepted', 'role_change', 'member_removed'
  target_member_id  uuid        references auth.users(id) on delete set null,
  target_email      text,
  previous_role     text,
  new_role          text,
  created_at        timestamptz not null default now()
);

-- Index for querying audit trail by organization
create index if not exists idx_team_audit_log_org
  on team_audit_log (org_owner_id, created_at desc);

-- Index for querying actions by actor
create index if not exists idx_team_audit_log_actor
  on team_audit_log (actor_id, created_at desc);

alter table team_audit_log enable row level security;

-- Directors can read audit logs for their organization
drop policy if exists "Directors read own org audit log" on team_audit_log;
create policy "Directors read own org audit log"
  on team_audit_log for select
  to authenticated
  using (auth.uid() = org_owner_id);

-- Service role manages all
drop policy if exists "Service role manages team audit log" on team_audit_log;
create policy "Service role manages team audit log"
  on team_audit_log for all
  to service_role
  using (true);
