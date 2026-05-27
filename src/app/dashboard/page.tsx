'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import KPICard from '@/components/KPICard';
import { LoadingSkeleton, CampaignStatusBadge, MetricCell } from '@/components/ui';
import { Zap, AlertTriangle, Play, ShieldAlert } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useClient } from '@/contexts/ClientContext';

interface AccountKPIs {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  frequency: number;
  conversions: number;
  status: { ctr: string; cpc: string; roas: string; frequency: string };
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  kpis?: AccountKPIs;
}

export default function DashboardPage() {
  const { currentClient } = useClient();
  const [kpis, setKPIs] = useState<AccountKPIs | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAutomation, setRunningAutomation] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [tokenDaysLeft, setTokenDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!currentClient) return;
    
    setLoading(true);
    Promise.all([
      apiFetch('/api/analytics?scope=account&date_preset=last_7d').then(r => r.json()),
      apiFetch('/api/campaigns?insights=true&date_preset=last_7d').then(r => r.json()),
      apiFetch('/api/settings/verify').then(r => r.json()).catch(() => null),
    ]).then(([analyticsData, campaignsData, tokenData]) => {
      setKPIs(analyticsData.kpis);
      setCampaigns((campaignsData.campaigns || []).slice(0, 8));
      if (tokenData?.daysLeft != null) setTokenDaysLeft(tokenData.daysLeft);
      else if (tokenData?.valid === false) setTokenDaysLeft(-1);
    }).finally(() => setLoading(false));
  }, [currentClient?.id]);

  const runAutomation = async () => {
    setRunningAutomation(true);
    try {
      await apiFetch('/api/automation/run', { method: 'POST' });
      setLastRun(new Date().toLocaleTimeString('es-ES'));
    } finally {
      setRunningAutomation(false);
    }
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'PAUSED').length;

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Visión general de tu cuenta de Meta Ads •{' '}
            <span style={{ color: 'var(--status-green)' }}>●</span> Agente activo
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={runAutomation}
            disabled={runningAutomation}
          >
            <Zap size={14} />
            {runningAutomation ? 'Evaluando...' : 'Ejecutar automatización'}
          </button>
          <a href="/chat" className="btn btn-primary">
            <span>🤖</span> Hablar con el agente
          </a>
        </div>
      </div>

      {/* Token expiry banner */}
      {tokenDaysLeft != null && tokenDaysLeft < 14 && (
        <div style={{
          background: tokenDaysLeft < 0 ? 'rgba(239,68,68,0.12)' : tokenDaysLeft < 7 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
          border: `1px solid ${tokenDaysLeft < 7 ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`,
          borderRadius: 'var(--radius-sm)', padding: '10px 16px',
          fontSize: '13px', color: tokenDaysLeft < 7 ? 'var(--status-red)' : 'var(--status-yellow)',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <ShieldAlert size={16} />
          {tokenDaysLeft < 0
            ? <>⚠️ El token de Meta ha <strong>caducado</strong>. Las campañas no se están monitorizando. <a href="/settings" style={{ textDecoration: 'underline' }}>Renovar en Configuración →</a></>
            : <>⚠️ El token de Meta caduca en <strong>{tokenDaysLeft} días</strong>. <a href="/settings" style={{ textDecoration: 'underline' }}>Renovarlo en Configuración →</a></>
          }
        </div>
      )}

      {lastRun && (
        <div style={{
          background: 'var(--status-green-bg)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 16px',
          fontSize: '13px',
          color: 'var(--status-green)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          ✅ Automatización ejecutada a las {lastRun}. Revisa el log en la sección de Automatización.
        </div>
      )}

      {/* KPI Grid */}
      {loading ? (
        <div className="grid-4" style={{ marginBottom: '24px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="kpi-card"><LoadingSkeleton rows={3} height={16} /></div>
          ))}
        </div>
      ) : (
        <div className="grid-4" style={{ marginBottom: '24px' }}>
          <KPICard
            label="Gasto total (7d)"
            value={kpis?.spend ?? 0}
            format="currency"
            icon="💸"
            status="neutral"
          />
          <KPICard
            label="ROAS"
            value={kpis?.roas ?? 0}
            format="multiplier"
            icon="📈"
            status={(kpis?.status.roas as 'green' | 'yellow' | 'red') ?? 'neutral'}
            sub={kpis?.roas ? (kpis.roas >= 3.5 ? 'Excelente' : kpis.roas >= 2 ? 'Aceptable' : '⚠️ Por debajo del umbral') : undefined}
            trend={kpis?.roas && kpis.roas >= 3.5 ? 'up' : 'down'}
          />
          <KPICard
            label="CTR"
            value={kpis?.ctr ?? 0}
            format="percent"
            icon="👆"
            status={(kpis?.status.ctr as 'green' | 'yellow' | 'red') ?? 'neutral'}
          />
          <KPICard
            label="CPC"
            value={kpis?.cpc ?? 0}
            format="currency"
            icon="🎯"
            status={(kpis?.status.cpc as 'green' | 'yellow' | 'red') ?? 'neutral'}
          />
        </div>
      )}

      {/* Secondary KPIs */}
      <div className="grid-3" style={{ marginBottom: '32px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '32px' }}>🎭</div>
          <div>
            <div className="kpi-label">Frecuencia</div>
            <div className="kpi-value" style={{ fontSize: '22px' }}>
              {loading ? '—' : kpis?.frequency.toFixed(2) ?? '—'}
            </div>
            <div className="kpi-sub">
              {kpis && kpis.frequency > 4
                ? <span className="text-red">⚠️ Saturación alta</span>
                : kpis && kpis.frequency > 3.5
                ? <span className="text-yellow">Vigilar</span>
                : <span className="text-green">Saludable</span>}
            </div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Play size={32} color="var(--status-green)" />
          <div>
            <div className="kpi-label">Campañas activas</div>
            <div className="kpi-value" style={{ fontSize: '22px' }}>{loading ? '—' : activeCampaigns}</div>
            <div className="kpi-sub">{loading ? '' : `${pausedCampaigns} pausadas`}</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '32px' }}>🔄</span>
          <div>
            <div className="kpi-label">Conversiones</div>
            <div className="kpi-value" style={{ fontSize: '22px' }}>{loading ? '—' : kpis?.conversions ?? 0}</div>
            <div className="kpi-sub">Últimos 7 días</div>
          </div>
        </div>
      </div>

      {/* Campaigns table */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Últimas campañas</h2>
        <a href="/campaigns" className="btn btn-ghost btn-sm">Ver todas →</a>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Estado</th>
              <th>CTR</th>
              <th>CPC</th>
              <th>ROAS</th>
              <th>Frec.</th>
              <th>Gasto</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '32px' }}><LoadingSkeleton rows={5} /></td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No hay campañas. Conecta tu cuenta de Meta Ads en Configuración.
              </td></tr>
            ) : campaigns.map(c => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.objective}</div>
                </td>
                <td><CampaignStatusBadge status={c.status} /></td>
                <td>{c.kpis ? <MetricCell value={c.kpis.ctr} format="percent" status={c.kpis.status.ctr as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.cpc} format="currency" status={c.kpis.status.cpc as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.roas} format="multiplier" status={c.kpis.status.roas as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.frequency} format="number" status={c.kpis.status.frequency as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.spend} format="currency" /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
