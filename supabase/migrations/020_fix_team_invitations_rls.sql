-- ─── Fix: Restrict team_invitations SELECT to org owner or invitee ─────────
-- Previously: using (true) allowed any authenticated user to read ALL invitations
-- Now: only the org director OR the invited email can see the invitation

drop policy if exists "Invitee reads own invitation" on team_invitations;
create policy "Invitee reads own invitation"
  on team_invitations for select to authenticated
  using (
    auth.uid() = org_owner_id
    OR email = (select email from auth.users where id = auth.uid())
  );

-- Add index for expiration cleanup queries
create index if not exists idx_team_invitations_expires_pending
  on team_invitations (expires_at)
  where status = 'pending';

-- Prevent duplicate pending invites to same email in same org
create unique index if not exists idx_team_invitations_unique_pending
  on team_invitations (org_owner_id, email)
  where status = 'pending';
