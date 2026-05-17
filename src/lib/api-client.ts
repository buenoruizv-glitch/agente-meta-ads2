import { supabase } from '@/lib/supabase';

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});
  
  if (typeof window !== 'undefined') {
    // Attach the selected client ID
    const clientId = localStorage.getItem('currentClientId');
    if (clientId) {
      headers.set('X-Client-Id', clientId);
    }

    // Attach the Supabase access token as Authorization header
    // This is a reliable fallback in case the cookie is not sent (e.g., on some Vercel deployments)
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {
      // If session retrieval fails, the cookie will be used as fallback by verifyAuth
    }
  }
  
  return fetch(url, { ...options, headers });
};
