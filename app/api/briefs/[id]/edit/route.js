import { NextResponse } from 'next/server';
import { saveEdit } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const brief = await saveEdit(params.id, body || {});
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(brief);
}
