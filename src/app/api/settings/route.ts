import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { getUserProfile, updateUserProfile } from '@/lib/db-service';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getUserProfile(user.uid);

    if (!profile) {
      return NextResponse.json({ settings: {} }, { status: 200 });
    }

    // Combine flat columns and the settings JSONB for the frontend
    const combinedSettings = {
      ...(profile.settings || {}),
      metaToken: profile.meta_access_token,
      adAccountId: profile.meta_ad_account_id,
      slackWebhook: profile.slack_webhook_url,
      anthropicKey: profile.anthropic_api_key,
      sheetsId: profile.google_sheets_id,
      // geminiKey and preferredModel are already in profile.settings if they exist
    };

    return NextResponse.json({ settings: combinedSettings }, { status: 200 });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    
    // Extract core fields to top-level columns
    const { 
      metaToken, adAccountId, slackWebhook, anthropicKey, sheetsId, 
      ...rest 
    } = body;

    const updates = {
      meta_access_token: metaToken,
      meta_ad_account_id: adAccountId,
      slack_webhook_url: slackWebhook,
      anthropic_api_key: anthropicKey,
      google_sheets_id: sheetsId,
      settings: rest // preferredModel and geminiKey will stay here
    };

    await updateUserProfile(user.uid, updates);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
