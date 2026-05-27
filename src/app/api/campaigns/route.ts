import { NextRequest, NextResponse } from 'next/server';
import {
  getCampaigns,
  createCampaign,
  updateCampaign,
  pauseCampaign,
  activateCampaign,
  getCampaignInsights,
  calculateKPIs,
} from '@/lib/meta-api';
import { getAuthenticatedClient } from '@/lib/api-utils';

async function getMetaConfig(req: NextRequest) {
  const { client } = await getAuthenticatedClient(req);
  
  return {
    token: client.meta_access_token || process.env.META_ACCESS_TOKEN,
    adAccountId: client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID
  };
}

function getPreviousPeriod(datePreset: string): { since: string; until: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const shift = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

  if (datePreset === 'last_7d') {
    return { since: fmt(shift(today, -14)), until: fmt(shift(today, -8)) };
  }
  if (datePreset === 'last_14d') {
    return { since: fmt(shift(today, -28)), until: fmt(shift(today, -15)) };
  }
  if (datePreset === 'last_30d') {
    return { since: fmt(shift(today, -60)), until: fmt(shift(today, -31)) };
  }
  if (datePreset === 'this_month') {
    const firstOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return { since: fmt(firstOfPrevMonth), until: fmt(lastOfPrevMonth) };
  }
  return { since: fmt(shift(today, -14)), until: fmt(shift(today, -8)) };
}

// GET /api/campaigns — list all campaigns with insights
export async function GET(req: NextRequest) {
  try {
    console.log('GET /api/campaigns - Start');
    const metaConfig = await getMetaConfig(req);
    console.log('GET /api/campaigns - metaConfig resolved:', !!metaConfig.token);
    const { searchParams } = new URL(req.url);
    const withInsights = searchParams.get('insights') === 'true';
    const datePreset = searchParams.get('date_preset') || 'last_7d';
    const withCompare = searchParams.get('compare') === 'true';

    console.log('GET /api/campaigns - Fetching campaigns');
    const data = await getCampaigns(metaConfig);
    console.log('GET /api/campaigns - campaigns received');
    const campaigns = data?.data || [];

    if (!withInsights) {
      return NextResponse.json({ campaigns });
    }

    const prevPeriod = withCompare ? getPreviousPeriod(datePreset) : null;

    // Fetch insights for each campaign (parallel)
    const withKPIs = await Promise.all(
      campaigns.map(async (campaign: Record<string, unknown>) => {
        try {
          const insightsPromise = getCampaignInsights(campaign.id as string, datePreset, metaConfig);
          const prevInsightsPromise = prevPeriod
            ? getCampaignInsights(campaign.id as string, datePreset, metaConfig, prevPeriod)
            : Promise.resolve(null);

          const [insightsData, prevInsightsData] = await Promise.all([insightsPromise, prevInsightsPromise]);
          const rawInsights = insightsData?.data?.[0];
          const rawPrev = prevInsightsData?.data?.[0];
          const kpis = rawInsights ? calculateKPIs(rawInsights) : null;
          const kpisPrev = rawPrev ? calculateKPIs(rawPrev) : null;
          return { ...campaign, kpis, kpisPrev, hasInsights: !!kpis };
        } catch {
          return { ...campaign, kpis: null, kpisPrev: null, hasInsights: false };
        }
      })
    );

    return NextResponse.json({ campaigns: withKPIs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error fetching campaigns';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST /api/campaigns — create new campaign
export async function POST(req: NextRequest) {
  try {
    const metaConfig = await getMetaConfig(req);
    const body = await req.json();
    const { name, objective, status, special_ad_categories } = body;

    if (!name || !objective) {
      return NextResponse.json({ error: 'name and objective are required' }, { status: 400 });
    }

    const result = await createCampaign({ name, objective, status, special_ad_categories }, metaConfig);
    return NextResponse.json({ campaign: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error creating campaign';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH /api/campaigns — update / pause / activate
export async function PATCH(req: NextRequest) {
  try {
    const metaConfig = await getMetaConfig(req);
    const body = await req.json();
    const { campaignId, action, ...data } = body;

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    let result;
    if (action === 'pause') {
      result = await pauseCampaign(campaignId, metaConfig);
    } else if (action === 'activate') {
      result = await activateCampaign(campaignId, metaConfig);
    } else {
      result = await updateCampaign(campaignId, data, metaConfig);
    }

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error updating campaign';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
