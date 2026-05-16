import { NextRequest, NextResponse } from 'next/server';
import { evaluateRulesForCampaigns, AutomationRule, formatRuleResultForSlack } from '@/lib/automation-engine';
import { getClientRules, saveAutomationLog, incrementRuleTriggerCount } from '@/lib/db-service';
import { getAuthenticatedClient } from '@/lib/api-utils';

// POST /api/automation/run — triggered by cron or manually
// This is the main automation evaluation loop
export async function POST(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }

    // Get client automation rules from Supabase
    let rules = await getClientRules(client.id);

    if (rules.length === 0) {
      // Fallback to default rules if client has none
      const { DEFAULT_RULES } = await import('@/lib/automation-engine');
      rules = DEFAULT_RULES.map((r, i) => ({
        ...r,
        id: `default-${i}`,
        createdAt: new Date().toISOString(),
      })) as AutomationRule[];
    }

    // Only run enabled rules
    const activeRules = rules.filter(r => r.enabled);

    const metaConfig = {
      token: client.meta_access_token || process.env.META_ACCESS_TOKEN,
      adAccountId: client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID
    };

    const results = await evaluateRulesForCampaigns(activeRules, metaConfig);
    const triggered = results.filter(r => r.triggered);

    // Send Slack notifications for triggered rules using client's webhook
    const slackWebhookUrl = client.slack_webhook_url || process.env.SLACK_WEBHOOK_URL;

    if (slackWebhookUrl && triggered.length > 0) {
      const slackMessages = triggered.map(formatRuleResultForSlack).join('\n\n---\n\n');
      try {
        await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🤖 *Meta Ads Agent — Acciones automáticas ejecutadas*\n\n${slackMessages}`,
          }),
        });
      } catch {
        console.error('Failed to send Slack notification');
      }
    }

    // Update logs and trigger counts in Supabase
    for (const res of results) {
      // We save logs for everything (auditing), but only update counts for actual triggers
      await saveAutomationLog(client.id, res);

      if (res.triggered && !res.ruleId.startsWith('default-')) {
        await incrementRuleTriggerCount(res.ruleId);
      }
    }

    return NextResponse.json({
      evaluated: results.length,
      triggered: triggered.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Automation run failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
