import { NextResponse } from 'next/server';
import { activatePromptVersion, deactivatePromptVersion, revisePromptVersion, deletePromptVersion } from '../../../../../lib/promptVersions';

export const dynamic = 'force-dynamic';

// { action: 'activate' } makes this version the live one (and every other
// version inactive); { action: 'deactivate' } turns the live version off
// (script generation then falls back to the built-in default prompt until
// another version is made live); { action: 'update', label?, content? }
// edits the version's name and/or instructions — this NEVER overwrites the
// version in place, it creates a new one (e.g. 1.0 -> 1.1) carrying the
// edit, taking over as live if the edited-from version was live, and
// leaves the original version's own row untouched.
export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const action = body && body.action;
  if (action === 'update') {
    const patch = {};
    if (typeof body.label === 'string') patch.label = body.label;
    if (typeof body.content === 'string') patch.content = body.content;
    const revised = await revisePromptVersion(params.id, patch);
    if (!revised) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(revised);
  }
  if (action !== 'activate' && action !== 'deactivate') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }
  const updated = action === 'activate'
    ? await activatePromptVersion(params.id)
    : await deactivatePromptVersion(params.id);
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(updated);
}

// Permanently deletes one version. The client confirms with the producer
// before ever calling this — see PromptVersionsClient's confirmDelete.
export async function DELETE(request, { params }) {
  const ok = await deletePromptVersion(params.id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
