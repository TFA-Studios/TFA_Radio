import { NextResponse } from 'next/server';
import { getBrief, saveEdit } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// The client's own tweaks to the script they chose (editedScript /
// variationScripts). Only meaningful once TFA has released the proposals —
// before that there is nothing for the client to edit.
export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const existing = await getBrief(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!existing.scriptsReleasedAt) return NextResponse.json({ error: 'scripts_not_released' }, { status: 403 });
  const brief = await saveEdit(params.id, body || {});
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(brief);
}
