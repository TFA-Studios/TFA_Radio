import { NextResponse } from 'next/server';
import { rateLimit, clientIp, tooManyRequests } from '../../../lib/rateLimit';
import { toPublicBrief } from '../../../lib/publicBrief';
import { nanoid } from 'nanoid';
import { createBrief, findAgencyByCode } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Gate on TFA_ACCESS_CODE (see .env.example) — without it set, this is a
// no-op and anyone can create a brief, same as before. With it set, a brief
// is only created when the request body's `code` matches, so /start (which
// posts here) can turn away anyone who wasn't given the code/link.
//
// Agency codes (see the dashboard's Agencies screen, lib/db.js's
// agencies table) layer on top of this rather than replacing it: a code
// that matches a configured agency always gets through AND tags the new
// brief with that agency (see createBrief's second argument below) — that's
// the whole point, tracking which partner a client came in through. The
// bare TFA_ACCESS_CODE keeps working exactly as before as a fallback for a
// generic/no-agency link, so nothing breaks for anyone still using it.
function legacyCodeOk(bodyCode) {
  const required = process.env.TFA_ACCESS_CODE;
  if (!required) return true;
  return typeof bodyCode === 'string' && bodyCode.trim() === required.trim();
}

export async function POST(request) {
  // Public endpoint: cap how many briefs one address can create (30 / 10 min).
  const rl = rateLimit('create:' + clientIp(request), 30, 600000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  let bodyCode;
  try {
    const body = await request.json();
    bodyCode = body?.code;
  } catch {
    bodyCode = undefined;
  }

  const agency = typeof bodyCode === 'string' && bodyCode.trim() ? await findAgencyByCode(bodyCode) : null;

  if (!agency && !legacyCodeOk(bodyCode)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
  }

  const id = nanoid(12);
  const brief = await createBrief(id, agency);
  return NextResponse.json(toPublicBrief(brief), { status: 201 });
}

// NOTE: there used to be a public GET here that returned every client's brief.
// Nothing used it and it would have exposed other agencies' data, so it is gone;
// the producer dashboard reads briefs server-side (scoped per viewer).
