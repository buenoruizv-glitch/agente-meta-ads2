'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import KPICard from '@/components/KPICard';
import { LoadingSkeleton } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useClient } from '@/contexts/ClientContext';
import { apiFetch } from '@/lib/api-client';

interface CampaignAnalytic {
  campaign: { id: string; name: string; status: string };
  kpis: {
    spend: number; ctr: number; cpc: number; roas: number;
    frequency: number; conversions: number; impressions: number;
    status: { ctr: string; cpc: string; roas: string; frequency: string };
  } | null;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{value: number; name: string}>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' }}>
      <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: 'var(--text-primary)' }}>{p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong></div>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const { currentClient } = useClient();
  const [data, setData] = useState<{ campaigns: CampaignAnalytic[]; summary: { totalSpend: number; avgROAS: number; avgCTR: number; totalCampaigns: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState('last_30d');

  useEffect(() => {
    if (!currentClient) return;
    
    setLoading(true);
    apiFetch(`/api/analytics?scope=campaigns&date_preset=${datePreset}`)
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [datePreset, currentClient?.id]);

  const chartData = (data?.campaigns || [])
    .filter(c => c.kpis)
    .map(c => ({
      name: c.campaign.name.length > 16 ? c.campaign.name.slice(0, 16) + '…' : c.campaign.name,
      ROAS: parseFloat((c.kpis!.roas).toFixed(2)),
      CTR: parseFloat((c.kpis!.ctr).toFixed(2)),
      CPC: parseFloat((c.kpis!.cpc).toFixed(2)),
      Gasto: parseFloat((c.kpis!.spend).toFixed(2)),
    }))
    .sort((a, b) => b.ROAS - a.ROAS)
    .slice(0, 10);

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analítica</h1>
          <p className="page-subtitle">Rendimiento comparativo por campaña</p>
        </div>
        <select className="input" style={{ width: 'auto' }} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
          <option value="last_7d">7 días</option>
          <option value="last_14d">14 días</option>
          <option value="last_30d">30 días</option>
          <option value="this_month">Este mes</option>
          <option value="last_month">Mes pasado</option>
        </select>
      </div>

      {/* Summary KPIs */}
      <div className="grid-4" style={{ marginBottom: '28px' }}>
    {loading ? [...Array(4)].map((_, i) => <div key={i} className="kpi-card"><LoadingSkeleton rows={3} height={16} /></div>) : (
      <>
        <KPICard label="Gasto total" value={data?.summary?.totalSpend ?? 0} format="currency" icon="💸" />
        <KPICard label="ROAS promedio" value={data?.summary?.avgROAS ?? 0} format="multiplier" icon="📈"
          status={data?.summary?.avgROAS && data?.summary?.avgROAS >= 3.5 ? 'green' : data?.summary?.avgROAS && data?.summary?.avgROAS >= 2 ? 'yellow' : 'red'} />
        <KPICard label="CTR promedio" value={data?.summary?.avgCTR ?? 0} format="percent" icon="👆"
          status={data?.summary?.avgCTR && data?.summary?.avgCTR >= 1.5 ? 'green' : data?.summary?.avgCTR && data?.summary?.avgCTR >= 0.5 ? 'yellow' : 'red'} />
        <KPICard label="Campañas analizadas" value={data?.summary?.totalCampaigns ?? 0} icon="📊" />
      </>
    )}
      </div>

      {/* Charts */}
      {loading ? <LoadingSkeleton rows={8} height={30} /> : chartData.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          Sin datos de métricas. Verifica que tu token de Meta esté configurado correctamente.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* ROAS chart */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: '20px' }}>ROAS por campaña</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ROAS" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '11px' }}>
              <span style={{ color: 'var(--status-red)' }}>■ &lt; 2x Pausar</span>
              <span style={{ color: 'var(--status-yellow)' }}>■ 2–3.5x Aceptable</span>
              <span style={{ color: 'var(--status-green)' }}>■ &gt; 3.5x Escalar</span>
            </div>
          </div>

          {/* CTR vs CPC */}
          <div className="grid-2">
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: '20px' }}>CTR por campaña (%)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="CTR" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: '20px' }}>CPC por campaña (€)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="CPC" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Campaign ranking table */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: '16px' }}>Ranking de campañas por ROAS</div>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Campaña</th><th>ROAS</th><th>CTR</th><th>CPC</th><th>Gasto</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.campaigns || []).filter(c => c.kpis).sort((a, b) => (b.kpis!.roas) - (a.kpis!.roas)).slice(0, 10).map((c, i) => (
                    <tr key={c.campaign.id}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>#{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{c.campaign.name}</td>
                      <td style={{ fontWeight: 700, color: c.kpis!.roas >= 3.5 ? 'var(--status-green)' : c.kpis!.roas >= 2 ? 'var(--status-yellow)' : 'var(--status-red)' }}>
                        {c.kpis!.roas.toFixed(2)}x
                      </td>
                      <td style={{ color: c.kpis!.ctr >= 1.5 ? 'var(--status-green)' : c.kpis!.ctr >= 0.5 ? 'var(--status-yellow)' : 'var(--status-red)' }}>
                        {c.kpis!.ctr.toFixed(2)}%
                      </td>
                      <td>€{c.kpis!.cpc.toFixed(2)}</td>
                      <td>€{c.kpis!.spend.toFixed(2)}</td>
                      <td>
                        <span className={`badge ${c.campaign.status === 'ACTIVE' ? 'badge-green' : 'badge-yellow'}`}>
                          {c.campaign.status === 'ACTIVE' ? '● Activa' : '◆ Pausada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
