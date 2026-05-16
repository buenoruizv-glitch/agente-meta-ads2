import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { getSuggestions } from '@/lib/db-service';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const suggestions = await getSuggestions(user.uid, 'pending');
    return NextResponse.json(suggestions);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
