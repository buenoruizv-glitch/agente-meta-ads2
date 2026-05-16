import { NextRequest, NextResponse } from 'next/server';
import { evaluateRulesForCampaigns, AutomationRule, formatRuleResultForSlack } from '@/lib/automation-engine';
import { getUserProfile, getUserRules, saveAutomationLog, incrementRuleTriggerCount } from '@/lib/db-service';
import { verifyAuth } from '@/lib/auth-server';

// POST /api/automation/run — triggered by cron or manually
// This is the main automation evaluation loop
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user settings (profile) from Supabase
    const profile = await getUserProfile(user.uid);
    const settings = profile || {};

    // Get user automation rules from Supabase
    let rules = await getUserRules(user.uid);
    
    if (rules.length === 0) {
      // Fallback to default rules if user has none
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
      token: settings.meta_access_token || process.env.META_ACCESS_TOKEN,
      adAccountId: settings.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID
    };

    const results = await evaluateRulesForCampaigns(activeRules, metaConfig);
    const triggered = results.filter(r => r.triggered);

    // Send Slack notifications for triggered rules using user's webhook
    const slackWebhookUrl = settings.slack_webhook_url || process.env.SLACK_WEBHOOK_URL;
    
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
       await saveAutomationLog(user.uid, res);
       
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
