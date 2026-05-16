import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { getAgentLogs } from '@/lib/db-service';

export async function GET(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const logs = await getAgentLogs(client.id, limit);
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
