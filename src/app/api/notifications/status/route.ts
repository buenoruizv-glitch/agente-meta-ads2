import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { getUnreadCount, getMonitoringSchedule } from '@/lib/db-service';

export async function GET(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }
    const [unread, schedule] = await Promise.all([
      getUnreadCount(client.id),
      getMonitoringSchedule(client.id),
    ]);
    return NextResponse.json({ unread, schedule });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
