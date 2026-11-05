import { NextResponse } from 'next/server';
import { requireStaffApi } from '../../../../../../lib/access';
import { getBrief, logBriefEvent } from '../../../../../../lib/db';
import { listSnapshots } from '../../../../../../lib/snapshots';
import { captureProof } from '../../../../../../lib/proofCapture';

// Producer-only. The proof copies of what the client filled in and chose (see
// lib/snapshots.js). GET lists them; POST lets TFA save a copy of the brief as
// it is right now (for clients who were already busy before this existed).
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  return NextResponse.json(await listSnapshots(params.id));
}

export async function POST(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const saved = await captureProof(request, brief, 'manual');
  if (!saved) return NextResponse.json({ error: 'failed', message: 'Vastleggen is niet gelukt. Probeer het opnieuw.' }, { status: 500 });
  await logBriefEvent(params.id, { actor: 'tfa', type: 'proof_saved', text: 'TFA legde de brief vast als bewijs' });
  return NextResponse.json(await listSnapshots(params.id));
}
