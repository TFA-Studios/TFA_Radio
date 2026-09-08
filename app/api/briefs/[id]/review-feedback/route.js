import { NextResponse } from 'next/server';
import { addReviewFeedback } from '../../../../../lib/db';
import { sendReviewFeedbackNotification } from '../../../../../lib/email';

// Public (like the rest of /api/briefs/*) — the client's private review
// page uses this to leave feedback on the current review round. Never
// blocked by any revision count (lib/flowData.js's INCLUDED_REVISIONS is a
// soft cap the dashboard flags internally, not enforced here).
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const text = (body && body.text ? String(body.text) : '').trim();
  if (!text) {
    return NextResponse.json({ error: 'missing_feedback_text' }, { status: 400 });
  }

  const brief = await addReviewFeedback(params.id, { text });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let dashboardUrl;
  try {
    dashboardUrl = new URL(request.url).origin + '/dashboard';
  } catch (e) {
    dashboardUrl = undefined;
  }

  let rounds = [];
  try {
    rounds = brief.reviewRounds ? JSON.parse(brief.reviewRounds) : [];
  } catch (e) {
    rounds = [];
  }
  const lastRound = Array.isArray(rounds) && rounds.length ? rounds[rounds.length - 1] : null;

  try {
    await sendReviewFeedbackNotification(brief, dashboardUrl, lastRound);
  } catch (err) {
    console.error('[api/briefs/:id/review-feedback] sendReviewFeedbackNotification failed:', err && err.message);
  }

  return NextResponse.json(brief);
}
