'use client';
import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Save, Eye, EyeOff, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

import { useClient } from '@/contexts/ClientContext';

export default function SettingsPage() {
  const { currentClient } = useClient();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  
  const [form, setForm] = useState({
    metaToken: '', adAccountId: '', anthropicKey: '', geminiKey: '',
    preferredModel: 'gemini', // 'gemini' or 'claude'
    slackWebhook: '', sheetsId: '', notionKey: '',
    // KPI thresholds
    ctrBad: 0.5, ctrGood: 1.5,
    cpcBad: 2.0, cpcGood: 0.8,
    roasBad: 2.0, roasGood: 3.5,
    freqBad: 4.0, freqGood: 2.5,
    // Automation
    automationEnabled: true, checkIntervalHours: 6,
    budgetScalePct: 15,
  });

  useEffect(() => {
    async function loadSettings() {
      if (!currentClient) return;
      setLoading(true);
      try {
        const res = await apiFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings && Object.keys(data.settings).length > 0) {
            setForm(prev => ({ ...prev, ...data.settings }));
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [currentClient?.id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      
      if (!res.ok) {
        throw new Error('No se pudo guardar la configuración');
      }
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Hubo un error al guardar. Por favor, inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }));

  if (loading) {
    return (
      <AppLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Credenciales de API, umbrales KPI y preferencias del agente</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="animate-spin" size={14} /> Guardando...</> : 
           saved ? <><CheckCircle size={14} /> Guardado</> : 
           <><Save size={14} /> Guardar cambios</>}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-red)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>

        {/* Meta API */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📘</span> Meta Ads API
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="label">Token de acceso de Meta</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showToken ? 'text' : 'password'}
                  placeholder="EAAxxxxxxx..."
                  value={form.metaToken}
                  onChange={e => set('metaToken', e.target.value)}
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Necesitas permisos: <code>ads_management, ads_read, business_management</code>
              </div>
            </div>
            <div className="form-group">
              <label className="label">ID de cuenta publicitaria</label>
              <input className="input" placeholder="act_123456789" value={form.adAccountId} onChange={e => set('adAccountId', e.target.value)} />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Debe empezar por <code>act_</code></div>
            </div>
          </div>
        </div>

        {/* Preferred AI Model */}
        <div className="card" style={{ border: '1px solid var(--primary-light)', background: 'rgba(59, 130, 246, 0.05)' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧠</span> Cerebro del Agente
          </div>
          <div className="form-group">
            <label className="label">Modelo inteligente predeterminado</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className={`btn ${form.preferredModel === 'gemini' ? 'btn-primary' : 'btn-outline'}`} 
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => set('preferredModel', 'gemini')}
              >
                Google Gemini (Gratis)
              </button>
              <button 
                className={`btn ${form.preferredModel === 'claude' ? 'btn-primary' : 'btn-outline'}`} 
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => set('preferredModel', 'claude')}
              >
                Anthropic Claude (Tokens)
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              El modelo seleccionado se usará para el chat y para el seguimiento automático de campañas.
            </div>
          </div>
        </div>

        {/* Claude AI */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🤖</span> Claude AI (Anthropic)
          </div>
          <div className="form-group">
            <label className="label">API Key de Anthropic</label>
            <input className="input" type="password" placeholder="sk-ant-..." value={form.anthropicKey} onChange={e => set('anthropicKey', e.target.value)} />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Obtén tu clave en <code>console.anthropic.com</code></div>
          </div>
        </div>

        {/* Gemini AI */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✨</span> Google Gemini AI
          </div>
          <div className="form-group">
            <label className="label">API Key de Google Gemini</label>
            <input className="input" type="password" placeholder="AIza..." value={form.geminiKey} onChange={e => set('geminiKey', e.target.value)} />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Obtén tu clave en <code>aistudio.google.com</code></div>
          </div>
        </div>

        {/* KPI Thresholds */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📊</span> Umbrales de KPI personalizados
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {[
              { key: 'ctr', label: 'CTR (%)', bad: 'ctrBad', good: 'ctrGood', badLabel: 'Malo (pausa)', goodLabel: 'Excelente (escalar)' },
              { key: 'cpc', label: 'CPC (€)', bad: 'cpcBad', good: 'cpcGood', badLabel: 'Malo (pausa)', goodLabel: 'Excelente (escalar)' },
              { key: 'roas', label: 'ROAS (x)', bad: 'roasBad', good: 'roasGood', badLabel: 'Malo (pausa)', goodLabel: 'Excelente (+budget)' },
              { key: 'freq', label: 'Frecuencia', bad: 'freqBad', good: 'freqGood', badLabel: 'Saturación (rotar)', goodLabel: 'Saludable' },
            ].map(({ key, label, bad, good, badLabel, goodLabel }) => (
              <div key={key}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', color: 'var(--text-secondary)' }}>{label}</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" style={{ color: 'var(--status-red)' }}>{badLabel}</label>
                    <input className="input" type="number" step="0.1"
                      value={(form as Record<string, unknown>)[bad] as number}
                      onChange={e => set(bad, parseFloat(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" style={{ color: 'var(--status-green)' }}>{goodLabel}</label>
                    <input className="input" type="number" step="0.1"
                      value={(form as Record<string, unknown>)[good] as number}
                      onChange={e => set(good, parseFloat(e.target.value))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Automation config */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚙️</span> Automatización
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="label">Intervalo de revisión (horas)</label>
              <select className="input" value={form.checkIntervalHours} onChange={e => set('checkIntervalHours', parseInt(e.target.value))}>
                <option value="1">Cada hora</option>
                <option value="3">Cada 3 horas</option>
                <option value="6">Cada 6 horas</option>
                <option value="12">Cada 12 horas</option>
                <option value="24">Una vez al día</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">% escalado de presupuesto</label>
              <input className="input" type="number" min="5" max="50" step="5"
                value={form.budgetScalePct} onChange={e => set('budgetScalePct', parseInt(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Integrations */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔌</span> Integraciones opcionales
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="label">Slack Webhook URL</label>
              <input className="input" type="url" placeholder="https://hooks.slack.com/services/..." value={form.slackWebhook} onChange={e => set('slackWebhook', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Google Sheets ID</label>
              <input className="input" placeholder="1BxiMVs0..." value={form.sheetsId} onChange={e => set('sheetsId', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Notion API Key</label>
              <input className="input" type="password" placeholder="secret_..." value={form.notionKey} onChange={e => set('notionKey', e.target.value)} />
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="animate-spin" size={16} /> Guardando...</> :
           saved ? <><CheckCircle size={16} /> Guardado correctamente</> : 
           <><Save size={16} /> Guardar configuración</>}
        </button>
      </div>
    </AppLayout>
  );
}

