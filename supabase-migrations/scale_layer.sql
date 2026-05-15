-- Scale Layer: white-label and partner config
CREATE TABLE IF NOT EXISTS tenants (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  plan          text DEFAULT 'agency' CHECK(plan IN('agency','enterprise','partner')),
  config        jsonb DEFAULT '{}',
  branding      jsonb DEFAULT '{}',
  api_quota     integer DEFAULT 1000,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- Link projects to tenants for multi-tenant support
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS projects_tenant ON projects(tenant_id);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc" ON tenants FOR ALL USING (true);
-- Intelligence sharing between tenants (partner network)
CREATE TABLE IF NOT EXISTS shared_patterns (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_tenant   uuid REFERENCES tenants(id),
  pattern_id      uuid REFERENCES empire_patterns(id) ON DELETE CASCADE,
  shared_at       timestamptz DEFAULT now(),
  anonymised      boolean DEFAULT true
);
ALTER TABLE shared_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc" ON shared_patterns FOR ALL USING (true);