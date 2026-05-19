import { NextRequest, NextResponse } from 'next/server';

const FB_BASE = 'https://graph.facebook.com/v19.0';

// GET — check current token status
export async function GET(_req: NextRequest) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ status: 'missing', message: 'META_ACCESS_TOKEN not set' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${FB_BASE}/debug_token?input_token=${token}&access_token=${token}`
    );
    const data = await res.json();
    const info = data?.data;

    if (!info?.is_valid) {
      return NextResponse.json({
        status: 'expired',
        message: 'El token ha caducado o no es válido.',
        expires_at: info?.expires_at ? new Date(info.expires_at * 1000).toISOString() : null,
        scopes: info?.scopes || [],
      });
    }

    const expiresAt = info.expires_at ? new Date(info.expires_at * 1000) : null;
    const daysLeft = expiresAt
      ? Math.floor((expiresAt.getTime() - Date.now()) / 86400000)
      : null;

    return NextResponse.json({
      status: daysLeft !== null && daysLeft < 10 ? 'expiring_soon' : 'ok',
      expires_at: expiresAt?.toISOString() ?? 'never (system user)',
      days_left: daysLeft,
      scopes: info.scopes || [],
      type: info.type,
      app_id: info.app_id,
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}

// POST { token } — exchange short-lived token for 60-day long-lived token
export async function POST(req: NextRequest) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret || appId === 'your_app_id_here') {
    return NextResponse.json({
      error: 'META_APP_ID y META_APP_SECRET no están configurados. Añádelos en Vercel para habilitar el refresco automático.',
    }, { status: 400 });
  }

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  try {
    const res = await fetch(
      `${FB_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(token)}`
    );
    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    // data.access_token is now a 60-day long-lived token
    return NextResponse.json({
      long_lived_token: data.access_token,
      expires_in_seconds: data.expires_in,
      expires_in_days: Math.floor(data.expires_in / 86400),
      instructions: 'Copia este token y actualízalo en Vercel como META_ACCESS_TOKEN',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
