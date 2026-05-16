'use client';
import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Zap, Mail, Lock, UserPlus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function RegisterContent() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        }
      });
      
      if (authError) throw authError;

      if (data.user) {
        // If email confirmation is disabled, we might get a session immediately
        if (data.session) {
          document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
          router.push('/dashboard');
        } else {
          setError('Cuenta creada. Revisa tu correo para confirmar la cuenta antes de iniciar sesión.');
          setLoading(false);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al crear la cuenta. Inténtalo de nuevo.');
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
          position: 'absolute', top: '-50px', left: '-50px',
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
            Crear <span style={{ color: 'var(--brand-primary)' }}>Cuenta</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
            Regístrate para empezar a automatizar tus anuncios
          </p>
        </div>

        {error && (
          <div style={{
            background: error.includes('creada') ? 'var(--status-green-bg)' : 'var(--status-red-bg)', 
            color: error.includes('creada') ? 'var(--status-green)' : 'var(--status-red)',
            padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '13px',
            border: `1px solid ${error.includes('creada') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

          <div className="form-group">
            <label className="label">Confirmar Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input 
                className="input" 
                type="password" 
                required 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{ paddingLeft: '38px' }} 
                placeholder="••••••••" 
              />
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '14px' }} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} disabled={loading}>
            {loading ? <span className="loading-dots"><span></span><span></span><span></span></span> : <><UserPlus size={16} /> Registrarse</>}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <Link href="/login" style={{ 
            color: 'var(--text-muted)', 
            fontSize: '13px', 
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.2s'
          }} onMouseOver={e => e.currentTarget.style.color = 'var(--brand-primary)'} 
             onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <ArrowLeft size={14} /> Ya tengo una cuenta. Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-dots"><span></span><span></span><span></span></div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
