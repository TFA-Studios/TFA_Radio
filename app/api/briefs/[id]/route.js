import { NextResponse } from 'next/server';
import { rateLimit, clientIp, tooManyRequests } from '../../../../lib/rateLimit';
import { toPublicBrief } from '../../../../lib/publicBrief';
import { waitUntil } from '@vercel/functions';
import { getBrief, updateBrief, saveScriptDrafts, saveScriptAudit, listAgencies, logBriefEvent, setScriptJob } from '../../../../lib/db';
import { scriptChangesOf, parseVariationScripts } from '../../../../components/flowData';
import { sendBriefReceivedEmail, sendConfirmationEmail } from '../../../../lib/email';
import { notifyNewBrief, notifyClientConfirmed, notifyScriptCheck } from '../../../../lib/slack';
import { describeProposals, describeScript } from '../../../../lib/eventLog';

function parseHistory(raw) {
  try {
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p : [];
  } catch (e) {
    return [];
  }
}
import { draftScriptVersions } from '../../../../lib/scriptgen';

export const dynamic = 'force-dynamic';
// After the client sends the brief, the script drafts are written in the
// background (up to 3 AI calls in parallel) — give the function room beyond
// Vercel's short default.
export const maxDuration = 60;

// How long the background job waits for the script drafts before giving up
// (the dashboard then shows "no drafts yet, write again").
const DRAFT_TIMEOUT_MS = 48000;

export async function GET(request, { params }) {
  const brief = await getBrief(params.id);
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(toPublicBrief(brief));
}

export async function PATCH(request, { params }) {
  // Autosave fires often; this ceiling (600 / min per address) only stops a runaway script.
  const rl = rateLimit('patch:' + clientIp(request), 600, 60000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await request.json().catch(() => ({}));

  const before = await getBrief(params.id);
  const wasSubmitted = !!(before && before.submittedAt);
  const wasFinalized = !!(before && before.finalizedAt);

  let brief = await updateBrief(params.id, body || {});
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let appUrl;
  try {
    appUrl = new URL(request.url).origin;
  } catch (e) {
    appUrl = undefined;
  }
  const dashboardUrl = appUrl ? appUrl + '/dashboard' : undefined;

  // Unlike the original Express app (which fired this fire-and-forget after
  // responding), a Vercel serverless function can be frozen/terminated the
  // instant the response is sent — so everything below is awaited, each
  // step wrapped so a failure never turns a successful submission into a
  // 500.

  // 1) The client sent their brief (end of step 3, first time only). The
  // client must never wait on this: they get their answer straight away and
  // see the "a copywriter is writing" page. The script drafts, the receipt
  // email and the Slack ping all run in the background (waitUntil keeps the
  // serverless function alive after the response is sent).
  if (body && body.submitted && !wasSubmitted && brief.submittedAt) {
    await logBriefEvent(params.id, { actor: 'klant', type: 'submitted', text: 'Klant verstuurde de brief', detail: [brief.product && 'Product: ' + brief.product, brief.usp && 'USP: ' + brief.usp, brief.mainMessage && 'Hoofdboodschap: ' + brief.mainMessage, brief.cta && 'Call-to-action: ' + brief.cta].filter(Boolean).join('\n') });
    const submittedBrief = brief;
    waitUntil(
      (async () => {
        let current = submittedBrief;
        let draftCount = 0;
        // Receipt email runs alongside the drafting — it does not need them.
        // Some agencies bring their own copywriter: no drafting for them, a
        // producer pastes the agency's script into the dashboard instead.
        let providedScript = false;
        try {
          if (submittedBrief.agencyId) {
            const ag = (await listAgencies()).find((a) => a.id === submittedBrief.agencyId);
            providedScript = !!ag && ag.scriptMode === 'provided';
          }
        } catch (err) {
          console.error('[api/briefs/:id] agency lookup failed:', err && err.message);
        }
        const receipt = sendBriefReceivedEmail(submittedBrief, appUrl).catch((err) => {
          console.error('[api/briefs/:id] sendBriefReceivedEmail failed:', err && err.message);
        });
        try {
          if (!providedScript) await setScriptJob(params.id, { status: 'running', kind: 'initial', startedAt: new Date().toISOString() });
          const result = providedScript ? { versions: [] } : await draftScriptVersions(submittedBrief, 3, { budgetMs: DRAFT_TIMEOUT_MS });
          if (result && result.versions && result.versions.length) {
            const saved = await saveScriptDrafts(params.id, result.versions);
            if (saved) {
              current = saved;
              draftCount = result.versions.length;
              await logBriefEvent(params.id, { actor: 'systeem', type: 'drafts_written', text: 'De AI schreef ' + draftCount + ' scriptvoorstellen', detail: describeProposals(parseHistory(saved.scriptHistory)) });
            }
          } else if (providedScript) {
            // nothing to draft
          } else if (result && result.error) {
            console.error('[api/briefs/:id] script drafting failed for ' + params.id + ': ' + result.error + (result.debugId ? ' [' + result.debugId + ']' : ''));
          } else {
            console.error('[api/briefs/:id] script drafting timed out for ' + params.id);
          }
        } catch (err) {
          console.error('[api/briefs/:id] script drafting threw:', err && err.message);
        }
        try {
          // Drafting is over (success or not): the dashboard stops showing "writing".
          if (draftCount > 0 || providedScript) await setScriptJob(params.id, null);
          else await setScriptJob(params.id, { status: 'failed', kind: 'initial', startedAt: new Date().toISOString(), message: 'De scripts konden niet automatisch geschreven worden. Klik op "Alles opnieuw schrijven".' });
        } catch (err) {
          console.error('[api/briefs/:id] clearing script job failed:', err && err.message);
        }
        await receipt;
        // Team-facing ping, sent once the drafts are ready (or with a
        // warning when drafting failed). Slack-only, Karim's call.
        try {
          await notifyNewBrief(current, dashboardUrl, providedScript ? null : draftCount);
        } catch (err) {
          console.error('[api/briefs/:id] notifyNewBrief failed:', err && err.message);
        }
      })()
    );
  }

  // 2) The client confirmed script, voice and music on the last step: the
  // full overview + terms email goes out, and the team hears the brief is
  // ready for production.
  if (body && body.finalized && !wasFinalized && brief.finalizedAt) {
    // If the client changed the script (or a variation) after TFA's proposals,
    // nothing counts as approved yet: it goes to the script check first, and
    // the confirmation email below says so.
    const changed = scriptChangesOf(brief).any;
    let tracks = [];
    try { tracks = JSON.parse(brief.selectedTracks || '[]'); } catch (e) {}
    await logBriefEvent(params.id, { actor: 'klant', type: 'finalized', text: 'Klant bevestigde script, stem en muziek' + (changed ? ' (script aangepast, wacht op controle)' : ''), detail: 'Stem: ' + (brief.selectedVoiceLabel || '-') + '\nMuziek: ' + (tracks.map((t) => t.title).join(', ') || '-') + '\n\n' + describeScript(brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript : brief.generatedScript || '', parseVariationScripts(brief)) });
    if (changed) {
      brief = (await saveScriptAudit(params.id, { scriptAuditStatus: 'pending', scriptAuditedAt: '' })) || brief;
    }
    try {
      await sendConfirmationEmail(brief, appUrl);
    } catch (err) {
      console.error('[api/briefs/:id] sendConfirmationEmail failed:', err && err.message);
    }
    try {
      await notifyClientConfirmed(brief, dashboardUrl);
      if (changed) await notifyScriptCheck(brief, dashboardUrl);
    } catch (err) {
      console.error('[api/briefs/:id] notifyClientConfirmed failed:', err && err.message);
    }
  }

  return NextResponse.json(toPublicBrief(brief));
}
