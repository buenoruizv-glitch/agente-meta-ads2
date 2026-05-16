'use client';
import { apiFetch } from '@/lib/api-client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Bell, CheckCircle, XCircle, AlertTriangle, TrendingUp,
  TrendingDown, Loader2, RefreshCw, ChevronDown, ChevronUp,
  Zap, Info, BarChart2, Clock
} from 'lucide-react';

interface Suggestion {
  id: string;
  campaign_id: string;
  campaign_name: string;
  priority: 'urgent' | 'warning' | 'opportunity';
  suggested_action: string;
  action_value: Record<string, number> | null;
  ai_title: string;
  ai_reasoning: string;
  expected_outcome: string | null;
  metrics_snapshot: Record<string, Record<string, number>> | null;
  status: string;
  created_at: string;
}

interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  summary: string | null;
  report_data: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

type FilterType = 'all' | 'urgent' | 'warning' | 'opportunity' | 'reports';

const PRIORITY_CONFIG = {
  urgent: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: '🔴 Urgente', icon: AlertTriangle },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: '🟡 Aviso', icon: AlertTriangle },
  opportunity: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', label: '🟢 Oportunidad', icon: TrendingUp },
  info: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.25)', label: '📊 Informe', icon: BarChart2 },
};

const ACTION_LABELS: Record<string, string> = {
  pause: '⏸ Pausar campaña',
  increase_budget: '📈 Aumentar presupuesto',
  decrease_budget: '📉 Reducir presupuesto',
  rotate_creative: '🎨 Rotar creatividades',
  expand_lal: '👥 Crear audiencia LAL',
  check_delivery: '🔍 Revisar entrega',
  activate: '▶️ Activar campaña',
};

import { useClient } from '@/contexts/ClientContext';

export default function NotificationsPage() {
  const { currentClient } = useClient();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentClient) return;
    setLoading(true);
    try {
      const [sugRes, notifRes] = await Promise.all([
        apiFetch('/api/notifications/suggestions'),
        apiFetch('/api/notifications/list'),
      ]);
      if (sugRes.ok) setSuggestions(await sugRes.json());
      if (notifRes.ok) setNotifications(await notifRes.json());
    } catch {
      setErrorMsg('No se pudieron cargar las notificaciones');
    } finally {
      setLoading(false);
    }
  }, [currentClient?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApply = async (suggestionId: string, campaignName: string) => {
    setApplyingId(suggestionId);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/actions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: suggestionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al aplicar');
      setSuccessMsg(data.result || `Acción aplicada en "${campaignName}"`);
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setApplyingId(null);
    }
  };

  const handleDismiss = async (suggestionId: string) => {
    try {
      await apiFetch('/api/actions/apply', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: suggestionId }),
      });
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    } catch { /* silent */ }
  };

  const filteredSuggestions = suggestions.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'reports') return false;
    return s.priority === filter;
  });

  const filteredNotifs = notifications.filter(n => {
    if (filter === 'reports') return ['daily_report', 'weekly_report'].includes(n.type);
    if (filter === 'all') return ['daily_report', 'weekly_report'].includes(n.type);
    return false;
  });

  const urgentCount = suggestions.filter(s => s.priority === 'urgent').length;
  const oppCount = suggestions.filter(s => s.priority === 'opportunity').length;
  const warnCount = suggestions.filter(s => s.priority === 'warning').length;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Centro de Notificaciones</h1>
          <p className="page-subtitle">Sugerencias del agente · Aprueba o descarta con un clic</p>
        </div>
        <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Mensajes de estado */}
      {successMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', marginBottom: '20px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', marginBottom: '20px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <XCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* Resumen rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Urgentes', count: urgentCount, color: '#ef4444', filter: 'urgent' as FilterType },
          { label: 'Avisos', count: warnCount, color: '#f59e0b', filter: 'warning' as FilterType },
          { label: 'Oportunidades', count: oppCount, color: '#10b981', filter: 'opportunity' as FilterType },
          { label: 'Informes', count: filteredNotifs.length, color: '#60a5fa', filter: 'reports' as FilterType },
        ].map(item => (
          <button
            key={item.filter}
            onClick={() => setFilter(item.filter)}
            style={{
              background: filter === item.filter ? `${item.color}20` : 'var(--bg-card)',
              border: `1px solid ${filter === item.filter ? item.color : 'var(--border-subtle)'}`,
              borderRadius: '12px', padding: '14px 16px', cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 800, color: item.color }}>{item.count}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.label}</div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(['all', 'urgent', 'warning', 'opportunity', 'reports'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={filter === f ? 'btn btn-primary' : 'btn btn-outline'}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {f === 'all' ? 'Todas' : f === 'urgent' ? '🔴 Urgentes' : f === 'warning' ? '🟡 Avisos' : f === 'opportunity' ? '🟢 Oportunidades' : '📊 Informes'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Sugerencias de acción */}
          {filteredSuggestions.map(s => {
            const config = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG.info;
            const isExpanded = expandedId === s.id;
            const isApplying = applyingId === s.id;
            const metrics = s.metrics_snapshot?.[s.campaign_id];

            return (
              <div key={s.id} className="card" style={{ border: `1px solid ${config.border}`, background: config.bg, transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    {/* Badge + campaña */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <span style={{ background: config.color, color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px' }}>
                        {config.label}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.campaign_name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        <Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />
                        {new Date(s.created_at).toLocaleDateString('es-ES')}
                      </span>
                    </div>

                    {/* Título */}
                    <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>{s.ai_title}</div>

                    {/* Acción sugerida */}
                    <div style={{ fontSize: '13px', color: config.color, fontWeight: 600, marginBottom: '8px' }}>
                      {ACTION_LABELS[s.suggested_action] || s.suggested_action}
                      {s.action_value?.percentage && ` (${s.action_value.percentage}%)`}
                    </div>

                    {/* Razonamiento (expandible) */}
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {s.ai_reasoning}
                    </div>

                    {/* Resultado esperado + métricas (expandido) */}
                    {isExpanded && (
                      <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                        {s.expected_outcome && (
                          <div style={{ fontSize: '12px', color: '#10b981', marginBottom: '8px' }}>
                            <strong>Resultado esperado:</strong> {s.expected_outcome}
                          </div>
                        )}
                        {metrics && (
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {Object.entries(metrics).map(([k, v]) => (
                              <div key={k} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '10px' }}>{k}</span>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {typeof v === 'number' ? v.toFixed(2) : v}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
                    <button
                      onClick={() => handleApply(s.id, s.campaign_name)}
                      disabled={isApplying}
                      style={{
                        background: config.color, color: '#fff', border: 'none',
                        borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
                        fontWeight: 700, fontSize: '13px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', gap: '6px',
                        opacity: isApplying ? 0.7 : 1, transition: 'all 0.2s',
                      }}
                    >
                      {isApplying ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                      {isApplying ? 'Aplicando...' : 'Aplicar'}
                    </button>
                    <button
                      onClick={() => handleDismiss(s.id)}
                      disabled={isApplying}
                      style={{
                        background: 'transparent', border: '1px solid var(--border-subtle)',
                        borderRadius: '8px', padding: '7px 14px', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: '12px', transition: 'all 0.2s',
                      }}
                    >
                      Descartar
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '11px' }}
                    >
                      {isExpanded ? <><ChevronUp size={12} /> Menos</> : <><ChevronDown size={12} /> Más info</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Notificaciones de informes */}
          {filteredNotifs.map(n => {
            const isExpanded = expandedId === n.id;
            const rd = n.report_data as any;
            const isWeekly = n.type === 'weekly_report';

            return (
              <div key={n.id} className="card" style={{ border: '1px solid rgba(96,165,250,0.2)', background: 'rgba(96,165,250,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ background: 'rgba(96,165,250,0.2)', color: '#60a5fa', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px' }}>
                        {isWeekly ? '📊 Informe Semanal' : '📋 Informe Diario'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(n.created_at).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>{n.title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{n.summary}</div>

                    {isExpanded && rd && (
                      <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                        {isWeekly && rd.key_learnings && (
                          <>
                            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>📌 Aprendizajes clave</div>
                            <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {rd.key_learnings.map((l: string, i: number) => (
                                <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{l}</li>
                              ))}
                            </ul>
                            {rd.next_week_priorities && (
                              <>
                                <div style={{ fontWeight: 600, fontSize: '13px', margin: '12px 0 8px' }}>🎯 Prioridades próxima semana</div>
                                <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {rd.next_week_priorities.map((p: string, i: number) => (
                                    <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </>
                        )}
                        {rd.campaigns && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Campañas</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {(rd.campaigns as any[]).map((c: any) => (
                                <div key={c.id || c.name} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: '6px' }}>
                                  <span>{c.name}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>ROAS {c.roas?.toFixed(2)}x · {c.phase}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : n.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: '12px' }}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Estado vacío */}
          {filteredSuggestions.length === 0 && filteredNotifs.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Bell size={40} style={{ marginBottom: '16px', opacity: 0.3 }} />
              <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>
                {filter === 'all' ? 'Sin notificaciones pendientes' : `Sin ${filter === 'reports' ? 'informes' : filter === 'urgent' ? 'alertas urgentes' : 'notificaciones'}`}
              </div>
              <div style={{ fontSize: '13px' }}>El agente revisará tus campañas mañana a las 08:00</div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
