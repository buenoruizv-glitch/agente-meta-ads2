import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // In a real scenario, fetch A/B tests from Firestore
  return NextResponse.json({
    tests: [
      {
        id: 'ab_1',
        name: 'Prueba de copy: Verano vs Invierno',
        status: 'RUNNING',
        variants: [
          { name: 'A (Verano)', spend: 120, conversions: 12, cpa: 10.0 },
          { name: 'B (Invierno)', spend: 125, conversions: 8, cpa: 15.6 }
        ],
        winner: null,
        confidence: 85,
        startedAt: '2026-05-10T10:00:00Z',
      },
      {
        id: 'ab_2',
        name: 'Creatividades: Video vs Imagen estática',
        status: 'COMPLETED',
        variants: [
          { name: 'A (Video)', spend: 500, conversions: 45, cpa: 11.1 },
          { name: 'B (Imagen)', spend: 500, conversions: 30, cpa: 16.6 }
        ],
        winner: 'A',
        confidence: 96,
        startedAt: '2026-04-15T10:00:00Z',
      }
    ]
  });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    return NextResponse.json({ success: true, testId: 'ab_' + Date.now() });
  } catch (err) {
    return NextResponse.json({ error: 'Error creating test' }, { status: 500 });
  }
}
