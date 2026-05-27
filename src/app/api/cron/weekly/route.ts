/**
 * /api/cron/weekly/route.ts
 * 
 * Informe estratégico semanal — se ejecuta los lunes a las 06:00 UTC.
 * Invoca a Claude una sola vez por usuario con datos de los últimos 7 días.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllActiveClients, createNotification, getSuggestions, saveSuggestions } from '@/lib/db-service';
import { generateWeeklyReport } from '@/lib/expert-analysis';
import { analyzeCampaigns } from '@/lib/automation-engine';

async function checkTokenExpiry() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/debug_token?input_token=${token}&access_token=${token}`);
    const data = await res.json();
    const info = data?.data;
    if (!info?.is_valid) {
      console.error('[Cron Weekly] ⚠️ META_ACCESS_TOKEN CADUCADO. Renuévalo en Vercel.');
      return;
    }
    if (info.expires_at) {
      const daysLeft = Math.floor((info.expires_at * 1000 - Date.now()) / 86400000);
      if (daysLeft < 14) {
        console.warn(`[Cron Weekly] ⚠️ Token Meta caduca en ${daysLeft} días. Renuévalo pronto.`);
      } else {
        console.log(`[Cron Weekly] ✅ Token Meta válido. Caduca en ${daysLeft} días.`);
      }
    }
  } catch (e) {
    console.warn('[Cron Weekly] No se pudo verificar el token Meta:', e);
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Always check token health on weekly run
  await checkTokenExpiry();

  const results: Array<{ clientId: string; status: string; suggestions?: number }> = [];

  try {
    const clients = await getAllActiveClients();
    console.log(`[Cron Weekly] Generando informes semanales para ${clients.length} clientes`);

    for (const client of clients) {
      try {
        const metaConfig = {
          token: client.meta_access_token || process.env.META_ACCESS_TOKEN,
          adAccountId: client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID,
        };

        // 1. Análisis actual de campañas
        const campaigns = await analyzeCampaigns(metaConfig);

        // 2. Sugerencias aplicadas y descartadas esta semana
        const applied = await getSuggestions(client.id, 'applied');
        const dismissed = await getSuggestions(client.id, 'dismissed');

        // 3. Construir brief semanal (~1200 tokens máx)
        const weeklyBrief = buildWeeklyBrief(campaigns, applied, dismissed);

        // 4. Claude genera el informe estratégico
        const anthropicKey = client.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
        const report = await generateWeeklyReport(weeklyBrief, anthropicKey || undefined);

        if (!report) {
          results.push({ clientId: client.id, status: 'no_report' });
          continue;
        }

        // 5. Guardar como notificación de tipo informe semanal
        const weekStr = getWeekString();
        const hasSuggestions = report.suggestions && report.suggestions.length > 0;
        const notificationId = await createNotification(client.id, {
          type: 'weekly_report',
          priority: hasSuggestions ? 'warning' : 'info',
          title: `📊 Informe Semanal — ${weekStr}`,
          summary: report.budget_recommendation,
          report_data: {
            key_learnings: report.key_learnings,
            next_week_priorities: report.next_week_priorities,
            budget_recommendation: report.budget_recommendation,
            suggestions_count: report.suggestions?.length || 0,
            campaigns_summary: campaigns.map(c => ({
              name: c.name,
              phase: c.phase,
              roas: c.kpis7d.roas,
              spend: c.kpis7d.spend,
              alerts: c.alerts.length,
            })),
            actions_this_week: {
              applied: applied.length,
              dismissed: dismissed.length,
            },
          },
        });

        // 6. Guardar sugerencias accionables para que el usuario las apruebe
        if (hasSuggestions) {
          const metricsSnapshot: Record<string, unknown> = {};
          campaigns.forEach(c => {
            metricsSnapshot[c.id] = { roas: c.kpis7d.roas, ctr: c.kpis7d.ctr, cpc: c.kpis7d.cpc };
          });
          await saveSuggestions(client.id, notificationId, report.suggestions!, metricsSnapshot);
        }

        results.push({ clientId: client.id, status: 'ok', suggestions: report.suggestions?.length || 0 });
      } catch (clientErr) {
        console.error(`[Cron Weekly] Error for client ${client.id}:`, clientErr);
        results.push({ clientId: client.id, status: 'error' });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[Cron Weekly] Fatal error:', err);
    return NextResponse.json({ error: 'Weekly cron failed' }, { status: 500 });
  }
}

export { POST as GET };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWeeklyBrief(
  campaigns: Awaited<ReturnType<typeof analyzeCampaigns>>,
  applied: any[],
  dismissed: any[]
): string {
  const lines: string[] = [`Semana del ${getWeekString()}`, ''];

  lines.push('RENDIMIENTO POR CAMPAÑA:');
  for (const c of campaigns) {
    const k = c.kpis7d;
    lines.push(
      `• "${c.name}" [${c.phase}, día ${c.ageDays}]: ` +
      `ROAS ${k.roas.toFixed(2)}x | CTR ${k.ctr.toFixed(2)}% | CPC ${k.cpc.toFixed(2)}€ | ` +
      `Gasto ${k.spend.toFixed(2)}€ | ${c.alerts.length} alertas`
    );
  }

  lines.push('');
  lines.push(`ACCIONES ESTA SEMANA:`);
  lines.push(`• Sugerencias aplicadas: ${applied.length}`);
  if (applied.length > 0) {
    applied.slice(0, 5).forEach(s => lines.push(`  ✅ ${s.ai_title} (${s.campaign_name})`));
  }
  lines.push(`• Sugerencias descartadas: ${dismissed.length}`);

  return lines.join('\n');
}

function getWeekString(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString('es-ES')} – ${sunday.toLocaleDateString('es-ES')}`;
}
