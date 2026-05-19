import {
  createCampaign,
  createAdSet,
  createAdCreative,
  createAd,
  uploadImageToMeta,
  uploadVideoToMeta,
  searchInterests,
  searchLocations,
} from './meta-api';

interface DraftCampaignPayload {
  campaignName: string;
  objective: string;
  adSetName: string;
  dailyBudget: number;
  billingEvent?: string;
  optimizationGoal?: string;
  adName: string;
  primaryText: string;
  headline: string;
  imageUrl?: string;
  thumbnailUrl?: string; // explicit thumbnail for video ads; auto-generated if omitted
  videoId?: string;
  linkUrl: string;
  pageId: string;
  // Reuse existing campaign/adset to add more ads without creating duplicates
  existingCampaignId?: string;
  existingAdSetId?: string;
  // Advanced targeting
  locations?: string[];
  radius?: number;
  ageMin?: number;
  ageMax?: number;
  interests?: string[];
  placements?: string[];
}

// Map objective → safe optimization_goal + billing_event
// NOTE: New Meta ad accounts can only bill by IMPRESSIONS
function getOptimizationDefaults(objective: string, customOptGoal?: string) {
  if (customOptGoal) {
    return {
      optimization_goal: customOptGoal,
      billing_event: 'IMPRESSIONS',
    };
  }
  switch (objective) {
    case 'OUTCOME_SALES':
    case 'OUTCOME_LEADS':
      return { optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS' };
    case 'OUTCOME_TRAFFIC':
      return { optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' };
    case 'OUTCOME_AWARENESS':
      return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' };
    default:
      return { optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' };
  }
}

function getPlacementsConfig(placements: string[]) {
  const config: Record<string, any> = {
    publisher_platforms: [],
    facebook_positions: [],
    instagram_positions: [],
  };

  const p = placements.map(s => s.toUpperCase());
  
  if (p.includes('FEED')) {
    config.publisher_platforms.push('facebook', 'instagram');
    config.facebook_positions.push('feed');
    config.instagram_positions.push('stream'); // 'stream' is used for Feed in Instagram positions
  }
  if (p.includes('STORIES')) {
    config.publisher_platforms.push('facebook', 'instagram');
    config.facebook_positions.push('story');
    config.instagram_positions.push('story');
  }
  if (p.includes('REELS')) {
    config.publisher_platforms.push('facebook', 'instagram');
    config.facebook_positions.push('facebook_reels');
    config.instagram_positions.push('reels');
  }

  // Remove duplicates
  config.publisher_platforms = Array.from(new Set(config.publisher_platforms));
  config.facebook_positions = Array.from(new Set(config.facebook_positions));
  config.instagram_positions = Array.from(new Set(config.instagram_positions));
  
  if (config.publisher_platforms.length === 0) return {};
  return config;
}

export async function createCampaignDraftService(
  payload: DraftCampaignPayload,
  metaConfig: { token?: string; adAccountId?: string; pixelId?: string }
) {
  const {
    campaignName, objective,
    adSetName, dailyBudget, billingEvent, optimizationGoal,
    adName, primaryText, headline, imageUrl, thumbnailUrl, videoId: existingVideoId, linkUrl, pageId,
    existingCampaignId, existingAdSetId,
    locations, radius, ageMin, ageMax, interests, placements
  } = payload;

  if (!pageId) {
    throw new Error('Page ID is required to create an Ad Creative');
  }

  const { optimization_goal, billing_event } = getOptimizationDefaults(objective, optimizationGoal);

  // 1. Campaign — reuse existing or create new
  let campaignId = existingCampaignId;
  let campaignResult: any = existingCampaignId ? { id: existingCampaignId } : null;

  if (!campaignId) {
    campaignResult = await createCampaign({
      name: campaignName,
      objective: objective,
      status: 'PAUSED',
      special_ad_categories: ['NONE'],
      is_adset_budget_sharing_enabled: false,
    }, metaConfig);
    campaignId = campaignResult.id;
  }

  // 2. Build Targeting
  const targeting: Record<string, any> = {
    age_min: ageMin || 18,
    age_max: ageMax || 65,
  };

  // Resolve Interests to IDs
  if (interests && interests.length > 0) {
    const interestSpecs: any[] = [];
    for (const interestName of interests) {
      try {
        const searchRes = await searchInterests(interestName, metaConfig);
        const match = searchRes.data?.find((i: any) => i.name.toLowerCase() === interestName.toLowerCase()) || searchRes.data?.[0];
        if (match) {
          interestSpecs.push({ id: match.id, name: match.name });
        }
      } catch (err) {
        console.warn(`[meta-campaign-service] Failed to resolve interest: ${interestName}`);
      }
    }
    if (interestSpecs.length > 0) {
      targeting.flexible_spec = [{ interests: interestSpecs }];
    }
  }

  // Resolve Locations/Radius
  if (locations && locations.length > 0) {
    const geoLocations: any = {
      location_types: ['home', 'recent'],
    };
    
    const customLocations: any[] = [];
    const cities: any[] = [];
    const regions: any[] = [];

    for (const locName of locations) {
      try {
        const searchRes = await searchLocations(locName, metaConfig);
        if (!searchRes.data || searchRes.data.length === 0) {
          console.warn(`[meta-campaign-service] No locations found for: ${locName}`);
          continue;
        }

        // Find best match: 
        // 1. Exact case-insensitive name match
        // 2. Name includes search term
        // 3. First result
        const match = searchRes.data.find((l: any) => l.name.toLowerCase() === locName.toLowerCase()) || 
                      searchRes.data.find((l: any) => l.name.toLowerCase().includes(locName.toLowerCase())) || 
                      searchRes.data[0];

        if (match) {
          console.log(`[meta-campaign-service] Resolved location '${locName}' to: ${match.name} (${match.type}, key: ${match.key})`);
          
          if (match.type === 'city' && match.key) {
            cities.push({
              key: match.key,
              radius: radius || 40,
              distance_unit: 'kilometer'
            });
          } else if ((match.type === 'region' || match.type === 'state') && match.key) {
            regions.push({ key: match.key });
          } else if (match.latitude && match.longitude) {
            customLocations.push({
              latitude: match.latitude,
              longitude: match.longitude,
              radius: radius || 40,
              distance_unit: 'kilometer'
            });
          } else if (match.key) {
            // Fallback for other types that have a key (like zip codes or neighborhoods)
            // Most of these can be treated as regions or custom locations, 
            // but for safety we'll try to use it as a region if it has a key
            regions.push({ key: match.key });
          }
        }
      } catch (err) {
        console.error(`[meta-campaign-service] Error resolving location '${locName}':`, err);
      }
    }

    let hasAny = false;
    if (cities.length > 0) { geoLocations.cities = cities; hasAny = true; }
    if (regions.length > 0) { geoLocations.regions = regions; hasAny = true; }
    if (customLocations.length > 0) { geoLocations.custom_locations = customLocations; hasAny = true; }

    if (hasAny) {
      targeting.geo_locations = geoLocations;
    } else {
      // If user specified locations but we couldn't resolve any, throw error instead of silent fallback to Spain
      // This helps the agent report the exact problem.
      throw new Error(`No se pudo encontrar ninguna ubicación válida para: ${locations.join(', ')}. Por favor, especifica el nombre de la ciudad o provincia con más detalle.`);
    }
  } else {
    // Default to whole country if no locations provided
    targeting.geo_locations = { countries: ['ES'], location_types: ['home', 'recent'] };
  }

  if (placements && placements.length > 0) {
    Object.assign(targeting, getPlacementsConfig(placements));
  }

  // 3. Create Ad Set
  // 3. AdSet — reuse existing or create new
  let adSetId = existingAdSetId;
  let adSetResult: any = existingAdSetId ? { id: existingAdSetId } : null;

  if (!adSetId) {
    const adSetPayload: Record<string, unknown> = {
      name: adSetName,
      campaign_id: campaignId,
      daily_budget: Math.round(dailyBudget * 100),
      billing_event: billingEvent || billing_event,
      optimization_goal: optimization_goal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: targeting,
      status: 'PAUSED',
    };

    if (optimization_goal === 'OFFSITE_CONVERSIONS') {
      if (!metaConfig.pixelId) {
        adSetPayload.optimization_goal = 'LINK_CLICKS';
        adSetPayload.billing_event = 'IMPRESSIONS';
      } else {
        adSetPayload.promoted_object = {
          pixel_id: metaConfig.pixelId,
          custom_event_type: 'PURCHASE',
        };
      }
    }

    adSetResult = await createAdSet(adSetPayload, metaConfig);
    adSetId = adSetResult.id;
  }

  // 4. Creative Handling (Detect Video vs Image)
  const isVideo = (imageUrl && /\.(mp4|mov|avi|m4v|webm)(\?.*)?$/i.test(imageUrl)) || !!existingVideoId;
  
  const objectStorySpec: any = {
    page_id: pageId,
  };

  if (isVideo) {
    let videoId = existingVideoId;
    if (!videoId && imageUrl) {
      try {
        videoId = await uploadVideoToMeta(imageUrl, metaConfig);
      } catch (err: any) {
        throw new Error(`Error al subir el video a Meta: ${err.message}`);
      }
    }

    // Meta requires image_url or image_hash in video_data.
    // Use the provided thumbnail, or fall back to a 1x1 transparent placeholder
    // that satisfies the API requirement while Meta processes the video.
    const resolvedThumbnail =
      thumbnailUrl ||
      'https://upload.wikimedia.org/wikipedia/commons/c/ca/1x1.png';

    let thumbnailHash: string | undefined;
    try {
      thumbnailHash = await uploadImageToMeta(resolvedThumbnail, metaConfig);
    } catch {
      // If upload fails, pass image_url directly — Meta will fetch it
    }

    objectStorySpec.video_data = {
      video_id: videoId,
      title: headline,
      message: primaryText,
      ...(thumbnailHash ? { image_hash: thumbnailHash } : { image_url: resolvedThumbnail }),
      call_to_action: {
        type: 'LEARN_MORE',
        value: { link: linkUrl },
      },
    };
  } else {
    const linkData: Record<string, unknown> = {
      link: linkUrl,
      message: primaryText,
      name: headline,
      call_to_action: {
        type: 'LEARN_MORE',
        value: { link: linkUrl }
      }
    };

    if (imageUrl && imageUrl.trim() !== '') {
      try {
        const imageHash = await uploadImageToMeta(imageUrl, metaConfig);
        linkData.image_hash = imageHash;
      } catch (imgErr: any) {
        throw new Error(`Error al subir la imagen a Meta: ${imgErr.message}`);
      }
    }
    
    objectStorySpec.link_data = linkData;
  }

  const creativeResult = await createAdCreative({
    name: `Creative - ${adName}`,
    object_story_spec: objectStorySpec,
  }, metaConfig);

  const creativeId = creativeResult.id;

  // 5. Create Ad
  const adResult = await createAd({
    name: adName,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: 'PAUSED',
  }, metaConfig);

  return {
    campaign: campaignResult,
    adSet: adSetResult,
    creative: creativeResult,
    ad: adResult,
  };
}



