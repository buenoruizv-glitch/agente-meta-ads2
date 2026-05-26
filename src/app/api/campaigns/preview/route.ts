import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { getCampaigns, getAdSets, getAds, getAdCreativeDetail, getAdPreviews } from '@/lib/meta-api';

const FORMAT_MAP: Record<string, string> = {
  FEED: 'DESKTOP_FEED_STANDARD',
  STORIES: 'INSTAGRAM_STORY',
  REELS: 'INSTAGRAM_REELS',
};

// Fetch the actual iframe page server-side so the client never touches Facebook cookies.
// Strip SDK scripts that trigger the GDPR cookie consent popup.
async function fetchPreviewSrcdoc(iframeHtml: string): Promise<string | null> {
  const m = iframeHtml.match(/src=["']([^"']+)["']/);
  if (!m) return null;
  const src = m[1].replace(/&amp;/g, '&');
  try {
    const res = await fetch(src, { headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    let html = await res.text();
    // Remove Facebook SDK script (the cookie consent trigger)
    html = html.replace(/<script\b[^>]*(?:connect\.facebook\.net|staticxx\.facebook\.com)[^>]*>[\s\S]*?<\/script>/gi, '');
    // Ensure relative URLs resolve against facebook.com
    if (!/<base\b/i.test(html)) {
      html = html.replace(/(<head\b[^>]*>)/i, '$1<base href="https://www.facebook.com/">');
    }
    return html;
  } catch {
    return null;
  }
}

function parseCreative(creative: any) {
  const spec = creative?.object_story_spec || {};
  const isVideo = !!spec.video_data;

  if (isVideo) {
    const vd = spec.video_data;
    return {
      type: 'video' as const,
      headline: vd?.title || '',
      primaryText: vd?.message || '',
      linkUrl: vd?.call_to_action?.value?.link || '',
      thumbnailUrl: creative.thumbnail_url || vd?.image_url || '',
    };
  }

  const ld = spec.link_data || {};
  return {
    type: 'image' as const,
    headline: ld.name || '',
    primaryText: ld.message || '',
    linkUrl: ld.link || ld.call_to_action?.value?.link || '',
    thumbnailUrl: creative.thumbnail_url || ld.picture || '',
  };
}

function parsePlacements(targeting: any): string[] {
  const fp: string[] = targeting?.facebook_positions || [];
  const ip: string[] = targeting?.instagram_positions || [];
  const result: string[] = [];

  if (fp.includes('feed') || ip.includes('stream')) result.push('FEED');
  if (fp.includes('story') || ip.includes('story')) result.push('STORIES');
  if (fp.includes('facebook_reels') || ip.includes('reels')) result.push('REELS');

  return result.length > 0 ? result : ['FEED', 'STORIES', 'REELS'];
}

function parseGeoLabel(geoLocations: any): string {
  if (!geoLocations) return 'España';
  const parts: string[] = [];

  if (geoLocations.cities?.length) {
    const names = geoLocations.cities.map((c: any) => {
      const radius = c.radius ? ` +${c.radius}km` : '';
      return `${c.name || c.key}${radius}`;
    });
    parts.push(...names);
  }
  if (geoLocations.regions?.length) {
    parts.push(...geoLocations.regions.map((r: any) => r.name || r.key));
  }
  if (geoLocations.custom_locations?.length) {
    geoLocations.custom_locations.forEach((l: any) => {
      parts.push(`Coord. (${l.radius || 40}km)`);
    });
  }
  if (geoLocations.countries?.length) {
    parts.push(...geoLocations.countries);
  }

  return parts.join(', ') || 'España';
}

export async function GET(req: NextRequest) {
  try {
    const { client } = await getAuthenticatedClient(req);
    const metaConfig = {
      token: (client.meta_access_token || process.env.META_ACCESS_TOKEN || '').trim(),
      adAccountId: (client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID || '').trim(),
    };

    const campaignId = req.nextUrl.searchParams.get('campaignId');
    if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

    const campaignsData = await getCampaigns(metaConfig);
    const campaign = (campaignsData?.data || []).find((c: any) => c.id === campaignId);
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const adSetsData = await getAdSets(campaignId, metaConfig);
    const adSets = adSetsData?.data || [];

    const adSetsDetail = await Promise.all(
      adSets.map(async (adSet: any) => {
        const adsData = await getAds(adSet.id, metaConfig);
        const ads = adsData?.data || [];

        const placements = parsePlacements(adSet.targeting || {});

        const adsDetail = await Promise.all(
          ads.map(async (ad: any) => {
            let creative = null;
            if (ad.creative?.id) {
              try {
                const raw = await getAdCreativeDetail(ad.creative.id, metaConfig);
                creative = parseCreative(raw);
              } catch { /* skip */ }
            }

            // Fetch official Meta preview iframes (one per placement)
            const previews: Record<string, string> = {};
            await Promise.all(
              placements.map(async (pl) => {
                const fmt = FORMAT_MAP[pl];
                if (!fmt) return;
                try {
                  const res = await getAdPreviews(ad.id, fmt, metaConfig);
                  const body: string = res?.data?.[0]?.body || '';
                  if (body) {
                    const srcdoc = await fetchPreviewSrcdoc(body);
                    if (srcdoc) previews[pl] = srcdoc;
                  }
                } catch { /* skip */ }
              })
            );

            return { id: ad.id, name: ad.name, status: ad.status, creative, previews };
          })
        );

        const targeting = adSet.targeting || {};
        return {
          id: adSet.id,
          name: adSet.name,
          status: adSet.status,
          dailyBudget: adSet.daily_budget ? parseInt(adSet.daily_budget) / 100 : null,
          optimizationGoal: adSet.optimization_goal || null,
          promotedObject: adSet.promoted_object || null,
          placements,
          targeting: {
            ageMin: targeting.age_min || 18,
            ageMax: targeting.age_max || 65,
            geoLabel: parseGeoLabel(targeting.geo_locations),
            interests: (targeting.flexible_spec?.[0]?.interests || []).map((i: any) => i.name || i.id),
          },
          ads: adsDetail,
        };
      })
    );

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
        dailyBudget: campaign.daily_budget ? parseInt(campaign.daily_budget) / 100 : null,
        createdTime: campaign.created_time,
      },
      adSets: adSetsDetail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
