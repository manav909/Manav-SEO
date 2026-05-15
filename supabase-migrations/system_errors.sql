-- system_errors: lightweight error visibility table.
-- Populated by api/lib/db.ts logError() — called whenever a Supabase
-- query returns an error object in any API route.

CREATE TABLE IF NOT EXISTS system_errors (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source      text NOT NULL,    -- which api file triggered the error
  action      text,             -- which action/operation was running
  error_msg   text NOT NULL,
  error_code  text,
  project_id  uuid,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_errors_created
  ON system_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS system_errors_source
  ON system_errors(source, created_at DESC);

ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access" ON system_errors
  FOR ALL USING (false);
