-- ============================================================================
-- VITAS · Migration 013: Performance Indexes
-- Agrega índices para queries frecuentes que mejoran performance
-- ============================================================================

-- Índice para buscar jugadores por equipo
CREATE INDEX IF NOT EXISTS idx_players_team_id
  ON players (team_id)
  WHERE team_id IS NOT NULL;

-- Índice para buscar jugadores por posición
CREATE INDEX IF NOT EXISTS idx_players_position
  ON players (position)
  WHERE position IS NOT NULL;

-- Índice para buscar tracking sessions por video
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_video_id
  ON tracking_sessions (video_id)
  WHERE video_id IS NOT NULL;

-- Índice para buscar tracking sessions por jugador
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_player_id
  ON tracking_sessions (player_id)
  WHERE player_id IS NOT NULL;

-- Índice para knowledge_base por categoría (RAG queries frecuentes)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category
  ON knowledge_base (category);

-- Índice para push_subscriptions por user_id
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions (user_id)
  WHERE user_id IS NOT NULL;

-- Índice para players_indexed por nombre (búsqueda de jugadores pro)
CREATE INDEX IF NOT EXISTS idx_players_indexed_name_trgm
  ON players_indexed USING gin (name gin_trgm_ops);

-- Índice para team_invitations activas
CREATE INDEX IF NOT EXISTS idx_team_invitations_status
  ON team_invitations (status)
  WHERE status = 'pending';
