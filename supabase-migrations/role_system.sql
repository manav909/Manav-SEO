-- Role-based access and AI voice calibration
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS team_roles jsonb DEFAULT '{}';
-- team_roles example: {"manav@example.com":"king","client@co.com":"client"}
CREATE TABLE IF NOT EXISTS role_notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_email  text NOT NULL,
  role        text NOT NULL CHECK(role IN('king','strategist','writer','client','executive')),
  event_type  text NOT NULL,
  message     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rn_user ON role_notifications(user_email, read_at);
ALTER TABLE role_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc" ON role_notifications FOR ALL USING (true);