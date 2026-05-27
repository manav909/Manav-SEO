-- ═══════════════════════════════════════════════════════════════════
-- Site Manager Migration
-- Run in Supabase Dashboard → SQL Editor BEFORE deploying code
-- ═══════════════════════════════════════════════════════════════════

-- Site workspaces — independent of project, optionally linked
CREATE TABLE IF NOT EXISTS dev_sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  label       TEXT NOT NULL,
  domain      TEXT,
  cms         TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pages within a site
CREATE TABLE IF NOT EXISTS dev_pages (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                     UUID NOT NULL REFERENCES dev_sites(id) ON DELETE CASCADE,
  project_id                  UUID REFERENCES projects(id) ON DELETE SET NULL,
  url                         TEXT NOT NULL,
  title                       TEXT,
  page_type                   TEXT DEFAULT 'other',
  priority                    INTEGER DEFAULT 50,
  status                      TEXT DEFAULT 'pending',
  -- Baseline captured before any work
  baseline_lcp_ms             NUMERIC,
  baseline_tbt_ms             NUMERIC,
  baseline_score              INTEGER,
  baseline_gsc_clicks         INTEGER,
  baseline_gsc_impressions    INTEGER,
  baseline_gsc_position       NUMERIC,
  baseline_captured_at        TIMESTAMPTZ,
  -- Current state updated after fixes
  current_lcp_ms              NUMERIC,
  current_tbt_ms              NUMERIC,
  current_score               INTEGER,
  issues_red                  INTEGER DEFAULT 0,
  issues_amber                INTEGER DEFAULT 0,
  last_audited_at             TIMESTAMPTZ,
  audit_run_id                TEXT,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Template fixes — one fix applies to many pages
CREATE TABLE IF NOT EXISTS dev_template_fixes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID NOT NULL REFERENCES dev_sites(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,
  fix_type            TEXT,
  title               TEXT NOT NULL,
  cms_platform        TEXT,
  affected_page_ids   JSONB DEFAULT '[]',
  affected_count      INTEGER DEFAULT 0,
  fix_code            TEXT,
  analysis            TEXT,
  apply_instructions  TEXT,
  status              TEXT DEFAULT 'pending',
  client_approved     BOOLEAN DEFAULT FALSE,
  client_approved_at  TIMESTAMPTZ,
  client_thread       JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Link dev_tasks to pages and template fixes
ALTER TABLE dev_tasks ADD COLUMN IF NOT EXISTS page_id           UUID REFERENCES dev_pages(id) ON DELETE SET NULL;
ALTER TABLE dev_tasks ADD COLUMN IF NOT EXISTS template_fix_id   UUID REFERENCES dev_template_fixes(id) ON DELETE SET NULL;

-- Extend seo_campaigns for campaign objectives
ALTER TABLE seo_campaigns ADD COLUMN IF NOT EXISTS goal_metric       TEXT;
ALTER TABLE seo_campaigns ADD COLUMN IF NOT EXISTS goal_target       NUMERIC;
ALTER TABLE seo_campaigns ADD COLUMN IF NOT EXISTS goal_baseline     NUMERIC;
ALTER TABLE seo_campaigns ADD COLUMN IF NOT EXISTS goal_deadline     DATE;
ALTER TABLE seo_campaigns ADD COLUMN IF NOT EXISTS target_locations  JSONB;
ALTER TABLE seo_campaigns ADD COLUMN IF NOT EXISTS site_id           UUID REFERENCES dev_sites(id) ON DELETE SET NULL;
-- campaign_type, parent_campaign_id, target_urls already exist

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dev_pages_site_id    ON dev_pages(site_id);
CREATE INDEX IF NOT EXISTS idx_dev_pages_url        ON dev_pages(site_id, url);
CREATE INDEX IF NOT EXISTS idx_dev_tasks_page_id    ON dev_tasks(page_id);
CREATE INDEX IF NOT EXISTS idx_dev_sites_project    ON dev_sites(project_id);
