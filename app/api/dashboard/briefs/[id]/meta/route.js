import { NextResponse } from 'next/server';
import { getBrief, updateBriefTeamMeta } from '../../../../../../lib/db';
import { notifyAssigned } from '../../../../../../lib/slack';

// Producer-only — gated by middleware.js, same as the status route.
// Updates the team-only assignedTo field on a brief. dueDate used to be
// settable here too, but the dashboard no longer offers a manual internal
// deadline (see the comment above formatAirDate in components/flowData.js)
// — the DB column is left in place for old data, just nothing writes to it
// anymore.
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, 'assignedTo')) patch.assignedTo = body.assignedTo;
  // Fired once, the first time a producer opens a brief's detail view (see
  // DashboardClient.js's row click handler) — stamps seenAt so the "new,
  // unchecked brief" highlight on the list disappears. Never a way to
  // un-seen a brief from the client, deliberately.
  if (body && body.seen === true) patch.seen = true;

  // Read the brief before the update so an assignedTo change can be
  // detected — the assignment email should fire only when it actually
  // changes to a new, non-empty engineer, not on every meta save (e.g. a
  // deadline-only edit shouldn't re-notify whoever is already assigned).
  const before = await getBrief(params.id);
  const brief = await updateBriefTeamMeta(params.id, patch);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (
    Object.prototype.hasOwnProperty.call(patch, 'assignedTo') &&
    patch.assignedTo &&
    patch.assignedTo !== (before && before.assignedTo)
  ) {
    let dashboardUrl;
    try {
      dashboardUrl = new URL(request.url).origin + '/dashboard';
    } catch (e) {
      dashboardUrl = undefined;
    }
    // Slack ping only, deliberately — this used to be an email straight to
    // the assigned engineer's own inbox (sendAssignmentEmail in
    // lib/email.js, still defined there if ever wanted back), but Karim
    // decided a Slack ping in the shared channel covers it just as well
    // without adding another inbox notification.
    try {
      await notifyAssigned(brief, patch.assignedTo, dashboardUrl);
    } catch (err) {
      console.error('[api/dashboard/briefs/:id/meta] notifyAssigned failed:', err && err.message);
    }
  }

  return NextResponse.json(brief);
}
