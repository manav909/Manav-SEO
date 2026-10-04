-- "Talk to Manvisha": one message thread per client project
-- (see api/lib/client-panel.ts). Safe to run more than once.
-- Clients only ever see client + staff rows; ai_draft rows are
-- suggestions for the team and are never shown to clients.

CREATE TABLE IF NOT EXISTS client_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  client_user_id    uuid,
  author_type       text        NOT NULL CHECK (author_type IN ('client','staff','ai_draft')),
  author_label      text,
  staff_email       text,
  body              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','draft','used','discarded')),
  read_by_client_at timestamptz,
  read_by_staff_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_messages_project_created
  ON client_messages (project_id, created_at);
CREATE INDEX IF NOT EXISTS client_messages_recent
  ON client_messages (created_at DESC);

-- Only the server (service role) reads and writes this table.
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON client_messages;
CREATE POLICY "No public access" ON client_messages FOR ALL USING (false);
