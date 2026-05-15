-- ═══════════════════════════════════════════════════════════
-- algorithm_knowledge_columns_fix.sql
--
-- The codebase queries `topic` and `freshness_score` columns
-- on `algorithm_knowledge` but they were never added in the
-- original CREATE TABLE statement. Adds them as additive columns
-- with sane defaults so existing read queries stop returning 400.
--
-- Safe to run multiple times — uses ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE algorithm_knowledge
  ADD COLUMN IF NOT EXISTS topic            TEXT,
  ADD COLUMN IF NOT EXISTS freshness_score  INTEGER DEFAULT 5;

-- Backfill: topic mirrors title for existing rows; freshness_score defaults to 5
UPDATE algorithm_knowledge SET topic = title WHERE topic IS NULL;
UPDATE algorithm_knowledge SET freshness_score = 5 WHERE freshness_score IS NULL;

-- Add an index so queries that order by freshness_score remain fast
CREATE INDEX IF NOT EXISTS algorithm_knowledge_freshness_idx
  ON algorithm_knowledge(freshness_score DESC);

-- Verification (uncomment to run after migration):
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'algorithm_knowledge'
--   AND column_name IN ('topic', 'freshness_score');
-- Should return 2 rows.
