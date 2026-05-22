-- ════════════════════════════════════════════════════════════════════
-- Phase 21 Block 2.13 — Manav's Pick Intelligence Engine
--
-- Three changes:
--   1. global_feed_items   — drop TTL, add enrichment columns
--   2. project_knowledge_snapshot — new daily-refresh table
--   3. manavs_picks        — new persistent picks with 5 role frames
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Extend global_feed_items for permanent corpus + enrichment ──

-- Drop the TTL index first (was indexed on expires_at)
DROP INDEX IF EXISTS idx_global_feed_expires;

-- Add enrichment columns. expires_at column itself stays (in case any
-- old code references it) but it's no longer used by readers.
ALTER TABLE global_feed_items
  ADD COLUMN IF NOT EXISTS topic_tags       TEXT[],
  ADD COLUMN IF NOT EXISTS entities         TEXT[],
  ADD COLUMN IF NOT EXISTS key_claims       JSONB,
  ADD COLUMN IF NOT EXISTS content_summary  TEXT,
  ADD COLUMN IF NOT EXISTS processed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS was_pick         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS picked_for_projects JSONB NOT NULL DEFAULT '[]'::JSONB;

-- New indexes for the engine's candidate-filter step
CREATE INDEX IF NOT EXISTS idx_global_feed_topic_tags  ON global_feed_items USING GIN (topic_tags);
CREATE INDEX IF NOT EXISTS idx_global_feed_entities    ON global_feed_items USING GIN (entities);
CREATE INDEX IF NOT EXISTS idx_global_feed_processed   ON global_feed_items(processed_at) WHERE processed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_global_feed_was_pick    ON global_feed_items(was_pick) WHERE was_pick = TRUE;

-- ── 2. Per-project knowledge snapshot ──

CREATE TABLE IF NOT EXISTS project_knowledge_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  taken_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  topic_tags      TEXT[] NOT NULL DEFAULT '{}',
  entities        TEXT[] NOT NULL DEFAULT '{}',
  active_keywords TEXT[] NOT NULL DEFAULT '{}',
  recent_findings  JSONB NOT NULL DEFAULT '[]'::JSONB,
  recent_movements JSONB NOT NULL DEFAULT '[]'::JSONB,
  context_summary  TEXT,
  positioning_loaded BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pks_project_date ON project_knowledge_snapshot(project_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pks_topic_tags   ON project_knowledge_snapshot USING GIN (topic_tags);
CREATE INDEX IF NOT EXISTS idx_pks_entities     ON project_knowledge_snapshot USING GIN (entities);

-- ── 3. Manav's Picks — persistent storage with 5 role frames ──

CREATE TABLE IF NOT EXISTS manavs_picks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL,
  picked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The insight (the actual content)
  insight_headline    TEXT NOT NULL,
  insight_body        TEXT NOT NULL,

  -- 5 role frames. Shape:
  --   [{ role: 'sales', headline: '...', body: '...' }, ...]
  frames              JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Citations (traceability)
  -- external: [{ feed_item_id, url, publisher, title, ingested_at }]
  -- internal: [{ source_table, source_field, value, captured_at, label }]
  external_citations  JSONB NOT NULL DEFAULT '[]'::JSONB,
  internal_citations  JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Engine bookkeeping
  connection_score    NUMERIC NOT NULL DEFAULT 0,
  relevance_score     NUMERIC NOT NULL DEFAULT 0,
  is_current          BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by       UUID,
  superseded_at       TIMESTAMPTZ,

  -- Audit
  generated_by_model  TEXT,
  generation_cost     NUMERIC,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A project has at most ONE current pick at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_manavs_picks_one_current
  ON manavs_picks(project_id) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_manavs_picks_archive
  ON manavs_picks(project_id, picked_at DESC);

CREATE INDEX IF NOT EXISTS idx_manavs_picks_score
  ON manavs_picks(project_id, relevance_score DESC);
