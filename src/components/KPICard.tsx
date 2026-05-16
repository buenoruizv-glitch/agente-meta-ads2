'use client';

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  status?: 'green' | 'yellow' | 'red' | 'neutral';
  icon?: string;
  format?: 'number' | 'percent' | 'currency' | 'multiplier';
}

function formatValue(value: string | number, format?: string): string {
  if (typeof value === 'string') return value;
  switch (format) {
    case 'percent': return `${value.toFixed(2)}%`;
    case 'currency': return `€${value.toFixed(2)}`;
    case 'multiplier': return `${value.toFixed(2)}x`;
    default: return value.toLocaleString('es-ES');
  }
}

export default function KPICard({ label, value, sub, trend, status = 'neutral', icon, format }: KPICardProps) {
  return (
    <div className={`kpi-card status-${status}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="kpi-label">{label}</span>
        {icon && <span style={{ fontSize: '20px' }}>{icon}</span>}
      </div>
      <div className="kpi-value">{formatValue(value, format)}</div>
      {sub && (
        <div className={`kpi-sub ${trend || ''}`}>
          {trend === 'up' && '↑'}
          {trend === 'down' && '↓'}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}
