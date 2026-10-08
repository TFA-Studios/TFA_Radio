import { NextResponse } from 'next/server';
import { getBrief } from '../../../../../../lib/db';
import { requireBriefReadApi } from '../../../../../../lib/access';
import { buildBriefPdf } from '../../../../../../lib/briefPdf';

// Producer-only (gated by middleware's /api/dashboard/* matcher) — used by
// the "Download PDF" button in the dashboard's brief detail overlay, which
// used to just link out to the client-facing overview page. This renders a
// standalone PDF of the same information instead, so a producer has
// something they can save/print/forward without needing to open the app.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const brief = await getBrief(params.id);
  // Staff may download any brief; an agency login only its own clients'.
  const denied = await requireBriefReadApi(brief);
  if (denied) return denied;
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
