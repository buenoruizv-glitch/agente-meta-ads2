import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/api-utils';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUCKET = 'creatives';

async function ensureBucket() {
  const { error } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (error) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
  }
}

// POST { files: [{ name, type, size }] }
// Returns signed upload URLs — the client uploads directly to Supabase (bypasses Vercel 4.5MB limit)
export async function POST(req: NextRequest) {
  try {
    let clientId: string;
    try {
      const authResult = await getAuthenticatedClient(req);
      clientId = authResult.client.id;
    } catch {
      return NextResponse.json({ error: 'Unauthorized or invalid client' }, { status: 401 });
    }

    const body = await req.json();
    const files: { name: string; type: string; size: number }[] = body.files;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    await ensureBucket();

    const results = await Promise.all(
      files.map(async (file) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${clientId}/${Date.now()}_${safeName}`;

        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUploadUrl(path);

        if (error) throw new Error(`Error generating signed URL for ${file.name}: ${error.message}`);

        const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

        return {
          name: file.name,
          type: file.type,
          size: file.size,
          path,
          signedUrl: data.signedUrl,
          token: data.token,
          publicUrl: publicUrlData.publicUrl,
        };
      })
    );

    return NextResponse.json({ files: results });
  } catch (err) {
    console.error('[Upload API] Error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
