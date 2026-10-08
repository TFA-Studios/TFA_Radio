import { requireStaffApi } from '../../../../lib/access';
import { NextResponse } from 'next/server';
import { listAgencies, createAgency } from '../../../../lib/db';

// Producer-only — gated by middleware.js, same as the other dashboard-only
// routes. Backs the dashboard's Agencies screen: the growing list of
// referring-agency access codes (see the STRING_COLUMNS/agencyCode comment
// in lib/db.js). GET lists them for the screen and for the delivery-tab's
// "suggest this agency's contact email" default; POST adds a new one.
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const agencies = await listAgencies();
  return NextResponse.json(agencies);
}

export async function POST(request) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const code = (body && body.code || '').trim();
  const name = (body && body.name || '').trim();
  const contactEmail = (body && body.contactEmail || '').trim();
  if (!code) return NextResponse.json({ error: 'missing_code' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'missing_name' }, { status: 400 });

  const result = await createAgency({ code, name, contactEmail, extraCodes: body.extraCodes, logoDark: body.logoDark, logoLight: body.logoLight, logoIcon: body.logoIcon });
  if (!result) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  if (result.error === 'duplicate_code') {
    return NextResponse.json({ error: 'duplicate_code' }, { status: 409 });
  }
  return NextResponse.json(result, { status: 201 });
}
