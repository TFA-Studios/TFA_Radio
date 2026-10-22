import { requireStaffApi } from '../../../../../../lib/access';
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getBrief, saveScriptDrafts, updateScriptDraft, releaseScripts, editScriptProposals, logBriefEvent, setScriptJob } from '../../../../../../lib/db';
import { beginScriptJob, runScriptJob } from '../../../../../../lib/scriptJobs';
import { describeProposal, describeProposals, describeScript } from '../../../../../../lib/eventLog';
import { jobState } from '../../../../../../lib/scriptJobState';
import { sendScriptsReadyEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js (isProtectedRoute matches
// /api/dashboard/(.*)). The producer's side of the "copywriter" workflow:
// the server drafts up to 3 script versions when a client sends their brief
// (see app/api/briefs/[id]/route.js); here a producer can regenerate them,
// edit any draft's text, and finally release them to the client, who until
// then only sees a "your copywriter is writing" waiting page.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
// GET — the brief as the dashboard sees it (used to follow a running job).
export async function GET(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(brief);
}

export async function POST(request, { params }) {
  const denied = await requireStaffApi();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const action = body && body.action;
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Writing happens in the background (lib/scriptJobs.js): these actions only
  // start the job and return at once; the dashboard shows progress and the
  // result by reading the brief, so nothing the producer clicks interrupts it.
  if (action === 'clear_job') {
    await setScriptJob(params.id, null);
    return NextResponse.json((await getBrief(params.id)) || brief);
  }

  if (action === 'regenerate' || action === 'rewrite' || action === 'add' || action === 'remove') {
    if (brief.scriptsReleasedAt) {
      return NextResponse.json({ error: 'already_released', message: 'De scripts zijn al vrijgegeven aan de klant.' }, { status: 409 });
    }
    const history = historyOf(brief);
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';

    if (action === 'remove') {
      const target = history.find((h) => h.id === body.versionId);
      if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      const out = await editScriptProposals(params.id, { type: 'remove', versionId: body.versionId });
      if (out.error) {
        const messages = { last_one: 'Er moet minstens één voorstel overblijven.', not_found: 'Voorstel niet gevonden.', already_released: 'De scripts zijn al vrijgegeven aan de klant.' };
        return NextResponse.json({ error: out.error, message: messages[out.error] || 'Dat is niet gelukt.' }, { status: out.error === 'not_found' ? 404 : 409 });
      }
      await logBriefEvent(params.id, { actor: 'tfa', type: 'proposal_removed', text: 'TFA haalde voorstel ' + (history.indexOf(target) + 1) + ' weg', detail: describeProposal(target) });
      return NextResponse.json((await getBrief(params.id)) || out.brief);
    }

    if (action === 'rewrite' && !history.some((h) => h.id === body.versionId)) return NextResponse.json({ error: 'not_found', message: 'Voorstel niet gevonden.' }, { status: 404 });
    if (action === 'add' && history.length >= 3) {
      return NextResponse.json({ error: 'too_many', message: 'Er zijn al drie voorstellen. Verwijder er eerst een.' }, { status: 409 });
    }
    const job = { kind: action, versionId: action === 'rewrite' ? body.versionId : undefined, comment: action === 'regenerate' ? '' : comment };
    if (!(await beginScriptJob(brief, job))) {
      return NextResponse.json({ error: 'busy', message: 'Er wordt al een voorstel geschreven. Even geduld.' }, { status: 409 });
    }
    waitUntil(runScriptJob(params.id, job));
    return NextResponse.json((await getBrief(params.id)) || brief, { status: 202 });
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
    await logBriefEvent(params.id, { actor: 'tfa', type: 'script_provided', text: 'Script van het agentschap ingevoerd', detail: describeScript(main, variations) });
    return NextResponse.json(saved);
  }

  if (action === 'release') {
    if (jobState(brief.scriptJob).status === 'running') {
      return NextResponse.json({ error: 'busy', message: 'Er wordt nog een voorstel geschreven. Geef vrij zodra het klaar is.' }, { status: 409 });
    }
    if (brief.scriptsReleasedAt) {
      return NextResponse.json({ error: 'already_released', message: 'De scripts zijn al vrijgegeven aan de klant.' }, { status: 409 });
    }
    const released = await releaseScripts(params.id);
    if (!released) {
      return NextResponse.json({ error: 'nothing_to_release', message: 'Er is nog geen script om vrij te geven.' }, { status: 400 });
    }
    await logBriefEvent(params.id, { actor: 'tfa', type: 'released', text: 'Scripts vrijgegeven aan de klant (' + historyOf(released).length + ' voorstel' + (historyOf(released).length === 1 ? '' : 'len') + ')', detail: describeProposals(historyOf(released)) });
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
    await logBriefEvent(params.id, { actor: 'tfa', type: 'draft_edited', text: 'TFA paste een voorstel aan', detail: describeProposal(updated && historyOf(updated).find((h) => h.id === versionId) || before), coalesce: true });
  }
  return NextResponse.json(updated);
}
