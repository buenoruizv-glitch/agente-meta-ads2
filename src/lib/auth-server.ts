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
    console.log('verifyAuth - Verifying token with Supabase');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('verifyAuth - Supabase error:', error.message);
      return null;
    }
    if (!user) {
      console.log('verifyAuth - No user found for token');
      return null;
    }

    console.log('verifyAuth - User verified:', user.id);
    // Return object compatible with existing code (expects uid)
    return {
      ...user,
      uid: user.id,
    };
  } catch (err) {
    console.error('verifyAuth - Unexpected error:', err);
    return null;
  }
}
