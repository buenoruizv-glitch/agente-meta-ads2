/**
 * /api/cron/weekly/route.ts
 * 
 * Informe estratégico semanal — se ejecuta los lunes a las 06:00 UTC.
 * Invoca a Claude una sola vez por usuario con datos de los últimos 7 días.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllActiveUsers, createNotification, getSuggestions } from '@/lib/db-service';
import { generateWeeklyReport } from '@/lib/expert-analysis';
import { analyzeCampaigns } from '@/lib/automation-engine';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Array<{ userId: string; status: string }> = [];

  try {
    const users = await getAllActiveUsers();
    console.log(`[Cron Weekly] Generando informes semanales para ${users.length} usuarios`);

    for (const user of users) {
      try {
        const metaConfig = {
          token: user.meta_access_token || process.env.META_ACCESS_TOKEN,
          adAccountId: user.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID,
        };

        // 1. Análisis actual de campañas
        const campaigns = await analyzeCampaigns(metaConfig);

        // 2. Sugerencias aplicadas y descartadas esta semana
        const applied = await getSuggestions(user.id, 'applied');
        const dismissed = await getSuggestions(user.id, 'dismissed');

        // 3. Construir brief semanal (~1200 tokens máx)
        const weeklyBrief = buildWeeklyBrief(campaigns, applied, dismissed);

        // 4. Claude genera el informe estratégico
        const anthropicKey = user.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
        const report = await generateWeeklyReport(weeklyBrief, anthropicKey || undefined);

        if (!report) {
          results.push({ userId: user.id, status: 'no_report' });
          continue;
        }

        // 5. Guardar como notificación de tipo informe semanal
        const weekStr = getWeekString();
        await createNotification(user.id, {
          type: 'weekly_report',
          priority: 'info',
          title: `📊 Informe Semanal — ${weekStr}`,
          summary: report.budget_recommendation,
          report_data: {
            key_learnings: report.key_learnings,
            next_week_priorities: report.next_week_priorities,
            budget_recommendation: report.budget_recommendation,
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

        results.push({ userId: user.id, status: 'ok' });
      } catch (userErr) {
        console.error(`[Cron Weekly] Error for user ${user.id}:`, userErr);
        results.push({ userId: user.id, status: 'error' });
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
