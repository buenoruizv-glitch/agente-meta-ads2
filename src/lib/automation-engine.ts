/**
 * automation-engine.ts
 * Motor de monitorización de campañas Meta Ads.
 * 
 * ARQUITECTURA DE DOS CAPAS (sin tokens de Claude si todo está en verde):
 * - CAPA 1 (Gemini/Gratis): Cálculo de KPIs, clasificación por fase,
 *   detección de umbrales → construye un brief compacto.
 * - CAPA 2 (Claude/Tokens): Solo si hay alertas. Analiza el brief
 *   y genera sugerencias estratégicas accionables.
 */

import {
  getCampaigns,
  getCampaignInsights,
  calculateKPIs,
  pauseCampaign,
  updateCampaign,
  MetaConfig,
} from './meta-api';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type RuleConditionOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
export type RuleAction =
  | 'pause'
  | 'activate'
  | 'increase_budget'
  | 'decrease_budget'
  | 'notify'
  | 'create_lal';
export type RuleEntity = 'campaign' | 'adset' | 'ad';
export type CampaignPhase = 'learning' | 'optimization' | 'scaling' | 'mature';
export type AlertPriority = 'urgent' | 'warning' | 'opportunity';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  entity: RuleEntity;
  conditions: Array<{
    metric: string;
    operator: RuleConditionOperator;
    value: number;
    windowDays?: number;
  }>;
  action: RuleAction;
  actionParams?: Record<string, unknown>;
  notifySlack?: boolean;
  createdAt: string;
  lastTriggered?: string;
  triggerCount?: number;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  entityId: string;
  entityName: string;
  triggered: boolean;
  action?: RuleAction;
  actionParams?: Record<string, unknown>;
  metrics: Record<string, number>;
  timestamp: string;
  error?: string;
}

export interface CampaignAlert {
  metric: string;
  priority: AlertPriority;
  currentValue: number;
  threshold: number;
  label: string;
}

export interface AnalyzedCampaign {
  id: string;
  name: string;
  status: string;
  phase: CampaignPhase;
  ageDays: number;
  kpis7d: ReturnType<typeof calculateKPIs>;
  kpis30d?: ReturnType<typeof calculateKPIs> | null;
  alerts: CampaignAlert[];
  dailyBudget: number;
  spendYesterday: number;
  spendPace: number; // porcentaje del budget gastado ayer
}

// ─── Reglas por defecto ───────────────────────────────────────────────────────

export const DEFAULT_RULES: Omit<AutomationRule, 'id' | 'createdAt'>[] = [
  {
    name: 'Auto-pausa ROAS bajo',
    enabled: true,
    entity: 'campaign',
    conditions: [{ metric: 'roas', operator: 'lt', value: 2, windowDays: 2 }],
    action: 'pause',
    notifySlack: true,
  },
  {
    name: 'Auto-pausa CTR bajo',
    enabled: true,
    entity: 'campaign',
    conditions: [{ metric: 'ctr', operator: 'lt', value: 0.5, windowDays: 3 }],
    action: 'pause',
    notifySlack: true,
  },
  {
    name: 'Auto-pausa frecuencia alta',
    enabled: true,
    entity: 'campaign',
    conditions: [{ metric: 'frequency', operator: 'gt', value: 4 }],
    action: 'pause',
    notifySlack: true,
  },
  {
    name: 'Escalar presupuesto ROAS excelente',
    enabled: true,
    entity: 'campaign',
    conditions: [{ metric: 'roas', operator: 'gt', value: 4, windowDays: 2 }],
    action: 'increase_budget',
    actionParams: { percentage: 15 },
    notifySlack: true,
  },
  {
    name: 'Alerta frecuencia en riesgo',
    enabled: true,
    entity: 'campaign',
    conditions: [{ metric: 'frequency', operator: 'gt', value: 3.5 }],
    action: 'notify',
    notifySlack: true,
  },
];

// ─── Umbrales por fase ────────────────────────────────────────────────────────

interface Thresholds {
  roas: { urgent: number; warning: number; opportunity: number };
  ctr: { urgent: number; warning: number; opportunity: number };
  cpc: { urgent: number; warning: number };
  frequency: { urgent: number; warning: number };
  cpa_multiplier: { urgent: number; warning: number }; // vs objetivo
  spend_pace: { urgent: number; warning: number }; // % del budget gastado
}

const THRESHOLDS_BY_PHASE: Record<CampaignPhase, Thresholds> = {
  learning: {
    // En aprendizaje, casi no hay umbrales — dejar que Meta optimice
    roas: { urgent: -1, warning: -1, opportunity: -1 },
    ctr: { urgent: -1, warning: -1, opportunity: -1 },
    cpc: { urgent: -1, warning: -1 },
    frequency: { urgent: 8, warning: 6 }, // Solo si es muy alto
    cpa_multiplier: { urgent: -1, warning: -1 },
    spend_pace: { urgent: 0.1, warning: 0.2 }, // Si Meta no gasta, hay problema de entrega
  },
  optimization: {
    roas: { urgent: 1.5, warning: 2.5, opportunity: 4.0 },
    ctr: { urgent: 0.3, warning: 0.8, opportunity: 2.5 },
    cpc: { urgent: 3.0, warning: 1.8 },
    frequency: { urgent: 5.0, warning: 3.5 },
    cpa_multiplier: { urgent: 2.0, warning: 1.5 },
    spend_pace: { urgent: 0.2, warning: 0.6 },
  },
  scaling: {
    roas: { urgent: 2.0, warning: 3.0, opportunity: 4.0 },
    ctr: { urgent: 0.5, warning: 1.0, opportunity: 2.5 },
    cpc: { urgent: 2.5, warning: 1.5 },
    frequency: { urgent: 4.0, warning: 3.0 }, // Más estricto en escala
    cpa_multiplier: { urgent: 1.8, warning: 1.3 },
    spend_pace: { urgent: 0.2, warning: 0.7 },
  },
  mature: {
    roas: { urgent: 2.5, warning: 3.5, opportunity: 5.0 },
    ctr: { urgent: 0.5, warning: 1.0, opportunity: 3.0 },
    cpc: { urgent: 2.0, warning: 1.3 },
    frequency: { urgent: 3.5, warning: 2.8 }, // Muy estricto en madurez
    cpa_multiplier: { urgent: 1.5, warning: 1.2 },
    spend_pace: { urgent: 0.3, warning: 0.75 },
  },
};

// ─── Funciones de clasificación ───────────────────────────────────────────────

/**
 * Determina la fase del ciclo de vida de una campaña por su antigüedad.
 */
export function classifyCampaignPhase(createdAt: string): CampaignPhase {
  const ageDays = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (ageDays <= 7) return 'learning';
  if (ageDays <= 30) return 'optimization';
  if (ageDays <= 90) return 'scaling';
  return 'mature';
}

/**
 * Calcula la antigüedad en días de una campaña.
 */
export function getCampaignAgeDays(createdAt: string): number {
  return Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
}

// ─── Evaluación de umbrales ───────────────────────────────────────────────────

/**
 * Evalúa los KPIs de una campaña contra los umbrales correspondientes a su fase.
 * Devuelve las alertas activas ordenadas por prioridad.
 */
export function evaluateThresholdsByPhase(
  kpis: ReturnType<typeof calculateKPIs>,
  phase: CampaignPhase,
  spendPace: number
): CampaignAlert[] {
  const t = THRESHOLDS_BY_PHASE[phase];
  const alerts: CampaignAlert[] = [];

  // ROAS
  if (t.roas.urgent > 0 && kpis.roas < t.roas.urgent) {
    alerts.push({ metric: 'roas', priority: 'urgent', currentValue: kpis.roas, threshold: t.roas.urgent, label: `ROAS ${kpis.roas.toFixed(2)}x (umbral urgente: ${t.roas.urgent}x)` });
  } else if (t.roas.warning > 0 && kpis.roas < t.roas.warning) {
    alerts.push({ metric: 'roas', priority: 'warning', currentValue: kpis.roas, threshold: t.roas.warning, label: `ROAS ${kpis.roas.toFixed(2)}x (umbral aviso: ${t.roas.warning}x)` });
  } else if (t.roas.opportunity > 0 && kpis.roas > t.roas.opportunity) {
    alerts.push({ metric: 'roas', priority: 'opportunity', currentValue: kpis.roas, threshold: t.roas.opportunity, label: `ROAS excelente: ${kpis.roas.toFixed(2)}x` });
  }

  // CTR
  if (t.ctr.urgent > 0 && kpis.ctr < t.ctr.urgent) {
    alerts.push({ metric: 'ctr', priority: 'urgent', currentValue: kpis.ctr, threshold: t.ctr.urgent, label: `CTR ${kpis.ctr.toFixed(2)}% (urgente < ${t.ctr.urgent}%)` });
  } else if (t.ctr.warning > 0 && kpis.ctr < t.ctr.warning) {
    alerts.push({ metric: 'ctr', priority: 'warning', currentValue: kpis.ctr, threshold: t.ctr.warning, label: `CTR ${kpis.ctr.toFixed(2)}%` });
  } else if (t.ctr.opportunity > 0 && kpis.ctr > t.ctr.opportunity) {
    alerts.push({ metric: 'ctr', priority: 'opportunity', currentValue: kpis.ctr, threshold: t.ctr.opportunity, label: `CTR excelente: ${kpis.ctr.toFixed(2)}%` });
  }

  // CPC
  if (t.cpc.urgent > 0 && kpis.cpc > t.cpc.urgent) {
    alerts.push({ metric: 'cpc', priority: 'urgent', currentValue: kpis.cpc, threshold: t.cpc.urgent, label: `CPC ${kpis.cpc.toFixed(2)}€ (muy alto)` });
  } else if (t.cpc.warning > 0 && kpis.cpc > t.cpc.warning) {
    alerts.push({ metric: 'cpc', priority: 'warning', currentValue: kpis.cpc, threshold: t.cpc.warning, label: `CPC ${kpis.cpc.toFixed(2)}€` });
  }

  // Frecuencia
  if (t.frequency.urgent > 0 && kpis.frequency > t.frequency.urgent) {
    alerts.push({ metric: 'frequency', priority: 'urgent', currentValue: kpis.frequency, threshold: t.frequency.urgent, label: `Frecuencia ${kpis.frequency.toFixed(1)} (saturación)` });
  } else if (t.frequency.warning > 0 && kpis.frequency > t.frequency.warning) {
    alerts.push({ metric: 'frequency', priority: 'warning', currentValue: kpis.frequency, threshold: t.frequency.warning, label: `Frecuencia ${kpis.frequency.toFixed(1)} (en riesgo)` });
  }

  // Spend Pace
  if (t.spend_pace.urgent > 0 && spendPace < t.spend_pace.urgent) {
    alerts.push({ metric: 'spend_pace', priority: 'urgent', currentValue: spendPace, threshold: t.spend_pace.urgent, label: `Solo gastó el ${(spendPace * 100).toFixed(0)}% del budget — problema de entrega` });
  } else if (t.spend_pace.warning > 0 && spendPace < t.spend_pace.warning) {
    alerts.push({ metric: 'spend_pace', priority: 'warning', currentValue: spendPace, threshold: t.spend_pace.warning, label: `Gasto bajo: ${(spendPace * 100).toFixed(0)}% del budget diario` });
  }

  // Ordenar por prioridad: urgent > warning > opportunity
  const priorityOrder = { urgent: 0, warning: 1, opportunity: 2 };
  return alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// ─── Construcción del Brief ───────────────────────────────────────────────────

/**
 * Construye el brief compacto para Claude.
 * Solo incluye campañas con alertas activas.
 * Máximo ~500 tokens de entrada.
 */
export function buildClaudeBrief(campaigns: AnalyzedCampaign[]): string {
  const withAlerts = campaigns.filter(c => c.alerts.length > 0);
  if (withAlerts.length === 0) return '';

  const date = new Date().toLocaleDateString('es-ES');
  const lines: string[] = [
    `Fecha: ${date}`,
    `Campañas con alertas: ${withAlerts.length} de ${campaigns.length}`,
    '',
  ];

  for (const c of withAlerts) {
    const k = c.kpis7d;
    const k30 = c.kpis30d;
    lines.push(`CAMPAÑA: "${c.name}" [FASE: ${c.phase.toUpperCase()}, día ${c.ageDays}]`);
    lines.push(`Alertas: ${c.alerts.map(a => `${a.priority.toUpperCase()} (${a.label})`).join('; ')}`);
    lines.push(`KPIs 7d: ROAS ${k.roas.toFixed(2)} | CTR ${k.ctr.toFixed(2)}% | CPC ${k.cpc.toFixed(2)}€ | Frec ${k.frequency.toFixed(1)}`);
    if (k30) {
      lines.push(`KPIs 30d: ROAS ${k30.roas.toFixed(2)} | CTR ${k30.ctr.toFixed(2)}% | CPC ${k30.cpc.toFixed(2)}€`);
    }
    lines.push(`Budget diario: ${c.dailyBudget}€ | Gasto ayer: ${c.spendYesterday.toFixed(2)}€ (${(c.spendPace * 100).toFixed(0)}%)`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Pipeline principal de análisis ──────────────────────────────────────────

/**
 * Analiza todas las campañas activas de un usuario.
 * Devuelve campañas analizadas con KPIs, fase y alertas.
 * NO invoca a Claude — eso lo hace el cron una vez que tiene el resultado.
 */
export async function analyzeCampaigns(
  config?: MetaConfig
): Promise<AnalyzedCampaign[]> {
  const campaignsData = await getCampaigns(config);
  const campaigns = campaignsData?.data || [];
  const results: AnalyzedCampaign[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    let insights7d, insights30d;
    try {
      [insights7d, insights30d] = await Promise.all([
        getCampaignInsights(campaign.id, 'last_7d', config),
        getCampaignInsights(campaign.id, 'last_30d', config).catch(() => null),
      ]);
    } catch {
      continue;
    }

    const raw7d = insights7d?.data?.[0];
    if (!raw7d) continue;

    const kpis7d = calculateKPIs(raw7d);
    const raw30d = insights30d?.data?.[0];
    const kpis30d = raw30d ? calculateKPIs(raw30d) : null;

    const phase = classifyCampaignPhase(campaign.created_time || new Date().toISOString());
    const ageDays = getCampaignAgeDays(campaign.created_time || new Date().toISOString());

    const dailyBudget = parseInt(campaign.daily_budget || '0') / 100; // Meta devuelve en centavos
    const spendYesterday = parseFloat(raw7d.spend || '0') / 7; // Aproximación
    const spendPace = dailyBudget > 0 ? spendYesterday / dailyBudget : 1;

    const alerts = evaluateThresholdsByPhase(kpis7d, phase, spendPace);

    results.push({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      phase,
      ageDays,
      kpis7d,
      kpis30d,
      alerts,
      dailyBudget,
      spendYesterday,
      spendPace,
    });
  }

  return results;
}

// ─── Pipeline de evaluación de reglas (legado — para el endpoint manual) ─────

function extractMetric(kpis: ReturnType<typeof calculateKPIs>, metric: string): number {
  const map: Record<string, number> = {
    ctr: kpis.ctr, cpc: kpis.cpc, roas: kpis.roas,
    frequency: kpis.frequency, cpa: kpis.cpa, spend: kpis.spend,
    impressions: kpis.impressions, clicks: kpis.clicks, conversions: kpis.conversions,
  };
  return map[metric] ?? 0;
}

function evaluateCondition(value: number, operator: RuleConditionOperator, threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'lt': return value < threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
    default: return false;
  }
}

export async function evaluateRulesForCampaigns(
  rules: AutomationRule[],
  config?: MetaConfig
): Promise<RuleEvaluationResult[]> {
  const results: RuleEvaluationResult[] = [];
  const enabledRules = rules.filter(r => r.enabled && r.entity === 'campaign');
  if (enabledRules.length === 0) return [];

  const campaignsData = await getCampaigns(config);
  const campaigns = campaignsData.data || [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    let insightsData;
    try {
      insightsData = await getCampaignInsights(campaign.id, 'last_7d', config);
    } catch {
      continue;
    }

    const rawInsights = insightsData?.data?.[0];
    if (!rawInsights) continue;

    const kpis = calculateKPIs(rawInsights);

    for (const rule of enabledRules) {
      const conditionsMet = rule.conditions.every(cond => {
        const value = extractMetric(kpis, cond.metric);
        return evaluateCondition(value, cond.operator, cond.value);
      });

      const result: RuleEvaluationResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        entityId: campaign.id,
        entityName: campaign.name,
        triggered: conditionsMet,
        metrics: { ctr: kpis.ctr, cpc: kpis.cpc, roas: kpis.roas, frequency: kpis.frequency, spend: kpis.spend },
        timestamp: new Date().toISOString(),
      };

      if (conditionsMet) {
        result.action = rule.action;
        result.actionParams = rule.actionParams;
        try {
          if (rule.action === 'pause') {
            await pauseCampaign(campaign.id, config);
          } else if (rule.action === 'increase_budget') {
            const pct = (rule.actionParams?.percentage as number) || 15;
            const currentBudget = parseInt(campaign.daily_budget || '0');
            const newBudget = Math.round(currentBudget * (1 + pct / 100));
            await updateCampaign(campaign.id, { daily_budget: newBudget }, config);
          }
        } catch (err) {
          result.error = err instanceof Error ? err.message : 'Unknown error';
        }
      }

      results.push(result);
    }
  }

  return results;
}

// ─── Slack formatter (legado) ─────────────────────────────────────────────────

export function formatRuleResultForSlack(result: RuleEvaluationResult): string {
  const emoji = result.action === 'pause' ? '⏸️' :
                result.action === 'increase_budget' ? '📈' : '⚠️';
  return `${emoji} *${result.ruleName}*\n` +
    `Campaña: ${result.entityName}\n` +
    `Métricas: CTR ${result.metrics.ctr?.toFixed(2)}% | CPC ${result.metrics.cpc?.toFixed(2)}€ | ` +
    `ROAS ${result.metrics.roas?.toFixed(2)} | Frec. ${result.metrics.frequency?.toFixed(2)}\n` +
    `Acción ejecutada: ${result.action} ${result.error ? `❌ Error: ${result.error}` : '✅'}\n` +
    `Hora: ${new Date(result.timestamp).toLocaleString('es-ES')}`;
}
