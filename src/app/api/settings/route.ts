import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { getClient, updateClient } from '@/lib/db-service';

export async function GET(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }

    // Combine flat columns and the settings JSONB for the frontend
    const combinedSettings = {
      ...(client.settings || {}),
      metaToken: client.meta_access_token,
      adAccountId: client.meta_ad_account_id,
      slackWebhook: client.slack_webhook_url,
      anthropicKey: client.anthropic_api_key,
      sheetsId: client.google_sheets_id,
    };

    return NextResponse.json({ settings: combinedSettings }, { status: 200 });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
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

    await updateClient(client.id, updates);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
