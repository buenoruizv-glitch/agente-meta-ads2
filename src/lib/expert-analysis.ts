/**
 * expert-analysis.ts
 * Módulo de análisis estratégico con Claude.
 * Claude actúa como media buyer senior: recibe un brief pre-procesado
 * (no datos crudos) y devuelve sugerencias concretas y accionables.
 * 
 * OPTIMIZACIÓN DE TOKENS:
 * - Solo se invoca si hay ≥1 alerta activa (Gemini lo determina antes).
 * - El brief de entrada tiene un máx. de ~500 tokens.
 * - La respuesta de Claude es JSON estructurado, sin texto libre extra.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ExpertSuggestion {
  campaign_id: string;
  campaign_name: string;
  priority: 'urgent' | 'warning' | 'opportunity';
  action: 'pause' | 'increase_budget' | 'decrease_budget' | 'rotate_creative' | 'expand_lal' | 'check_delivery';
  action_value: Record<string, number | string | null>;
  ai_title: string;       // Máx. 80 caracteres
  ai_reasoning: string;   // Máx. 3 frases
  expected_outcome: string;
}

export interface WeeklyInsight {
  key_learnings: string[];   // 3 aprendizajes de la semana
  next_week_priorities: string[]; // 2 prioridades
  budget_recommendation: string;  // 1 recomendación global
}

// Prompt del sistema — Se envía como `system` en cada llamada.
// Fijo y reutilizable, no cuenta para el historial de conversación.
const EXPERT_SYSTEM_PROMPT = `Eres un media buyer senior especializado en Meta Ads con 10 años de experiencia. 
Recibes briefs pre-analizados de campañas publicitarias y debes emitir sugerencias concretas y accionables.

REGLAS ESTRICTAS:
1. Solo emites UNA sugerencia por alerta detectada.
2. El razonamiento tiene MÁXIMO 3 frases cortas.
3. Tu respuesta debe ser SIEMPRE un JSON válido, sin texto adicional.
4. Priorizas siempre preservar el capital del cliente antes que escalar.
5. Nunca sugieres pausar una campaña en FASE DE APRENDIZAJE (días 0-7), salvo si el gasto diario es 0.
6. Para campañas en ESCALA (>30 días), priorizas análisis de frecuencia y fatiga creativa.
7. Una oportunidad de escalar budget solo se sugiere si hay al menos 5 días consecutivos con ROAS superior al umbral.

CRITERIOS DE EXPERTO:
- ROAS < 1.5 durante 3+ días en fase optimización: PAUSA INMEDIATA
- CTR < 0.3%: revisar creatividad y audiencia antes de pausar
- Frecuencia > 5: pausa o rotación de creatividades
- Gasto < 20% del budget: problema de entrega, no de rendimiento
- ROAS > 4x durante 5 días: escalar budget un 20%
- Frecuencia > 3.5 + CTR bajando: fatiga inminente, rotación de creatividad`;

const DAILY_JSON_SCHEMA = `{
  "suggestions": [
    {
      "campaign_id": "string",
      "campaign_name": "string",
      "priority": "urgent|warning|opportunity",
      "action": "pause|increase_budget|decrease_budget|rotate_creative|expand_lal|check_delivery",
      "action_value": { "percentage": 20 },
      "ai_title": "string (max 80 chars)",
      "ai_reasoning": "string (max 3 sentences)",
      "expected_outcome": "string (1 sentence)"
    }
  ]
}`;

const WEEKLY_JSON_SCHEMA = `{
  "key_learnings": ["string", "string", "string"],
  "next_week_priorities": ["string", "string"],
  "budget_recommendation": "string"
}`;

/**
 * Analiza campañas con alertas y genera sugerencias estratégicas.
 * Solo se llama si Gemini ha detectado ≥1 alerta.
 */
export async function analyzeWithClaude(
  brief: string,
  apiKey?: string
): Promise<ExpertSuggestion[]> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('No Anthropic API key available');

  const client = new Anthropic({ apiKey: key });

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,  // Respuesta corta — solo JSON
    system: EXPERT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analiza el siguiente brief de campañas con alertas y responde ÚNICAMENTE con un JSON válido siguiendo este schema:

${DAILY_JSON_SCHEMA}

BRIEF:
${brief}`,
      },
    ],
  });

  const textBlock = response.content.find(c => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return [];

  try {
    // Extraer JSON aunque venga envuelto en ```json ... ```
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.suggestions || [];
  } catch {
    console.error('[ExpertAnalysis] Failed to parse Claude response:', textBlock.text);
    return [];
  }
}

/**
 * Genera el informe estratégico semanal.
 * Se invoca una vez por semana por usuario.
 */
export async function generateWeeklyReport(
  weeklyBrief: string,
  apiKey?: string
): Promise<WeeklyInsight | null> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const client = new Anthropic({ apiKey: key });

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 512,
    system: EXPERT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Genera el informe semanal estratégico basado en estos datos. Responde ÚNICAMENTE con JSON válido:

${WEEKLY_JSON_SCHEMA}

DATOS SEMANALES:
${weeklyBrief}`,
      },
    ],
  });

  const textBlock = response.content.find(c => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return null;

  try {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error('[ExpertAnalysis] Failed to parse weekly report:', textBlock.text);
    return null;
  }
}
