-- Site health & new-website checklist (api/lib/site-foundations.ts).
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS site_checks (
  project_id  uuid        NOT NULL,
  check_key   text        NOT NULL,
  label       text        NOT NULL,
  status      text        NOT NULL CHECK (status IN ('good','todo','in_progress','unknown')),
  detail      text,
  source      text        NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','team')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, check_key)
);

ALTER TABLE site_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON site_checks;
CREATE POLICY "No public access" ON site_checks FOR ALL USING (false);
