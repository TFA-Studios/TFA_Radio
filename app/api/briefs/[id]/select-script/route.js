import { NextResponse } from 'next/server';
import { toPublicBrief } from '../../../../../lib/publicBrief';
import { getBrief, selectScriptVersion } from '../../../../../lib/db';

// Public (like the rest of /api/briefs/*) — the client-flow script step
// uses this so the client can pick their favorite of the (up to 3) script
// proposals TFA's copywriter wrote; this just re-points
// generatedScript/generatedVarScript at the chosen history entry.
// Only works once a producer has released the proposals from the dashboard
// (scriptsReleasedAt) — before that the drafts are TFA-internal.
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const versionId = body && body.versionId;
  if (!versionId || typeof versionId !== 'string') {
    return NextResponse.json({ error: 'invalid_version_id' }, { status: 400 });
  }
  const existing = await getBrief(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!existing.scriptsReleasedAt) return NextResponse.json({ error: 'scripts_not_released' }, { status: 403 });
  if (existing.finalizedAt) return NextResponse.json({ error: 'already_finalized' }, { status: 409 });
  const updated = await selectScriptVersion(params.id, versionId);
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(toPublicBrief(updated));
}
