import { NextRequest } from 'next/server';
import { verifyAuth } from './auth-server';
import { getClient } from './db-service';

const VIRTUAL_CLIENT_ERRORS = ['Client not found', 'Forbidden: Client does not belong to user'];

function virtualClient(userId: string, clientId: string) {
  return {
    id: clientId,
    user_id: userId,
    name: 'Cliente Principal',
    meta_access_token: null,
    meta_ad_account_id: null,
    meta_pixel_id: null,
    meta_page_id: null,
    anthropic_api_key: null,
    google_gemini_api_key: null,
    settings: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function getAuthenticatedClient(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) throw new Error('Unauthorized');

  const clientId = req.headers.get('x-client-id') || req.headers.get('X-Client-Id');
  if (!clientId) {
    throw new Error('Client ID missing in headers');
  }

  try {
    const client = await getClient(clientId);
    if (!client) throw new Error('Client not found');
    if (client.user_id !== user.uid) throw new Error('Forbidden: Client does not belong to user');
    return { user, client };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String((err as any)?.message || err);
    if (VIRTUAL_CLIENT_ERRORS.includes(msg)) throw new Error(msg);
    // DB unavailable (missing tables, schema cache) — fall back to env-var config
    console.warn('[api-utils] DB lookup failed, using virtual client:', msg);
    return { user, client: virtualClient(user.uid, clientId) };
  }
}
