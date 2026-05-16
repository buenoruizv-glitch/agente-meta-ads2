-- 20240517_logs_and_costs.sql
-- Tablas para el historial de ejecuciones y control de costes IA

CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  agent          TEXT NOT NULL, -- 'gemini' | 'claude' | 'system'
  step           TEXT NOT NULL, -- 'fetching_data', 'analyzing_metrics', 'expert_analysis', etc.
  details        TEXT,          -- Descripción legible de la acción
  tokens_input   INT DEFAULT 0,
  tokens_output  INT DEFAULT 0,
  cost_usd       NUMERIC(10, 6) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own execution logs"
  ON agent_execution_logs FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_agent_logs_user_date
  ON agent_execution_logs(user_id, created_at DESC);

-- Función para obtener resumen de costes (útil para el dashboard)
CREATE OR REPLACE VIEW agent_cost_summary AS
SELECT 
  user_id,
  DATE_TRUNC('day', created_at) as day,
  DATE_TRUNC('month', created_at) as month,
  agent,
  SUM(cost_usd) as total_cost,
  SUM(tokens_input + tokens_output) as total_tokens
FROM agent_execution_logs
GROUP BY user_id, day, month, agent;
