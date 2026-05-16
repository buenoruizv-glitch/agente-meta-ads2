import { supabase } from './supabase';
import { supabaseAdmin } from './supabase';
import { AutomationRule, RuleEvaluationResult } from './automation-engine';
import type { ExpertSuggestion } from './expert-analysis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  client_id: string;
  user_id: string;
  type: string;
  priority: string;
  title: string;
  summary: string | null;
  report_data: Record<string, unknown> | null;
  status: string;
  created_at: string;
  read_at: string | null;
  expires_at: string | null;
}

export interface SuggestionRow {
  id: string;
  client_id: string;
  user_id: string;
  notification_id: string;
  campaign_id: string;
  campaign_name: string | null;
  priority: string;
  suggested_action: string;
  action_value: Record<string, unknown> | null;
  ai_title: string;
  ai_reasoning: string;
  expected_outcome: string | null;
  metrics_snapshot: Record<string, unknown> | null;
  status: string;
  applied_at: string | null;
  created_at: string;
}

export interface MonitoringScheduleRow {
  id: string;
  client_id: string;
  user_id: string;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_status: string;
  last_run_summary: string | null;
  campaigns_checked: number;
  suggestions_generated: number;
  claude_invoked: boolean;
  current_phase: string;
  updated_at: string;
}

export interface ExecutionLogRow {
  id: string;
  client_id: string;
  user_id: string;
  agent: string;
  step: string;
  details: string | null;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  created_at: string;
}

export interface CostSummaryRow {
  client_id: string;
  day: string;
  month: string;
  agent: string;
  total_cost: number;
  total_tokens: number;
}

export async function getClient(clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateClient(clientId: string, updates: any) {
  const { data, error } = await supabase
    .from('clients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getClientRules(clientId: string): Promise<AutomationRule[]> {
  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('client_id', clientId);

  if (error) throw error;
  
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    entity: row.entity_type,
    conditions: row.conditions,
    action: row.action,
    actionParams: row.action_params,
    notifySlack: row.notify_slack,
    createdAt: row.created_at,
    lastTriggered: row.last_triggered_at,
    triggerCount: row.trigger_count
  }));
}

export async function saveAutomationLog(clientId: string, result: RuleEvaluationResult) {
  const { error } = await supabase
    .from('automation_logs')
    .insert({
      rule_id: result.ruleId.startsWith('default-') ? null : result.ruleId,
      client_id: clientId,
      entity_id: result.entityId,
      entity_name: result.entityName,
      triggered: result.triggered,
      action_taken: result.triggered ? result.action : null,
      metrics_at_trigger: result.metrics,
      error_message: result.error,
      created_at: result.timestamp
    });

  if (error) {
    console.error('Error saving automation log:', error);
  }
}

export async function incrementRuleTriggerCount(ruleId: string) {
  if (ruleId.startsWith('default-')) return;

  const { error } = await supabase.rpc('increment_rule_count', { row_id: ruleId });
  
  if (error) {
    const { data: rule } = await supabase
      .from('automation_rules')
      .select('trigger_count')
      .eq('id', ruleId)
      .single();
      
    await supabase
      .from('automation_rules')
      .update({ 
        trigger_count: (rule?.trigger_count || 0) + 1,
        last_triggered_at: new Date().toISOString()
      })
      .eq('id', ruleId);
  }
}

export async function saveCampaignSnapshot(clientId: string, snapshot: {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  roas: number;
}) {
  const { error } = await supabase
    .from('campaign_snapshots')
    .insert({
      client_id: clientId,
      ...snapshot,
      snapshot_date: new Date().toISOString().split('T')[0]
    });

  if (error) throw error;
}

// ─── Monitoring Schedule ──────────────────────────────────────────────────────

export async function upsertMonitoringSchedule(
  clientId: string,
  updates: Partial<Omit<MonitoringScheduleRow, 'id' | 'client_id' | 'user_id'>>
) {
  const { error } = await supabase
    .from('monitoring_schedule')
    .upsert({ client_id: clientId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'client_id' });
  if (error) console.error('upsertMonitoringSchedule error:', error.message);
}

export async function getMonitoringSchedule(clientId: string): Promise<MonitoringScheduleRow | null> {
  const { data, error } = await supabase
    .from('monitoring_schedule')
    .select('*')
    .eq('client_id', clientId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function createNotification(
  clientId: string,
  notification: {
    type: string;
    priority: string;
    title: string;
    summary?: string;
    report_data?: Record<string, unknown>;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('agent_notifications')
    .insert({ client_id: clientId, ...notification })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getNotifications(clientId: string, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('agent_notifications')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('agent_notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) console.error('markNotificationRead error:', error.message);
}

export async function getUnreadCount(clientId: string): Promise<number> {
  const { count, error } = await supabase
    .from('agent_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'unread');
  if (error) return 0;
  return count || 0;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

export async function saveSuggestions(
  clientId: string,
  notificationId: string,
  suggestions: ExpertSuggestion[],
  metricsSnapshot: Record<string, unknown>
) {
  if (suggestions.length === 0) return;
  const rows = suggestions.map(s => ({
    client_id: clientId,
    notification_id: notificationId,
    campaign_id: s.campaign_id,
    campaign_name: s.campaign_name,
    priority: s.priority,
    suggested_action: s.action,
    action_value: s.action_value,
    ai_title: s.ai_title,
    ai_reasoning: s.ai_reasoning,
    expected_outcome: s.expected_outcome,
    metrics_snapshot: metricsSnapshot,
  }));
  const { error } = await supabase.from('agent_suggestions').insert(rows);
  if (error) throw error;
}

export async function getSuggestions(clientId: string, status = 'pending'): Promise<SuggestionRow[]> {
  const { data, error } = await supabase
    .from('agent_suggestions')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getSuggestionById(id: string): Promise<SuggestionRow | null> {
  const { data, error } = await supabase
    .from('agent_suggestions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function updateSuggestionStatus(id: string, status: 'applied' | 'dismissed') {
  const { error } = await supabase
    .from('agent_suggestions')
    .update({ status, applied_at: status === 'applied' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

// ─── Active Users for Cron ────────────────────────────────────────────────────

/**
 * Devuelve todos los clientes con token de Meta configurado.
 * Usa supabaseAdmin (service role) para poder leer todos los perfiles.
 */
export async function getAllActiveClients(): Promise<Array<{
  id: string;
  user_id: string;
  name: string;
  meta_access_token: string;
  meta_ad_account_id: string;
  anthropic_api_key: string | null;
  settings: Record<string, unknown>;
}>> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('clients')
    .select('id, user_id, name, meta_access_token, meta_ad_account_id, anthropic_api_key, settings')
    .not('meta_access_token', 'is', null)
    .not('meta_ad_account_id', 'is', null);
  if (error) throw error;
  return (data || []) as any[];
}

// ─── Logs & Costs ─────────────────────────────────────────────────────────────

export async function logAgentActivity(log: {
  client_id: string;
  agent: string;
  step: string;
  details?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
}) {
  const client = supabaseAdmin || supabase;
  const { error } = await client
    .from('agent_execution_logs')
    .insert(log);
  if (error) console.error('logAgentActivity error:', error.message);
}

export async function getAgentLogs(clientId: string, limit = 50): Promise<ExecutionLogRow[]> {
  const { data, error } = await supabase
    .from('agent_execution_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('getAgentLogs error:', error.message);
    return [];
  }
  return data || [];
}

export async function getCostSummary(clientId: string): Promise<CostSummaryRow[]> {
  const { data, error } = await supabase
    .from('agent_cost_summary')
    .select('*')
    .eq('client_id', clientId)
    .order('day', { ascending: false });
  if (error) {
    console.error('getCostSummary error:', error.message);
    return [];
  }
  return data || [];
}
