/**
 * /api/cron/daily/route.ts
 *
 * Ciclo diario de monitorización — 100% sin tokens de IA.
 * Reglas deterministas basadas en umbrales KPI:
 *   ROAS < 2 + gasto > 10€ → pause (urgent)
 *   ROAS > 4              → increase_budget 15% (opportunity)
 *   CTR  < 0.5%           → rotate_creative (warning)
 *   Frecuencia > 4        → rotate_creative (warning)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCampaigns, getCampaignInsights, calculateKPIs } from '@/lib/meta-api';
import type { MetaConfig } from '@/lib/meta-api';
import type { ExpertSuggestion } from '@/lib/expert-analysis';
import {
  getAllActiveClients,
  createNotification,
  saveSuggestions,
  upsertMonitoringSchedule,
} from '@/lib/db-service';

interface SimpleCampaign {
  id: string;
  name: string;
  status: string;
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  frequency: number;
  conversions: number;
}

function getNextRunAt(): string {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(6, 0, 0, 0);
  return next.toISOString();
}

async function analyzeRuleBased(
  metaConfig: MetaConfig
): Promise<{ campaigns: SimpleCampaign[]; suggestions: ExpertSuggestion[] }> {
  const campaignsData = await getCampaigns(metaConfig);
  const allCampaigns: any[] = campaignsData?.data || [];
  const activeCampaigns = allCampaigns.filter(c => c.status === 'ACTIVE');

  const campaigns: SimpleCampaign[] = [];
  const suggestions: ExpertSuggestion[] = [];

  await Promise.all(
    activeCampaigns.map(async (c) => {
      try {
        const insightsData = await getCampaignInsights(c.id, 'last_7d', metaConfig);
        const raw = insightsData?.data?.[0];
        if (!raw) {
          campaigns.push({ id: c.id, name: c.name, status: c.status, spend: 0, roas: 0, ctr: 0, cpc: 0, frequency: 0, conversions: 0 });
          return;
        }

        const kpis = calculateKPIs(raw);
        campaigns.push({
          id: c.id,
          name: c.name,
          status: c.status,
          spend: kpis.spend,
          roas: kpis.roas,
          ctr: kpis.ctr,
          cpc: kpis.cpc,
          frequency: kpis.frequency,
          conversions: kpis.conversions,
        });

        // Rule 1: ROAS < 2 with meaningful spend → pause
        if (kpis.roas < 2 && kpis.roas > 0 && kpis.spend > 10) {
          suggestions.push({
            campaign_id: c.id,
            campaign_name: c.name,
            priority: 'urgent',
            action: 'pause',
            action_value: {},
            ai_title: `Pausar campaña — ROAS de ${kpis.roas.toFixed(2)}x por debajo del umbral mínimo`,
            ai_reasoning: `El ROAS de ${kpis.roas.toFixed(2)}x está por debajo del mínimo aceptable (2x) con un gasto de ${kpis.spend.toFixed(2)}€ en 7 días. Pausar evita más pérdidas mientras se revisa la estrategia.`,
            expected_outcome: 'Detener el sangrado de presupuesto hasta revisar audiencia y creatividades.',
          });
        }

        // Rule 2: ROAS > 4 → scale budget
        if (kpis.roas > 4 && kpis.spend > 5) {
          suggestions.push({
            campaign_id: c.id,
            campaign_name: c.name,
            priority: 'opportunity',
            action: 'increase_budget',
            action_value: { percentage: 15 },
            ai_title: `Escalar presupuesto — ROAS excelente de ${kpis.roas.toFixed(2)}x`,
            ai_reasoning: `La campaña lleva 7 días con ROAS ${kpis.roas.toFixed(2)}x, muy por encima del umbral (4x). Un incremento del 15% debería mantener el rendimiento y aumentar el volumen de conversiones.`,
            expected_outcome: 'Aumentar conversiones manteniendo un ROAS superior a 3.5x.',
          });
        }

        // Rule 3: CTR < 0.5% → rotate creative
        if (kpis.ctr < 0.5 && kpis.impressions > 500) {
          suggestions.push({
            campaign_id: c.id,
            campaign_name: c.name,
            priority: 'warning',
            action: 'rotate_creative',
            action_value: {},
            ai_title: `Rotar creatividades — CTR bajo (${kpis.ctr.toFixed(2)}%)`,
            ai_reasoning: `El CTR de ${kpis.ctr.toFixed(2)}% está muy por debajo del 0.5% con más de ${kpis.impressions.toLocaleString()} impresiones. La creatividad actual no está conectando con la audiencia.`,
            expected_outcome: 'Mejorar el CTR por encima del 1% con nuevas creatividades.',
          });
        }

        // Rule 4: High frequency → creative fatigue
        if (kpis.frequency > 4) {
          suggestions.push({
            campaign_id: c.id,
            campaign_name: c.name,
            priority: 'warning',
            action: 'rotate_creative',
            action_value: {},
            ai_title: `Fatiga creativa — Frecuencia de ${kpis.frequency.toFixed(1)}x`,
            ai_reasoning: `La frecuencia de ${kpis.frequency.toFixed(1)} indica que la audiencia ha visto el anuncio demasiadas veces. Esto suele provocar caída del CTR y aumento del CPM. Rotar creatividades frescaría la campaña.`,
            expected_outcome: 'Reducir la frecuencia efectiva y recuperar el engagement.',
          });
        }
      } catch {
        // Si no hay insights para una campaña, la ignoramos
      }
    })
  );

  return { campaigns, suggestions };
}

function buildDailySummary(campaigns: SimpleCampaign[], suggestionsCount = 0): string {
  if (campaigns.length === 0) return 'Sin campañas activas esta semana.';
  const totalSpend = campaigns.reduce((s, c) => s + c.spend / 7, 0);
  const avgRoas = campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length;

  const lines = [
    `${campaigns.length} campaña${campaigns.length > 1 ? 's' : ''} activa${campaigns.length > 1 ? 's' : ''} revisada${campaigns.length > 1 ? 's' : ''}`,
    `Gasto medio/día: ${totalSpend.toFixed(2)}€`,
    `ROAS promedio: ${avgRoas.toFixed(2)}x`,
  ];
  if (suggestionsCount > 0) {
    lines.push(`${suggestionsCount} ${suggestionsCount === 1 ? 'sugerencia pendiente' : 'sugerencias pendientes'}`);
  }
  return lines.join(' · ');
}

function buildNotificationTitle(suggestions: ExpertSuggestion[]): string {
  const date = new Date().toLocaleDateString('es-ES');
  const urgent = suggestions.filter(s => s.priority === 'urgent').length;
  const opps = suggestions.filter(s => s.priority === 'opportunity').length;
  if (urgent > 0) return `🔴 ${date} — ${urgent} acción urgente${urgent > 1 ? 'es' : ''} requeri${urgent > 1 ? 'das' : 'da'}`;
  if (opps > 0) return `🟢 ${date} — ${opps} oportunidad${opps > 1 ? 'es' : ''} detectada${opps > 1 ? 's' : ''}`;
  return `🟡 ${date} — ${suggestions.length} aviso${suggestions.length > 1 ? 's' : ''} para revisar`;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runStarted = new Date().toISOString();
  const results: Array<{ clientId: string; status: string; suggestions: number }> = [];

  try {
    const clients = await getAllActiveClients();
    console.log(`[Cron Daily] Iniciando ciclo sin tokens para ${clients.length} clientes`);

    for (const client of clients) {
      const metaConfig: MetaConfig = {
        token: (client.meta_access_token || process.env.META_ACCESS_TOKEN || '').trim(),
        adAccountId: (client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID || '').trim(),
      };

      try {
        await upsertMonitoringSchedule(client.id, { current_phase: 'fetching' });

        const { campaigns, suggestions } = await analyzeRuleBased(metaConfig);

        if (suggestions.length === 0) {
          const summary = buildDailySummary(campaigns);
          await createNotification(client.id, {
            type: 'daily_report',
            priority: 'info',
            title: `✅ ${new Date().toLocaleDateString('es-ES')} — Todo en orden`,
            summary,
            report_data: {
              campaigns: campaigns.map(c => ({
                id: c.id, name: c.name, roas: c.roas, ctr: c.ctr, spend: c.spend,
              })),
            },
          });
          await upsertMonitoringSchedule(client.id, {
            last_run_at: runStarted,
            next_run_at: getNextRunAt(),
            last_run_status: 'all_green',
            last_run_summary: summary,
            campaigns_checked: campaigns.length,
            suggestions_generated: 0,
            claude_invoked: false,
            current_phase: 'done',
          });
          results.push({ clientId: client.id, status: 'all_green', suggestions: 0 });
          continue;
        }

        await upsertMonitoringSchedule(client.id, { current_phase: 'saving' });

        const urgentCount = suggestions.filter(s => s.priority === 'urgent').length;
        const opportunityCount = suggestions.filter(s => s.priority === 'opportunity').length;
        const priority = urgentCount > 0 ? 'urgent' : opportunityCount > 0 ? 'opportunity' : 'warning';
        const summary = buildDailySummary(campaigns, suggestions.length);

        const notificationId = await createNotification(client.id, {
          type: urgentCount > 0 ? 'alert' : 'opportunity',
          priority,
          title: buildNotificationTitle(suggestions),
          summary,
          report_data: {
            campaigns_checked: campaigns.length,
            suggestions_count: suggestions.length,
          },
        });

        const metricsSnapshot: Record<string, unknown> = {};
        campaigns.forEach(c => {
          metricsSnapshot[c.id] = { roas: c.roas, ctr: c.ctr, cpc: c.cpc };
        });
        await saveSuggestions(client.id, notificationId, suggestions, metricsSnapshot);

        await upsertMonitoringSchedule(client.id, {
          last_run_at: runStarted,
          next_run_at: getNextRunAt(),
          last_run_status: 'ok',
          last_run_summary: summary,
          campaigns_checked: campaigns.length,
          suggestions_generated: suggestions.length,
          claude_invoked: false,
          current_phase: 'done',
        });

        results.push({ clientId: client.id, status: 'ok', suggestions: suggestions.length });
      } catch (clientErr) {
        console.error(`[Cron Daily] Error for client ${client.id}:`, clientErr);
        await upsertMonitoringSchedule(client.id, {
          last_run_at: runStarted,
          next_run_at: getNextRunAt(),
          last_run_status: 'error',
          last_run_summary: `Error: ${clientErr instanceof Error ? clientErr.message : 'Unknown'}`,
          current_phase: 'idle',
        });
        results.push({ clientId: client.id, status: 'error', suggestions: 0 });
      }
    }

    console.log(`[Cron Daily] Ciclo completado:`, results);
    return NextResponse.json({ success: true, results, runAt: runStarted });
  } catch (err) {
    console.error('[Cron Daily] Fatal error:', err);
    return NextResponse.json({ error: 'Cron failed', detail: String(err) }, { status: 500 });
  }
}

export { POST as GET };
