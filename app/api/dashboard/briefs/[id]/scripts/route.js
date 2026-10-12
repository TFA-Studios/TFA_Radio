import { requireStaffApi } from '../../../../../../lib/access';
import { NextResponse } from 'next/server';
import { getBrief, saveScriptDrafts, updateScriptDraft, releaseScripts } from '../../../../../../lib/db';
import { draftScriptVersions } from '../../../../../../lib/scriptgen';
import { sendScriptsReadyEmail } from '../../../../../../lib/email';

// Producer-only — gated by middleware.js (isProtectedRoute matches
// /api/dashboard/(.*)). The producer's side of the "copywriter" workflow:
// the server drafts up to 3 script versions when a client sends their brief
// (see app/api/briefs/[id]/route.js); here a producer can regenerate them,
// edit any draft's text, and finally release them to the client, who until
// then only sees a "your copywriter is writing" waiting page.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { action: 'regenerate' } — replace the drafts with 3 fresh versions.
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
    return NextResponse.json(saved);
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
  const updated = await updateScriptDraft(params.id, versionId, data);
  if (!updated) return NextResponse.json({ error: 'not_found_or_released' }, { status: 404 });
  return NextResponse.json(updated);
}
