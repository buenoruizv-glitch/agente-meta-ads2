import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { getUnreadCount, getMonitoringSchedule } from '@/lib/db-service';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const [unread, schedule] = await Promise.all([
      getUnreadCount(user.uid),
      getMonitoringSchedule(user.uid),
    ]);
    return NextResponse.json({ unread, schedule });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
