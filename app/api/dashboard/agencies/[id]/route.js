import { requireStaffApi } from '../../../../../lib/access';
import { NextResponse } from 'next/server';
import { updateAgency, deleteAgency } from '../../../../../lib/db';

// Producer-only — gated by middleware.js. Edit/retire an entry on the
// dashboard's Agencies screen (see the sibling route.js for list/create).
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, 'code')) patch.code = body.code;
  if (Object.prototype.hasOwnProperty.call(body || {}, 'name')) patch.name = body.name;
  if (Object.prototype.hasOwnProperty.call(body || {}, 'contactEmail')) patch.contactEmail = body.contactEmail;
  for (const k of ['userEmails', 'scriptMode', 'formKey', 'formConfig', 'logoDark', 'logoLight', 'logoIcon', 'extraCodes']) {
    if (Object.prototype.hasOwnProperty.call(body || {}, k)) patch[k] = body[k];
  }

  const result = await updateAgency(params.id, patch);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (result.error === 'duplicate_code') return NextResponse.json({ error: 'duplicate_code' }, { status: 409 });
  return NextResponse.json(result);
}

export async function DELETE(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const ok = await deleteAgency(params.id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
