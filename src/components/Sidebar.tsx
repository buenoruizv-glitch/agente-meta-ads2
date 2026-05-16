'use client';

import { apiFetch } from '@/lib/api-client';
import { useClient } from '@/contexts/ClientContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, MessageSquare, Megaphone, BarChart3,
  FlaskConical, Zap, Settings, Plug, LogOut, Bell, Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

import { ClientSelector } from './ClientSelector';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/chat', icon: MessageSquare, label: 'Agente IA', badge: 'AI' },
  { href: '/campaigns', icon: Megaphone, label: 'Campañas' },
  { href: '/analytics', icon: BarChart3, label: 'Analítica' },
  { href: '/ab-tests', icon: FlaskConical, label: 'A/B Tests' },
  { href: '/automation', icon: Zap, label: 'Automatización' },
  { href: '/notifications', icon: Bell, label: 'Notificaciones', dynamic: true },
  { href: '/agent-status', icon: Activity, label: 'Estado Agente' },
];

const SECONDARY_ITEMS = [
  { href: '/integrations', icon: Plug, label: 'Integraciones' },
  { href: '/settings', icon: Settings, label: 'Configuración' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { currentClient } = useClient();
  const [unreadCount, setUnreadCount] = useState(0);

  // Polling ligero del badge de notificaciones cada 60s
  useEffect(() => {
    if (!currentClient) return;

    const fetchUnread = async () => {
      try {
        const res = await apiFetch('/api/notifications/status');
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.unread || 0);
        }
      } catch { /* silent */ }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [currentClient?.id]);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">📡</div>
        <div>
          <div className="sidebar-logo-text">Meta<span>Agent</span></div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>Powered by Claude AI</div>
        </div>
      </div>

      {/* Client Selector */}
      <div style={{ padding: '0 16px 16px 16px' }}>
        <ClientSelector />
      </div>

      {/* Main nav */}
      <div className="sidebar-section-label">Principal</div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ href, icon: Icon, label, badge, dynamic }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const showBadge = dynamic && unreadCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon className="nav-icon" size={16} />
              {label}
              {badge && !showBadge && <span className="nav-badge">{badge}</span>}
              {showBadge && (
                <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', minWidth: '18px', textAlign: 'center' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav */}
      <div className="sidebar-section-label" style={{ marginTop: 'auto' }}>Sistema</div>
      <nav className="sidebar-nav" style={{ marginBottom: '16px' }}>
        {SECONDARY_ITEMS.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${pathname === href ? 'active' : ''}`}
          >
            <Icon className="nav-icon" size={16} />
            {label}
          </Link>
        ))}
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            await apiFetch('/api/auth/session', { method: 'DELETE' });
            window.location.href = '/login';
          }}
          className="nav-item"
          style={{ width: '100%', textAlign: 'left', background: 'transparent', color: 'var(--status-red)', border: 'none', cursor: 'pointer' }}
        >
          <LogOut className="nav-icon" size={16} />
          Cerrar Sesión
        </button>
      </nav>
    </aside>
  );
}
