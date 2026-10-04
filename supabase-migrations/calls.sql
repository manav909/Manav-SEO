-- Calls: booking, call notes and tracked actions (api/lib/client-calls.ts).
-- Works with any calendar — invites go out as .ics attachments.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS call_settings (
  id             integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- one row
  host_name      text        NOT NULL DEFAULT 'Manvisha',
  host_email     text,
  timezone       text        NOT NULL DEFAULT 'America/Chicago',
  slot_minutes   integer     NOT NULL DEFAULT 20,
  notice_hours   integer     NOT NULL DEFAULT 12,     -- no bookings sooner than this
  horizon_days   integer     NOT NULL DEFAULT 14,     -- how far ahead clients can book
  meeting_link   text,                                -- your standing Google Meet / Zoom link
  weekly_hours   jsonb       NOT NULL DEFAULT '[{"weekday":2,"start":"10:00","end":"12:00"},{"weekday":4,"start":"16:00","end":"18:00"}]'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO call_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS client_calls (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  client_user_id  uuid,
  starts_at       timestamptz NOT NULL,
  minutes         integer     NOT NULL DEFAULT 20,
  topic           text,
  status          text        NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','done')),
  meeting_link    text,
  transcript      text,
  summary         text,
  summary_draft   text,
  summary_sent_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_calls_project ON client_calls (project_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS client_calls_starts  ON client_calls (starts_at);
-- One live booking per time slot.
CREATE UNIQUE INDEX IF NOT EXISTS client_calls_slot_unique ON client_calls (starts_at) WHERE status = 'booked';

CREATE TABLE IF NOT EXISTS call_actions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid,
  project_id  uuid        NOT NULL,
  what        text        NOT NULL,
  owner       text        NOT NULL DEFAULT 'team' CHECK (owner IN ('team','client')),
  due_date    date,
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_actions_project ON call_actions (project_id, status);

ALTER TABLE call_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_calls  ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_actions  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON call_settings;
DROP POLICY IF EXISTS "No public access" ON client_calls;
DROP POLICY IF EXISTS "No public access" ON call_actions;
CREATE POLICY "No public access" ON call_settings FOR ALL USING (false);
CREATE POLICY "No public access" ON client_calls  FOR ALL USING (false);
CREATE POLICY "No public access" ON call_actions  FOR ALL USING (false);
