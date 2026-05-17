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

  if (error) {
    if (error.code === 'PGRST205') {
      // Fallback a profiles
      const { data: profile, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', clientId)
        .single();
        
      if (pError) throw pError;
      
      return {
        id: profile.id,
        user_id: profile.id,
        name: 'Cliente Principal (Fallback)',
        meta_access_token: profile.meta_access_token,
        meta_ad_account_id: profile.meta_ad_account_id,
        anthropic_api_key: profile.anthropic_api_key,
        google_sheets_id: null,
        settings: {},
        created_at: profile.created_at,
        updated_at: profile.updated_at
      };
    }
    throw error;
  }
  return data;
}

export async function updateClient(clientId: string, updates: any) {
  const { data, error } = await supabase
    .from('clients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST205') {
      // Fallback a profiles
      const profileUpdates: any = { updated_at: new Date().toISOString() };
      if (updates.meta_access_token !== undefined) profileUpdates.meta_access_token = updates.meta_access_token;
      if (updates.meta_ad_account_id !== undefined) profileUpdates.meta_ad_account_id = updates.meta_ad_account_id;
      if (updates.anthropic_api_key !== undefined) profileUpdates.anthropic_api_key = updates.anthropic_api_key;
      
      const { data: profile, error: pError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', clientId)
        .select()
        .single();

      if (pError) throw pError;

      return {
        id: profile.id,
        user_id: profile.id,
        name: 'Cliente Principal (Fallback)',
        meta_access_token: profile.meta_access_token,
        meta_ad_account_id: profile.meta_ad_account_id,
        anthropic_api_key: profile.anthropic_api_key,
        google_sheets_id: null,
        settings: {},
        created_at: profile.created_at,
        updated_at: profile.updated_at
      };
    }
    throw error;
  }
  return data;
}

export async function getClientRules(clientId: string): Promise<AutomationRule[]> {
  let data, error;
  const res = await supabase
    .from('automation_rules')
    .select('*')
    .eq('client_id', clientId);
    
  data = res.data;
  error = res.error;

  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbRes = await supabase
        .from('automation_rules')
        .select('*')
        .eq('user_id', clientId);
      data = fbRes.data;
      if (fbRes.error) throw fbRes.error;
    } else {
      throw error;
    }
  }
  
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
  const payload = {
    rule_id: result.ruleId.startsWith('default-') ? null : result.ruleId,
    client_id: clientId,
    entity_id: result.entityId,
    entity_name: result.entityName,
    triggered: result.triggered,
    action_taken: result.triggered ? result.action : null,
    metrics_at_trigger: result.metrics,
    error_message: result.error,
    created_at: result.timestamp
  };

  const { error } = await supabase.from('automation_logs').insert(payload);

  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbPayload = { ...payload, user_id: clientId };
      delete (fbPayload as any).client_id;
      await supabase.from('automation_logs').insert(fbPayload);
      return;
    }
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
  const payload = {
    client_id: clientId,
    ...snapshot,
    snapshot_date: new Date().toISOString().split('T')[0]
  };

  const { error } = await supabase.from('campaign_snapshots').insert(payload);

  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbPayload = { ...payload, user_id: clientId };
      delete (fbPayload as any).client_id;
      const { error: fbError } = await supabase.from('campaign_snapshots').insert(fbPayload);
      if (fbError) throw fbError;
      return;
    }
    throw error;
  }
}

// ─── Monitoring Schedule ──────────────────────────────────────────────────────

export async function upsertMonitoringSchedule(
  clientId: string,
  updates: Partial<Omit<MonitoringScheduleRow, 'id' | 'client_id' | 'user_id'>>
) {
  const { error } = await supabase
    .from('monitoring_schedule')
    .upsert({ client_id: clientId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'client_id' });
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const { error: fbError } = await supabase
        .from('monitoring_schedule')
        .upsert({ user_id: clientId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (fbError) console.error('upsertMonitoringSchedule fallback error:', fbError.message);
      return;
    }
    console.error('upsertMonitoringSchedule error:', error.message);
  }
}

export async function getMonitoringSchedule(clientId: string): Promise<MonitoringScheduleRow | null> {
  const { data, error } = await supabase
    .from('monitoring_schedule')
    .select('*')
    .eq('client_id', clientId)
    .single();
  if (error && error.code !== 'PGRST116') {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const { data: fbData, error: fbError } = await supabase
        .from('monitoring_schedule')
        .select('*')
        .eq('user_id', clientId)
        .single();
      if (fbError && fbError.code !== 'PGRST116') throw fbError;
      return fbData;
    }
    throw error;
  }
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
  const payload = { client_id: clientId, ...notification };
  let { data, error } = await supabase
    .from('agent_notifications')
    .insert(payload)
    .select('id')
    .single();
    
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbPayload = { ...notification, user_id: clientId };
      const fbRes = await supabase.from('agent_notifications').insert(fbPayload).select('id').single();
      if (fbRes.error) throw fbRes.error;
      data = fbRes.data;
    } else {
      throw error;
    }
  }
  return data?.id || '';
}

export async function getNotifications(clientId: string, limit = 50): Promise<NotificationRow[]> {
  let { data, error } = await supabase
    .from('agent_notifications')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbRes = await supabase
        .from('agent_notifications')
        .select('*')
        .eq('user_id', clientId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (fbRes.error) throw fbRes.error;
      data = fbRes.data;
    } else {
      throw error;
    }
  }
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
  let res = await supabase
    .from('agent_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'unread');
    
  if (res.error && (res.error.message.includes('client_id') || res.error.code === 'PGRST200')) {
    res = await supabase
      .from('agent_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', clientId)
      .eq('status', 'unread');
  }
  
  if (res.error) return 0;
  return res.count || 0;
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
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbRows = rows.map(r => {
        const row = { ...r, user_id: r.client_id };
        delete (row as any).client_id;
        return row;
      });
      const { error: fbError } = await supabase.from('agent_suggestions').insert(fbRows);
      if (fbError) throw fbError;
      return;
    }
    throw error;
  }
}

export async function getSuggestions(clientId: string, status = 'pending'): Promise<SuggestionRow[]> {
  let { data, error } = await supabase
    .from('agent_suggestions')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', status)
    .order('created_at', { ascending: false });
    
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbRes = await supabase
        .from('agent_suggestions')
        .select('*')
        .eq('user_id', clientId)
        .eq('status', status)
        .order('created_at', { ascending: false });
      if (fbRes.error) throw fbRes.error;
      data = fbRes.data;
    } else {
      throw error;
    }
  }
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
    
  if (error) {
    if (error.code === 'PGRST205') {
      const { data: profiles, error: pError } = await client
        .from('profiles')
        .select('id, meta_access_token, meta_ad_account_id, anthropic_api_key')
        .not('meta_access_token', 'is', null)
        .not('meta_ad_account_id', 'is', null);
        
      if (pError) throw pError;
      
      return (profiles || []).map(p => ({
        id: p.id,
        user_id: p.id,
        name: 'Cliente Principal (Fallback)',
        meta_access_token: p.meta_access_token,
        meta_ad_account_id: p.meta_ad_account_id,
        anthropic_api_key: p.anthropic_api_key,
        settings: {}
      }));
    }
    throw error;
  }
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
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fallbackLog = { ...log, user_id: log.client_id };
      delete (fallbackLog as any).client_id;
      await client.from('agent_execution_logs').insert(fallbackLog);
      return;
    }
    console.error('logAgentActivity error:', error.message);
  }
}

export async function getAgentLogs(clientId: string, limit = 50): Promise<ExecutionLogRow[]> {
  let { data, error } = await supabase
    .from('agent_execution_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200') {
      const fbRes = await supabase
        .from('agent_execution_logs')
        .select('*')
        .eq('user_id', clientId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (fbRes.error) {
        console.error('getAgentLogs error:', fbRes.error.message);
        return [];
      }
      return fbRes.data || [];
    }
    console.error('getAgentLogs error:', error.message);
    return [];
  }
  return data || [];
}

export async function getCostSummary(clientId: string): Promise<CostSummaryRow[]> {
  let { data, error } = await supabase
    .from('agent_cost_summary')
    .select('*')
    .eq('client_id', clientId)
    .order('day', { ascending: false });
    
  if (error) {
    if (error.message.includes('client_id') || error.code === 'PGRST200' || error.code === 'PGRST205') {
      return []; // Fallback empty if view fails
    }
    console.error('getCostSummary error:', error.message);
    return [];
  }
  return data || [];
}
