-- 20240517_notifications.sql
-- Tablas para el sistema de monitorización autónoma y notificaciones

-- 1. Notificaciones del Agente
CREATE TABLE IF NOT EXISTS agent_notifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('daily_report','weekly_report','alert','opportunity','info')),
  priority    TEXT NOT NULL DEFAULT 'info' CHECK (priority IN ('urgent','warning','opportunity','info')),
  title       TEXT NOT NULL,
  summary     TEXT,
  report_data JSONB,  -- datos estructurados del reporte / sugerencias agrupadas
  status      TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','actioned')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  read_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own notifications"
  ON agent_notifications FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_status
  ON agent_notifications(user_id, status, created_at DESC);

-- 2. Sugerencias de Acción con IA
CREATE TABLE IF NOT EXISTS agent_suggestions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE,
  notification_id  UUID REFERENCES agent_notifications(id) ON DELETE CASCADE,
  campaign_id      TEXT NOT NULL,
  campaign_name    TEXT,
  priority         TEXT NOT NULL CHECK (priority IN ('urgent','warning','opportunity')),
  suggested_action TEXT NOT NULL,  -- 'pause'|'increase_budget'|'decrease_budget'|'rotate_creative'|'expand_lal'|'check_delivery'
  action_value     JSONB,          -- { "new_budget": 5500 } ó { "percentage": 20 }
  ai_title         TEXT NOT NULL,  -- Título corto para la tarjeta (max 80 chars)
  ai_reasoning     TEXT NOT NULL,  -- Razonamiento de Claude (max 3 frases)
  expected_outcome TEXT,           -- "Se espera recuperar ROAS a 2.5x en 48h"
  metrics_snapshot JSONB,          -- KPIs en el momento del análisis
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed')),
  applied_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own suggestions"
  ON agent_suggestions FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_suggestions_user_status
  ON agent_suggestions(user_id, status, created_at DESC);

-- 3. Estado de Monitorización en Tiempo Real (una fila por usuario)
CREATE TABLE IF NOT EXISTS monitoring_schedule (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  last_run_at           TIMESTAMPTZ,
  next_run_at           TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  last_run_status       TEXT DEFAULT 'never_run',  -- 'ok'|'error'|'partial'|'all_green'
  last_run_summary      TEXT,  -- "4 campañas revisadas. 2 alertas."
  campaigns_checked     INT DEFAULT 0,
  suggestions_generated INT DEFAULT 0,
  claude_invoked        BOOLEAN DEFAULT FALSE,
  current_phase         TEXT DEFAULT 'idle',  -- 'idle'|'fetching'|'analyzing'|'saving'|'done'
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE monitoring_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own monitoring schedule"
  ON monitoring_schedule FOR ALL USING (auth.uid() = user_id);

-- Habilitar Supabase Realtime para la tabla de estado del agente
-- (ejecutar en Supabase Dashboard > Database > Replication si no funciona automáticamente)
ALTER PUBLICATION supabase_realtime ADD TABLE monitoring_schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_notifications;
