import { NextResponse } from 'next/server';
import { requireStaffApi } from '../../../../../../lib/access';
import { listEmailLog } from '../../../../../../lib/emailLog';

// Producer-only: every email sent for this brief and what we know about its delivery.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  return NextResponse.json(await listEmailLog(params.id));
}
