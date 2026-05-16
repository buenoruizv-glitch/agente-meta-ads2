import { NextRequest, NextResponse } from 'next/server';
import { getAccountInsights, getCampaigns, getCampaignInsights, calculateKPIs } from '@/lib/meta-api';
import { verifyAuth } from '@/lib/auth-server';
import { getUserProfile } from '@/lib/db-service';

async function getMetaConfig(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) throw new Error('Unauthorized');
  
  const profile = await getUserProfile(user.uid);
  
  return {
    token: profile?.meta_access_token || process.env.META_ACCESS_TOKEN,
    adAccountId: profile?.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID
  };
}

// GET /api/analytics?scope=account|campaigns&date_preset=last_7d
export async function GET(req: NextRequest) {
  try {
    console.log('GET /api/analytics - Start');
    const metaConfig = await getMetaConfig(req);
    console.log('GET /api/analytics - metaConfig resolved:', !!metaConfig.token);
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'account';
    const datePreset = searchParams.get('date_preset') || 'last_30d';
    console.log(`GET /api/analytics - scope: ${scope}, datePreset: ${datePreset}`);

    if (scope === 'account') {
      console.log('GET /api/analytics - Fetching account insights');
      const insightsData = await getAccountInsights(datePreset, metaConfig);
      console.log('GET /api/analytics - account insights received');
      const raw = insightsData?.data?.[0];
      const kpis = raw ? calculateKPIs(raw) : null;
      return NextResponse.json({ kpis, raw });
    }

    if (scope === 'campaigns') {
      const campaignsData = await getCampaigns(metaConfig);
      const campaigns = campaignsData?.data || [];

      const results = await Promise.all(
        campaigns.map(async (c: Record<string, unknown>) => {
          try {
            const ins = await getCampaignInsights(c.id as string, datePreset, metaConfig);
            const raw = ins?.data?.[0];
            return { campaign: c, kpis: raw ? calculateKPIs(raw) : null };
          } catch {
            return { campaign: c, kpis: null };
          }
        })
      );

      // Summary stats across all campaigns
      const validResults = results.filter(r => r.kpis !== null);
      const totalSpend = validResults.reduce((s, r) => s + (r.kpis?.spend || 0), 0);
      const avgROAS = validResults.length > 0
        ? validResults.reduce((s, r) => s + (r.kpis?.roas || 0), 0) / validResults.length
        : 0;
      const avgCTR = validResults.length > 0
        ? validResults.reduce((s, r) => s + (r.kpis?.ctr || 0), 0) / validResults.length
        : 0;

      return NextResponse.json({
        campaigns: results,
        summary: { totalSpend, avgROAS, avgCTR, totalCampaigns: campaigns.length },
      });
    }

    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error fetching analytics';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
