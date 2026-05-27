'use client';
import { apiFetch } from '@/lib/api-client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import { MetricCell, CampaignStatusBadge, LoadingSkeleton } from '@/components/ui';
import { RefreshCw, Copy, Check } from 'lucide-react';
import { useClient } from '@/contexts/ClientContext';

interface CampaignReport {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  stop_time?: string;
  kpis: {
    spend: number;
    clicks: number;
    impressions: number;
    ctr: number;
    cpc: number;
    roas: number;
    frequency: number;
    conversions: number;
    status: { ctr: string; cpc: string; roas: string; frequency: string };
  } | null;
}

const OBJECTIVES: Record<string, string> = {
  CONVERSIONS: 'Conversiones', LINK_CLICKS: 'Tráfico', REACH: 'Alcance',
  LEAD_GENERATION: 'Leads', CATALOG_SALES: 'Catálogo',
  OUTCOME_TRAFFIC: 'Tráfico', OUTCOME_LEADS: 'Leads',
  OUTCOME_SALES: 'Ventas', OUTCOME_AWARENESS: 'Awareness',
};

const DATE_LABELS: Record<string, string> = {
  last_7d: 'últimos 7 días', last_14d: 'últimos 14 días',
  last_30d: 'últimos 30 días', this_month: 'este mes',
};

function statusDot(s: string) {
  if (s === 'green') return <span style={{ color: 'var(--status-green)', fontWeight: 700 }}>●</span>;
  if (s === 'yellow') return <span style={{ color: 'var(--status-yellow)', fontWeight: 700 }}>●</span>;
  if (s === 'red') return <span style={{ color: 'var(--status-red)', fontWeight: 700 }}>●</span>;
  return null;
}

function parseBudget(raw?: string): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n / 100;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function BudgetCell({ c }: { c: CampaignReport }) {
  const daily = parseBudget(c.daily_budget);
  const lifetime = parseBudget(c.lifetime_budget);
  const endDate = formatDate(c.stop_time);

  return (
    <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
      {daily != null && (
        <div><span style={{ color: 'var(--text-muted)' }}>Diario:</span> <strong>€{daily.toFixed(2)}</strong></div>
      )}
      {lifetime != null && (
        <div><span style={{ color: 'var(--text-muted)' }}>Total:</span> <strong>€{lifetime.toFixed(2)}</strong></div>
      )}
      {c.stop_time && (
        <div><span style={{ color: 'var(--text-muted)' }}>Fin:</span> <strong>{endDate}</strong></div>
      )}
      {daily == null && lifetime == null && '—'}
    </div>
  );
}

function ReportPageInner() {
  const { currentClient } = useClient();
  const [campaigns, setCampaigns] = useState<CampaignReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState('last_7d');
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentClient) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/campaigns?insights=true&date_preset=${datePreset}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } finally {
      setLoading(false);
    }
  }, [datePreset, currentClient?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const active = campaigns.filter(c => c.status === 'ACTIVE');
  const totalSpend = campaigns.reduce((s, c) => s + (c.kpis?.spend || 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + (c.kpis?.conversions || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.kpis?.clicks || 0), 0);
  const avgRoas = active.filter(c => c.kpis?.roas).reduce((s, c, _, a) => s + (c.kpis?.roas || 0) / a.length, 0);
  const totalDailyBudget = active.reduce((s, c) => s + (parseBudget(c.daily_budget) || 0), 0);

  const copyReport = () => {
    const dateLabel = DATE_LABELS[datePreset] || datePreset;
    const lines: string[] = [
      `📊 INFORME DE CAMPAÑA — ${dateLabel.toUpperCase()}`,
      `Fecha: ${new Date().toLocaleDateString('es-ES')}`,
      '',
      `RESUMEN GENERAL`,
      `• Campañas activas: ${active.length}`,
      `• Gasto total (período): €${totalSpend.toFixed(2)}`,
      ...(totalDailyBudget > 0 ? [`• Presupuesto diario total: €${totalDailyBudget.toFixed(2)}`] : []),
      `• Conversiones: ${totalConversions}`,
      `• Clics totales: ${totalClicks}`,
      ...(avgRoas > 0 ? [`• ROAS promedio: ${avgRoas.toFixed(2)}x`] : []),
      '',
      `DETALLE POR CAMPAÑA`,
    ];
    for (const c of active) {
      if (!c.kpis) continue;
      const daily = parseBudget(c.daily_budget);
      const lifetime = parseBudget(c.lifetime_budget);
      lines.push(`\n▸ ${c.name}`);
      if (daily != null) lines.push(`  Presupuesto diario: €${daily.toFixed(2)}`);
      if (lifetime != null) lines.push(`  Presupuesto total: €${lifetime.toFixed(2)}`);
      if (c.stop_time) lines.push(`  Fecha fin: ${formatDate(c.stop_time)}`);
      lines.push(`  Gasto: €${c.kpis.spend.toFixed(2)} | Clics: ${c.kpis.clicks} | CTR: ${c.kpis.ctr.toFixed(2)}%`);
      lines.push(`  CPC: €${c.kpis.cpc.toFixed(2)} | Frecuencia: ${c.kpis.frequency.toFixed(1)} | ROAS: ${c.kpis.roas.toFixed(2)}x`);
      if (c.kpis.conversions > 0) lines.push(`  Conversiones: ${c.kpis.conversions}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Informe de Rendimiento</h1>
          <p className="page-subtitle">
            {active.length} campañas activas · €{totalSpend.toFixed(2)} gastados
            {totalDailyBudget > 0 && ` · €${totalDailyBudget.toFixed(2)}/día presupuestado`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select className="input" style={{ width: 'auto' }} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
            <option value="last_7d">7 días</option>
            <option value="last_14d">14 días</option>
            <option value="last_30d">30 días</option>
            <option value="this_month">Este mes</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={copyReport} disabled={loading || campaigns.length === 0}>
            {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar informe</>}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Gasto real', value: `€${totalSpend.toFixed(2)}` },
          { label: 'Presup. diario', value: totalDailyBudget > 0 ? `€${totalDailyBudget.toFixed(2)}` : '—' },
          { label: 'Conversiones', value: totalConversions.toString() },
          { label: 'Clics', value: totalClicks.toLocaleString() },
          { label: 'ROAS promedio', value: avgRoas > 0 ? `${avgRoas.toFixed(2)}x` : '—' },
          { label: 'Activas', value: active.length.toString() },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Campaign table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Estado</th>
              <th>Presupuesto</th>
              <th>Gasto</th>
              <th>Clics</th>
              <th>CTR</th>
              <th>CPC</th>
              <th>ROAS</th>
              <th>Frec.</th>
              <th>Conv.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: '32px' }}><LoadingSkeleton rows={5} /></td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                Sin datos de campañas
              </td></tr>
            ) : campaigns.map(c => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {OBJECTIVES[c.objective] || c.objective}
                  </div>
                </td>
                <td><CampaignStatusBadge status={c.status} /></td>
                <td><BudgetCell c={c} /></td>
                <td>{c.kpis ? <MetricCell value={c.kpis.spend} format="currency" /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.clicks} /> : '—'}</td>
                <td>
                  {c.kpis ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {statusDot(c.kpis.status.ctr)}
                      <MetricCell value={c.kpis.ctr} format="percent" />
                    </span>
                  ) : '—'}
                </td>
                <td>
                  {c.kpis ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {statusDot(c.kpis.status.cpc)}
                      <MetricCell value={c.kpis.cpc} format="currency" />
                    </span>
                  ) : '—'}
                </td>
                <td>
                  {c.kpis ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {statusDot(c.kpis.status.roas)}
                      <MetricCell value={c.kpis.roas} format="multiplier" />
                    </span>
                  ) : '—'}
                </td>
                <td>
                  {c.kpis ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {statusDot(c.kpis.status.frequency)}
                      <MetricCell value={c.kpis.frequency} format="number" />
                    </span>
                  ) : '—'}
                </td>
                <td>{c.kpis ? <MetricCell value={c.kpis.conversions} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--status-green)' }}>● Excelente</span>
        <span style={{ color: 'var(--status-yellow)' }}>● Aceptable</span>
        <span style={{ color: 'var(--status-red)' }}>● Bajo rendimiento</span>
        <span style={{ marginLeft: 'auto' }}>{campaigns.length} campañas · {DATE_LABELS[datePreset]}</span>
      </div>
    </AppLayout>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportPageInner />
    </Suspense>
  );
}
