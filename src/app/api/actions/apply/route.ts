/**
 * /api/actions/apply/route.ts
 * 
 * Ejecuta en Meta Business la acción sugerida por el agente.
 * Recibe el ID de una sugerencia pendiente y la aplica directamente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { getSuggestionById, updateSuggestionStatus } from '@/lib/db-service';
import { pauseCampaign, updateCampaign } from '@/lib/meta-api';

export async function POST(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }

    const { suggestion_id } = await req.json();
    if (!suggestion_id) {
      return NextResponse.json({ error: 'suggestion_id required' }, { status: 400 });
    }

    // 1. Cargar sugerencia desde Supabase
    const suggestion = await getSuggestionById(suggestion_id);
    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }
    if (suggestion.client_id !== client.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (suggestion.status !== 'pending') {
      return NextResponse.json({ error: 'Suggestion already actioned' }, { status: 409 });
    }

    // 2. Obtener config Meta del usuario
    const metaConfig = {
      token: client.meta_access_token || process.env.META_ACCESS_TOKEN,
      adAccountId: client.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID,
    };

    const campaignId = suggestion.campaign_id;
    const action = suggestion.suggested_action;
    const value = suggestion.action_value as Record<string, number> || {};

    let actionResult = '';

    // 3. Ejecutar la acción en Meta
    switch (action) {
      case 'pause':
        await pauseCampaign(campaignId, metaConfig);
        actionResult = `Campaña "${suggestion.campaign_name}" pausada correctamente`;
        break;

      case 'increase_budget': {
        const percentage = value.percentage || 20;
        const currentBudget = value.current_budget || 0;
        const newBudget = currentBudget > 0
          ? Math.round(currentBudget * (1 + percentage / 100) * 100) // Meta usa centavos
          : null;
        if (newBudget) {
          await updateCampaign(campaignId, { daily_budget: newBudget }, metaConfig);
          actionResult = `Presupuesto aumentado un ${percentage}% para "${suggestion.campaign_name}"`;
        } else {
          actionResult = `No se pudo calcular el nuevo presupuesto — revisa manualmente`;
        }
        break;
      }

      case 'decrease_budget': {
        const percentage = value.percentage || 20;
        const currentBudget = value.current_budget || 0;
        const newBudget = currentBudget > 0
          ? Math.round(currentBudget * (1 - percentage / 100) * 100)
          : null;
        if (newBudget && newBudget > 0) {
          await updateCampaign(campaignId, { daily_budget: newBudget }, metaConfig);
          actionResult = `Presupuesto reducido un ${percentage}% para "${suggestion.campaign_name}"`;
        }
        break;
      }

      case 'activate':
        await updateCampaign(campaignId, { status: 'ACTIVE' }, metaConfig);
        actionResult = `Campaña "${suggestion.campaign_name}" activada`;
        break;

      case 'check_delivery':
      case 'rotate_creative':
      case 'expand_lal':
        // Estas acciones requieren intervención manual — registrar como "actioned" igualmente
        actionResult = `Acción registrada: ${action}. Requiere acción manual en Meta Business Manager.`;
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // 4. Marcar sugerencia como aplicada
    await updateSuggestionStatus(suggestion_id, 'applied');

    return NextResponse.json({
      success: true,
      action,
      campaign: suggestion.campaign_name,
      result: actionResult,
    });
  } catch (err) {
    console.error('[Apply Action] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to apply action';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Descartar sugerencia
export async function DELETE(req: NextRequest) {
  try {
    let client;
    try {
      const authResult = await getAuthenticatedClient(req);
      client = authResult.client;
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }

    const { suggestion_id } = await req.json();
    if (!suggestion_id) return NextResponse.json({ error: 'suggestion_id required' }, { status: 400 });

    const suggestion = await getSuggestionById(suggestion_id);
    if (!suggestion || suggestion.client_id !== client.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await updateSuggestionStatus(suggestion_id, 'dismissed');
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
