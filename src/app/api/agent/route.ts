export const maxDuration = 60;
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

export async function POST(req: NextRequest) {
  try {
    const metaConfig = await getMetaConfig(req);
    const { messages, includeContext = true } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }

    // Enrich system prompt with live campaign context
    let systemPrompt = AGENT_SYSTEM_PROMPT;

    if (includeContext) {
      try {
        const [campaignsData, accountInsights] = await Promise.allSettled([
          getCampaigns(metaConfig),
          getAccountInsights('last_7d', metaConfig),
        ]);

        let contextBlock = '\n\n## Datos en tiempo real de tu cuenta\n';

        if (campaignsData.status === 'fulfilled') {
          const campaigns = campaignsData.value?.data || [];
          const active = campaigns.filter((c: { status: string }) => c.status === 'ACTIVE');
          const paused = campaigns.filter((c: { status: string }) => c.status === 'PAUSED');
          contextBlock += `- Campañas activas: ${active.length}\n`;
          contextBlock += `- Campañas pausadas: ${paused.length}\n`;
          if (active.length > 0) {
            contextBlock += `- Nombres activas: ${active.slice(0, 5).map((c: { name: string }) => c.name).join(', ')}\n`;
          }
        }

        if (accountInsights.status === 'fulfilled') {
          const insights = accountInsights.value?.data?.[0];
          if (insights) {
            const kpis = calculateKPIs(insights);
            contextBlock += `\n### KPIs últimos 7 días (cuenta completa)\n`;
            contextBlock += `- Gasto total: €${kpis.spend.toFixed(2)}\n`;
            contextBlock += `- CTR promedio: ${kpis.ctr.toFixed(2)}%\n`;
            contextBlock += `- CPC promedio: €${kpis.cpc.toFixed(2)}\n`;
            contextBlock += `- ROAS: ${kpis.roas.toFixed(2)}x\n`;
            contextBlock += `- Frecuencia: ${kpis.frequency.toFixed(2)}\n`;
            contextBlock += `- Conversiones: ${kpis.conversions}\n`;
          }
        }

        systemPrompt += contextBlock;
      } catch {
        // Context enrichment failed — continue without it
        systemPrompt += '\n\n(Nota: No se pudo cargar el contexto en tiempo real de la cuenta)';
      }
    }

    // Prepare messages for Anthropic API
    const anthropicMessages = messages.reduce((acc: any[], m: any) => {
      if (acc.length === 0 && m.role !== 'user') return acc;
      const lastMsg = acc[acc.length - 1];
      if (lastMsg && lastMsg.role === m.role) {
        lastMsg.content += '\n\n' + m.content;
      } else {
        acc.push({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        });
      }
      return acc;
    }, []);

    const tools: Anthropic.Tool[] = [
      {
        name: 'create_campaign_draft',
        description: 'Create a new Meta Ads campaign in DRAFT (PAUSED) mode. Call this when the user explicitly asks to create a campaign. Return the result to the user.',
        input_schema: {
          type: 'object',
          properties: {
            campaignName: { type: 'string', description: 'Name of the campaign' },
            objective: { type: 'string', enum: ['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_AWARENESS'] },
            adSetName: { type: 'string' },
            dailyBudget: { type: 'number', description: 'Daily budget in euros' },
            adName: { type: 'string' },
            primaryText: { type: 'string' },
            headline: { type: 'string' },
            imageUrl: { type: 'string', description: 'URL of the image or video to use. If it ends in .mp4, .mov, etc., it will be treated as a video.' },
            linkUrl: { type: 'string', description: 'Destination URL. Provide a default if not specified.' },
            locations: { type: 'array', items: { type: 'string' }, description: 'Target locations (cities, regions), e.g. ["Murcia"]' },
            radius: { type: 'number', description: 'Radius in km for locations' },
            ageMin: { type: 'number', description: 'Minimum age' },
            ageMax: { type: 'number', description: 'Maximum age' },
            interests: { type: 'array', items: { type: 'string' }, description: 'Target interests, e.g. ["Camping", "Travel"]' },
            placements: { type: 'array', items: { type: 'string' }, description: 'Ad placements, e.g. ["FEED", "STORIES", "REELS"]' },
          },
          required: ['campaignName', 'objective', 'adSetName', 'dailyBudget', 'adName', 'primaryText', 'headline', 'linkUrl']
        }
      }
    ];

    // 1. Get User Profile and Settings
    const { client } = await getAuthenticatedClient(req);
    const userSettings = client.settings || {};
    
    // API Keys (Priority: User Profile > Environment)
    const googleApiKey = userSettings.geminiKey || client.google_gemini_api_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const anthropicApiKey = client.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    
    // Model Preference
    const preferredModel = userSettings.preferredModel || 'gemini'; // Default to gemini if not set

    let responseText = '';
    let stopReason = '';
    let usage = {};

    // Logic: Try preferred model first. If it fails or is not available, try the other one.
    let currentModel = preferredModel;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !responseText) {
      attempts++;
      
      if (currentModel === 'gemini') {
        if (!googleApiKey) {
          currentModel = 'claude';
          continue;
        }
        try {
          // Use Gemini 2.5 Flash
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(googleApiKey as string);
          const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash', // Updated to latest stable Gemini 2.5 Flash
            systemInstruction: {
              role: 'system',
              parts: [{ text: systemPrompt }],
            },
            tools: [{
              functionDeclarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema as any,
              }))
            }] as any,
          });

          const history = messages.slice(0, -1).reduce((acc: any[], m: any) => {
            if (acc.length === 0 && m.role !== 'user') return acc;
            const mappedRole = m.role === 'assistant' ? 'model' : 'user';
            const textContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            const lastMsg = acc[acc.length - 1];
            if (lastMsg && lastMsg.role === mappedRole) {
              lastMsg.parts[0].text += '\n\n' + textContent;
            } else {
              acc.push({
                role: mappedRole,
                parts: [{ text: textContent }],
              });
            }
            return acc;
          }, []);

          const chat = model.startChat({ history });
          const lastMessage = messages[messages.length - 1].content;
          let result = await chat.sendMessage(lastMessage);
          let response = result.response;
          let call = response.functionCalls()?.[0];

          if (call) {
            const toolResults: any[] = [];
            if (call.name === 'create_campaign_draft') {
              try {
                const params = call.args as any;
                const payload = {
                  ...params,
                  pageId: metaConfig.pageId || process.env.META_PAGE_ID,
                  imageUrl: params.imageUrl || 'https://via.placeholder.com/1080x1080.png?text=Anuncio+de+Prueba',
                };
                const createRes = await createCampaignDraftService(payload, metaConfig);
                toolResults.push({
                  functionResponse: {
                    name: call.name,
                    response: { success: true, campaignId: createRes.campaign.id }
                  }
                });
              } catch (err: any) {
                toolResults.push({
                  functionResponse: {
                    name: call.name,
                    response: { error: err?.message || String(err) }
                  }
                });
              }
            }
            result = await chat.sendMessage(toolResults as any);
            response = result.response;
          }

          responseText = response.text();
          stopReason = 'end_turn';
        } catch (geminiErr) {
          console.error('[Agent API] Gemini attempt failed:', geminiErr);
          currentModel = 'claude'; // Switch for next attempt
        }
      } else if (currentModel === 'claude') {
        if (!anthropicApiKey) {
          currentModel = 'gemini';
          continue;
        }
        try {
          const anthropicClient = new Anthropic({ apiKey: anthropicApiKey });
          const response = await anthropicClient.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: anthropicMessages,
            tools: tools,
          });

          if (response.stop_reason === 'tool_use') {
            const toolUses = response.content.filter(c => c.type === 'tool_use') as Anthropic.ToolUseBlock[];
            if (toolUses.length > 0) {
              anthropicMessages.push({ role: 'assistant', content: response.content } as any);
              const toolResults: any[] = [];

              for (const toolUse of toolUses) {
                if (toolUse.name === 'create_campaign_draft') {
                  try {
                    const params = toolUse.input as any;
                    const payload = {
                      ...params,
                      pageId: metaConfig.pageId || process.env.META_PAGE_ID,
                      imageUrl: params.imageUrl || 'https://via.placeholder.com/1080x1080.png?text=Anuncio+de+Prueba',
                    };
                    const res = await createCampaignDraftService(payload, metaConfig);
                    toolResults.push({
                      type: 'tool_result',
                      tool_use_id: toolUse.id,
                      content: JSON.stringify({ success: true, campaignId: res.campaign.id }),
                    });
                  } catch (err: any) {
                    toolResults.push({
                      type: 'tool_result',
                      tool_use_id: toolUse.id,
                      content: JSON.stringify({ error: err?.message || String(err) }),
                      is_error: true,
                    });
                  }
                }
              }

              anthropicMessages.push({ role: 'user', content: toolResults } as any);
              const finalRes = await anthropicClient.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                system: systemPrompt,
                messages: anthropicMessages,
                tools: tools,
              });
              
              const textBlock = finalRes.content.find(c => c.type === 'text') as Anthropic.TextBlock;
              responseText = textBlock?.text || '';
              usage = finalRes.usage;
              stopReason = finalRes.stop_reason || '';
            }
          } else {
            const textBlock = response.content.find(c => c.type === 'text') as Anthropic.TextBlock;
            responseText = textBlock?.text || '';
            usage = response.usage;
            stopReason = response.stop_reason || '';
          }
        } catch (claudeErr) {
          console.error('[Agent API] Claude attempt failed:', claudeErr);
          currentModel = 'gemini'; // Switch for next attempt
        }
      }
    }

    if (!responseText) {
      throw new Error("No se pudo obtener respuesta del agente de IA. Todos los intentos con Gemini y Claude fallaron. Por favor, verifica la configuración de tus API Keys.");
    }

    return NextResponse.json({
      message: responseText,
      usage: usage,
      stopReason: stopReason,
    });
  } catch (err) {
    console.error('[Agent API] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
