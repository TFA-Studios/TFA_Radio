import { NextResponse } from 'next/server';
import { addReviewRound } from '../../../../../../lib/db';
import { sendReviewReadyEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js (isProtectedRoute matches
// /api/dashboard/(.*)). Starts a new post-production review round by
// pasting a Frame.io link — pushes it onto brief.reviewRounds and emails the
// client a link to their private review page (app/brief/[id]/review).
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const frameioLink = (body && body.frameioLink ? String(body.frameioLink) : '').trim();
  if (!frameioLink) {
    return NextResponse.json({ error: 'missing_frameio_link' }, { status: 400 });
  }

  const brief = await addReviewRound(params.id, { frameioLink });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let appUrl;
  try {
    appUrl = new URL(request.url).origin;
  } catch (e) {
    appUrl = undefined;
  }
  const reviewUrl = appUrl ? appUrl + '/brief/' + brief.id + '/review' : '';
  if (reviewUrl) {
    try {
      await sendReviewReadyEmail(brief, reviewUrl);
    } catch (err) {
      console.error('[api/dashboard/briefs/:id/review-round] sendReviewReadyEmail failed:', err && err.message);
    }
  }

  return NextResponse.json(brief);
}
