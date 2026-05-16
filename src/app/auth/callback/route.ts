import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get('code');
  const redirect = requestUrl.searchParams.get('redirect') || '/dashboard';

  if (code) {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (!error && data.session) {
        const response = NextResponse.redirect(new URL(redirect, req.url));
        
        // Set the session cookie for SSR verification in verifyAuth
        response.cookies.set('sb-access-token', data.session.access_token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: data.session.expires_in,
        });
        
        return response;
      }
    } catch (err) {
      console.error('Auth callback error:', err);
    }
  }

  // Fallback if no code or error
  return NextResponse.redirect(new URL('/login?error=auth_failed', req.url));
}
