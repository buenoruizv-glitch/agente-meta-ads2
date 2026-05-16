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

// GET /api/campaigns — list all campaigns with insights
export async function GET(req: NextRequest) {
  try {
    console.log('GET /api/campaigns - Start');
    const metaConfig = await getMetaConfig(req);
    console.log('GET /api/campaigns - metaConfig resolved:', !!metaConfig.token);
    const { searchParams } = new URL(req.url);
    const withInsights = searchParams.get('insights') === 'true';
    const datePreset = searchParams.get('date_preset') || 'last_7d';

    console.log('GET /api/campaigns - Fetching campaigns');
    const data = await getCampaigns(metaConfig);
    console.log('GET /api/campaigns - campaigns received');
    const campaigns = data?.data || [];

    if (!withInsights) {
      return NextResponse.json({ campaigns });
    }

    // Fetch insights for each campaign (parallel)
    const withKPIs = await Promise.all(
      campaigns.map(async (campaign: Record<string, unknown>) => {
        try {
          const insightsData = await getCampaignInsights(campaign.id as string, datePreset, metaConfig);
          const rawInsights = insightsData?.data?.[0];
          const kpis = rawInsights ? calculateKPIs(rawInsights) : null;
          return { ...campaign, kpis, hasInsights: !!kpis };
        } catch {
          return { ...campaign, kpis: null, hasInsights: false };
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
