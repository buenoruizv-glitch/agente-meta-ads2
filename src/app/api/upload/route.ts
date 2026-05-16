import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS for storage uploads
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUCKET = 'creatives';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const uploadedFiles: { name: string; url: string; type: string; size: number }[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${user.uid}/${Date.now()}_${safeName}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (error) {
        console.error('[Upload] Error uploading file:', error.message);
        // Try to create the bucket if it doesn't exist
        if (error.message.includes('not found') || error.message.includes('does not exist')) {
          await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
          // Retry upload
          const { error: retryError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, buffer, {
              contentType: file.type || 'application/octet-stream',
              upsert: false,
            });
          if (retryError) throw new Error(retryError.message);
        } else {
          throw new Error(error.message);
        }
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from(BUCKET)
        .getPublicUrl(path);

      uploadedFiles.push({
        name: file.name,
        url: publicUrlData.publicUrl,
        type: file.type,
        size: file.size,
      });
    }

    return NextResponse.json({ files: uploadedFiles });
  } catch (err) {
    console.error('[Upload API] Error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


