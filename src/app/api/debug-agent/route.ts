import { NextRequest, NextResponse } from 'next/server';

/**
 * Public diagnostic endpoint — NO AUTH REQUIRED.
 * DELETE THIS FILE after debugging is complete.
 * Usage: GET /api/debug-agent
 */
export async function GET(req: NextRequest) {
  const checks: Record<string, any> = {};

  // 1. Check environment variables
  checks.env = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY?.slice(0, 10)}...)` : 'MISSING',
    GOOGLE_GENERATIVE_AI_API_KEY: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ? `set (${process.env.GOOGLE_GENERATIVE_AI_API_KEY?.slice(0, 10)}...)` : 'MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
    META_ACCESS_TOKEN: !!process.env.META_ACCESS_TOKEN ? `set (${process.env.META_ACCESS_TOKEN?.slice(0, 10)}...)` : 'MISSING',
    META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID || 'MISSING',
    NODE_ENV: process.env.NODE_ENV,
  };

  // 2. Check Supabase connectivity
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await sb.from('clients').select('id').limit(1);
    checks.supabase_clients_table = error ? `ERROR: ${error.message} (code: ${error.code})` : 'OK - clients table accessible';
  } catch (e: any) {
    checks.supabase_clients_table = `EXCEPTION: ${e.message}`;
  }

  // 3. Test Gemini API
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent('Say "OK" in one word.');
      const text = result.response.text();
      checks.gemini_api = `OK - response: "${text?.trim()}"`;
    } catch (e: any) {
      checks.gemini_api = `ERROR: ${e.message}`;
    }
  } else {
    checks.gemini_api = 'SKIPPED - no API key';
  }

  // 4. Test Anthropic API
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicKey });
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say OK' }],
      });
      const text = (response.content[0] as any).text;
      checks.anthropic_api = `OK - response: "${text?.trim()}"`;
    } catch (e: any) {
      checks.anthropic_api = `ERROR: ${e.message}`;
    }
  } else {
    checks.anthropic_api = 'SKIPPED - no API key';
  }

  // 5. Test Meta API
  const metaToken = process.env.META_ACCESS_TOKEN;
  const metaAccountId = process.env.META_AD_ACCOUNT_ID;
  if (metaToken && metaAccountId) {
    try {
      const url = `https://graph.facebook.com/v19.0/${metaAccountId}?fields=name,account_status&access_token=${metaToken}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        checks.meta_api = `ERROR: ${data.error.message} (code: ${data.error.code})`;
      } else {
        checks.meta_api = `OK - account: "${data.name}", status: ${data.account_status}`;
      }
    } catch (e: any) {
      checks.meta_api = `EXCEPTION: ${e.message}`;
    }
  } else {
    checks.meta_api = 'SKIPPED - missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID';
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    checks,
    summary: Object.entries(checks).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`),
  }, {
    headers: {
      'Cache-Control': 'no-store',
    }
  });
}
