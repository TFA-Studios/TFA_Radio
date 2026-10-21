import { requireStaffApi } from '../../../../../lib/access';
import { NextResponse } from 'next/server';
import { setBriefsArchived } from '../../../../../lib/db';

// Producer-only "dashboard opruimen": soft-archives (or restores) briefs so
// the working view stays clean. Nothing is deleted — the CSV export and the
// archive view still hold everything.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const ids = body && body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: 'invalid_ids' }, { status: 400 });
  }
  const count = await setBriefsArchived(ids, body.archived !== false);
  return NextResponse.json({ ok: true, count });
}
