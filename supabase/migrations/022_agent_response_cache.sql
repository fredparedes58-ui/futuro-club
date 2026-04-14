-- ─────────────────────────────────────────────────────────────
-- 022 · Agent Response Cache
-- Caches AI agent responses to avoid duplicate LLM calls.
-- Keyed by SHA-256 hash of (agent + user + input).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.agent_response_cache (
  id          uuid        primary key default gen_random_uuid(),
  cache_key   text        not null unique,
  agent_name  text        not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  player_id   text,
  video_id    text,
  response    jsonb       not null,
  tokens_saved integer   not null default 0,
  hit_count   integer    not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- Indexes for fast lookups and invalidation
create index if not exists idx_agent_cache_key
  on public.agent_response_cache(cache_key);
create index if not exists idx_agent_cache_player
  on public.agent_response_cache(player_id, agent_name);
create index if not exists idx_agent_cache_video
  on public.agent_response_cache(video_id, agent_name);
create index if not exists idx_agent_cache_expires
  on public.agent_response_cache(expires_at);

alter table public.agent_response_cache enable row level security;

-- Service role has full access (Edge functions use service role)
create policy "Service role full access cache"
  on public.agent_response_cache for all to service_role
  using (true) with check (true);

-- Users can read their own cache entries
create policy "Users read own cache"
  on public.agent_response_cache for select to authenticated
  using (user_id = auth.uid());
