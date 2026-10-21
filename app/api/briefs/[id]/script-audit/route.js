import { NextResponse } from 'next/server';
import { toPublicBrief } from '../../../../../lib/publicBrief';
import { getBrief, saveEdit, saveScriptAudit, addInternalNote, logBriefEvent } from '../../../../../lib/db';
import { syncVariationsPatch } from '../../../../../lib/scriptSync';
import { notifyAuditReply } from '../../../../../lib/slack';

export const dynamic = 'force-dynamic';

// The client's answer to TFA's counter proposal on the script check.
//   { action: 'accept' }                 take over TFA's proposed text (if any)
//   { action: 'reply', message }         keep their own version and tell us why
export async function POST(request, { params }) {
  const body = (await request.json().catch(() => ({}))) || {};
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (brief.scriptAuditStatus !== 'counter') return NextResponse.json({ error: 'nothing_to_answer' }, { status: 409 });
  const now = new Date().toISOString();
  let current = brief;
  let message = '';
  if (body.action === 'accept') {
    if (brief.scriptCounterText && brief.scriptCounterText.trim()) {
      current = (await saveEdit(params.id, { editedScript: brief.scriptCounterText })) || current;
      const patch = syncVariationsPatch(current);
      if (patch) {
        current = (await saveEdit(params.id, { variationScripts: patch.variationScripts, variationsBase: patch.variationsBase })) || current;
        if (patch.reset) await addInternalNote(params.id, { author: 'Systeem', text: 'Het hoofdscript is sterk veranderd: de variaties zijn teruggezet naar het nieuwe script. Controleer wat per variatie moet verschillen.' }).catch(() => {});
      }
    }
    current = (await saveScriptAudit(params.id, { scriptAuditStatus: 'approved', scriptAuditedAt: now, scriptAuditReply: '' })) || current;
    await addInternalNote(params.id, { author: 'Klant', text: 'Klant nam ons tegenvoorstel voor het script over.' }).catch(() => {});
    await logBriefEvent(params.id, { actor: 'klant', type: 'counter_accepted', text: 'Klant nam ons tegenvoorstel over', detail: current.editedScript || '' });
  } else if (body.action === 'reply') {
    message = typeof body.message === 'string' ? body.message.trim().slice(0, 800) : '';
    if (!message) return NextResponse.json({ error: 'empty' }, { status: 400 });
    current = (await saveScriptAudit(params.id, { scriptAuditStatus: 'pending', scriptAuditReply: message, scriptAuditedAt: '' })) || current;
    await addInternalNote(params.id, { author: 'Klant', text: 'Reactie op ons scriptvoorstel: ' + message }).catch(() => {});
    await logBriefEvent(params.id, { actor: 'klant', type: 'counter_replied', text: 'Klant hield de eigen versie en reageerde', detail: message });
  } else {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }
  let dashboardUrl;
  try { dashboardUrl = new URL(request.url).origin + '/dashboard'; } catch (e) {}
  try { await notifyAuditReply(current, body.action === 'accept', message, dashboardUrl); } catch (err) { console.error('[script-audit] slack failed:', err && err.message); }
  return NextResponse.json(toPublicBrief(current));
}
