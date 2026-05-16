'use client';

interface StatusDotProps {
  status: 'green' | 'yellow' | 'red' | 'neutral';
  size?: number;
}

export function StatusDot({ status, size = 8 }: StatusDotProps) {
  const colors = {
    green: 'var(--status-green)',
    yellow: 'var(--status-yellow)',
    red: 'var(--status-red)',
    neutral: 'var(--text-muted)',
  };
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: colors[status],
      flexShrink: 0,
    }} />
  );
}

interface MetricCellProps {
  value: number;
  format?: 'percent' | 'currency' | 'multiplier' | 'number';
  status?: 'green' | 'yellow' | 'red' | 'neutral';
}

export function MetricCell({ value, format, status }: MetricCellProps) {
  const colors = {
    green: 'var(--status-green)',
    yellow: 'var(--status-yellow)',
    red: 'var(--status-red)',
    neutral: 'var(--text-primary)',
  };

  let display = '';
  switch (format) {
    case 'percent': display = `${value.toFixed(2)}%`; break;
    case 'currency': display = `€${value.toFixed(2)}`; break;
    case 'multiplier': display = `${value.toFixed(2)}x`; break;
    default: display = value.toLocaleString('es-ES');
  }

  return (
    <span style={{
      fontWeight: 600,
      color: status ? colors[status] : 'var(--text-primary)',
      fontFamily: 'Space Grotesk, sans-serif',
    }}>
      {display}
    </span>
  );
}

interface CampaignStatusBadgeProps {
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED' | string;
}

export function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green',
    PAUSED: 'badge-yellow',
    ARCHIVED: 'badge-gray',
    DELETED: 'badge-gray',
  };
  const labels: Record<string, string> = {
    ACTIVE: '● Activa',
    PAUSED: '◆ Pausada',
    ARCHIVED: '○ Archivada',
    DELETED: '✕ Eliminada',
  };
  return (
    <span className={`badge ${map[status] || 'badge-gray'}`}>
      {labels[status] || status}
    </span>
  );
}

interface LoadingSkeletonProps {
  rows?: number;
  height?: number;
}

export function LoadingSkeleton({ rows = 4, height = 20 }: LoadingSkeletonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, borderRadius: '6px', opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      textAlign: 'center',
      gap: '12px',
    }}>
      <div style={{ fontSize: '48px', lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {description && <div style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '320px' }}>{description}</div>}
    </div>
  );
}

export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      ` }} />
    </svg>
  );
}
