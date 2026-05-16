-- initial_schema.sql

-- 1. Profiles (User data & Credentials)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  meta_access_token TEXT,
  meta_ad_account_id TEXT,
  slack_webhook_url TEXT,
  anthropic_api_key TEXT,
  google_sheets_id TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  entity_type TEXT DEFAULT 'campaign', -- campaign, adset, ad
  conditions JSONB NOT NULL, -- [{metric: 'roas', operator: 'lt', value: 2}]
  action TEXT NOT NULL, -- pause, activate, increase_budget
  action_params JSONB, -- {percentage: 15}
  notify_slack BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ,
  trigger_count INT DEFAULT 0
);

-- Enable RLS for rules
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own rules" ON automation_rules FOR ALL USING (auth.uid() = user_id);

-- 3. Automation Logs
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  entity_id TEXT, -- Meta ID
  entity_name TEXT,
  triggered BOOLEAN DEFAULT FALSE,
  action_taken TEXT,
  metrics_at_trigger JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for logs
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own logs" ON automation_logs FOR SELECT USING (auth.uid() = user_id);

-- 4. Campaign Snapshots (Historical Tracking)
CREATE TABLE IF NOT EXISTS campaign_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  spend NUMERIC DEFAULT 0,
  clicks INT DEFAULT 0,
  impressions INT DEFAULT 0,
  conversions INT DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for snapshots
ALTER TABLE campaign_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own snapshots" ON campaign_snapshots FOR SELECT USING (auth.uid() = user_id);

-- Create a index on snapshots for performance
CREATE INDEX IF NOT EXISTS idx_campaign_snapshots_date ON campaign_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_campaign_snapshots_user ON campaign_snapshots(user_id);

-- RPC to increment trigger count safely
CREATE OR REPLACE FUNCTION increment_rule_count(row_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE automation_rules
  SET trigger_count = trigger_count + 1,
      last_triggered_at = NOW()
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END $$;
