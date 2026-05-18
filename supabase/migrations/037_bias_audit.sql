-- ============================================================================
-- VITAS · Migration 037 · Bias Audit Views
-- ============================================================================
-- Detects statistical anomalies in player evaluations by:
--   1. Position (are forwards always rated higher than defenders?)
--   2. Age group (are younger players favored?)
--   3. Data volume (do players with more videos get inflated scores?)
--   4. Time (are recent evaluations systematically different?)
-- ============================================================================

-- 1. Score distribution by position
CREATE OR REPLACE VIEW v_bias_by_position AS
SELECT
  p.position,
  COUNT(*) AS player_count,
  ROUND(AVG(p.vsi)::NUMERIC, 1) AS avg_vsi,
  ROUND(STDDEV(p.vsi)::NUMERIC, 1) AS stddev_vsi,
  MIN(p.vsi) AS min_vsi,
  MAX(p.vsi) AS max_vsi,
  ROUND(AVG(p.vsi)::NUMERIC - (SELECT AVG(vsi) FROM players WHERE vsi > 0)::NUMERIC, 1) AS deviation_from_global_avg
FROM players p
WHERE p.vsi > 0
GROUP BY p.position
HAVING COUNT(*) >= 2
ORDER BY avg_vsi DESC;

COMMENT ON VIEW v_bias_by_position IS 'Detects if certain positions get systematically higher/lower scores';

-- 2. Score distribution by age group
CREATE OR REPLACE VIEW v_bias_by_age AS
SELECT
  CASE
    WHEN p.age BETWEEN 10 AND 13 THEN 'U14'
    WHEN p.age BETWEEN 14 AND 16 THEN 'U17'
    WHEN p.age BETWEEN 17 AND 19 THEN 'U20'
    WHEN p.age >= 20 THEN '20+'
    ELSE 'Unknown'
  END AS age_group,
  COUNT(*) AS player_count,
  ROUND(AVG(p.vsi)::NUMERIC, 1) AS avg_vsi,
  ROUND(STDDEV(p.vsi)::NUMERIC, 1) AS stddev_vsi,
  ROUND(AVG(p.vsi)::NUMERIC - (SELECT AVG(vsi) FROM players WHERE vsi > 0)::NUMERIC, 1) AS deviation_from_global_avg
FROM players p
WHERE p.vsi > 0
GROUP BY age_group
ORDER BY avg_vsi DESC;

COMMENT ON VIEW v_bias_by_age IS 'Detects if certain age groups get systematically higher/lower scores';

-- 3. Score vs data volume (visibility bias)
-- Players with more videos might get inflated scores
CREATE OR REPLACE VIEW v_bias_by_visibility AS
SELECT
  CASE
    WHEN video_count = 0 THEN '0 videos'
    WHEN video_count = 1 THEN '1 video'
    WHEN video_count BETWEEN 2 AND 3 THEN '2-3 videos'
    WHEN video_count BETWEEN 4 AND 6 THEN '4-6 videos'
    ELSE '7+ videos'
  END AS data_volume,
  COUNT(*) AS player_count,
  ROUND(AVG(vsi)::NUMERIC, 1) AS avg_vsi,
  ROUND(STDDEV(vsi)::NUMERIC, 1) AS stddev_vsi
FROM (
  SELECT
    p.id,
    p.vsi,
    COUNT(DISTINCT pa.id) AS video_count
  FROM players p
  LEFT JOIN player_analyses pa ON pa.player_id = p.id
  WHERE p.vsi > 0
  GROUP BY p.id, p.vsi
) sub
GROUP BY data_volume
ORDER BY avg_vsi DESC;

COMMENT ON VIEW v_bias_by_visibility IS 'Detects if players with more data get inflated scores (visibility bias)';

-- 4. Score trend over time (recency bias)
CREATE OR REPLACE VIEW v_bias_by_recency AS
SELECT
  DATE_TRUNC('month', pa.created_at) AS month,
  COUNT(*) AS analysis_count,
  ROUND(AVG((pa.report->>'vsi')::NUMERIC), 1) AS avg_vsi,
  ROUND(STDDEV((pa.report->>'vsi')::NUMERIC), 1) AS stddev_vsi
FROM player_analyses pa
WHERE pa.report->>'vsi' IS NOT NULL
  AND (pa.report->>'vsi')::NUMERIC > 0
GROUP BY month
ORDER BY month DESC
LIMIT 12;

COMMENT ON VIEW v_bias_by_recency IS 'Detects if scores trend up/down over time (prompt drift or recency bias)';

-- 5. Consolidated bias dashboard view
CREATE OR REPLACE VIEW v_bias_dashboard AS
SELECT
  'position' AS bias_type,
  position AS category,
  player_count,
  avg_vsi,
  stddev_vsi,
  deviation_from_global_avg,
  CASE
    WHEN ABS(deviation_from_global_avg) > 10 THEN 'HIGH'
    WHEN ABS(deviation_from_global_avg) > 5 THEN 'MEDIUM'
    ELSE 'LOW'
  END AS severity
FROM v_bias_by_position

UNION ALL

SELECT
  'age' AS bias_type,
  age_group AS category,
  player_count,
  avg_vsi,
  stddev_vsi,
  deviation_from_global_avg,
  CASE
    WHEN ABS(deviation_from_global_avg) > 10 THEN 'HIGH'
    WHEN ABS(deviation_from_global_avg) > 5 THEN 'MEDIUM'
    ELSE 'LOW'
  END AS severity
FROM v_bias_by_age;

COMMENT ON VIEW v_bias_dashboard IS 'Consolidated bias detection dashboard — HIGH severity = investigate';
