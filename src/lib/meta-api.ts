// Meta Ads API service — wraps Graph API calls
const BASE_URL = 'https://graph.facebook.com/v19.0';

export interface MetaConfig {
  token?: string;
  adAccountId?: string;
}

const defaultToken = process.env.META_ACCESS_TOKEN;
const defaultAdAccountId = process.env.META_AD_ACCOUNT_ID;

async function metaFetch(path: string, params: Record<string, string> = {}, method = 'GET', body?: Record<string, unknown>, config?: MetaConfig) {
  const url = new URL(`${BASE_URL}${path}`);
  const resolvedToken = config?.token || defaultToken;
  if (!resolvedToken) throw new Error("Meta access token is missing. Please configure it in Settings.");

  url.searchParams.set('access_token', resolvedToken);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method,
    headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const metaError = err?.error || {};
    const errorMsg = metaError.message || err?.message || `Meta API error ${res.status}`;
    const userMsg = metaError.error_user_msg || '';
    const userTitle = metaError.error_user_title || '';

    // Detect expired / invalid token explicitly
    const isExpired =
      metaError.code === 190 ||
      /session has expired|access token.*expired|token.*invalid|OAuthException/i.test(errorMsg);
    if (isExpired) {
      throw new Error(
        `TOKEN_EXPIRED: El token de Meta ha caducado. Ve a Configuración → Meta Token y genera uno nuevo en developers.facebook.com/tools/explorer`
      );
    }

    let detailedMsg = errorMsg;
    if (userTitle) detailedMsg = `${userTitle}: ${detailedMsg}`;
    if (userMsg) detailedMsg = `${detailedMsg} (${userMsg})`;
    if (metaError.fbtrace_id) detailedMsg = `${detailedMsg} [Trace ID: ${metaError.fbtrace_id}]`;

    console.error(`[Meta API Error] ${method} ${path}:`, JSON.stringify(err, null, 2));
    throw new Error(detailedMsg);
  }
  return res.json();
}

// Helper to get ad account id
function getAccountId(config?: MetaConfig) {
  const accountId = config?.adAccountId || defaultAdAccountId;
  if (!accountId) throw new Error("Meta Ad Account ID is missing. Please configure it in Settings.");
  return accountId;
}

// ─── Campaigns ────────────────────────────────────────────
export async function getCampaigns(config?: MetaConfig) {
  const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time';
  return metaFetch(`/${getAccountId(config)}/campaigns`, { fields, limit: '100' }, 'GET', undefined, config);
}

export async function getCampaignInsights(campaignId: string, datePreset = 'last_7d', config?: MetaConfig) {
  const fields = 'impressions,reach,clicks,ctr,cpc,cpm,spend,actions,action_values,frequency';
  return metaFetch(`/${campaignId}/insights`, { fields, date_preset: datePreset }, 'GET', undefined, config);
}

export async function createCampaign(data: {
  name: string;
  objective: string;
  status?: string;
  special_ad_categories?: string[];
  is_adset_budget_sharing_enabled?: boolean;
}, config?: MetaConfig) {
  return metaFetch(`/${getAccountId(config)}/campaigns`, {}, 'POST', {
    ...data,
    status: data.status || 'PAUSED',
    special_ad_categories: data.special_ad_categories || ['NONE'],
    is_adset_budget_sharing_enabled: data.is_adset_budget_sharing_enabled ?? false,
  }, config);
}

export async function updateCampaign(campaignId: string, data: Record<string, unknown>, config?: MetaConfig) {
  return metaFetch(`/${campaignId}`, {}, 'POST', data, config);
}

export async function pauseCampaign(campaignId: string, config?: MetaConfig) {
  return metaFetch(`/${campaignId}`, {}, 'POST', { status: 'PAUSED' }, config);
}

export async function activateCampaign(campaignId: string, config?: MetaConfig) {
  return metaFetch(`/${campaignId}`, {}, 'POST', { status: 'ACTIVE' }, config);
}

// ─── Ad Sets ──────────────────────────────────────────────
export async function getAdSets(campaignId?: string, config?: MetaConfig) {
  const fields = 'id,name,status,daily_budget,optimization_goal,targeting,bid_amount,campaign_id';
  const path = campaignId ? `/${campaignId}/adsets` : `/${getAccountId(config)}/adsets`;
  return metaFetch(path, { fields, limit: '200' }, 'GET', undefined, config);
}

export async function createAdSet(data: Record<string, unknown>, config?: MetaConfig) {
  return metaFetch(`/${getAccountId(config)}/adsets`, {}, 'POST', data, config);
}

export async function updateAdSet(adSetId: string, data: Record<string, unknown>, config?: MetaConfig) {
  return metaFetch(`/${adSetId}`, {}, 'POST', data, config);
}

export async function getAdSetInsights(adSetId: string, datePreset = 'last_7d', config?: MetaConfig) {
  const fields = 'impressions,reach,clicks,ctr,cpc,cpm,spend,actions,frequency';
  return metaFetch(`/${adSetId}/insights`, { fields, date_preset: datePreset }, 'GET', undefined, config);
}

// ─── Ads ──────────────────────────────────────────────────
export async function getAds(adSetId?: string, config?: MetaConfig) {
  const fields = 'id,name,status,creative,adset_id,campaign_id';
  const path = adSetId ? `/${adSetId}/ads` : `/${getAccountId(config)}/ads`;
  return metaFetch(path, { fields, limit: '200' }, 'GET', undefined, config);
}

export async function getAdInsights(adId: string, datePreset = 'last_7d', config?: MetaConfig) {
  const fields = 'impressions,reach,clicks,ctr,cpc,cpm,spend,actions,action_values,frequency';
  return metaFetch(`/${adId}/insights`, { fields, date_preset: datePreset }, 'GET', undefined, config);
}

export async function createAdCreative(data: Record<string, unknown>, config?: MetaConfig) {
  return metaFetch(`/${getAccountId(config)}/adcreatives`, {}, 'POST', data, config);
}

export async function createAd(data: Record<string, unknown>, config?: MetaConfig) {
  return metaFetch(`/${getAccountId(config)}/ads`, {}, 'POST', data, config);
}

// ─── Account ──────────────────────────────────────────────
export async function getAccountInsights(datePreset = 'last_30d', config?: MetaConfig) {
  const fields = 'impressions,reach,clicks,ctr,cpc,cpm,spend,actions,action_values,frequency';
  return metaFetch(`/${getAccountId(config)}/insights`, { fields, date_preset: datePreset }, 'GET', undefined, config);
}

export async function getAccountInfo(config?: MetaConfig) {
  const fields = 'id,name,currency,timezone_name,account_status,balance';
  return metaFetch(`/${getAccountId(config)}`, { fields }, 'GET', undefined, config);
}

// ─── Search & Targeting ──────────────────────────────────
export async function searchInterests(query: string, config?: MetaConfig) {
  return metaFetch(`/search`, { type: 'adinterest', q: query }, 'GET', undefined, config);
}

export async function searchLocations(query: string, config?: MetaConfig) {
  return metaFetch(`/search`, { type: 'adgeolocation', q: query }, 'GET', undefined, config);
}

export async function getAdSet(adSetId: string, config?: MetaConfig) {
  const fields = 'id,name,status,daily_budget,optimization_goal,targeting,bid_amount,campaign_id,promoted_object';
  return metaFetch(`/${adSetId}`, { fields }, 'GET', undefined, config);
}

export async function getAdCreativeDetail(creativeId: string, config?: MetaConfig) {
  const fields = 'id,name,object_story_spec,thumbnail_url,image_url';
  return metaFetch(`/${creativeId}`, { fields }, 'GET', undefined, config);
}

export async function getAdPreviews(adId: string, adFormat: string, config?: MetaConfig) {
  return metaFetch(`/${adId}/previews`, { ad_format: adFormat }, 'GET', undefined, config);
}

// ─── Ad Images ───────────────────────────────────────────
export async function uploadImageToMeta(imageUrl: string, config?: MetaConfig): Promise<string> {
  // Download the image from the given URL (e.g. Supabase Storage)
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Could not download image from ${imageUrl}: ${imgRes.status}`);
  const arrayBuffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  // Upload to Meta Ad Images endpoint
  const url = new URL(`${BASE_URL}/${getAccountId(config)}/adimages`);
  const resolvedToken = config?.token || defaultToken;
  if (!resolvedToken) throw new Error('Meta access token is missing.');
  url.searchParams.set('access_token', resolvedToken);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bytes: base64 }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Meta adimages upload error ${res.status}`);
  }

  // The response has shape: { images: { <filename>: { hash, url, ... } } }
  const images = data.images || {};
  const firstKey = Object.keys(images)[0];
  if (!firstKey) throw new Error('Meta adimages upload returned no image hash');
  return images[firstKey].hash as string;
}

// ─── Ad Videos ───────────────────────────────────────────
export async function uploadVideoToMeta(videoUrl: string, config?: MetaConfig): Promise<string> {
  const resolvedToken = config?.token || defaultToken;
  const adAccountId = getAccountId(config);
  if (!resolvedToken) throw new Error('Meta access token is missing.');

  console.log(`[Meta API] Starting video upload from: ${videoUrl}`);

  // Use Simple URL Upload (more reliable and simpler for URL-hosted videos)
  const uploadUrl = `${BASE_URL}/${adAccountId}/advideos`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url: videoUrl,
      access_token: resolvedToken,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const errorMsg = data?.error?.message || 'Failed to upload video to Meta';
    console.error(`[Meta API] Video upload error: ${errorMsg}`, data?.error);
    throw new Error(errorMsg);
  }

  const video_id = data.id;
  console.log(`[Meta API] Video upload complete. ID: ${video_id}`);
  return video_id;
}

// ─── KPI Helpers ──────────────────────────────────────────
export function calculateKPIs(insights: {
  spend?: string;
  clicks?: string;
  impressions?: string;
  ctr?: string;
  cpc?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}) {
  const spend = parseFloat(insights.spend || '0');
  const clicks = parseInt(insights.clicks || '0');
  const impressions = parseInt(insights.impressions || '0');
  const ctr = parseFloat(insights.ctr || '0');
  const cpc = parseFloat(insights.cpc || '0');
  const frequency = parseFloat(insights.frequency || '0');

  // ROAS calculation
  const purchaseValue = (insights.action_values || [])
    .filter(a => a.action_type === 'purchase')
    .reduce((sum, a) => sum + parseFloat(a.value), 0);
  const roas = spend > 0 ? purchaseValue / spend : 0;

  // Conversions
  const conversions = (insights.actions || [])
    .filter(a => ['purchase', 'lead', 'complete_registration'].includes(a.action_type))
    .reduce((sum, a) => sum + parseInt(a.value), 0);

  const cpa = conversions > 0 ? spend / conversions : 0;

  // Status evaluation
  const getStatus = (metric: string, value: number) => {
    const thresholds: Record<string, { good: number; bad: number; direction: 'higher' | 'lower' }> = {
      ctr: { good: 1.5, bad: 0.5, direction: 'higher' },
      cpc: { good: 0.8, bad: 2.0, direction: 'lower' },
      roas: { good: 3.5, bad: 2.0, direction: 'higher' },
      frequency: { good: 2.5, bad: 4.0, direction: 'lower' },
    };
    const t = thresholds[metric];
    if (!t) return 'neutral';
    if (t.direction === 'higher') {
      if (value >= t.good) return 'green';
      if (value >= t.bad) return 'yellow';
      return 'red';
    } else {
      if (value <= t.good) return 'green';
      if (value <= t.bad) return 'yellow';
      return 'red';
    }
  };

  return {
    spend, clicks, impressions, ctr, cpc, frequency,
    roas, conversions, cpa, purchaseValue,
    status: {
      ctr: getStatus('ctr', ctr),
      cpc: getStatus('cpc', cpc),
      roas: getStatus('roas', roas),
      frequency: getStatus('frequency', frequency),
    }
  };
}
