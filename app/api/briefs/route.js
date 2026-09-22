import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createBrief, listBriefs } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Gate on TFA_ACCESS_CODE (see .env.example) — without it set, this is a
// no-op and anyone can create a brief, same as before. With it set, a brief
// is only created when the request body's `code` matches, so /start (which
// posts here) can turn away anyone who wasn't given the code/link.
function accessCodeOk(bodyCode) {
  const required = process.env.TFA_ACCESS_CODE;
  if (!required) return true;
  return typeof bodyCode === 'string' && bodyCode.trim() === required.trim();
}

export async function POST(request) {
  let bodyCode;
  try {
    const body = await request.json();
    bodyCode = body?.code;
  } catch {
    bodyCode = undefined;
  }

  if (!accessCodeOk(bodyCode)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
  }

  const id = nanoid(12);
  const brief = await createBrief(id);
  return NextResponse.json(brief, { status: 201 });
}

export async function GET() {
  const briefs = await listBriefs();
  return NextResponse.json(briefs);
}
