import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function verifyAuth(req: NextRequest) {
  // Try to get token from Authorization header
  const authHeader = req.headers.get('Authorization');
  let token = authHeader?.replace('Bearer ', '');

  // Fallback to Supabase standard cookie names
  if (!token) {
    token = req.cookies.get('sb-access-token')?.value;
  }

  if (!token) {
    console.log('verifyAuth - No token found in headers or cookies');
    return null;
  }

  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const authCall = supabase.auth.getUser(token).then(({ data: { user }, error }) => {
      if (error || !user) return null;
      return { ...user, uid: user.id };
    }).catch(() => null);

    const result = await Promise.race([authCall, timeout]);
    return result;
  } catch (err) {
    console.error('verifyAuth - Unexpected error:', err);
    return null;
  }
}
