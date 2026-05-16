'use client';
import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { EmptyState, LoadingSkeleton } from '@/components/ui';
import { FlaskConical, Plus, Trophy, ChevronRight, AlertCircle } from 'lucide-react';

interface Variant {
  name: string; spend: number; conversions: number; cpa: number;
}

interface ABTest {
  id: string; name: string; status: 'RUNNING' | 'COMPLETED';
  variants: Variant[]; winner: string | null; confidence: number;
  startedAt: string;
}

export default function ABTestsPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ab-tests')
      .then(res => res.json())
      .then(data => {
        setTests(data.tests || []);
        setLoading(false);
      });
  }, []);

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">A/B Testing</h1>
          <p className="page-subtitle">Experimentos activos y resultados históricos</p>
        </div>
        <button className="btn btn-primary btn-sm">
          <Plus size={14} /> Nuevo Experimento
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        {loading ? (
          <>
            <LoadingSkeleton rows={4} height={120} />
            <LoadingSkeleton rows={4} height={120} />
          </>
        ) : tests.length === 0 ? (
          <EmptyState icon="🧪" title="No hay experimentos" description="Crea tu primer test A/B para optimizar resultados" />
        ) : (
          tests.map(test => (
            <div key={test.id} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
              {test.status === 'RUNNING' && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--status-blue)' }} />
              )}
              {test.status === 'COMPLETED' && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--status-green)' }} />
              )}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{test.name}</h3>
                    <span className={`badge ${test.status === 'RUNNING' ? 'badge-blue' : 'badge-green'}`}>
                      {test.status === 'RUNNING' ? '🏃‍♂️ En curso' : '✅ Finalizado'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Iniciado el {new Date(test.startedAt).toLocaleDateString('es-ES')} • Confianza estadística: {test.confidence}%
                  </div>
                </div>
                
                {test.status === 'RUNNING' && test.confidence < 90 && (
                  <div style={{ fontSize: '12px', color: 'var(--status-yellow)', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--status-yellow-bg)', padding: '4px 10px', borderRadius: '20px' }}>
                    <AlertCircle size={14} /> Recopilando datos
                  </div>
                )}
                
                {test.status === 'COMPLETED' && test.winner && (
                  <div style={{ fontSize: '12px', color: 'var(--status-green)', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--status-green-bg)', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 }}>
                    <Trophy size={14} /> Ganador: {test.winner}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {test.variants.map((v, i) => {
                  const isWinner = test.winner === v.name.charAt(0);
                  return (
                    <div key={i} style={{ 
                      background: 'var(--bg-elevated)', 
                      border: isWinner ? '1px solid var(--status-green)' : '1px solid var(--bg-border)',
                      borderRadius: 'var(--radius-sm)', 
                      padding: '16px',
                      position: 'relative'
                    }}>
                      {isWinner && <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--status-green)', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trophy size={12} /></div>}
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px', color: isWinner ? 'var(--status-green)' : 'var(--text-primary)' }}>
                        Variante {v.name}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>CPA</div>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>€{v.cpa.toFixed(2)}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Conversiones</div>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>{v.conversions}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Gasto</div>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>€{v.spend.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}
