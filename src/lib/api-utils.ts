import { NextRequest } from 'next/server';
import { verifyAuth } from './auth-server';
import { getClient } from './db-service';

export async function getAuthenticatedClient(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) throw new Error('Unauthorized');

  const clientId = req.headers.get('x-client-id');
  if (!clientId) {
    throw new Error('Client ID missing in headers');
  }

  const client = await getClient(clientId);
  if (!client) {
    throw new Error('Client not found');
  }

  // Security check: ensure the client belongs to the authenticated user
  if (client.user_id !== user.uid) {
    throw new Error('Forbidden: Client does not belong to user');
  }

  return { user, client };
}
