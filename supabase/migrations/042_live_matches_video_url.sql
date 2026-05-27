-- ════════════════════════════════════════════════════════════════════════════
-- VITAS · Migration 042 · live_matches: video_url column
-- Match-day Live · Video Analysis support
-- ════════════════════════════════════════════════════════════════════════════
-- Adds video_url column so coaches can attach a match video at creation.
-- At match end, aggregate API sends video to Gemini for analysis of
-- BOTH teams (local + rival) and enriches the 3 Claude reports.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE live_matches
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN live_matches.video_url
  IS 'CDN URL of match video (Bunny). Analyzed by Gemini at match end for both-team insights.';
