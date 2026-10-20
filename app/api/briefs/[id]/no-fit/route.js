import { NextResponse } from 'next/server';
import { toPublicBrief } from '../../../../../lib/publicBrief';
import { getBrief, saveScriptAudit, addInternalNote } from '../../../../../lib/db';
import { notifyNoFit } from '../../../../../lib/slack';

export const dynamic = 'force-dynamic';

// The quiet "none of these proposals fit" route under the script proposals.
// Deliberately light: it flags the brief for the team (to-do list, internal
// note, Slack) and does nothing else; a producer decides what happens next.
export async function POST(request, { params }) {
  const body = (await request.json().catch(() => ({}))) || {};
  const existing = await getBrief(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!existing.scriptsReleasedAt || existing.finalizedAt) return NextResponse.json({ error: 'not_available' }, { status: 409 });
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 800) : '';
  const now = new Date().toISOString();
  await saveScriptAudit(params.id, { scriptAuditStatus: 'nofit', scriptAuditReply: message, scriptAuditedAt: now });
  await addInternalNote(params.id, { author: 'Klant', text: 'Geen van de scriptvoorstellen past.' + (message ? ' Toelichting: ' + message : '') }).catch(() => {});
  const brief = await getBrief(params.id);
  let dashboardUrl;
  try { dashboardUrl = new URL(request.url).origin + '/dashboard'; } catch (e) {}
  try { await notifyNoFit(brief, message, dashboardUrl); } catch (err) { console.error('[no-fit] slack failed:', err && err.message); }
  return NextResponse.json(toPublicBrief(brief));
}
