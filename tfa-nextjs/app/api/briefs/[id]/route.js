import { NextResponse } from 'next/server';
import { getBrief, updateBrief } from '../../../../lib/db';
import { sendConfirmationEmail } from '../../../../lib/email';
import { notifyNewBrief } from '../../../../lib/slack';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(brief);
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));

  const before = await getBrief(params.id);
  const wasSubmitted = !!(before && before.submittedAt);

  const brief = await updateBrief(params.id, body || {});
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Unlike the original Express app (which fired this fire-and-forget after
  // responding), a Vercel serverless function can be frozen/terminated the
  // instant the response is sent — so we await it here, wrapped so a
  // failure never turns a successful submission into a 500.
  if (body && body.submitted && !wasSubmitted && brief.submittedAt) {
    // Same origin the dashboard link below is built from — reused so the
    // confirmation email can link back to the client's own overview page
    // inside the app (previously the email had no way back into the app at
    // all beyond re-finding the original URL).
    let appUrl;
    try {
      appUrl = new URL(request.url).origin;
    } catch (e) {
      appUrl = undefined;
    }
    try {
      await sendConfirmationEmail(brief, appUrl);
    } catch (err) {
      console.error('[api/briefs/:id] sendConfirmationEmail failed:', err && err.message);
    }
    // Team-facing "a new brief just came in" ping. Deliberately Slack-only
    // now, not email — Karim's call: the team-notification EMAIL
    // (sendTeamNotificationEmail in lib/email.js, still defined there if
    // ever wanted back) got dropped in favor of just this Slack ping plus
    // the dashboard's own "new/unseen" badge (see isUnseenBrief in
    // DashboardClient.js and app/dashboard/page.js), since the team is
    // always in Slack anyway and didn't want a second inbox ping on top of
    // the client's own confirmation email above.
    const dashboardUrl = appUrl ? appUrl + '/dashboard' : undefined;
    try {
      await notifyNewBrief(brief, dashboardUrl);
    } catch (err) {
      console.error('[api/briefs/:id] notifyNewBrief failed:', err && err.message);
    }
  }

  return NextResponse.json(brief);
}
