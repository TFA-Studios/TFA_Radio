import { NextResponse } from 'next/server';
import { approveReview, markAdminNotified } from '../../../../../lib/db';
import { sendReviewApprovedNotification } from '../../../../../lib/email';

// Public (like the rest of /api/briefs/*) — the client's private review
// page uses this to approve the current review round. On approval, the
// final Frame.io link is automatically emailed to TFA's admin inbox (see
// sendReviewApprovedNotification / ADMIN_NOTIFY_EMAIL in lib/email.js).
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const brief = await approveReview(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found_or_no_round' }, { status: 404 });

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
  const approvedRound = Array.isArray(rounds) && rounds.length ? rounds[rounds.length - 1] : null;

  try {
    await sendReviewApprovedNotification(brief, { dashboardUrl, frameioLink: brief.frameioLink || '', round: approvedRound });
  } catch (err) {
    console.error('[api/briefs/:id/review-approve] sendReviewApprovedNotification failed:', err && err.message);
  }

  let updated = brief;
  try {
    updated = (await markAdminNotified(params.id)) || brief;
  } catch (err) {
    console.error('[api/briefs/:id/review-approve] markAdminNotified failed:', err && err.message);
  }

  return NextResponse.json(updated);
}
