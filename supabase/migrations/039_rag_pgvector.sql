-- ============================================================================
-- VITAS · Migration 039 · RAG with pgvector (IA → 8/10)
-- ============================================================================
-- Enables Retrieval-Augmented Generation for player evaluations.
-- Instead of evaluating "in the vacuum", the AI gets full player history
-- as context before generating reports.
--
-- Architecture:
--   1. Enable pgvector extension
--   2. Player knowledge base (embeddings of historical evaluations)
--   3. Context retrieval function (nearest neighbors by player)
--   4. Evaluation history for temporal tracking
-- ============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Player knowledge chunks — stores embedded text about each player
CREATE TABLE IF NOT EXISTS player_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Content
  chunk_type TEXT NOT NULL CHECK (chunk_type IN (
    'evaluation',      -- AI evaluation report
    'tracking_session', -- Tracking metrics summary
    'coach_note',      -- Manual coach observation
    'injury',          -- Injury record
    'milestone',       -- Achievement or milestone
    'training',        -- Training session data
    'match_event'      -- Notable match event
  )),
  content TEXT NOT NULL,          -- Raw text content
  metadata JSONB DEFAULT '{}',   -- Structured metadata

  -- Vector embedding (1536 dimensions for text-embedding-3-small)
  embedding vector(1536),

  -- Timestamps
  source_date TIMESTAMPTZ,       -- When the original event happened
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_pk_player ON player_knowledge(player_id);
CREATE INDEX IF NOT EXISTS idx_pk_org ON player_knowledge(org_id);
CREATE INDEX IF NOT EXISTS idx_pk_type ON player_knowledge(chunk_type);
CREATE INDEX IF NOT EXISTS idx_pk_source_date ON player_knowledge(source_date DESC);

-- HNSW index for vector similarity search (fast approximate nearest neighbors)
CREATE INDEX IF NOT EXISTS idx_pk_embedding ON player_knowledge
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS
ALTER TABLE player_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own or org knowledge" ON player_knowledge
  FOR SELECT USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
    OR org_id IN (SELECT user_org_ids())
  );

CREATE POLICY "Users insert knowledge" ON player_knowledge
  FOR INSERT WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
    OR org_id IN (SELECT user_org_ids())
  );

-- 3. Context retrieval function
-- Given a player_id + query embedding, return the most relevant knowledge chunks
CREATE OR REPLACE FUNCTION get_player_context(
  p_player_id TEXT,
  p_query_embedding vector(1536),
  p_limit INT DEFAULT 10,
  p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  chunk_type TEXT,
  content TEXT,
  metadata JSONB,
  source_date TIMESTAMPTZ,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pk.id,
    pk.chunk_type,
    pk.content,
    pk.metadata,
    pk.source_date,
    1 - (pk.embedding <=> p_query_embedding) AS similarity
  FROM player_knowledge pk
  WHERE pk.player_id = p_player_id
    AND pk.embedding IS NOT NULL
    AND 1 - (pk.embedding <=> p_query_embedding) >= p_similarity_threshold
  ORDER BY pk.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Get full player timeline (no embedding needed, just chronological)
CREATE OR REPLACE FUNCTION get_player_timeline(
  p_player_id TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  chunk_type TEXT,
  content TEXT,
  metadata JSONB,
  source_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pk.id,
    pk.chunk_type,
    pk.content,
    pk.metadata,
    pk.source_date
  FROM player_knowledge pk
  WHERE pk.player_id = p_player_id
  ORDER BY pk.source_date DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Evaluation history — tracks how AI scores change over time
CREATE TABLE IF NOT EXISTS evaluation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Score data
  vsi NUMERIC(5,1),
  confidence_score NUMERIC(5,1),
  dimensions_evaluated INT,
  dimensions_total INT,

  -- Agent info
  agent_name TEXT,
  agent_version TEXT,
  model_used TEXT,

  -- Context used
  context_chunks_used INT DEFAULT 0,
  had_tracking_data BOOLEAN DEFAULT false,
  had_video_data BOOLEAN DEFAULT false,

  -- Metadata
  report_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eh_player ON evaluation_history(player_id);
CREATE INDEX IF NOT EXISTS idx_eh_org ON evaluation_history(org_id);
CREATE INDEX IF NOT EXISTS idx_eh_date ON evaluation_history(created_at DESC);

ALTER TABLE evaluation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own or org eval history" ON evaluation_history
  FOR SELECT USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
    OR org_id IN (SELECT user_org_ids())
  );

CREATE POLICY "Users insert eval history" ON evaluation_history
  FOR INSERT WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
    OR org_id IN (SELECT user_org_ids())
  );

-- 6. Player evolution view — shows how scores change over time
CREATE OR REPLACE VIEW v_player_evolution AS
SELECT
  eh.player_id,
  p.name AS player_name,
  p.position,
  COUNT(*) AS total_evaluations,
  ROUND(AVG(eh.vsi)::NUMERIC, 1) AS avg_vsi,
  ROUND(MIN(eh.vsi)::NUMERIC, 1) AS min_vsi,
  ROUND(MAX(eh.vsi)::NUMERIC, 1) AS max_vsi,
  ROUND(MAX(eh.vsi)::NUMERIC - MIN(eh.vsi)::NUMERIC, 1) AS vsi_range,
  ROUND(AVG(eh.confidence_score)::NUMERIC, 1) AS avg_confidence,
  -- Trend: is the player improving?
  CASE
    WHEN COUNT(*) < 3 THEN 'insufficient_data'
    WHEN (
      SELECT eh2.vsi FROM evaluation_history eh2
      WHERE eh2.player_id = eh.player_id
      ORDER BY eh2.created_at DESC LIMIT 1
    ) > AVG(eh.vsi) + 3 THEN 'improving'
    WHEN (
      SELECT eh2.vsi FROM evaluation_history eh2
      WHERE eh2.player_id = eh.player_id
      ORDER BY eh2.created_at DESC LIMIT 1
    ) < AVG(eh.vsi) - 3 THEN 'declining'
    ELSE 'stable'
  END AS trend
FROM evaluation_history eh
JOIN players p ON p.id = eh.player_id
GROUP BY eh.player_id, p.name, p.position;

COMMENT ON VIEW v_player_evolution IS 'Shows how player AI scores evolve over time — improving/stable/declining';

-- 7. Stats view for RAG quality monitoring
CREATE OR REPLACE VIEW v_rag_stats AS
SELECT
  COUNT(DISTINCT pk.player_id) AS players_with_context,
  COUNT(*) AS total_chunks,
  COUNT(*) FILTER (WHERE pk.embedding IS NOT NULL) AS embedded_chunks,
  COUNT(*) FILTER (WHERE pk.chunk_type = 'evaluation') AS evaluation_chunks,
  COUNT(*) FILTER (WHERE pk.chunk_type = 'tracking_session') AS tracking_chunks,
  COUNT(*) FILTER (WHERE pk.chunk_type = 'coach_note') AS coach_notes,
  ROUND(AVG(LENGTH(pk.content))::NUMERIC, 0) AS avg_chunk_length,
  MIN(pk.created_at) AS oldest_chunk,
  MAX(pk.created_at) AS newest_chunk
FROM player_knowledge pk;

COMMENT ON VIEW v_rag_stats IS 'RAG knowledge base health stats';
