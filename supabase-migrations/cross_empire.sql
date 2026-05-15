-- Institutional knowledge: patterns proven across multiple projects
CREATE TABLE IF NOT EXISTS empire_patterns (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type   text NOT NULL,
  title          text NOT NULL,
  description    text,
  evidence       jsonb DEFAULT '[]',
  project_count  integer DEFAULT 0,
  confidence     integer DEFAULT 50,
  industry       text,
  cms            text,
  tags           text[] DEFAULT '{}',
  status         text DEFAULT 'active' CHECK(status IN('active','archived','testing')),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ep_type  ON empire_patterns(pattern_type,confidence DESC);
CREATE INDEX IF NOT EXISTS ep_tags  ON empire_patterns USING GIN(tags);
ALTER TABLE empire_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc" ON empire_patterns FOR ALL USING (true);