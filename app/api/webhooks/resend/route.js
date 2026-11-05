import { NextResponse } from 'next/server';
import { verifyWebhook } from '../../../../lib/svix';
import { applyEmailEvent } from '../../../../lib/emailLog';
import { EMAIL_PROBLEM_STATUSES, EMAIL_STATUS_LABELS } from '../../../../lib/emailStatus';
import { getBrief, logBriefEvent } from '../../../../lib/db';
import { postToSlack } from '../../../../lib/slack';

// Public on purpose (Resend calls it), so every request must carry a valid
// signature made with RESEND_WEBHOOK_SECRET; anything else is rejected. Keeps the
// delivery status of each email up to date (delivered, bounced, marked as spam)
// and pings Slack and the brief's history when an email did not arrive.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const body = await request.text();
  const ok = verifyWebhook({
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
    body,
    secret,
  });
  if (!ok) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });

  let event;
  try { event = JSON.parse(body); } catch (e) { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const data = (event && event.data) || {};
  const bounce = data.bounce && (data.bounce.message || data.bounce.type);
  const entry = await applyEmailEvent({ resendId: data.email_id, type: event && event.type, at: event && event.created_at, detail: bounce || data.reason || '' });
  // Unknown email (not one of ours): acknowledge so Resend does not keep retrying.
  if (!entry) return NextResponse.json({ ok: true, matched: false });

  if (entry.status !== entry.previousStatus && EMAIL_PROBLEM_STATUSES.includes(entry.status)) {
    try {
      const brief = await getBrief(entry.briefId);
      const name = (brief && brief.companyName) || entry.briefId;
      await logBriefEvent(entry.briefId, { actor: 'systeem', type: 'email_problem', text: 'E-mail niet aangekomen: ' + entry.kind + ' (' + (EMAIL_STATUS_LABELS[entry.status] || entry.status) + ')', detail: 'Aan: ' + entry.to + '\nOnderwerp: ' + entry.subject + (entry.detail ? '\nReden: ' + entry.detail : '') });
      await postToSlack(':warning: *E-mail niet aangekomen* bij ' + name + ': ' + entry.kind + ' aan ' + entry.to + ' (' + (EMAIL_STATUS_LABELS[entry.status] || entry.status) + '). Neem contact op met de klant.');
    } catch (err) {
      console.error('[webhooks/resend] follow-up failed:', err && err.message);
    }
  }
  return NextResponse.json({ ok: true, matched: true });
}
