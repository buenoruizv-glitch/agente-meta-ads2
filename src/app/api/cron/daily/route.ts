/**
 * /api/cron/daily/route.ts
 * 
 * Punto de entrada del ciclo diario de monitorización autónoma.
 * Llamado por Vercel Cron Jobs cada día a las 08:00 (UTC+2).
 * Protegido por CRON_SECRET para que nadie externo lo invoque.
 * 
 * FLUJO (10 pasos del plan):
 * 1. Obtener usuarios activos con token Meta
 * 2. Para cada usuario: descargar métricas vía Meta API
 * 3. Gemini (gratis): calcular KPIs
 * 4. Gemini (gratis): clasificar por fase del ciclo de vida
 * 5. Gemini (gratis): evaluar umbrales por fase
 * 6. ¿Hay alertas? → No: guardar "todo en verde". Sí: continuar
 * 7. Construir brief compacto (~500 tokens)
 * 8. Claude (tokens): análisis estratégico → sugerencias
 * 9. Guardar notificación + sugerencias en Supabase
 * 10. Actualizar monitoring_schedule con next_run_at
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeCampaigns,
  buildClaudeBrief,
  AnalyzedCampaign,
} from '@/lib/automation-engine';
import { analyzeWithClaude } from '@/lib/expert-analysis';
import {
  getAllActiveUsers,
  createNotification,
  saveSuggestions,
  upsertMonitoringSchedule,
} from '@/lib/db-service';

// Calcula la próxima ejecución (mañana 06:00 UTC = 08:00 España)
function getNextRunAt(): string {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(6, 0, 0, 0);
  return next.toISOString();
}

export async function POST(req: NextRequest) {
  // ── Seguridad: solo Vercel Cron puede llamar esto ──────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runStarted = new Date().toISOString();
  const results: Array<{ userId: string; status: string; suggestions: number }> = [];

  try {
    // ── Paso 1: Obtener todos los usuarios activos ─────────────────────────
    const users = await getAllActiveUsers();
    console.log(`[Cron Daily] Iniciando ciclo para ${users.length} usuarios`);

    for (const user of users) {
      const metaConfig = {
        token: user.meta_access_token || process.env.META_ACCESS_TOKEN,
        adAccountId: user.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID,
      };

      try {
        // ── Paso 2-5: Capa Gemini (gratis) ─────────────────────────────────
        // Actualizar estado: fetching
        await upsertMonitoringSchedule(user.id, { current_phase: 'fetching' });

        const analyzedCampaigns = await analyzeCampaigns(metaConfig);
        const campaignsWithAlerts = analyzedCampaigns.filter(c => c.alerts.length > 0);

        // ── Paso 6: ¿Hay alertas? ───────────────────────────────────────────
        if (campaignsWithAlerts.length === 0) {
          // Todo en verde — generar reporte diario mínimo, sin Claude
          const summary = buildDailySummary(analyzedCampaigns);
          await createNotification(user.id, {
            type: 'daily_report',
            priority: 'info',
            title: `✅ ${new Date().toLocaleDateString('es-ES')} — Todo en orden`,
            summary,
            report_data: {
              campaigns: analyzedCampaigns.map(c => ({
                id: c.id,
                name: c.name,
                phase: c.phase,
                roas: c.kpis7d.roas,
                ctr: c.kpis7d.ctr,
                spend: c.kpis7d.spend,
              })),
            },
          });

          await upsertMonitoringSchedule(user.id, {
            last_run_at: runStarted,
            next_run_at: getNextRunAt(),
            last_run_status: 'all_green',
            last_run_summary: summary,
            campaigns_checked: analyzedCampaigns.length,
            suggestions_generated: 0,
            claude_invoked: false,
            current_phase: 'done',
          });

          results.push({ userId: user.id, status: 'all_green', suggestions: 0 });
          continue;
        }

        // ── Paso 7: Construir brief ─────────────────────────────────────────
        await upsertMonitoringSchedule(user.id, { current_phase: 'analyzing' });
        const brief = buildClaudeBrief(campaignsWithAlerts);

        // ── Paso 8: Claude — Análisis estratégico ──────────────────────────
        const anthropicKey = user.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
        const suggestions = await analyzeWithClaude(brief, anthropicKey || undefined);

        // ── Paso 9: Guardar en Supabase ────────────────────────────────────
        await upsertMonitoringSchedule(user.id, { current_phase: 'saving' });

        const urgentCount = suggestions.filter(s => s.priority === 'urgent').length;
        const opportunityCount = suggestions.filter(s => s.priority === 'opportunity').length;
        const priority = urgentCount > 0 ? 'urgent' : opportunityCount > 0 ? 'opportunity' : 'warning';

        const notifTitle = buildNotificationTitle(suggestions, analyzedCampaigns);
        const summary = buildDailySummary(analyzedCampaigns, suggestions.length);

        const notificationId = await createNotification(user.id, {
          type: urgentCount > 0 ? 'alert' : 'opportunity',
          priority,
          title: notifTitle,
          summary,
          report_data: {
            campaigns_checked: analyzedCampaigns.length,
            campaigns_with_alerts: campaignsWithAlerts.length,
            suggestions_count: suggestions.length,
          },
        });

        // Métricas globales para el snapshot
        const metricsSnapshot: Record<string, unknown> = {};
        analyzedCampaigns.forEach(c => {
          metricsSnapshot[c.id] = { roas: c.kpis7d.roas, ctr: c.kpis7d.ctr, cpc: c.kpis7d.cpc };
        });

        await saveSuggestions(user.id, notificationId, suggestions, metricsSnapshot);

        // ── Paso 10: Actualizar schedule ────────────────────────────────────
        await upsertMonitoringSchedule(user.id, {
          last_run_at: runStarted,
          next_run_at: getNextRunAt(),
          last_run_status: 'ok',
          last_run_summary: summary,
          campaigns_checked: analyzedCampaigns.length,
          suggestions_generated: suggestions.length,
          claude_invoked: true,
          current_phase: 'done',
        });

        results.push({ userId: user.id, status: 'ok', suggestions: suggestions.length });
      } catch (userErr) {
        console.error(`[Cron Daily] Error for user ${user.id}:`, userErr);
        await upsertMonitoringSchedule(user.id, {
          last_run_at: runStarted,
          next_run_at: getNextRunAt(),
          last_run_status: 'error',
          last_run_summary: `Error: ${userErr instanceof Error ? userErr.message : 'Unknown'}`,
          current_phase: 'idle',
        });
        results.push({ userId: user.id, status: 'error', suggestions: 0 });
      }
    }

    console.log(`[Cron Daily] Ciclo completado:`, results);
    return NextResponse.json({ success: true, results, runAt: runStarted });
  } catch (err) {
    console.error('[Cron Daily] Fatal error:', err);
    return NextResponse.json({ error: 'Cron failed', detail: String(err) }, { status: 500 });
  }
}

// También soportar GET para Vercel Cron Jobs (algunas versiones usan GET)
export { POST as GET };

// ─── Helpers de formato ────────────────────────────────────────────────────────

function buildDailySummary(campaigns: AnalyzedCampaign[], suggestionsCount = 0): string {
  const totalSpend = campaigns.reduce((s, c) => s + c.kpis7d.spend / 7, 0);
  const avgRoas = campaigns.length > 0
    ? campaigns.reduce((s, c) => s + c.kpis7d.roas, 0) / campaigns.length
    : 0;

  const lines = [
    `${campaigns.length} campañas revisadas`,
    `Gasto medio diario (7d): ${totalSpend.toFixed(2)}€`,
    `ROAS promedio: ${avgRoas.toFixed(2)}x`,
  ];

  if (suggestionsCount > 0) {
    lines.push(`${suggestionsCount} ${suggestionsCount === 1 ? 'sugerencia pendiente' : 'sugerencias pendientes'} de tu aprobación`);
  }

  return lines.join(' · ');
}

function buildNotificationTitle(suggestions: ReturnType<typeof Array.prototype.filter>, campaigns: AnalyzedCampaign[]): string {
  const date = new Date().toLocaleDateString('es-ES');
  const urgent = (suggestions as any[]).filter((s: any) => s.priority === 'urgent').length;
  const opps = (suggestions as any[]).filter((s: any) => s.priority === 'opportunity').length;

  if (urgent > 0) return `🔴 ${date} — ${urgent} acción urgente${urgent > 1 ? 'es' : ''} requer${urgent > 1 ? 'idas' : 'ida'}`;
  if (opps > 0) return `🟢 ${date} — ${opps} oportunidad${opps > 1 ? 'es' : ''} detectada${opps > 1 ? 's' : ''}`;
  return `🟡 ${date} — ${(suggestions as any[]).length} aviso${(suggestions as any[]).length > 1 ? 's' : ''} para revisar`;
}
