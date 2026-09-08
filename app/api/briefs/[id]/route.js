import { NextResponse } from 'next/server';
import { getBrief, updateBrief } from '../../../../lib/db';
import { sendConfirmationEmail, sendTeamNotificationEmail } from '../../../../lib/email';

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
    // Team-facing "a new brief just came in" ping — a team inbox email,
    // entirely separate from the client's own confirmation email above and
    // optional (no-op if TEAM_NOTIFY_EMAILS isn't configured). Never allowed
    // to turn a successful submission into a failed request.
    const dashboardUrl = appUrl ? appUrl + '/dashboard' : undefined;
    try {
      await sendTeamNotificationEmail(brief, dashboardUrl);
    } catch (err) {
      console.error('[api/briefs/:id] sendTeamNotificationEmail failed:', err && err.message);
    }
  }

  return NextResponse.json(brief);
}
