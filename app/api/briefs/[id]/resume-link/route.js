import { NextResponse } from 'next/server';
import { getBrief } from '../../../../../lib/db';
import { sendResumeLinkEmail } from '../../../../../lib/email';

// Public, unauthenticated — same trust level as the rest of /api/briefs/[id]:
// anyone with the brief's own unguessable id can already read/edit it via
// the flow itself, so emailing a link back to an address the client types
// in adds no new exposure.
//
// Lets a client email themselves the way back into an in-progress brief
// instead of having to bookmark the URL — every field already autosaves as
// they fill it in, so there's nothing to "save" here beyond re-delivering
// the link.
export async function POST(request, { params }) {
  const { id } = params;
  const brief = await getBrief(id);
  if (!brief) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  let email = '';
  try {
    const body = await request.json();
    email = (body.email || '').trim();
  } catch (e) {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid-email' }, { status: 400 });
  }

  const origin = request.headers.get('origin') || new URL(request.url).origin;
  const resumeUrl = origin + '/brief/' + id + '/contact';
  const result = await sendResumeLinkEmail(brief, email, resumeUrl);
  return NextResponse.json(result);
}
