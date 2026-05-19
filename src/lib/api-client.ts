import { supabase } from '@/lib/supabase';

export const apiFetch = async (url: string, options: RequestInit = {}, timeoutMs = 270_000) => {
  const headers = new Headers(options.headers || {});

  if (typeof window !== 'undefined') {
    const clientId = localStorage.getItem('currentClientId');
    if (clientId) headers.set('X-Client-Id', clientId);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers.set('Authorization', `Bearer ${token}`);
    } catch {
      // cookie fallback
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    return res;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('El agente tardó demasiado en responder (timeout). Intenta de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
