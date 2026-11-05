import { requireStaffApi } from '../../../../../lib/access';
import { NextResponse } from 'next/server';
import { deleteRemovableBriefs, getBrief } from '../../../../../lib/db';
import { deleteSnapshotsOf } from '../../../../../lib/snapshots';
import { deleteEmailLogOf } from '../../../../../lib/emailLog';

// Producer-only permanent delete. Only briefs that are already archived or
// marked as test are removed (enforced in the database layer), and the caller must send
// confirm: true so a stray request can never delete anything by accident.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const ids = body && body.ids;
  if (!body || body.confirm !== true) return NextResponse.json({ error: 'confirm_required' }, { status: 400 });
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: 'invalid_ids' }, { status: 400 });
  }
  const count = await deleteRemovableBriefs(ids);
  // The proof copies and email log go with the brief (only for briefs that are really gone).
  const gone = [];
  for (const id of ids) { if (!(await getBrief(id))) gone.push(id); }
  await deleteSnapshotsOf(gone);
  await deleteEmailLogOf(gone);
  console.log('[api/dashboard/briefs/delete] permanently deleted ' + count + ' archived/test brief(s).');
  return NextResponse.json({ ok: true, count });
}
