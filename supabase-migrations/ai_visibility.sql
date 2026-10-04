-- AI visibility: how AI assistants answer the questions customers ask
-- (api/lib/ai-visibility.ts). Safe to run more than once.

CREATE TABLE IF NOT EXISTS ai_visibility_checks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  run_id      text        NOT NULL,
  engine      text        NOT NULL,      -- chatgpt | perplexity | gemini | claude
  question    text        NOT NULL,
  mentioned   boolean     NOT NULL DEFAULT false,   -- business name appears in the answer
  linked      boolean     NOT NULL DEFAULT false,   -- website appears in the answer or its sources
  excerpt     text,
  sources     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_visibility_checks_project ON ai_visibility_checks (project_id, created_at DESC);

-- Optional custom questions per project (otherwise built from real searches).
CREATE TABLE IF NOT EXISTS ai_visibility_questions (
  project_id  uuid        PRIMARY KEY,
  questions   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_visibility_checks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visibility_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON ai_visibility_checks;
DROP POLICY IF EXISTS "No public access" ON ai_visibility_questions;
CREATE POLICY "No public access" ON ai_visibility_checks    FOR ALL USING (false);
CREATE POLICY "No public access" ON ai_visibility_questions FOR ALL USING (false);
