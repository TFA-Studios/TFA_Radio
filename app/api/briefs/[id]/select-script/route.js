import { NextResponse } from 'next/server';
import { selectScriptVersion } from '../../../../../lib/db';

// Public (like the rest of /api/briefs/*) — the client-flow script step
// uses this so the client can review all of their (up to 3) past script
// generations and pick their favorite one to go with; this just re-points
// generatedScript/generatedVarScript at the chosen history entry.
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const versionId = body && body.versionId;
  if (!versionId || typeof versionId !== 'string') {
    return NextResponse.json({ error: 'invalid_version_id' }, { status: 400 });
  }
  const updated = await selectScriptVersion(params.id, versionId);
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(updated);
}
