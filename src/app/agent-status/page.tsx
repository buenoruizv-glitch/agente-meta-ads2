'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Activity, Clock, CheckCircle2, AlertCircle, RefreshCw,
  TrendingUp, Zap, Calendar, BarChart2, Loader2, Bot
} from 'lucide-react';

interface MonitoringSchedule {
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

const PHASE_CONFIG: Record<string, { label: string; color: string; pulse: boolean }> = {
  idle:      { label: 'En espera',          color: '#6b7280', pulse: false },
  fetching:  { label: '📡 Descargando datos', color: '#60a5fa', pulse: true },
  analyzing: { label: '🧠 Analizando con IA', color: '#a78bfa', pulse: true },
  saving:    { label: '💾 Guardando',         color: '#34d399', pulse: true },
  done:      { label: '✅ Completado',        color: '#10b981', pulse: false },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  never_run:  { label: 'Sin ejecutar aún',  color: '#6b7280', icon: Clock },
  all_green:  { label: 'Todo en orden',     color: '#10b981', icon: CheckCircle2 },
  ok:         { label: 'Completado',        color: '#10b981', icon: CheckCircle2 },
  partial:    { label: 'Parcial',           color: '#f59e0b', icon: AlertCircle },
  error:      { label: 'Con errores',       color: '#ef4444', icon: AlertCircle },
};

const TIMELINE = [
  { time: '08:00', label: 'Descarga de métricas', desc: 'Gemini obtiene datos de todas las campañas activas desde Meta API', agent: 'Gemini', color: '#60a5fa' },
  { time: '08:02', label: 'Cálculo de KPIs', desc: 'Se calculan ROAS, CTR, CPC, Frecuencia y Spend Pace para cada campaña', agent: 'Gemini', color: '#60a5fa' },
  { time: '08:03', label: 'Clasificación por fase', desc: 'Aprendizaje (0-7d) · Optimización (8-30d) · Escala (31-90d) · Madurez (+90d)', agent: 'Gemini', color: '#60a5fa' },
  { time: '08:04', label: 'Evaluación de umbrales', desc: 'Cada campaña se analiza con los umbrales específicos de su fase', agent: 'Gemini', color: '#60a5fa' },
  { time: '08:05', label: 'Análisis estratégico', desc: 'Si hay alertas, Claude recibe un brief compacto y genera sugerencias accionables', agent: 'Claude', color: '#a78bfa' },
  { time: '08:07', label: 'Guardado de notificaciones', desc: 'Sugerencias guardadas en Supabase. Listas para aplicar con un clic', agent: 'Sistema', color: '#34d399' },
  { time: 'Lunes\n08:00', label: 'Informe semanal estratégico', desc: 'Claude analiza la semana completa: aprendizajes, prioridades y recomendación de presupuesto', agent: 'Claude', color: '#a78bfa' },
];

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours}h`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatNextRun(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (diff < 0) return 'En breve...';
  return `En ${hours}h ${mins}min`;
}

export default function AgentStatusPage() {
  const [schedule, setSchedule] = useState<MonitoringSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggeringManual, setTriggeringManual] = useState(false);
  const [manualMsg, setManualMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/status');
      if (res.ok) {
        const data = await res.json();
        setSchedule(data.schedule);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Polling cada 10 segundos si está en fase activa
    const interval = setInterval(() => {
      if (schedule && ['fetching', 'analyzing', 'saving'].includes(schedule.current_phase)) {
        fetchStatus();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus, schedule?.current_phase]);

  const triggerManualRun = async () => {
    setTriggeringManual(true);
    setManualMsg(null);
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET || '';
      const res = await fetch('/api/cron/daily', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.ok) {
        setManualMsg('✅ Ciclo de monitorización iniciado. Actualizando estado...');
        setTimeout(fetchStatus, 3000);
      } else {
        setManualMsg('❌ No se pudo iniciar el ciclo manual');
      }
    } catch {
      setManualMsg('❌ Error de conexión');
    } finally {
      setTriggeringManual(false);
    }
  };

  const phase = schedule?.current_phase || 'idle';
  const phaseConfig = PHASE_CONFIG[phase] || PHASE_CONFIG.idle;
  const statusKey = schedule?.last_run_status || 'never_run';
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.never_run;
  const StatusIcon = statusConfig.icon;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Estado del Agente</h1>
          <p className="page-subtitle">Monitorización autónoma · Actualización diaria 08:00</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={fetchStatus} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button
            className="btn btn-primary"
            onClick={triggerManualRun}
            disabled={triggeringManual || ['fetching', 'analyzing', 'saving'].includes(phase)}
          >
            {triggeringManual ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Ejecutar ahora
          </button>
        </div>
      </div>

      {manualMsg && (
        <div style={{ padding: '12px 16px', background: manualMsg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${manualMsg.startsWith('✅') ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>
          {manualMsg}
        </div>
      )}

      {/* Estado actual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Fase actual */}
        <div className="card" style={{ borderColor: phaseConfig.color }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Estado actual</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {phaseConfig.pulse && (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: phaseConfig.color, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            )}
            <span style={{ fontWeight: 700, color: phaseConfig.color }}>{phaseConfig.label}</span>
          </div>
        </div>

        {/* Último resultado */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Último ciclo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <StatusIcon size={16} style={{ color: statusConfig.color }} />
            <span style={{ fontWeight: 700, color: statusConfig.color }}>{statusConfig.label}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{formatRelativeTime(schedule?.last_run_at || null)}</div>
        </div>

        {/* Próxima ejecución */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Próximo análisis</div>
          <div style={{ fontWeight: 700, fontSize: '18px', color: '#60a5fa' }}>{formatNextRun(schedule?.next_run_at || null)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {schedule?.next_run_at ? new Date(schedule.next_run_at).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'No programado'}
          </div>
        </div>

        {/* Stats */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Último ciclo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800 }}>{schedule?.campaigns_checked || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Campañas</div>
            </div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: schedule?.suggestions_generated ? '#a78bfa' : undefined }}>{schedule?.suggestions_generated || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sugerencias</div>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen del último ciclo */}
      {schedule?.last_run_summary && (
        <div className="card" style={{ marginBottom: '28px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Bot size={16} style={{ color: schedule.claude_invoked ? '#a78bfa' : '#60a5fa' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Resumen del último análisis</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {schedule.claude_invoked ? '🧠 Claude invocado' : '✨ Solo Gemini (gratis)'}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{schedule.last_run_summary}</div>
        </div>
      )}

      {/* Timeline del ciclo */}
      <div className="card" style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} style={{ color: 'var(--accent)' }} />
          Protocolo de Monitorización
        </h2>
        <div style={{ position: 'relative', paddingLeft: '0' }}>
          {TIMELINE.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: i < TIMELINE.length - 1 ? '0' : '0', position: 'relative' }}>
              {/* Línea vertical */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '80px', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'pre', textAlign: 'right', width: '100%', paddingBottom: '4px', fontWeight: 600 }}>{step.time}</div>
                {i < TIMELINE.length - 1 && <div style={{ width: '1px', flex: 1, background: 'var(--border-subtle)', minHeight: '32px', margin: '0 auto' }} />}
              </div>
              {/* Punto */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '2px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: step.color, flexShrink: 0, boxShadow: `0 0 0 3px ${step.color}20` }} />
                {i < TIMELINE.length - 1 && <div style={{ width: '1px', flex: 1, background: 'var(--border-subtle)', minHeight: '32px' }} />}
              </div>
              {/* Contenido */}
              <div style={{ flex: 1, paddingBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>{step.label}</span>
                  <span style={{ fontSize: '10px', background: `${step.color}20`, color: step.color, padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>{step.agent}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Arquitectura de coste */}
      <div className="card">
        <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={16} style={{ color: '#10b981' }} />
          Arquitectura de Coste Cero
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: '6px' }}>🆓 Gemini Flash</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Descarga datos · Calcula KPIs · Clasifica fases · Evalúa umbrales<br />
              <strong style={{ color: '#60a5fa' }}>Coste: 0€</strong>
            </div>
          </div>
          <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: '6px' }}>🧠 Claude Sonnet</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Solo si hay alertas · Brief de ~500 tokens · Respuesta JSON estructurada<br />
              <strong style={{ color: '#a78bfa' }}>~0.12€/mes con 4 campañas</strong>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Si todas las campañas están en verde → Claude no se invoca → <strong style={{ color: '#10b981' }}>coste = 0€</strong>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.3); } }`}</style>
    </AppLayout>
  );
}
