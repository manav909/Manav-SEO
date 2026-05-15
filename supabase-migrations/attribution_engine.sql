CREATE TABLE IF NOT EXISTS attribution_log (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id              text NOT NULL,
  task_type            text NOT NULL,
  task_title           text,
  completed_at         timestamptz NOT NULL,
  verified_at          timestamptz,
  metric_before        jsonb DEFAULT '{}',
  metric_after         jsonb DEFAULT '{}',
  delta                jsonb DEFAULT '{}',
  attribution_confidence integer DEFAULT 50,
  days_to_impact       integer,
  notes                text,
  created_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attr_project  ON attribution_log(project_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS attr_tasktype ON attribution_log(task_type, days_to_impact);
ALTER TABLE attribution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc" ON attribution_log FOR ALL USING (true);
CREATE OR REPLACE VIEW task_timing_model AS
  SELECT task_type, COUNT(*) sample_size,
    ROUND(AVG(days_to_impact)) avg_days,
    ROUND(AVG(attribution_confidence)) avg_confidence
  FROM attribution_log WHERE days_to_impact IS NOT NULL
  GROUP BY task_type ORDER BY sample_size DESC;