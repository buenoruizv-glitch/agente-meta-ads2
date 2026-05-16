import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { getCostSummary } from '@/lib/db-service';

export async function GET(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }
    
    const costs = await getCostSummary(client.id);
    return NextResponse.json({ costs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
