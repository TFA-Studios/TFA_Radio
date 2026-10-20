import { requireStaffApi } from '../../../../../../lib/access';
import { NextResponse } from 'next/server';
import { reopenScripts } from '../../../../../../lib/db';

// Producer-only — gated by middleware.js. Takes the released script proposals
// back (used when the client said none of them fit) so the copywriter stage
// can run again: write new drafts, then release them as usual.
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const brief = await reopenScripts(params.id);
  if (!brief) return NextResponse.json({ error: 'not_available', message: 'Kan de voorstellen niet terugnemen (al bevestigd door de klant?).' }, { status: 409 });
  return NextResponse.json(brief);
}
