-- ════════════════════════════════════════════════════════════════════════════
-- Phase D1 — Artifacts table foundation
--
-- Promotes pipeline / audit / cluster-map outputs to first-class queryable
-- rows so the senior PM can find, filter, and search across hundreds of
-- projects without writing SQL by hand.
--
-- Apply order:
--   1. Section A — Create the artifacts table + indexes + full-text trigger
--   2. Section B — Backfill from existing season_pipeline_runs.final_artifacts
--   3. Section C — Verify the migration landed (counts + sample rows)
--
-- This migration is INSERT-ONLY (no UPDATE to existing tables, no DROP).
-- Safe to re-run: every INSERT is guarded by ON CONFLICT DO NOTHING using
-- the (source_kind, source_id, source_step_id) composite uniqueness.
--
-- After this lands, the runner code (finalizeRun in season-pipeline-runner.ts)
-- starts dual-writing every new artifact into this table alongside the
-- existing final_artifacts JSON column. The JSON stays for backward compat
-- but the table becomes the source of truth for portfolio queries.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Section A — Schema ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artifacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership (project_id is the client; matches existing convention
  -- across season_pipeline_runs, seo_campaigns, etc.)
  project_id            uuid NOT NULL,
  campaign_id           uuid,                -- nullable: not all artifacts belong to a campaign
  panel_id              uuid,                -- the specific (keyword, target_url) pair

  -- Source provenance — where did this artifact come from?
  source_kind           text NOT NULL,       -- 'pipeline_run' | 'audit' | 'cluster_map' | 'monitoring' | 'off_page' | 'internal_linking' | etc.
  source_id             uuid NOT NULL,       -- the run_id / audit_id / etc.
  source_step_id        text,                -- e.g. 'content_brief', 'forecast', 'strategy_plan' (NULL for atomic sources like audit)

  -- Artifact identity
  artifact_kind         text NOT NULL,       -- 'brief' | 'forecast' | 'client_update' | 'audit_report' | 'competitor_snapshot' | etc.
  title                 text NOT NULL,
  keyword               text,                -- the target keyword if any
  target_url            text,                -- the landing page if any

  -- Content
  body                  text NOT NULL,
  body_format           text NOT NULL DEFAULT 'markdown',  -- 'markdown' | 'html' | 'json'
  metadata              jsonb DEFAULT '{}'::jsonb,         -- step-specific metadata (audit signals consumed, LLM call counts, etc.)

  -- Full-text search (auto-maintained by trigger below)
  search_vector         tsvector,

  -- Lifecycle — supersession-over-deletion. Refresh produces a new row;
  -- the previous row gets superseded_by pointing to the new one. Nothing
  -- is ever deleted.
  status                text NOT NULL DEFAULT 'current',   -- 'current' | 'superseded' | 'archived'
  superseded_by         uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  superseded_at         timestamptz,

  -- Audit / cost ledger
  generated_at          timestamptz NOT NULL DEFAULT now(),
  generation_cost_usd   numeric(10,4),
  llm_calls             integer DEFAULT 0,
  serpapi_calls         integer DEFAULT 0,

  -- Workflow state
  pm_reviewed           boolean DEFAULT false,
  pm_reviewed_at        timestamptz,
  pm_reviewed_by        uuid,                -- staff_member id
  pm_notes              text,
  client_sent           boolean DEFAULT false,
  client_sent_at        timestamptz
);

-- Uniqueness: prevent dual-writes from creating duplicate rows when the
-- same source_step is re-finalized. (source_kind, source_id, source_step_id)
-- identifies a single artifact instance. For sources without step_id
-- (e.g. atomic audit reports), use the empty string ''.
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_source_step_unique
  ON artifacts (source_kind, source_id, COALESCE(source_step_id, ''));

-- Filter indexes for the Documents page sidebar
CREATE INDEX IF NOT EXISTS idx_artifacts_project       ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_campaign      ON artifacts(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_panel         ON artifacts(panel_id)    WHERE panel_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_kind          ON artifacts(artifact_kind);
CREATE INDEX IF NOT EXISTS idx_artifacts_keyword       ON artifacts(keyword)     WHERE keyword     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_status        ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_generated_at  ON artifacts(generated_at DESC);

-- Composite indexes for the most common filter combinations
CREATE INDEX IF NOT EXISTS idx_artifacts_project_status_kind
  ON artifacts(project_id, status, artifact_kind, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_campaign_status
  ON artifacts(campaign_id, status, generated_at DESC) WHERE campaign_id IS NOT NULL;

-- Workflow filter index — "what needs me right now"
CREATE INDEX IF NOT EXISTS idx_artifacts_unreviewed
  ON artifacts(project_id, generated_at DESC)
  WHERE pm_reviewed = false AND status = 'current';

-- Full-text search index — Postgres-native, fast, deterministic
CREATE INDEX IF NOT EXISTS idx_artifacts_search ON artifacts USING gin(search_vector);

-- Trigger to auto-maintain search_vector. Indexes title, keyword, body, and
-- a few metadata text fields. Weight: title (A) > keyword (A) > body (B) > metadata (C).
CREATE OR REPLACE FUNCTION artifacts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.keyword, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_artifacts_search_vector ON artifacts;
CREATE TRIGGER trg_artifacts_search_vector
  BEFORE INSERT OR UPDATE OF title, keyword, body, metadata
  ON artifacts
  FOR EACH ROW
  EXECUTE FUNCTION artifacts_search_vector_update();


-- ─── Section B — Backfill from existing pipeline runs ─────────────────────
--
-- Walks every row in season_pipeline_runs that has a non-empty final_artifacts
-- JSON array and inserts one artifact row per element. Idempotent — re-running
-- this section is a no-op because of the unique index.
--
-- We expand the final_artifacts jsonb array via jsonb_array_elements, mapping:
--   - kind     → artifact_kind
--   - title    → title
--   - body     → body
--   - step_id  → source_step_id
--
-- For each artifact we also pull the parent run's project_id / campaign_id /
-- panel_id, the keyword from scope, the timestamp from finished_at, and basic
-- cost metadata.

INSERT INTO artifacts (
  project_id,
  campaign_id,
  panel_id,
  source_kind,
  source_id,
  source_step_id,
  artifact_kind,
  title,
  keyword,
  target_url,
  body,
  body_format,
  metadata,
  status,
  generated_at,
  llm_calls
)
SELECT
  r.project_id,
  r.campaign_id,
  r.panel_id,
  'pipeline_run'                                                                          AS source_kind,
  r.id                                                                                    AS source_id,
  COALESCE(a->>'step_id', '')                                                             AS source_step_id,
  COALESCE(a->>'kind', 'unknown')                                                         AS artifact_kind,
  COALESCE(NULLIF(a->>'title', ''), a->>'kind', 'Untitled')                               AS title,
  COALESCE(r.scope->>'keyword', NULL)                                                     AS keyword,
  COALESCE(r.scope->>'target_url', NULL)                                                  AS target_url,
  COALESCE(a->>'body', '')                                                                AS body,
  'markdown'                                                                              AS body_format,
  jsonb_build_object(
    'pipeline_type',  r.pipeline_type,
    'run_status',     r.status,
    'step_count',     r.step_count,
    'backfilled',     true,
    'backfilled_at',  now()
  )                                                                                       AS metadata,
  CASE
    WHEN r.status IN ('completed', 'failed', 'cancelled') THEN 'current'
    ELSE 'current'
  END                                                                                     AS status,
  COALESCE(r.finished_at, r.started_at, now())                                            AS generated_at,
  COALESCE(r.llm_calls_used, 0)                                                           AS llm_calls
FROM season_pipeline_runs r
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.final_artifacts, '[]'::jsonb)) AS a
WHERE
      r.final_artifacts IS NOT NULL
  AND jsonb_typeof(r.final_artifacts) = 'array'
  AND jsonb_array_length(r.final_artifacts) > 0
  AND COALESCE(a->>'body', '') <> ''
ON CONFLICT (source_kind, source_id, COALESCE(source_step_id, ''))
DO NOTHING;


-- ─── Section C — Verify ────────────────────────────────────────────────────

-- C.1 — Count of artifacts created
SELECT
  'Total artifacts'  AS metric,
  COUNT(*)           AS count
FROM artifacts;

-- C.2 — Breakdown by artifact kind (sanity check — should see brief, forecast,
-- client_update, internal_doc, strategy_plan, etc.)
SELECT
  artifact_kind,
  COUNT(*)           AS count,
  MIN(generated_at)  AS earliest,
  MAX(generated_at)  AS latest
FROM artifacts
GROUP BY artifact_kind
ORDER BY count DESC;

-- C.3 — Breakdown by project — confirms multi-tenant scoping is preserved
SELECT
  project_id,
  COUNT(*)           AS artifact_count,
  COUNT(DISTINCT campaign_id) FILTER (WHERE campaign_id IS NOT NULL) AS campaigns,
  COUNT(DISTINCT keyword)     FILTER (WHERE keyword     IS NOT NULL) AS distinct_keywords
FROM artifacts
GROUP BY project_id
ORDER BY artifact_count DESC
LIMIT 20;

-- C.4 — Full-text search smoke test. Should return any artifact containing
-- the word "audit" in title, keyword, or body. Replace 'audit' with any
-- term you'd actually search for once data is in.
SELECT
  id,
  artifact_kind,
  title,
  keyword,
  ts_rank(search_vector, plainto_tsquery('english', 'audit')) AS rank
FROM artifacts
WHERE search_vector @@ plainto_tsquery('english', 'audit')
ORDER BY rank DESC, generated_at DESC
LIMIT 10;

-- C.5 — Confirm the search_vector trigger is firing for new inserts
-- (a row inserted with body 'test content' should have a populated search_vector)
SELECT
  id,
  title,
  CASE
    WHEN search_vector IS NULL                THEN 'MISSING — trigger not firing!'
    WHEN length(search_vector::text) < 10     THEN 'TOO SHORT — partial population'
    ELSE 'OK'
  END AS search_vector_health
FROM artifacts
LIMIT 5;
