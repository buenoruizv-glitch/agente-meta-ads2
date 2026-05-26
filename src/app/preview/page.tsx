'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { apiFetch } from '@/lib/api-client';
import { useClient } from '@/contexts/ClientContext';
import { RefreshCw, Copy, Check, ExternalLink } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────

interface AdCreative {
  type: 'video' | 'image';
  headline: string;
  primaryText: string;
  linkUrl: string;
  thumbnailUrl: string;
}

interface Ad {
  id: string;
  name: string;
  status: string;
  creative: AdCreative | null;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  optimizationGoal: string | null;
  promotedObject: { pixel_id?: string; custom_event_type?: string } | null;
  placements: string[];
  targeting: { ageMin: number; ageMax: number; geoLabel: string; interests: string[] };
  ads: Ad[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  dailyBudget: number | null;
  createdTime: string;
}

interface PreviewData { campaign: Campaign; adSets: AdSet[] }

// ─── Constants ────────────────────────────────────────────

const OBJECTIVES: Record<string, string> = {
  CONVERSIONS: 'Conversiones', LINK_CLICKS: 'Tráfico', REACH: 'Alcance',
  LEAD_GENERATION: 'Leads', CATALOG_SALES: 'Catálogo',
  OUTCOME_TRAFFIC: 'Tráfico', OUTCOME_LEADS: 'Leads',
  OUTCOME_SALES: 'Ventas', OUTCOME_AWARENESS: 'Alcance',
};

const PLACEMENT_LABELS: Record<string, string> = {
  FEED: 'Feed', STORIES: 'Stories', REELS: 'Reels',
};

const EVENT_LABELS: Record<string, string> = {
  PURCHASE: 'Compra', LEAD: 'Lead', VIEW_CONTENT: 'Ver contenido',
  ADD_TO_CART: 'Añadir al carrito', COMPLETE_REGISTRATION: 'Registro',
};

function statusColor(s: string) {
  if (s === 'ACTIVE') return 'var(--status-green)';
  if (s === 'PAUSED') return 'var(--status-yellow)';
  return 'var(--text-muted)';
}

function domain(url: string) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

// ─── Placement Mockups ────────────────────────────────────

function FeedMockup({ creative, adSetName }: { creative: AdCreative; adSetName: string }) {
  const pageName = adSetName.split('|')[0]?.trim() || 'Tu Marca';
  const thumb = creative.thumbnailUrl;

  return (
    <div style={{
      width: '280px', background: '#fff', borderRadius: '8px', overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.25)', fontFamily: 'Arial, sans-serif', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#050505', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pageName}</div>
          <div style={{ fontSize: '11px', color: '#65676b', display: 'flex', gap: '4px', alignItems: 'center' }}>
            Patrocinado · <span>🌐</span>
          </div>
        </div>
        <div style={{ color: '#65676b', fontSize: '18px', cursor: 'pointer' }}>···</div>
      </div>

      {/* Primary text */}
      {creative.primaryText && (
        <div style={{ padding: '0 12px 8px', fontSize: '13px', color: '#050505', lineHeight: '1.4', maxHeight: '58px', overflow: 'hidden' }}>
          {creative.primaryText.slice(0, 120)}{creative.primaryText.length > 120 ? '...' : ''}
        </div>
      )}

      {/* Media */}
      <div style={{ width: '100%', aspectRatio: '1/1', background: '#f0f2f5', position: 'relative', overflow: 'hidden' }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bcc0c4', fontSize: '12px' }}>Sin imagen</div>
        )}
        {creative.type === 'video' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderLeft: '16px solid #fff', marginLeft: '4px' }} />
            </div>
          </div>
        )}
      </div>

      {/* CTA bar */}
      <div style={{ background: '#f0f2f5', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          {creative.linkUrl && <div style={{ fontSize: '11px', color: '#65676b', textTransform: 'uppercase' }}>{domain(creative.linkUrl)}</div>}
          {creative.headline && <div style={{ fontSize: '14px', fontWeight: 600, color: '#050505', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{creative.headline}</div>}
        </div>
        <button style={{ background: '#e4e6eb', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, color: '#050505', cursor: 'pointer', flexShrink: 0 }}>
          Más info
        </button>
      </div>

      {/* Engagement bar */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #e4e6eb', display: 'flex', gap: '16px', fontSize: '13px', color: '#65676b' }}>
        <span>👍 Me gusta</span><span>💬 Comentar</span><span>↗ Compartir</span>
      </div>
    </div>
  );
}

function StoriesMockup({ creative, adSetName, isReel = false }: { creative: AdCreative; adSetName: string; isReel?: boolean }) {
  const pageName = adSetName.split('|')[0]?.trim() || 'Tu Marca';
  const thumb = creative.thumbnailUrl;

  return (
    <div style={{
      width: '157px', height: '280px', background: '#111', borderRadius: '12px', overflow: 'hidden',
      position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.4)', flexShrink: 0,
      fontFamily: 'Arial, sans-serif',
    }}>
      {/* Background image */}
      {thumb ? (
        <img src={thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' }} />
      )}

      {/* Overlay gradient */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.7) 100%)' }} />

      {/* Video play icon */}
      {creative.type === 'video' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '12px solid #fff', marginLeft: '3px' }} />
          </div>
        </div>
      )}

      {/* Progress bars */}
      <div style={{ position: 'absolute', top: '8px', left: '6px', right: '6px', display: 'flex', gap: '3px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: '2px', borderRadius: '2px', background: i === 1 ? '#fff' : 'rgba(255,255,255,0.4)' }} />
        ))}
      </div>

      {/* Top bar */}
      <div style={{ position: 'absolute', top: '18px', left: '8px', right: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', border: '1.5px solid #fff', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pageName}</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.75)' }}>Patrocinado</div>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>✕</span>
      </div>

      {/* Bottom content */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 10px 12px' }}>
        {creative.headline && (
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', marginBottom: '4px', lineHeight: '1.3', maxHeight: '28px', overflow: 'hidden' }}>{creative.headline}</div>
        )}
        {creative.primaryText && (
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.85)', marginBottom: '8px', maxHeight: '24px', overflow: 'hidden', lineHeight: '1.3' }}>
            {creative.primaryText.slice(0, 80)}
          </div>
        )}
        <button style={{ width: '100%', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '5px', padding: '6px', fontSize: '10px', fontWeight: 700, color: '#050505', cursor: 'pointer' }}>
          Más información
        </button>
      </div>

      {isReel && (
        <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          {['❤️', '💬', '↗'].map((icon, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontSize: '18px' }}>{icon}</span>
              <span style={{ fontSize: '8px', color: '#fff' }}>0</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ad Card ──────────────────────────────────────────────

function AdCard({ ad, placements, adSetName }: { ad: Ad; placements: string[]; adSetName: string }) {
  if (!ad.creative) return null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{ad.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor(ad.status), display: 'inline-block' }} />
            {ad.status} · {ad.creative.type === 'video' ? '🎬 Vídeo' : '🖼️ Imagen'}
          </div>
        </div>
      </div>

      {/* Copy summary */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', lineHeight: '1.6' }}>
        {ad.creative.headline && <div><span style={{ color: 'var(--text-muted)' }}>Título: </span><strong>{ad.creative.headline}</strong></div>}
        {ad.creative.primaryText && <div style={{ marginTop: '4px' }}><span style={{ color: 'var(--text-muted)' }}>Texto: </span>{ad.creative.primaryText.slice(0, 160)}{ad.creative.primaryText.length > 160 ? '…' : ''}</div>}
        {ad.creative.linkUrl && <div style={{ marginTop: '4px' }}><span style={{ color: 'var(--text-muted)' }}>URL: </span><a href={ad.creative.linkUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-accent)', textDecoration: 'none' }}>{ad.creative.linkUrl.slice(0, 60)}{ad.creative.linkUrl.length > 60 ? '…' : ''} <ExternalLink size={10} style={{ display: 'inline' }} /></a></div>}
      </div>

      {/* Placement mockups */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cómo se verá en cada posición</div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {placements.map(pl => (
          <div key={pl} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{PLACEMENT_LABELS[pl] || pl}</div>
            {pl === 'FEED' && <FeedMockup creative={ad.creative!} adSetName={adSetName} />}
            {pl === 'STORIES' && <StoriesMockup creative={ad.creative!} adSetName={adSetName} />}
            {pl === 'REELS' && <StoriesMockup creative={ad.creative!} adSetName={adSetName} isReel />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────

interface CampaignOption { id: string; name: string; status: string }

function PreviewPageInner() {
  const { currentClient } = useClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>(searchParams.get('campaignId') || '');
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch campaign list (for selector)
  useEffect(() => {
    if (!currentClient) return;
    apiFetch('/api/campaigns').then(r => r.json()).then(d => {
      setCampaigns((d.campaigns || []).map((c: any) => ({ id: c.id, name: c.name, status: c.status })));
    }).catch(() => {});
  }, [currentClient?.id]);

  // Load preview when campaign selected
  const loadPreview = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await apiFetch(`/api/campaigns/preview?campaignId=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Error ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Error al cargar la vista previa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadPreview(selectedId);
  }, [selectedId, loadPreview]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    router.replace(`/preview?campaignId=${id}`, { scroll: false });
  };

  // Build plain-text summary for copy/paste
  const buildTextSummary = (): string => {
    if (!data) return '';
    const { campaign, adSets } = data;
    let txt = `📣 RESUMEN DE CAMPAÑA — ${campaign.name}\n`;
    txt += `═══════════════════════════════════════\n`;
    txt += `Objetivo: ${OBJECTIVES[campaign.objective] || campaign.objective}\n`;
    if (campaign.dailyBudget) txt += `Presupuesto diario: €${campaign.dailyBudget.toFixed(2)}\n`;
    txt += `Estado: ${campaign.status}\n\n`;

    adSets.forEach((adSet, i) => {
      txt += `📍 CONJUNTO DE ANUNCIOS ${i + 1}: ${adSet.name}\n`;
      txt += `─────────────────────────────\n`;
      txt += `Ubicación: ${adSet.targeting.geoLabel}\n`;
      txt += `Edad: ${adSet.targeting.ageMin}-${adSet.targeting.ageMax} años\n`;
      if (adSet.targeting.interests.length) txt += `Intereses: ${adSet.targeting.interests.join(', ')}\n`;
      txt += `Posiciones: ${adSet.placements.map(p => PLACEMENT_LABELS[p] || p).join(', ')}\n`;
      if (adSet.dailyBudget) txt += `Presupuesto: €${adSet.dailyBudget.toFixed(2)}/día\n`;
      if (adSet.promotedObject?.custom_event_type) txt += `Seguimiento: ${EVENT_LABELS[adSet.promotedObject.custom_event_type] || adSet.promotedObject.custom_event_type}\n`;
      txt += `\n`;

      adSet.ads.forEach((ad, j) => {
        if (!ad.creative) return;
        txt += `  🎯 Anuncio ${j + 1}: ${ad.name}\n`;
        if (ad.creative.headline) txt += `     Título: ${ad.creative.headline}\n`;
        if (ad.creative.primaryText) txt += `     Texto: ${ad.creative.primaryText}\n`;
        if (ad.creative.linkUrl) txt += `     Enlace: ${ad.creative.linkUrl}\n`;
        txt += `\n`;
      });
    });

    return txt;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildTextSummary());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const totalAds = data?.adSets.reduce((s, as) => s + as.ads.length, 0) || 0;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Resumen para cliente</h1>
          <p className="page-subtitle">Vista previa de cómo quedan los anuncios en cada posición</p>
        </div>
        {data && (
          <button className="btn btn-secondary btn-sm" onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copiado' : 'Copiar resumen'}
          </button>
        )}
      </div>

      {/* Campaign selector */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Campaña</label>
        <select
          className="input"
          style={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}
          value={selectedId}
          onChange={e => handleSelect(e.target.value)}
        >
          <option value="">— Selecciona una campaña —</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>
              {c.status === 'ACTIVE' ? '● ' : c.status === 'PAUSED' ? '○ ' : ''}
              {c.name}
            </option>
          ))}
        </select>
        {selectedId && (
          <button className="btn btn-ghost btn-sm" onClick={() => loadPreview(selectedId)} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--status-red-bg)', border: '1px solid var(--status-red)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: 'var(--status-red)', marginBottom: '20px', fontSize: '13px' }}>
          ❌ {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2].map(i => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: '24px', height: '200px', opacity: 0.5 }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!selectedId && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'var(--text-muted)', gap: '12px' }}>
          <div style={{ fontSize: '48px' }}>📋</div>
          <div style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Selecciona una campaña para ver el resumen</div>
          <div style={{ fontSize: '13px' }}>Verás cómo quedan los anuncios en Feed, Stories y Reels</div>
        </div>
      )}

      {/* Preview content */}
      {data && !loading && (
        <div>
          {/* Campaign header */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700 }}>{data.campaign.name}</h2>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: data.campaign.status === 'ACTIVE' ? 'var(--status-green-bg)' : 'var(--status-yellow-bg)', color: data.campaign.status === 'ACTIVE' ? 'var(--status-green)' : 'var(--status-yellow)', fontWeight: 600 }}>
                    {data.campaign.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span>🎯 {OBJECTIVES[data.campaign.objective] || data.campaign.objective}</span>
                  {data.campaign.dailyBudget && <span>💰 €{data.campaign.dailyBudget.toFixed(2)}/día</span>}
                  <span>📦 {data.adSets.length} conjunto{data.adSets.length !== 1 ? 's' : ''} · {totalAds} anuncio{totalAds !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Ad sets */}
          {data.adSets.map((adSet, idx) => (
            <div key={adSet.id} style={{ marginBottom: '32px' }}>
              {/* Ad set header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{idx + 1}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{adSet.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {adSet.id}
                  </div>
                </div>
              </div>

              {/* Targeting summary */}
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>Ubicación</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>📍 {adSet.targeting.geoLabel}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>Edad</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>👤 {adSet.targeting.ageMin}–{adSet.targeting.ageMax} años</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>Posiciones</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>📲 {adSet.placements.map(p => PLACEMENT_LABELS[p] || p).join(' · ')}</div>
                </div>
                {adSet.dailyBudget && (
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>Presupuesto</div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>💶 €{adSet.dailyBudget.toFixed(2)}/día</div>
                  </div>
                )}
                {adSet.promotedObject?.custom_event_type && (
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>Seguimiento</div>
                    <div style={{ color: 'var(--status-blue)', fontWeight: 500 }}>📊 {EVENT_LABELS[adSet.promotedObject.custom_event_type] || adSet.promotedObject.custom_event_type}</div>
                  </div>
                )}
                {adSet.targeting.interests.length > 0 && (
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>Intereses</div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>🎯 {adSet.targeting.interests.slice(0, 5).join(', ')}</div>
                  </div>
                )}
              </div>

              {/* Ads */}
              {adSet.ads.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-border)' }}>Sin anuncios en este conjunto.</div>
              ) : (
                adSet.ads.map(ad => (
                  <AdCard key={ad.id} ad={ad} placements={adSet.placements} adSetName={adSet.name} />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </AppLayout>
  );
}

export default function PreviewPage() {
  return (
    <Suspense>
      <PreviewPageInner />
    </Suspense>
  );
}
