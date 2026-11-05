import { NextResponse } from 'next/server';
import { requireStaffApi } from '../../../../../../../../lib/access';
import { getBrief } from '../../../../../../../../lib/db';
import { getSnapshot } from '../../../../../../../../lib/snapshots';
import { listEmailLog } from '../../../../../../../../lib/emailLog';
import { buildProofPdf } from '../../../../../../../../lib/proofPdf';

// Producer-only: the proof PDF of one saved copy.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const brief = await getBrief(params.id);
  const snapshot = brief ? await getSnapshot(params.id, params.snapId) : null;
  if (!brief || !snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pdf = await buildProofPdf(brief, snapshot, await listEmailLog(params.id));
  const safeName = (brief.companyName || 'brief').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'brief';
  const day = snapshot.createdAt.slice(0, 10);
  return new NextResponse(pdf, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="tfa-bewijs-${safeName}-${snapshot.kind}-${day}.pdf"` },
  });
}
