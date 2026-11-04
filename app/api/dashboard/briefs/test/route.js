import { requireStaffApi } from '../../../../../lib/access';
import { NextResponse } from 'next/server';
import { setBriefsTest } from '../../../../../lib/db';

// Producer-only: mark briefs as test briefs (or back to normal). Test briefs
// are left out of reports, the CSV export, the dashboard counts and Slack.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const ids = body && body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: 'invalid_ids' }, { status: 400 });
  }
  const count = await setBriefsTest(ids, body.test !== false);
  return NextResponse.json({ ok: true, count });
}
