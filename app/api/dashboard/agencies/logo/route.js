import { requireStaffApi } from '../../../../../lib/access';
import { NextResponse } from 'next/server';

// Staff-only: upload an agency logo/icon image to Blob storage and return its
// public URL, which the Agencies screen then saves on the agency. Logos are
// small, so a plain multipart POST is fine (no client-direct upload needed).
export const dynamic = 'force-dynamic';

const BLOB_ENABLED = !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const TYPES = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };
const MAX = 2 * 1024 * 1024;

export async function POST(request) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  if (!BLOB_ENABLED) {
    return NextResponse.json({ error: 'no_blob_store_configured', hint: 'Plak in plaats daarvan een https-link naar het logo.' }, { status: 501 });
  }
  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  const kind = String((form && form.get('kind')) || 'logo').replace(/[^a-z]/g, '') || 'logo';
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'unsupported_type' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'too_large' }, { status: 400 });
  try {
    const { put } = await import('@vercel/blob');
    const blob = await put(`agency-logos/${kind}.${ext}`, file, { access: 'public', addRandomSuffix: true, contentType: file.type });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json({ error: 'upload_failed', message: e.message }, { status: 500 });
  }
}
