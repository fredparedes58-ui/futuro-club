-- Player CRUD Performance Indexes
-- Optimizes the /api/players/crud endpoint queries

-- Composite index for user's players sorted by update time (most common query)
create index if not exists idx_players_user_updated
  on public.players(user_id, updated_at desc);

-- Index for name-based sorting via JSONB
create index if not exists idx_players_data_name
  on public.players((data->>'name'));

-- Index for VSI-based sorting/filtering via JSONB
create index if not exists idx_players_data_vsi
  on public.players((data->>'vsi'));

-- Index for age-based queries (useful for PHV age groups)
create index if not exists idx_players_data_age
  on public.players((data->>'age'));

-- Ensure RLS policy covers all operations (already exists in 000, but add update/delete if missing)
drop policy if exists "Users update own players" on public.players;
create policy "Users update own players" on public.players
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users delete own players" on public.players;
create policy "Users delete own players" on public.players
  for delete using (auth.uid() = user_id);

drop policy if exists "Users insert own players" on public.players;
create policy "Users insert own players" on public.players
  for insert with check (auth.uid() = user_id);

-- Service role bypass for admin operations
drop policy if exists "Service role manages players" on public.players;
create policy "Service role manages players" on public.players
  for all to service_role
  using (true);
