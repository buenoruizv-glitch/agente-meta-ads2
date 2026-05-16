import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // This was used for Firebase Session cookies. 
  // Supabase session is handled in /auth/callback.
  // We can keep it as a no-op or return an error if called.
  return NextResponse.json({ error: 'Use /auth/callback for session setup' }, { status: 400 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true }, { status: 200 });
  
  // Clear Supabase access token cookie
  response.cookies.set('sb-access-token', '', { maxAge: -1, path: '/' });
  
  return response;
}
