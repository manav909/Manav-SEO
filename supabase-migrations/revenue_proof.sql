-- Revenue tracking and proof of value
CREATE TABLE IF NOT EXISTS revenue_metrics (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recorded_at     timestamptz DEFAULT now(),
  organic_sessions   integer DEFAULT 0,
  organic_value_usd  numeric(10,2) DEFAULT 0,
  leads_generated    integer DEFAULT 0,
  revenue_attributed numeric(12,2) DEFAULT 0,
  traffic_value_model jsonb DEFAULT '{}',
  source          text DEFAULT 'manual',
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rev_project ON revenue_metrics(project_id, recorded_at DESC);
ALTER TABLE revenue_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc" ON revenue_metrics FOR ALL USING (true);