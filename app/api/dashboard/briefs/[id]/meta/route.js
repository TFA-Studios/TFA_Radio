import { NextResponse } from 'next/server';
import { getBrief, updateBriefTeamMeta } from '../../../../../../lib/db';
import { sendAssignmentEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js, same as the status route.
// Updates the team-only assignedTo / dueDate fields on a brief.
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, 'assignedTo')) patch.assignedTo = body.assignedTo;
  if (Object.prototype.hasOwnProperty.call(body || {}, 'dueDate')) patch.dueDate = body.dueDate;

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
    try {
      await sendAssignmentEmail(brief, patch.assignedTo, dashboardUrl);
    } catch (err) {
      console.error('[api/dashboard/briefs/:id/meta] sendAssignmentEmail failed:', err && err.message);
    }
  }

  return NextResponse.json(brief);
}
