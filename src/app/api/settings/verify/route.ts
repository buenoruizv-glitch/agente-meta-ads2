import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { checkTokenStatus } from '@/lib/meta-api';

// GET — verifica las credenciales almacenadas del cliente actual
// POST { token, adAccountId } — verifica credenciales proporcionadas antes de guardar
export async function GET(req: NextRequest) {
  try {
    const { client } = await getAuthenticatedClient(req);
    const token = (client.meta_access_token || process.env.META_ACCESS_TOKEN || '').trim();
    const adAccountId = (client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID || '').trim();

    if (!token || !adAccountId) {
      return NextResponse.json({ valid: false, error: 'Credenciales no configuradas' });
    }

    const result = await checkTokenStatus({ token, adAccountId });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ valid: false, error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await getAuthenticatedClient(req); // solo verificar auth
    const { token, adAccountId } = await req.json();

    if (!token || !adAccountId) {
      return NextResponse.json({ valid: false, error: 'Token y Account ID son obligatorios' }, { status: 400 });
    }

    const result = await checkTokenStatus({ token: token.trim(), adAccountId: adAccountId.trim() });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ valid: false, error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
