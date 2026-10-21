import { requireStaffApi } from '../../../../../../lib/access';
import { NextResponse } from 'next/server';
import { getBrief, saveScriptDrafts, updateScriptDraft, releaseScripts, editScriptProposals, logBriefEvent } from '../../../../../../lib/db';
import { draftScriptVersions, draftOneVersion } from '../../../../../../lib/scriptgen';
import { sendScriptsReadyEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js (isProtectedRoute matches
// /api/dashboard/(.*)). The producer's side of the "copywriter" workflow:
// the server drafts up to 3 script versions when a client sends their brief
// (see app/api/briefs/[id]/route.js); here a producer can regenerate them,
// edit any draft's text, and finally release them to the client, who until
// then only sees a "your copywriter is writing" waiting page.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function historyOf(b) {
  try {
    const parsed = b && b.scriptHistory ? JSON.parse(b.scriptHistory) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// POST { action: 'regenerate' } — replace the drafts with 3 fresh versions.
// POST { action: 'rewrite', versionId, comment? } — rewrite ONE proposal; the comment is added to the AI prompt.
// POST { action: 'add', comment? }  — add one more proposal (max 3).
// POST { action: 'remove', versionId } — drop one proposal (the client may get 1 or 2 instead of 3).
// POST { action: 'release' }    — release the drafts to the client (emails them).
export async function POST(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const action = body && body.action;
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (action === 'regenerate') {
    if (brief.scriptsReleasedAt) {
      return NextResponse.json({ error: 'already_released', message: 'De scripts zijn al vrijgegeven aan de klant.' }, { status: 409 });
    }
    const result = await draftScriptVersions(brief, 3);
    if (!result.versions.length) {
      return NextResponse.json(
        { error: 'generation_failed', message: result.error || 'Genereren is niet gelukt.', debugId: result.debugId || null },
        { status: 503 }
      );
    }
    const saved = await saveScriptDrafts(params.id, result.versions);
    await logBriefEvent(params.id, { actor: 'tfa', type: 'drafts_regenerated', text: 'TFA liet alle voorstellen opnieuw schrijven (' + result.versions.length + ' nieuwe)' });
    return NextResponse.json(saved);
  }

  if (action === 'rewrite' || action === 'add' || action === 'remove') {
    if (brief.scriptsReleasedAt) {
      return NextResponse.json({ error: 'already_released', message: 'De scripts zijn al vrijgegeven aan de klant.' }, { status: 409 });
    }
    const history = historyOf(brief);
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
    const target = history.find((h) => h.id === body.versionId);
    const slot = action === 'add' ? history.length : history.findIndex((h) => h.id === body.versionId);
    if (action !== 'add' && !target) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    let op;
    if (action === 'remove') {
      op = { type: 'remove', versionId: body.versionId };
    } else {
      if (action === 'add' && history.length >= 3) {
        return NextResponse.json({ error: 'too_many', message: 'Er zijn al drie voorstellen. Verwijder er eerst een.' }, { status: 409 });
      }
      const gen = await draftOneVersion(brief, { slot, comment, current: target ? target.main : '' });
      if (!gen.version) {
        return NextResponse.json({ error: 'generation_failed', message: gen.error, debugId: gen.debugId || null }, { status: 503 });
      }
      const v = gen.version;
      const vars = Array.isArray(v.variations) ? v.variations : (v.variation ? [v.variation] : []);
      op = action === 'add'
        ? { type: 'add', version: { main: v.main, variations: vars, source: v.source, comment } }
        : { type: 'replace', versionId: body.versionId, version: { main: v.main, variations: vars, source: v.source, comment } };
    }
    const out = await editScriptProposals(params.id, op);
    if (out.error) {
      const messages = { last_one: 'Er moet minstens één voorstel overblijven.', too_many: 'Er zijn al drie voorstellen.', not_found: 'Voorstel niet gevonden.', already_released: 'De scripts zijn al vrijgegeven aan de klant.' };
      return NextResponse.json({ error: out.error, message: messages[out.error] || 'Dat is niet gelukt.' }, { status: out.error === 'not_found' ? 404 : 409 });
    }
    const label = (n) => 'voorstel ' + (n + 1);
    if (action === 'remove') {
      await logBriefEvent(params.id, { actor: 'tfa', type: 'proposal_removed', text: 'TFA haalde ' + label(slot) + ' weg', detail: target.main });
    } else if (action === 'add') {
      const added = historyOf(out.brief).slice(-1)[0];
      await logBriefEvent(params.id, { actor: 'tfa', type: 'proposal_added', text: 'TFA liet een extra voorstel schrijven' + (comment ? ' (met opmerking)' : ''), detail: (comment ? 'Opmerking: ' + comment + '\n\n' : '') + (added ? added.main : '') });
    } else {
      const now = historyOf(out.brief)[slot];
      await logBriefEvent(params.id, { actor: 'tfa', type: 'proposal_rewritten', text: 'TFA liet ' + label(slot) + ' opnieuw schrijven' + (comment ? ' (met opmerking)' : ''), detail: (comment ? 'Opmerking: ' + comment + '\n\n' : '') + 'Nieuw:\n' + (now ? now.main : '') + '\n\nVervangen tekst:\n' + target.main });
    }
    return NextResponse.json((await getBrief(params.id)) || out.brief);
  }

  if (action === 'provide') {
    // The agency's own copywriter supplied a ready script: store it as the
    // single proposal (replaces any drafts), ready to release.
    if (brief.scriptsReleasedAt) {
      return NextResponse.json({ error: 'already_released', message: 'De scripts zijn al vrijgegeven aan de klant.' }, { status: 409 });
    }
    const main = typeof body.main === 'string' ? body.main.trim() : '';
    const variation = typeof body.variation === 'string' ? body.variation.trim() : '';
    const variations = Array.isArray(body.variations) ? body.variations.map((v) => String(v || '').trim()) : (variation ? [variation] : []);
    if (!main) return NextResponse.json({ error: 'empty', message: 'Plak eerst het script.' }, { status: 400 });
    const saved = await saveScriptDrafts(params.id, [{ main, variation: variations[0] || variation, variations, source: 'agency' }]);
    await logBriefEvent(params.id, { actor: 'tfa', type: 'script_provided', text: 'Script van het agentschap ingevoerd', detail: main });
    return NextResponse.json(saved);
  }

  if (action === 'release') {
    if (brief.scriptsReleasedAt) {
      return NextResponse.json({ error: 'already_released', message: 'De scripts zijn al vrijgegeven aan de klant.' }, { status: 409 });
    }
    const released = await releaseScripts(params.id);
    if (!released) {
      return NextResponse.json({ error: 'nothing_to_release', message: 'Er is nog geen script om vrij te geven.' }, { status: 400 });
    }
    await logBriefEvent(params.id, { actor: 'tfa', type: 'released', text: 'Scripts vrijgegeven aan de klant (' + historyOf(released).length + ' voorstel' + (historyOf(released).length === 1 ? '' : 'len') + ')', detail: historyOf(released).map((h, i) => 'Voorstel ' + (i + 1) + ':\n' + h.main).join('\n\n') });
    let appUrl;
    try {
      appUrl = new URL(request.url).origin;
    } catch (e) {
      appUrl = undefined;
    }
    try {
      await sendScriptsReadyEmail(released, appUrl);
    } catch (err) {
      console.error('[api/dashboard/briefs/:id/scripts] sendScriptsReadyEmail failed:', err && err.message);
    }
    return NextResponse.json(released);
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}

// PATCH { versionId, main?, variation? } — edit one draft before release.
export async function PATCH(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const versionId = body && body.versionId;
  if (!versionId || typeof versionId !== 'string') {
    return NextResponse.json({ error: 'invalid_version_id' }, { status: 400 });
  }
  const data = {};
  if (typeof body.main === 'string') data.main = body.main;
  if (typeof body.variation === 'string') data.variation = body.variation;
  if (Array.isArray(body.variations)) data.variations = body.variations.map((v) => String(v || ''));
  // TFA's recommendation among the proposals (optional, with an optional reason).
  if (typeof body.recommended === 'boolean') data.recommended = body.recommended;
  if (typeof body.reason === 'string') data.reason = body.reason;
  const before = historyOf(await getBrief(params.id)).find((h) => h.id === versionId);
  const updated = await updateScriptDraft(params.id, versionId, data);
  if (!updated) return NextResponse.json({ error: 'not_found_or_released' }, { status: 404 });
  const textChanged = before && ((typeof data.main === 'string' && data.main !== before.main) || (Array.isArray(data.variations) && JSON.stringify(data.variations) !== JSON.stringify(Array.isArray(before.variations) ? before.variations : (before.variation ? [before.variation] : []))));
  if (textChanged) {
    await logBriefEvent(params.id, { actor: 'tfa', type: 'draft_edited', text: 'TFA paste een voorstel aan', detail: typeof data.main === 'string' ? data.main : '' });
  }
  return NextResponse.json(updated);
}
