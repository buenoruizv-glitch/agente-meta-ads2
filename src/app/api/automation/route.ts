import { NextRequest, NextResponse } from 'next/server';
import { evaluateRulesForCampaigns, DEFAULT_RULES, AutomationRule } from '@/lib/automation-engine';

// In production this would be stored in Firestore; using in-memory for now
let activeRules: AutomationRule[] = DEFAULT_RULES.map((r, i) => ({
  ...r,
  id: `default-${i}`,
  createdAt: new Date().toISOString(),
  triggerCount: 0,
}));

// GET /api/automation — list rules
export async function GET() {
  return NextResponse.json({ rules: activeRules });
}

// POST /api/automation — create a new rule
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newRule: AutomationRule = {
      ...body,
      id: `rule-${Date.now()}`,
      createdAt: new Date().toISOString(),
      triggerCount: 0,
    };
    activeRules.push(newRule);
    return NextResponse.json({ rule: newRule });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid rule data' }, { status: 400 });
  }
}

// PUT /api/automation — toggle or update a rule
export async function PUT(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    activeRules = activeRules.map(r => r.id === id ? { ...r, ...updates } : r);
    return NextResponse.json({ rules: activeRules });
  } catch {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
}

// DELETE /api/automation — remove a rule
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    activeRules = activeRules.filter(r => r.id !== id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
}
