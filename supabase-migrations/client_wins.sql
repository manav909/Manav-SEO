-- Proof & delight: wins/milestones and daily keyword history
-- (api/lib/client-wins.ts). Safe to run more than once.

CREATE TABLE IF NOT EXISTS client_wins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  kind        text        NOT NULL,          -- page_one | clicks_record | goal_reached | order_delivered | custom
  title       text        NOT NULL,
  detail      text,
  dedupe_key  text        NOT NULL,          -- one win per event, however often the detector runs
  happened_at timestamptz NOT NULL DEFAULT now(),
  created_by  text,                          -- 'system' or a team email
  thanks      text,
  thanked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS client_wins_project ON client_wins (project_id, happened_at DESC);

CREATE TABLE IF NOT EXISTS keyword_history (
  project_id  uuid    NOT NULL,
  query       text    NOT NULL,
  day         date    NOT NULL,
  position    numeric,
  clicks      integer,
  impressions integer,
  PRIMARY KEY (project_id, query, day)
);
CREATE INDEX IF NOT EXISTS keyword_history_project_day ON keyword_history (project_id, day DESC);

ALTER TABLE client_wins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON client_wins;
DROP POLICY IF EXISTS "No public access" ON keyword_history;
CREATE POLICY "No public access" ON client_wins     FOR ALL USING (false);
CREATE POLICY "No public access" ON keyword_history FOR ALL USING (false);
