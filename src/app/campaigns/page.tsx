'use client';
import { apiFetch } from '@/lib/api-client';
import { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { CampaignStatusBadge, MetricCell, LoadingSkeleton, EmptyState } from '@/components/ui';
import { RefreshCw, Play, Pause, Plus, Search, ClipboardList } from 'lucide-react';
import { useClient } from '@/contexts/ClientContext';

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  kpis?: {
    spend: number; ctr: number; cpc: number; roas: number;
    frequency: number; conversions: number;
    status: { ctr: string; cpc: string; roas: string; frequency: string };
  };
}

const OBJECTIVES: Record<string, string> = {
  CONVERSIONS: 'Conversiones', LINK_CLICKS: 'Tráfico', REACH: 'Alcance',
  LEAD_GENERATION: 'Leads', CATALOG_SALES: 'Catálogo',
  OUTCOME_TRAFFIC: 'Tráfico', OUTCOME_LEADS: 'Leads',
  OUTCOME_SALES: 'Ventas', OUTCOME_AWARENESS: 'Awareness',
};

export default function CampaignsPage() {
  const { currentClient } = useClient();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [datePreset, setDatePreset] = useState('last_7d');

  const fetchCampaigns = useCallback(async () => {
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

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const toggleStatus = async (c: Campaign) => {
    setUpdating(c.id);
    const action = c.status === 'ACTIVE' ? 'pause' : 'activate';
    await apiFetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: c.id, action }),
    });
    setCampaigns(prev => prev.map(x =>
      x.id === c.id ? { ...x, status: x.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } : x
    ));
    setUpdating(null);
  };

  const filtered = campaigns.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) &&
    (filterStatus === 'ALL' || c.status === filterStatus)
  );
  const totalSpend = campaigns.reduce((s, c) => s + (c.kpis?.spend || 0), 0);

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Campañas</h1>
          <p className="page-subtitle">{campaigns.filter(c => c.status === 'ACTIVE').length} activas · €{totalSpend.toFixed(2)} gastados</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchCampaigns} disabled={loading}>
            <RefreshCw size={13} />
          </button>
          <a href="/campaigns/new" className="btn btn-secondary btn-sm"><Plus size={13} /> Nueva (Manual)</a>
          <a href="/chat" className="btn btn-primary btn-sm"><Plus size={13} /> Nueva (IA)</a>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        <select className="input" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="ALL">Todos</option>
          <option value="ACTIVE">Activas</option>
          <option value="PAUSED">Pausadas</option>
        </select>
        <select className="input" style={{ width: 'auto' }} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
          <option value="last_7d">7 días</option>
          <option value="last_14d">14 días</option>
          <option value="last_30d">30 días</option>
          <option value="this_month">Este mes</option>
        </select>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Campaña</th><th>Estado</th><th>Objetivo</th>
              <th>Gasto</th><th>CTR</th><th>CPC</th><th>ROAS</th><th>Frec.</th><th>Conv.</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: '32px' }}><LoadingSkeleton rows={6} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10}>
                <EmptyState icon="📭" title="Sin campañas" description="Conecta tu cuenta de Meta Ads o crea una campaña con el agente IA"
                  action={<a href="/chat" className="btn btn-primary btn-sm">Crear con IA</a>} />
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.id}</div>
                </td>
                <td><CampaignStatusBadge status={c.status} /></td>
                <td><span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{OBJECTIVES[c.objective] || c.objective}</span></td>
                <td>{c.kpis ? <MetricCell value={c.kpis.spend} format="currency" /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.ctr} format="percent" status={c.kpis.status.ctr as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.cpc} format="currency" status={c.kpis.status.cpc as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.roas} format="multiplier" status={c.kpis.status.roas as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.frequency} format="number" status={c.kpis.status.frequency as 'green'} /> : '—'}</td>
                <td>{c.kpis ? <MetricCell value={c.kpis.conversions} /> : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <a href={`/preview?campaignId=${c.id}`} className="btn btn-ghost btn-sm" title="Ver resumen cliente">
                      <ClipboardList size={12} />
                    </a>
                    <button
                      className={`btn btn-sm ${c.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => toggleStatus(c)} disabled={updating === c.id}
                    >
                      {updating === c.id ? '...' : c.status === 'ACTIVE' ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--status-green)' }}>● Excelente</span>
        <span style={{ color: 'var(--status-yellow)' }}>● Aceptable</span>
        <span style={{ color: 'var(--status-red)' }}>● Bajo rendimiento</span>
        <span style={{ marginLeft: 'auto' }}>{filtered.length} campañas</span>
      </div>
    </AppLayout>
  );
}
