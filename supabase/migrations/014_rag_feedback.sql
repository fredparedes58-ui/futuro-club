-- ============================================================================
-- VITAS · Migration 014: RAG Feedback Table
-- Almacena feedback de usuarios sobre resultados RAG para mejorar retrieval
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id    TEXT NOT NULL,
  score       INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para analytics por trace
CREATE INDEX IF NOT EXISTS idx_rag_feedback_trace_id
  ON rag_feedback (trace_id);

-- Índice para analytics temporales
CREATE INDEX IF NOT EXISTS idx_rag_feedback_created_at
  ON rag_feedback (created_at DESC);

-- RLS: permitir inserts desde service role, lectura desde authenticated
ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON rag_feedback;
CREATE POLICY "service_role_full_access" ON rag_feedback
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "authenticated_insert" ON rag_feedback;
CREATE POLICY "authenticated_insert" ON rag_feedback
  FOR INSERT
  WITH CHECK (true);
