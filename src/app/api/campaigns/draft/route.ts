import { NextRequest, NextResponse } from 'next/server';
import { createCampaignDraftService } from '@/lib/meta-campaign-service';
import { verifyAuth } from '@/lib/auth-server';
import { getUserProfile } from '@/lib/db-service';

async function getMetaConfig(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) throw new Error('Unauthorized');
  
  const profile = await getUserProfile(user.uid);
  
  return {
    token: profile?.meta_access_token || process.env.META_ACCESS_TOKEN,
    adAccountId: profile?.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID,
    pixelId: profile?.meta_pixel_id || process.env.META_PIXEL_ID
  };
}

export async function POST(req: NextRequest) {
  try {
    const metaConfig = await getMetaConfig(req);
    const body = await req.json();
    
    const { 
      campaignName, objective,
      adSetName, dailyBudget, billingEvent, optimizationGoal,
      adName, primaryText, headline, imageUrl, linkUrl, pageId
    } = body;

    const resolvedPageId = pageId || process.env.META_PAGE_ID;

    if (!resolvedPageId) {
      return NextResponse.json({ error: 'Page ID is required to create an Ad Creative' }, { status: 400 });
    }

    const payload = {
      campaignName, objective, adSetName, dailyBudget, billingEvent, optimizationGoal,
      adName, primaryText, headline, imageUrl, linkUrl, pageId: resolvedPageId
    };

    const results = await createCampaignDraftService(payload, metaConfig);

    return NextResponse.json({ 
      success: true, 
      ...results
    });

  } catch (err) {
    console.error('Error creating draft campaign:', err);
    const message = err instanceof Error ? err.message : 'Error creating draft campaign';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
