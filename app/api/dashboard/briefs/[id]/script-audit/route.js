import { requireStaffApi } from '../../../../../../lib/access';
import { NextResponse } from 'next/server';
import { getBrief, saveScriptAudit, logBriefEvent } from '../../../../../../lib/db';
import { sendScriptCounterEmail, sendScriptApprovedEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js. The producer's side of the script
// check (what the client changed after TFA's proposals):
//   { action: 'approve', notify? }                  the changes are fine
//   { action: 'counter', note, counterText? }       send a counter proposal in the app
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) || {};
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const now = new Date().toISOString();
  let appUrl;
  try { appUrl = new URL(request.url).origin; } catch (e) {}

  if (body.action === 'approve') {
    const saved = await saveScriptAudit(params.id, { scriptAuditStatus: 'approved', scriptAuditedAt: now, scriptAuditNote: '', scriptCounterText: '', scriptAuditReply: '' });
    if (body.notify) {
      try { await sendScriptApprovedEmail(saved, appUrl); } catch (err) { console.error('[script-audit] email failed:', err && err.message); }
    }
    await logBriefEvent(params.id, { actor: 'tfa', type: 'audit_approved', text: 'TFA keurde de aanpassingen van de klant goed' });
    return NextResponse.json(saved);
  }

  if (body.action === 'counter') {
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1500) : '';
    const counterText = typeof body.counterText === 'string' ? body.counterText.trim().slice(0, 4000) : '';
    if (!note && !counterText) return NextResponse.json({ error: 'empty', message: 'Schrijf een toelichting of een voorgestelde tekst.' }, { status: 400 });
    const saved = await saveScriptAudit(params.id, { scriptAuditStatus: 'counter', scriptAuditNote: note, scriptCounterText: counterText, scriptAuditedAt: now, scriptAuditReply: '' });
    await logBriefEvent(params.id, { actor: 'tfa', type: 'audit_counter', text: 'TFA stuurde een tegenvoorstel', detail: [note, counterText].filter(Boolean).join('\n\n') });
    try { await sendScriptCounterEmail(saved, appUrl); } catch (err) { console.error('[script-audit] email failed:', err && err.message); }
    return NextResponse.json(saved);
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
