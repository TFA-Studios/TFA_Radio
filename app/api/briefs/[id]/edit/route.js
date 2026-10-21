import { NextResponse } from 'next/server';
import { toPublicBrief } from '../../../../../lib/publicBrief';
import { getBrief, saveEdit, saveScriptAudit, addInternalNote, logBriefEvent } from '../../../../../lib/db';
import { syncVariationsPatch } from '../../../../../lib/scriptSync';
import { scriptChangesOf } from '../../../../../components/flowData';

export const dynamic = 'force-dynamic';

// The client's own tweaks to the script they chose (editedScript /
// variationScripts). Only meaningful once TFA has released the proposals —
// before that there is nothing for the client to edit.
//
// `syncVariations: true` (sent when the client approves the main script)
// carries the edit into the variations: they keep their own change and get
// the client's edit on top, instead of staying on the copywriter's old text.
export async function PATCH(request, { params }) {
  const body = (await request.json().catch(() => ({}))) || {};
  const existing = await getBrief(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!existing.scriptsReleasedAt) return NextResponse.json({ error: 'scripts_not_released' }, { status: 403 });
  const { syncVariations, ...fields } = body;
  // variationsBase is server-managed.
  delete fields.variationsBase;
  let brief = await saveEdit(params.id, fields);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (syncVariations) {
    const patch = syncVariationsPatch(brief);
    if (patch) {
      brief = (await saveEdit(params.id, { variationScripts: patch.variationScripts, variationsBase: patch.variationsBase })) || brief;
      if (patch.reset) await addInternalNote(params.id, { author: 'Systeem', text: 'De klant heeft het hoofdscript sterk herschreven: de variaties zijn teruggezet naar dat nieuwe script. Controleer wat per variatie moet verschillen.' }).catch(() => {});
    }
  }

  const finalMain = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : brief.generatedScript || '';
  if (syncVariations) {
    const changedByClient = brief.editedScript !== null && brief.editedScript !== undefined && brief.editedScript !== brief.generatedScript;
    await logBriefEvent(params.id, { actor: 'klant', type: 'script_approved', text: changedByClient ? 'Klant keurde het hoofdscript goed, met eigen aanpassingen' : 'Klant keurde het hoofdscript goed zoals voorgesteld', detail: finalMain });
  }
  // After the client has already confirmed everything, a later change to the
  // script puts it back in front of TFA for a check.
  if (brief.finalizedAt && brief.scriptAuditStatus !== 'pending' && scriptChangesOf(brief).any) {
    brief = (await saveScriptAudit(params.id, { scriptAuditStatus: 'pending', scriptAuditedAt: '' })) || brief;
    await logBriefEvent(params.id, { actor: 'klant', type: 'script_changed_after_confirm', text: 'Klant paste het script aan na bevestiging; staat klaar voor controle', detail: finalMain });
  }
  return NextResponse.json(toPublicBrief(brief));
}
