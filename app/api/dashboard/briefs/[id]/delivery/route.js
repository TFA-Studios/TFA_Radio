import { NextResponse } from 'next/server';
import { saveDelivery } from '../../../../../../lib/db';
import { sendDeliveryEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js, same as the other dashboard-only
// brief routes. Backs the dashboard's "Uitlevering" tab (see
// DashboardClient.js), which only appears once the client has approved:
// saves the final WAV Frame.io link + recipient email on the brief
// (stamping deliveredAt and remembering the recipient for next time — see
// saveDelivery in lib/db.js), then fires the delivery email immediately.
// Deliberately generic, not Advision-specific — the recipient is whatever
// address the producer typed or picked, so the exact same flow covers a
// different agency or a client directly later.
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const link = (body && body.link || '').trim();
  const recipientEmail = (body && body.recipientEmail || '').trim();
  if (!link) return NextResponse.json({ error: 'missing_link' }, { status: 400 });
  if (!recipientEmail) return NextResponse.json({ error: 'missing_recipient' }, { status: 400 });

  const brief = await saveDelivery(params.id, { link, recipientEmail });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Never let a Resend/email hiccup undo the save above — the link and
  // recipient are already on record either way (same never-blocks
  // philosophy as every other notification in this app).
  try {
    await sendDeliveryEmail(brief, link, recipientEmail);
  } catch (err) {
    console.error('[api/dashboard/briefs/:id/delivery] sendDeliveryEmail failed:', err && err.message);
  }

  return NextResponse.json(brief);
}
