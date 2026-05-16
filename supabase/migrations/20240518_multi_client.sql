-- 20240518_multi_client.sql
-- Migración para soporte Multi-Cliente (Multi-Tenant)

-- 1. Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  meta_access_token TEXT,
  meta_ad_account_id TEXT,
  anthropic_api_key TEXT,
  google_sheets_id TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own clients" ON clients FOR ALL USING (auth.uid() = user_id);

-- 2. Migrate existing profile settings to the first client "VanLovers"
INSERT INTO clients (user_id, name, meta_access_token, meta_ad_account_id, anthropic_api_key, google_sheets_id, settings)
SELECT 
  id as user_id, 
  'VanLovers' as name, 
  meta_access_token, 
  meta_ad_account_id, 
  anthropic_api_key, 
  google_sheets_id, 
  settings
FROM profiles;

-- 3. Drop migrated columns from profiles
ALTER TABLE profiles 
  DROP COLUMN IF EXISTS meta_access_token,
  DROP COLUMN IF EXISTS meta_ad_account_id,
  DROP COLUMN IF EXISTS anthropic_api_key,
  DROP COLUMN IF EXISTS google_sheets_id,
  DROP COLUMN IF EXISTS settings;

-- 4. Add client_id to all relevant tables and migrate data

-- 4.1. automation_rules
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
UPDATE automation_rules a
SET client_id = (SELECT id FROM clients c WHERE c.user_id = a.user_id LIMIT 1)
WHERE client_id IS NULL;

-- 4.2. automation_logs
ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
UPDATE automation_logs a
SET client_id = (SELECT id FROM clients c WHERE c.user_id = a.user_id LIMIT 1)
WHERE client_id IS NULL;

-- 4.3. campaign_snapshots
ALTER TABLE campaign_snapshots ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
UPDATE campaign_snapshots a
SET client_id = (SELECT id FROM clients c WHERE c.user_id = a.user_id LIMIT 1)
WHERE client_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_snapshots_client ON campaign_snapshots(client_id);

-- 4.4. agent_execution_logs
ALTER TABLE agent_execution_logs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
UPDATE agent_execution_logs a
SET client_id = (SELECT id FROM clients c WHERE c.user_id = a.user_id LIMIT 1)
WHERE client_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_logs_client_date ON agent_execution_logs(client_id, created_at DESC);

-- 4.5. agent_cost_summary
-- Since agent_cost_summary is a VIEW, we need to drop it and recreate it with client_id
DROP VIEW IF EXISTS agent_cost_summary;
CREATE OR REPLACE VIEW agent_cost_summary AS
SELECT 
  client_id,
  DATE_TRUNC('day', created_at) as day,
  DATE_TRUNC('month', created_at) as month,
  agent,
  SUM(cost_usd) as total_cost,
  SUM(tokens_input + tokens_output) as total_tokens
FROM agent_execution_logs
WHERE client_id IS NOT NULL
GROUP BY client_id, day, month, agent;

-- 4.6. agent_notifications
ALTER TABLE agent_notifications ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
UPDATE agent_notifications a
SET client_id = (SELECT id FROM clients c WHERE c.user_id = a.user_id LIMIT 1)
WHERE client_id IS NULL;

-- 4.7. agent_suggestions
ALTER TABLE agent_suggestions ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
UPDATE agent_suggestions a
SET client_id = (SELECT id FROM clients c WHERE c.user_id = a.user_id LIMIT 1)
WHERE client_id IS NULL;

-- 4.8. monitoring_schedule
ALTER TABLE monitoring_schedule ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
UPDATE monitoring_schedule a
SET client_id = (SELECT id FROM clients c WHERE c.user_id = a.user_id LIMIT 1)
WHERE client_id IS NULL;
-- Drop unique constraint on user_id, add unique constraint on client_id
ALTER TABLE monitoring_schedule DROP CONSTRAINT IF EXISTS monitoring_schedule_user_id_key;
ALTER TABLE monitoring_schedule ADD CONSTRAINT monitoring_schedule_client_id_key UNIQUE (client_id);
