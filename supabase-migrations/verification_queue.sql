CREATE TABLE IF NOT EXISTS verification_queue (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id       text NOT NULL,
  card_type     text NOT NULL,
  card_title    text NOT NULL,
  card_snapshot jsonb DEFAULT '{}',
  site_url      text,
  check_type    text NOT NULL DEFAULT 'standard',
  scheduled_for timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','executing','done','failed','skipped')),
  attempts      int DEFAULT 0,
  verdict       text,
  evidence      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vq_status_scheduled
  ON verification_queue(status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS vq_project
  ON verification_queue(project_id, created_at DESC);

ALTER TABLE verification_queue
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service key full access"
  ON verification_queue FOR ALL
  USING (true);
