'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { LoadingSpinner } from '@/components/ui';

export default function NewCampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    // Campaign
    campaignName: 'Mi Nueva Campaña (Borrador)',
    objective: 'OUTCOME_TRAFFIC',
    
    // Ad Set
    adSetName: 'Conjunto de Anuncios 1',
    dailyBudget: 10,
    
    // Ad
    adName: 'Anuncio 1',
    primaryText: '¡Descubre nuestra nueva colección de temporada!',
    headline: 'Oferta exclusiva por tiempo limitado',
    imageUrl: 'https://via.placeholder.com/1080x1080.png?text=Anuncio+de+Prueba',
    linkUrl: 'https://example.com',
    pageId: '', // Optional from UI, fallback to env
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 3));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/campaigns/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la campaña');
      }
      
      // Success - Redirect back to campaigns
      router.push('/campaigns');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Crear Campaña (Borrador)</h1>
          <p className="page-subtitle">Configura la estructura inicial de tu campaña para subirla a Meta.</p>
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', background: 'var(--bg-card)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        
        {/* Progress Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '12px', left: '0', right: '0', height: '2px', background: 'var(--border-color)', zIndex: 0 }} />
          <div style={{ position: 'absolute', top: '12px', left: '0', width: `${((step - 1) / 2) * 100}%`, height: '2px', background: 'var(--primary)', zIndex: 0, transition: 'width 0.3s ease' }} />
          
          {[1, 2, 3].map(s => (
            <div key={s} style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: step >= s ? 'var(--primary)' : 'var(--bg-body)',
              color: step >= s ? 'white' : 'var(--text-muted)',
              border: `2px solid ${step >= s ? 'var(--primary)' : 'var(--border-color)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', zIndex: 1
            }}>
              {s}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-red)', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Form Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {step === 1 && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Detalles de la Campaña</h3>
              
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Nombre de la Campaña</label>
                <input name="campaignName" value={formData.campaignName} onChange={handleChange} className="input" style={{ width: '100%' }} />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Objetivo</label>
                <select name="objective" value={formData.objective} onChange={handleChange} className="input" style={{ width: '100%' }}>
                  <option value="OUTCOME_TRAFFIC">Tráfico</option>
                  <option value="OUTCOME_LEADS">Leads</option>
                  <option value="OUTCOME_SALES">Ventas</option>
                  <option value="OUTCOME_AWARENESS">Reconocimiento</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Conjunto de Anuncios</h3>
              
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Nombre del Conjunto</label>
                <input name="adSetName" value={formData.adSetName} onChange={handleChange} className="input" style={{ width: '100%' }} />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Presupuesto Diario (€)</label>
                <input type="number" name="dailyBudget" value={formData.dailyBudget} onChange={handleChange} className="input" style={{ width: '100%' }} />
              </div>
              
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                * La segmentación por defecto se aplicará a toda España, mayores de 18 años. Podrás ajustarla más tarde en Meta.
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Creatividad del Anuncio</h3>
              
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Nombre del Anuncio</label>
                <input name="adName" value={formData.adName} onChange={handleChange} className="input" style={{ width: '100%' }} />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Texto Principal (Copy)</label>
                <textarea name="primaryText" value={formData.primaryText} onChange={handleChange} className="input" style={{ width: '100%', minHeight: '80px', resize: 'vertical' }} />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Titular</label>
                <input name="headline" value={formData.headline} onChange={handleChange} className="input" style={{ width: '100%' }} />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>URL de Destino</label>
                <input name="linkUrl" value={formData.linkUrl} onChange={handleChange} className="input" style={{ width: '100%' }} />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>URL de la Imagen (Prueba)</label>
                <input name="imageUrl" value={formData.imageUrl} onChange={handleChange} className="input" style={{ width: '100%' }} />
              </div>
              
              <div className="form-group">
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Page ID (Opcional, usa el de configuración si está vacío)</label>
                <input name="pageId" value={formData.pageId} onChange={handleChange} className="input" placeholder="Ej: 1234567890" style={{ width: '100%' }} />
              </div>
            </div>
          )}

        </div>

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
          <button className="btn btn-ghost" onClick={prevStep} disabled={step === 1 || loading}>
            Atrás
          </button>
          
          {step < 3 ? (
            <button className="btn btn-primary" onClick={nextStep}>
              Siguiente
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loading ? <LoadingSpinner size={16} /> : null}
              {loading ? 'Creando...' : 'Crear Borrador'}
            </button>
          )}
        </div>

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </AppLayout>
  );
}
