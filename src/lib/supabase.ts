import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Check your .env.local file.');
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('Supabase client initialized');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client with service_role key — ONLY for server-side use (cron jobs, etc.)
// Never expose this to the browser. Bypasses RLS.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

