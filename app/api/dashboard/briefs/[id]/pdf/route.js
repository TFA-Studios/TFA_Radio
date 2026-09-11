import { NextResponse } from 'next/server';
import { getBrief } from '../../../../../../lib/db';
import { buildBriefPdf } from '../../../../../../lib/briefPdf';

// Producer-only (gated by middleware's /api/dashboard/* matcher) — used by
// the "Download PDF" button in the dashboard's brief detail overlay, which
// used to just link out to the client-facing overview page. This renders a
// standalone PDF of the same information instead, so a producer has
// something they can save/print/forward without needing to open the app.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const brief = await getBrief(params.id);
  if (!brief) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const pdfBuffer = await buildBriefPdf(brief);
  const safeName = (brief.companyName || 'brief').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'brief';
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="tfa-overzicht-${safeName}.pdf"`,
    },
  });
}
