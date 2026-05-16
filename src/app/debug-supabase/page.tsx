'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function DebugSupabase() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkConnection() {
      try {
        const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
        if (error) console.log('Supabase Error:', error);
        setStatus({
          success: !error,
          error: error ? {
            message: error.message || 'Unknown error (check console)',
            code: error.code,
            details: error.details,
            hint: error.hint
          } : null,
          data
        });
      } catch (err: any) {
        console.error('Catch Error:', err);
        setStatus({ success: false, error: { message: err.message } });
      } finally {
        setLoading(false);
      }
    }
    checkConnection();
  }, []);

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace' }}>
      <h1>Supabase Connection Debug</h1>
      <div style={{ marginBottom: '20px' }}>
        <strong>Project URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Using hardcoded values in supabase.ts'}
      </div>
      
      {loading ? (
        <p>Checking connection...</p>
      ) : (
        <pre style={{ 
          background: status.success ? '#dcfce7' : '#fee2e2', 
          padding: '20px', 
          borderRadius: '8px',
          border: `1px solid ${status.success ? '#22c55e' : '#ef4444'}`
        }}>
          {JSON.stringify(status, null, 2)}
        </pre>
      )}

      {!status?.success && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h3>Troubleshooting:</h3>
          <ul>
            <li>Ensure <strong>NEXT_PUBLIC_SUPABASE_URL</strong> and <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> are correct in <code>.env.local</code>.</li>
            <li>If you recently updated them, make sure to <strong>rebuild</strong> the app (run <code>start-prod.bat</code> again).</li>
            <li>Verify that <strong>CORS</strong> is allowed for <code>localhost:3000</code> in Supabase Settings {'>'} API.</li>
            <li>Check if the <strong>JWT Secret</strong> was recently rotated in Supabase Settings {'>'} API.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
