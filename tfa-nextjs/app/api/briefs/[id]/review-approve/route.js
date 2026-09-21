import { NextResponse } from 'next/server';
import { approveReview, markAdminNotified } from '../../../../../lib/db';
import { notifyDelivered } from '../../../../../lib/slack';

// Public (like the rest of /api/briefs/*) — the client's private review
// page uses this to approve the current review round. On approval, the
// final Frame.io link is automatically posted to Slack (see notifyDelivered
// in lib/slack.js) — this used to also be a separate ADMIN_NOTIFY_EMAIL
// email (still defined as sendReviewApprovedNotification in lib/email.js,
// unused, if ever wanted back), but Karim wants everything internal routed
// through Slack rather than email.
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

  try {
    await notifyDelivered(brief, dashboardUrl, brief.frameioLink || '');
  } catch (err) {
    console.error('[api/briefs/:id/review-approve] notifyDelivered failed:', err && err.message);
  }

  let updated = brief;
  try {
    updated = (await markAdminNotified(params.id)) || brief;
  } catch (err) {
    console.error('[api/briefs/:id/review-approve] markAdminNotified failed:', err && err.message);
  }

  return NextResponse.json(updated);
}
