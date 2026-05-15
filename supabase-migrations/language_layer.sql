ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS market   text DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';
CREATE INDEX IF NOT EXISTS projects_language ON projects(language);