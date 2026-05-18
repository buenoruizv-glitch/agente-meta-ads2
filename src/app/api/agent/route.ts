export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { AGENT_SYSTEM_PROMPT } from '@/lib/agent-prompts';
import { getCampaigns, getAccountInsights, calculateKPIs } from '@/lib/meta-api';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { createCampaignDraftService } from '@/lib/meta-campaign-service';

async function getMetaConfig(req: NextRequest) {
  const { client } = await getAuthenticatedClient(req);
  return {
    token: (client.meta_access_token || process.env.META_ACCESS_TOKEN || '').trim(),
    adAccountId: (client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID || '').trim(),
    pixelId: (client.meta_pixel_id || process.env.META_PIXEL_ID || '').trim(),
    pageId: (client.meta_page_id || process.env.META_PAGE_ID || '').trim(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function enrichContext(metaConfig: Awaited<ReturnType<typeof getMetaConfig>>): Promise<string> {
  try {
    const [campaignsData, accountInsights] = await Promise.allSettled([
      withTimeout(getCampaigns(metaConfig), 8000),
      withTimeout(getAccountInsights('last_7d', metaConfig), 8000),
    ]);

    let block = '\n\n## Datos en tiempo real de tu cuenta\n';

    if (campaignsData.status === 'fulfilled') {
      const campaigns = campaignsData.value?.data || [];
      const active = campaigns.filter((c: { status: string }) => c.status === 'ACTIVE');
      const paused = campaigns.filter((c: { status: string }) => c.status === 'PAUSED');
      block += `- Campañas activas: ${active.length}\n`;
      block += `- Campañas pausadas: ${paused.length}\n`;
      if (active.length > 0) {
        block += `- Nombres activas: ${active.slice(0, 5).map((c: { name: string }) => c.name).join(', ')}\n`;
      }
    }

    if (accountInsights.status === 'fulfilled') {
      const insights = accountInsights.value?.data?.[0];
      if (insights) {
        const kpis = calculateKPIs(insights);
        block += `\n### KPIs últimos 7 días\n`;
        block += `- Gasto: €${kpis.spend.toFixed(2)} | CTR: ${kpis.ctr.toFixed(2)}% | CPC: €${kpis.cpc.toFixed(2)} | ROAS: ${kpis.roas.toFixed(2)}x | Conv: ${kpis.conversions}\n`;
      }
    }

    return block;
  } catch {
    return '\n\n(Contexto en tiempo real no disponible)';
  }
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_campaign_draft',
    description: 'Create a new Meta Ads campaign in DRAFT (PAUSED) mode. For multiple campaigns, call this tool multiple times in sequence.',
    input_schema: {
      type: 'object',
      properties: {
        campaignName: { type: 'string' },
        objective: { type: 'string', enum: ['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_AWARENESS'] },
        adSetName: { type: 'string' },
        dailyBudget: { type: 'number', description: 'Daily budget in euros' },
        adName: { type: 'string' },
        primaryText: { type: 'string' },
        headline: { type: 'string' },
        imageUrl: { type: 'string', description: 'URL of the image or video (.mp4/.mov = video)' },
        linkUrl: { type: 'string' },
        locations: { type: 'array', items: { type: 'string' } },
        radius: { type: 'number', description: 'Radius in km' },
        ageMin: { type: 'number' },
        ageMax: { type: 'number' },
        interests: { type: 'array', items: { type: 'string' } },
        placements: { type: 'array', items: { type: 'string' }, description: 'e.g. ["FEED","STORIES","REELS"]' },
      },
      required: ['campaignName', 'objective', 'adSetName', 'dailyBudget', 'adName', 'primaryText', 'headline', 'linkUrl'],
    },
  },
];

async function executeTool(name: string, params: any, metaConfig: Awaited<ReturnType<typeof getMetaConfig>>) {
  if (name === 'create_campaign_draft') {
    const payload = {
      ...params,
      pageId: metaConfig.pageId,
      imageUrl: params.imageUrl || 'https://via.placeholder.com/1080x1080.png?text=Anuncio',
    };
    const res = await createCampaignDraftService(payload, metaConfig);
    return { success: true, campaignId: res.campaign.id, adSetId: res.adSet.id, adId: res.ad.id };
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function POST(req: NextRequest) {
  try {
    const [metaConfig, body] = await Promise.all([
      getMetaConfig(req),
      req.json(),
    ]);

    const { messages, includeContext = true } = body;
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }

    const contextBlock = includeContext ? await enrichContext(metaConfig) : '';
    const systemPrompt = AGENT_SYSTEM_PROMPT + contextBlock;

    const { client } = await getAuthenticatedClient(req);
    const userSettings = (client as any).settings || {};
    const googleApiKey = userSettings.geminiKey || (client as any).google_gemini_api_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const anthropicApiKey = (client as any).anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    const preferredModel = userSettings.preferredModel || 'claude';

    let responseText = '';
    let usage = {};
    let currentModel = preferredModel;

    for (let attempt = 0; attempt < 2 && !responseText; attempt++) {

      // ─── CLAUDE (agentic loop) ──────────────────────────────────────────────
      if (currentModel === 'claude') {
        if (!anthropicApiKey) { currentModel = 'gemini'; continue; }
        try {
          const anthropicClient = new Anthropic({ apiKey: anthropicApiKey as string });

          const msgs: any[] = messages.reduce((acc: any[], m: any) => {
            if (acc.length === 0 && m.role !== 'user') return acc;
            const last = acc[acc.length - 1];
            if (last?.role === m.role) { last.content += '\n\n' + m.content; }
            else { acc.push({ role: m.role as 'user' | 'assistant', content: m.content }); }
            return acc;
          }, []);

          // Agentic loop — keeps going until no more tool calls (max 15 iterations)
          for (let iter = 0; iter < 15; iter++) {
            const response = await anthropicClient.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 2048,
              system: systemPrompt,
              messages: msgs,
              tools: TOOLS,
            });

            usage = response.usage;

            if (response.stop_reason !== 'tool_use') {
              const textBlock = response.content.find(c => c.type === 'text') as Anthropic.TextBlock | undefined;
              responseText = textBlock?.text || '';
              break;
            }

            // Process all tool calls in this response
            msgs.push({ role: 'assistant', content: response.content });
            const toolResults: any[] = [];

            const toolUses = response.content.filter(c => c.type === 'tool_use') as Anthropic.ToolUseBlock[];
            for (const tu of toolUses) {
              try {
                const result = await executeTool(tu.name, tu.input, metaConfig);
                toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
              } catch (err: any) {
                toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: err?.message || String(err) }), is_error: true });
              }
            }

            msgs.push({ role: 'user', content: toolResults });
          }
        } catch (err) {
          console.error('[Agent] Claude failed:', err);
          currentModel = 'gemini';
        }

      // ─── GEMINI (agentic loop) ──────────────────────────────────────────────
      } else {
        if (!googleApiKey) { currentModel = 'claude'; continue; }
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(googleApiKey as string);
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
            tools: [{
              functionDeclarations: TOOLS.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema as any,
              })),
            }] as any,
          });

          const history = messages.slice(0, -1).reduce((acc: any[], m: any) => {
            if (acc.length === 0 && m.role !== 'user') return acc;
            const role = m.role === 'assistant' ? 'model' : 'user';
            const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            const last = acc[acc.length - 1];
            if (last?.role === role) { last.parts[0].text += '\n\n' + text; }
            else { acc.push({ role, parts: [{ text }] }); }
            return acc;
          }, []);

          const chat = model.startChat({ history });

          // Agentic loop for Gemini
          let nextMessage: any = messages[messages.length - 1].content;
          for (let iter = 0; iter < 15; iter++) {
            const result = await chat.sendMessage(nextMessage);
            const response = result.response;
            const calls = response.functionCalls() || [];

            if (calls.length === 0) {
              responseText = response.text();
              break;
            }

            // Execute all tool calls and build tool result message
            const toolResultParts: any[] = [];
            for (const call of calls) {
              try {
                const res = await executeTool(call.name, call.args, metaConfig);
                toolResultParts.push({ functionResponse: { name: call.name, response: res } });
              } catch (err: any) {
                toolResultParts.push({ functionResponse: { name: call.name, response: { error: err?.message || String(err) } } });
              }
            }
            nextMessage = toolResultParts;
          }
        } catch (err) {
          console.error('[Agent] Gemini failed:', err);
          currentModel = 'claude';
        }
      }
    }

    if (!responseText) {
      throw new Error('No se pudo obtener respuesta del agente. Verifica las API Keys.');
    }

    return NextResponse.json({ message: responseText, usage });
  } catch (err) {
    console.error('[Agent API] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
