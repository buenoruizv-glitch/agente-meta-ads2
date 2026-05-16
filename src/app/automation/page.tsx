'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { LoadingSkeleton, EmptyState } from '@/components/ui';
import { Zap, Plus, Trash2, ToggleLeft, ToggleRight, Play, AlertCircle } from 'lucide-react';

interface AutomationRule {
  id: string; name: string; enabled: boolean; entity: string;
  conditions: Array<{ metric: string; operator: string; value: number }>;
  action: string; actionParams?: Record<string, unknown>;
  createdAt: string; triggerCount?: number;
}

const ACTION_LABELS: Record<string, string> = {
  pause: '⏸️ Pausar', activate: '▶️ Activar',
  increase_budget: '📈 Aumentar presupuesto', decrease_budget: '📉 Reducir presupuesto',
  notify: '🔔 Notificar',
};

const METRIC_LABELS: Record<string, string> = {
  ctr: 'CTR', cpc: 'CPC (€)', roas: 'ROAS', frequency: 'Frecuencia',
  spend: 'Gasto (€)', impressions: 'Impresiones', conversions: 'Conversiones',
};

const OP_LABELS: Record<string, string> = {
  gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=',
};

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ triggered: number; evaluated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New Rule Modal State
  const [showModal, setShowModal] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '', entity: 'campaign', metric: 'roas', operator: 'lt', value: '', action: 'pause'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/automation')
      .then(r => r.json())
      .then(d => {
        setRules(d.rules || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Error al cargar las reglas. Comprueba tu conexión.');
        setLoading(false);
      });
  }, []);

  const toggleRule = async (rule: AutomationRule) => {
    setError(null);
    try {
      const res = await fetch('/api/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar la regla');
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta regla?')) return;
    setError(null);
    try {
      const res = await fetch('/api/automation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('No se pudo eliminar la regla');
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const runNow = async () => {
    setRunning(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch('/api/automation/run', { method: 'POST' });
      if (!res.ok) throw new Error('Error al ejecutar las reglas');
      const data = await res.json();
      setLastResult({ triggered: data.triggered, evaluated: data.evaluated });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRunning(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.name || !newRule.value) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: newRule.name,
        enabled: true,
        entity: newRule.entity,
        conditions: [{
          metric: newRule.metric,
          operator: newRule.operator,
          value: parseFloat(newRule.value)
        }],
        action: newRule.action,
        notifySlack: true
      };

      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Error al crear la regla');
      const data = await res.json();
      setRules(prev => [data.rule, ...prev]);
      setShowModal(false);
      setNewRule({ name: '', entity: 'campaign', metric: 'roas', operator: 'lt', value: '', action: 'pause' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Automatización</h1>
          <p className="page-subtitle">Reglas automáticas basadas en KPIs — se evalúan cada 6h</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={runNow} disabled={running || loading}>
            <Play size={13} /> {running ? 'Evaluando...' : 'Ejecutar ahora'}
          </button>
          <a href="/chat" className="btn btn-secondary btn-sm"><Plus size={13} /> Asistente IA</a>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Plus size={13} /> Nueva regla (Manual)
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-red)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {lastResult && (
        <div style={{
          background: 'var(--status-green-bg)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '20px',
          fontSize: '13px', color: 'var(--status-green)',
        }}>
          ✅ Evaluación completada: {lastResult.evaluated} reglas analizadas, <strong>{lastResult.triggered} acciones ejecutadas</strong>
        </div>
      )}

      {/* KPI Thresholds reference */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={16} color="var(--brand-primary)" /> Umbrales de referencia (guía Meta MCP)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { metric: 'CTR', bad: '< 0.5%', ok: '0.5–1.5%', good: '> 1.5%', action: 'Pausar / Escalar' },
            { metric: 'CPC', bad: '> €2', ok: '€0.80–€2', good: '< €0.80', action: 'Optimizar / Escalar' },
            { metric: 'ROAS', bad: '< 2x', ok: '2x–3.5x', good: '> 3.5x', action: 'Pausar / +15% budget' },
            { metric: 'Frecuencia', bad: '> 4', ok: '2.5–4', good: '< 2.5', action: 'Rotar creatividades' },
          ].map(t => (
            <div key={t.metric} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
              <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '13px' }}>{t.metric}</div>
              <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ color: 'var(--status-red)' }}>🔴 {t.bad}</span>
                <span style={{ color: 'var(--status-yellow)' }}>🟡 {t.ok}</span>
                <span style={{ color: 'var(--status-green)' }}>🟢 {t.good}</span>
                <span style={{ color: 'var(--text-muted)', marginTop: '4px' }}>→ {t.action}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rules list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? <LoadingSkeleton rows={5} height={80} /> :
         rules.length === 0 ? (
           <EmptyState icon="⚡" title="Sin reglas" description="Crea tu primera regla de automatización" />
         ) : rules.map(rule => (
          <div key={rule.id} className="card" style={{
            display: 'flex', alignItems: 'center', gap: '16px',
            opacity: rule.enabled ? 1 : 0.6,
          }}>
            <button onClick={() => toggleRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              {rule.enabled
                ? <ToggleRight size={24} color="var(--status-green)" />
                : <ToggleLeft size={24} color="var(--text-muted)" />}
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>{rule.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px' }}>
                  📋 {rule.entity}
                </span>
                {rule.conditions.map((cond, i) => (
                  <span key={i} style={{ background: 'rgba(37,99,235,0.15)', padding: '2px 8px', borderRadius: '4px', color: '#93c5fd' }}>
                    {METRIC_LABELS[cond.metric] || cond.metric} {OP_LABELS[cond.operator]} {cond.value}
                    {cond.metric === 'ctr' || cond.metric === 'frequency' ? '' : cond.metric === 'cpc' ? '€' : ''}
                  </span>
                ))}
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '4px', color: 'var(--status-green)' }}>
                  {ACTION_LABELS[rule.action] || rule.action}
                  {rule.action === 'increase_budget' && rule.actionParams?.percentage ? ` +${rule.actionParams.percentage}%` : ''}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
              {rule.triggerCount !== undefined && <div>{rule.triggerCount} ejecuciones</div>}
              <div>{new Date(rule.createdAt).toLocaleDateString('es-ES')}</div>
            </div>

            <button className="btn btn-ghost btn-sm" onClick={() => deleteRule(rule.id)} title="Eliminar regla">
              <Trash2 size={13} color="var(--status-red)" />
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '24px'
        }}>
          <div className="card card-glass animate-in" style={{ width: '100%', maxWidth: '440px', padding: '32px', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: '-50px', right: '-50px',
              width: '150px', height: '150px', background: 'var(--brand-primary)',
              filter: 'blur(80px)', opacity: 0.15, borderRadius: '50%', pointerEvents: 'none'
            }} />
            
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', fontFamily: 'Space Grotesk, sans-serif' }}>
              Nueva Regla Manual
            </h2>
            
            <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', zIndex: 1 }}>
              <div className="form-group">
                <label className="label">Nombre de la regla</label>
                <input required type="text" className="input" placeholder="Ej: Pausar campañas con bajo rendimiento" 
                       value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="label">Entidad a evaluar</label>
                <select className="input" value={newRule.entity} onChange={e => setNewRule({...newRule, entity: e.target.value})}>
                  <option value="campaign">Campaña</option>
                  <option value="adset">Conjunto de anuncios</option>
                  <option value="ad">Anuncio</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">Métrica</label>
                  <select className="input" value={newRule.metric} onChange={e => setNewRule({...newRule, metric: e.target.value})}>
                    {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Operador</label>
                  <select className="input" value={newRule.operator} onChange={e => setNewRule({...newRule, operator: e.target.value})}>
                    {Object.entries(OP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Valor</label>
                  <input required type="number" step="0.01" className="input" placeholder="0.00"
                         value={newRule.value} onChange={e => setNewRule({...newRule, value: e.target.value})} />
                </div>
              </div>

              <div className="form-group">
                <label className="label">Acción automática</label>
                <select className="input" value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})}>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={saving}>
                  {saving ? <span className="loading-dots"><span></span><span></span><span></span></span> : 'Guardar Regla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
