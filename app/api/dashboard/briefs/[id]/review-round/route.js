import { NextResponse } from 'next/server';
import { addReviewRound } from '../../../../../../lib/db';
import { sendReviewReadyEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js (isProtectedRoute matches
// /api/dashboard/(.*)). Starts a new post-production review round — a new
// dated folder shared inside the brief's one Frame.io link (see the
// reviewRounds comment in lib/db.js). frameioLink is only required the
// first time a round is shared on this brief (it sets the master link);
// after that it's optional — omitting it (or resubmitting the same value)
// just reuses whatever link is already on the brief. folderDate defaults to
// today server-side if not given; note is an optional free-text label.
// Pushes the round onto brief.reviewRounds and emails the client a link to
// their private review page (app/brief/[id]/review).
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const frameioLink = (body && body.frameioLink ? String(body.frameioLink) : '').trim();
  const folderDate = (body && body.folderDate ? String(body.folderDate) : '').trim();
  const note = (body && body.note ? String(body.note) : '').trim();

  const brief = await addReviewRound(params.id, { frameioLink, folderDate, note });
  if (!brief) return NextResponse.json({ error: 'missing_frameio_link_or_not_found' }, { status: 400 });

  let appUrl;
  try {
    appUrl = new URL(request.url).origin;
  } catch (e) {
    appUrl = undefined;
  }
  let rounds = [];
  try {
    rounds = brief.reviewRounds ? JSON.parse(brief.reviewRounds) : [];
  } catch (e) {
    rounds = [];
  }
  const newRound = Array.isArray(rounds) && rounds.length ? rounds[rounds.length - 1] : null;

  const reviewUrl = appUrl ? appUrl + '/brief/' + brief.id + '/review' : '';
  if (reviewUrl) {
    try {
      await sendReviewReadyEmail(brief, reviewUrl, newRound);
    } catch (err) {
      console.error('[api/dashboard/briefs/:id/review-round] sendReviewReadyEmail failed:', err && err.message);
    }
  }

  return NextResponse.json(brief);
}
