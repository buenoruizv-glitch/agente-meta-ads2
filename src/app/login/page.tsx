'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Zap, Mail, Lock, LogIn } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (authError) throw authError;

      if (data.session) {
        // Set cookie manually for SSR verification
        const cookieStr = `sb-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
        document.cookie = cookieStr;
        
        router.push(redirectPath);
      } else {
        setError('Inicio de sesión exitoso, pero no se recibió una sesión activa. ¿Has verificado tu correo electrónico?');
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Credenciales incorrectas o usuario no encontrado.');
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${redirectPath}`
        }
      });
      if (authError) throw authError;
    } catch (err: any) {
      console.error(err);
      setError('Autenticación con Google fallida.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'radial-gradient(circle at center, var(--bg-surface) 0%, var(--bg-base) 100%)',
    }}>
      <div className="card card-glass" style={{
        maxWidth: '400px',
        width: '100%',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow effect */}
        <div style={{
          position: 'absolute', top: '-50px', right: '-50px',
          width: '150px', height: '150px', background: 'var(--brand-primary)',
          filter: 'blur(80px)', opacity: 0.15, borderRadius: '50%'
        }} />

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{
            width: '48px', height: '48px', background: 'var(--brand-gradient)',
            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: 'var(--glow-blue)'
          }}>
            <Zap size={24} color="white" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.5px' }}>
            Meta Ads <span style={{ color: 'var(--brand-primary)' }}>Agent</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
            Autentícate para acceder al dashboard
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--status-red-bg)', color: 'var(--status-red)',
            padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '13px',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={loginWithEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="label">Correo Electrónico</label>
            <div style={{ position: 'relative' }}>
              <input 
                className="input" 
                type="email" 
                required 
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ paddingLeft: '38px' }} 
                placeholder="ejemplo@empresa.com" 
              />
              <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '14px' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input 
                className="input" 
                type="password" 
                required 
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingLeft: '38px' }} 
                placeholder="••••••••" 
              />
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '14px' }} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} disabled={loading}>
            {loading ? <span className="loading-dots"><span></span><span></span><span></span></span> : <><LogIn size={16} /> Iniciar Sesión</>}
          </button>
        </form>

        <div className="divider" style={{ margin: '8px 0', position: 'relative', textAlign: 'center' }}>
          <span style={{ 
            background: 'var(--bg-card)', padding: '0 12px', color: 'var(--text-muted)', 
            fontSize: '12px', position: 'relative', top: '-28px' 
          }}>O continuar con</span>
        </div>

        <button 
          type="button" 
          onClick={loginWithGoogle}
          className="btn btn-secondary" 
          style={{ width: '100%', justifyContent: 'center', marginTop: '-16px' }}
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </button>

        <div style={{ textAlign: 'center', marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '24px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            ¿No tienes una cuenta? {' '}
            <a href="/register" style={{ 
              color: 'var(--brand-primary)', 
              fontWeight: 600, 
              textDecoration: 'none',
              transition: 'opacity 0.2s'
            }} onMouseOver={e => e.currentTarget.style.opacity = '0.8'} 
               onMouseOut={e => e.currentTarget.style.opacity = '1'}>
              Regístrate aquí
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-dots"><span></span><span></span><span></span></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
