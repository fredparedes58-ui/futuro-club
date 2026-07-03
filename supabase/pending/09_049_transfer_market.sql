-- ─────────────────────────────────────────────────────────────────────────
-- VITAS · Transfer Market — listings, inquiries, saved searches
--
-- Diseño extensible:
--   - Listing types como CHECK constraint (añadir nuevos = ALTER TABLE)
--   - Status lifecycle también via CHECK
--   - Snapshots JSONB para que el listing sobreviva cambios del player
--   - Saved searches con query JSONB (esquema flexible)
-- ─────────────────────────────────────────────────────────────────────────

-- ── Listings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_listings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seller_user_id      UUID,                                          -- nullable cuando no hay auth
  seller_name         TEXT,
  tenant_id           UUID,
  publisher_role      TEXT NOT NULL DEFAULT 'club'
                      CHECK (publisher_role IN ('club', 'agent', 'player')),

  listing_type        TEXT NOT NULL DEFAULT 'sale'
                      CHECK (listing_type IN ('sale', 'loan', 'trial')),
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'under_negotiation', 'closed', 'expired')),

  asking_price_eur    NUMERIC(12, 2),                                -- nullable = negociable
  currency            TEXT NOT NULL DEFAULT 'EUR'
                      CHECK (currency IN ('EUR', 'USD', 'GBP')),
  valuation_eur_ai    NUMERIC(12, 2),                                -- auto desde valuationModel
  accepts_offers      BOOLEAN NOT NULL DEFAULT true,

  visibility          TEXT NOT NULL DEFAULT 'public'
                      CHECK (visibility IN ('public', 'private')),
  description         TEXT,
  highlight_video_id  TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',

  -- Snapshot del jugador para que la card del listing sobreviva updates
  player_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,

  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_status_visibility
  ON transfer_listings (status, visibility)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_listings_player
  ON transfer_listings (player_id);

CREATE INDEX IF NOT EXISTS idx_listings_tenant
  ON transfer_listings (tenant_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_listings_expires
  ON transfer_listings (expires_at)
  WHERE status = 'active';

-- Only one active listing per player (a player can be relisted but only
-- one slot active at a time).
CREATE UNIQUE INDEX IF NOT EXISTS uq_listings_one_active_per_player
  ON transfer_listings (player_id)
  WHERE status IN ('active', 'under_negotiation');

-- ── Inquiries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_inquiries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          UUID NOT NULL REFERENCES transfer_listings(id) ON DELETE CASCADE,
  buyer_user_id       UUID,
  buyer_name          TEXT,
  buyer_tenant_id     UUID,

  message             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'viewed', 'in_progress', 'declined', 'accepted')),

  proposed_price_eur  NUMERIC(12, 2),
  proposed_type       TEXT
                      CHECK (proposed_type IS NULL OR proposed_type IN ('sale', 'loan', 'trial')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  viewed_at           TIMESTAMPTZ,
  responded_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inquiries_listing
  ON transfer_inquiries (listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiries_buyer
  ON transfer_inquiries (buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiries_status
  ON transfer_inquiries (status)
  WHERE status IN ('new', 'in_progress');

-- ── Saved searches (alerts) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_saved_searches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID,
  tenant_id           UUID,
  label               TEXT NOT NULL,
  query               JSONB NOT NULL DEFAULT '{}'::jsonb,
  notify_on_match     BOOLEAN NOT NULL DEFAULT true,
  last_notified_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user
  ON transfer_saved_searches (user_id);

-- ── Match score cache (output del agente) ──────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_match_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          UUID NOT NULL REFERENCES transfer_listings(id) ON DELETE CASCADE,
  query_hash          TEXT NOT NULL,                                 -- hash de TransferSearchQuery
  score               INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  reasoning           TEXT,
  matched_criteria    TEXT[] DEFAULT '{}',
  missing_criteria    TEXT[] DEFAULT '{}',
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, query_hash)
);

CREATE INDEX IF NOT EXISTS idx_match_scores_query
  ON transfer_match_scores (query_hash, score DESC);

-- ── updated_at trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_transfer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listings_updated_at ON transfer_listings;
CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON transfer_listings
  FOR EACH ROW EXECUTE FUNCTION touch_transfer_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE transfer_listings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_inquiries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_saved_searches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_match_scores    ENABLE ROW LEVEL SECURITY;

-- Listings: público (visibility='public' + status='active') visible para todos
-- autenticados. Privados solo owner. Edit solo owner/tenant.
CREATE POLICY listings_public_read ON transfer_listings
  FOR SELECT
  USING (
    (visibility = 'public' AND status = 'active')
    OR seller_user_id = auth.uid()
    OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

CREATE POLICY listings_owner_write ON transfer_listings
  FOR ALL
  USING (
    seller_user_id = auth.uid()
    OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    seller_user_id = auth.uid()
    OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    OR auth.role() = 'service_role'
  );

-- Inquiries: el buyer y el seller del listing las ven.
CREATE POLICY inquiries_participants_read ON transfer_inquiries
  FOR SELECT
  USING (
    buyer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM transfer_listings l
      WHERE l.id = listing_id
        AND (l.seller_user_id = auth.uid()
             OR l.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY inquiries_participants_write ON transfer_inquiries
  FOR ALL
  USING (
    buyer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM transfer_listings l
      WHERE l.id = listing_id
        AND (l.seller_user_id = auth.uid()
             OR l.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    )
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    buyer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM transfer_listings l
      WHERE l.id = listing_id
        AND (l.seller_user_id = auth.uid()
             OR l.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    )
    OR auth.role() = 'service_role'
  );

-- Saved searches: solo owner.
CREATE POLICY saved_searches_owner ON transfer_saved_searches
  FOR ALL
  USING (user_id = auth.uid() OR auth.role() = 'service_role')
  WITH CHECK (user_id = auth.uid() OR auth.role() = 'service_role');

-- Match scores: auth read, service write.
CREATE POLICY match_scores_auth_read ON transfer_match_scores
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY match_scores_service_write ON transfer_match_scores
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Vista resumen activos ──────────────────────────────────────────────
CREATE OR REPLACE VIEW v_active_listings_summary AS
SELECT
  l.id,
  l.player_id,
  l.listing_type,
  l.asking_price_eur,
  l.currency,
  l.player_snapshot,
  l.tags,
  l.expires_at,
  COUNT(i.id) AS inquiries_count,
  COUNT(i.id) FILTER (WHERE i.status = 'new') AS new_inquiries
FROM transfer_listings l
LEFT JOIN transfer_inquiries i ON i.listing_id = l.id
WHERE l.status = 'active'
GROUP BY l.id;

COMMENT ON TABLE transfer_listings       IS 'Marketplace: jugadores en venta/cesión/prueba.';
COMMENT ON TABLE transfer_inquiries      IS 'Mensajes de clubes compradores a un listing.';
COMMENT ON TABLE transfer_saved_searches IS 'Alertas: club guarda criterio y recibe notif al haber match.';
COMMENT ON TABLE transfer_match_scores   IS 'Cache del agente TransferMatch.';
