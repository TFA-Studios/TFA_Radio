import { NextResponse } from 'next/server';
import { updateBriefStatus, STATUS_VALUES } from '../../../../../../lib/db';

// Producer-only — gated by middleware.js (isProtectedRoute matches
// /api/dashboard/(.*)), unlike the public /api/briefs/:id route the
// client-facing brief flow uses.
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { status } = body || {};

  if (!STATUS_VALUES.includes(status)) {
    return NextResponse.json(
      { error: 'invalid_status', allowed: STATUS_VALUES },
      { status: 400 }
    );
  }

  const brief = await updateBriefStatus(params.id, status);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(brief);
}
