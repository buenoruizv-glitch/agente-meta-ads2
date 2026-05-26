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
  previews?: Record<string, string>; // placement → iframe HTML from Meta
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

// ─── Meta iframe preview ─────────────────────────────────

// Dimensions Meta uses per format (native iframe sizes)
const IFRAME_SIZES: Record<string, { w: number; h: number }> = {
  FEED:    { w: 476, h: 400 },
  STORIES: { w: 320, h: 569 },
  REELS:   { w: 320, h: 569 },
};
const DISPLAY_WIDTHS: Record<string, number> = {
  FEED: 320, STORIES: 210, REELS: 210,
};

function parseIframeSrc(html: string): string | null {
  const m = html.match(/src=["']([^"']+)["']/);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

function AdIframePreview({ iframeHtml, placement }: { iframeHtml: string; placement: string }) {
  const src = parseIframeSrc(iframeHtml);
  const native = IFRAME_SIZES[placement] || { w: 476, h: 400 };
  const displayW = DISPLAY_WIDTHS[placement] || 320;
  const scale = displayW / native.w;
  const displayH = Math.round(native.h * scale);

  if (!src) return null;

  return (
    <div style={{ width: displayW, height: displayH, overflow: 'hidden', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.3)', flexShrink: 0 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: native.w, height: native.h }}>
        <iframe
          src={src}
          width={native.w}
          height={native.h}
          frameBorder="0"
          scrolling="no"
          style={{ display: 'block', border: 'none' }}
        />
      </div>
    </div>
  );
}

// ─── Ad Card ──────────────────────────────────────────────

function AdCard({ ad, placements }: { ad: Ad; placements: string[] }) {
  if (!ad.creative) return null;

  const hasPreviews = ad.previews && Object.keys(ad.previews).length > 0;

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

      {/* Official Meta previews */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Vista previa oficial de Meta
      </div>
      {hasPreviews ? (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {placements.map(pl => {
            const html = ad.previews?.[pl];
            if (!html) return null;
            return (
              <div key={pl} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{PLACEMENT_LABELS[pl] || pl}</div>
                <AdIframePreview iframeHtml={html} placement={pl} />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
          ⚠️ No se pudo obtener la vista previa de Meta para este anuncio. Es posible que el anuncio esté pendiente de revisión.
        </div>
      )}
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
                  <AdCard key={ad.id} ad={ad} placements={adSet.placements} />
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
