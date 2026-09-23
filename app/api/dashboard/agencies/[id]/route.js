import { NextResponse } from 'next/server';
import { updateAgency, deleteAgency } from '../../../../../lib/db';

// Producer-only — gated by middleware.js. Edit/retire an entry on the
// dashboard's Agencies screen (see the sibling route.js for list/create).
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, 'code')) patch.code = body.code;
  if (Object.prototype.hasOwnProperty.call(body || {}, 'name')) patch.name = body.name;
  if (Object.prototype.hasOwnProperty.call(body || {}, 'contactEmail')) patch.contactEmail = body.contactEmail;

  const result = await updateAgency(params.id, patch);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(request, { params }) {
  const ok = await deleteAgency(params.id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
