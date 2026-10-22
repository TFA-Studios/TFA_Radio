// Script writing runs as a background job on the server, independent of the
// dashboard: the request that starts it returns at once, the job keeps going
// whatever the producer clicks or navigates to, applies its result to the
// brief when done, and records progress in the brief's `scriptJob` field so
// any screen can show "writing…" and then the result.
import { getBrief, saveScriptDrafts, editScriptProposals, logBriefEvent, setScriptJob } from './db';
import { draftScriptVersions, draftOneVersion } from './scriptgen';
import { describeProposal, describeProposals } from './eventLog';
import { jobState } from './scriptJobState';

const BUDGET_MS = 270000;

function historyOf(b) {
  try {
    const parsed = b && b.scriptHistory ? JSON.parse(b.scriptHistory) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Marks the brief as busy. Returns false when another job is already running.
export async function beginScriptJob(brief, job) {
  if (jobState(brief.scriptJob).status === 'running') return false;
  await setScriptJob(brief.id, { status: 'running', startedAt: new Date().toISOString(), ...job });
  return true;
}

async function fail(id, job, message) {
  await setScriptJob(id, { status: 'failed', ...job, startedAt: new Date().toISOString(), message: message || 'Genereren is niet gelukt. Probeer het opnieuw.' });
}

// The actual work. Never throws; always ends by clearing or failing the job.
export async function runScriptJob(id, job) {
  try {
    const brief = await getBrief(id);
    if (!brief) return;
    if (job.kind === 'regenerate') {
      const result = await draftScriptVersions(brief, 3, { budgetMs: BUDGET_MS });
      if (!result.versions.length) return await fail(id, job, result.error);
      const saved = await saveScriptDrafts(id, result.versions);
      await logBriefEvent(id, { actor: 'tfa', type: 'drafts_regenerated', text: 'TFA liet alle voorstellen opnieuw schrijven (' + result.versions.length + ' nieuwe)', detail: 'NIEUW\n\n' + describeProposals(historyOf(saved)) + (historyOf(brief).length ? '\n\n=====\n\nVERVANGEN\n\n' + describeProposals(historyOf(brief)) : '') });
    } else {
      const history = historyOf(brief);
      const target = history.find((h) => h.id === job.versionId);
      const comment = job.comment || '';
      const slot = job.kind === 'add' ? history.length : history.findIndex((h) => h.id === job.versionId);
      if (job.kind !== 'add' && !target) return await fail(id, job, 'Voorstel niet gevonden.');
      const gen = await draftOneVersion(brief, { slot, comment, current: target ? target.main : '' });
      if (!gen.version) return await fail(id, job, gen.error);
      const v = gen.version;
      const vars = Array.isArray(v.variations) ? v.variations : (v.variation ? [v.variation] : []);
      const version = { main: v.main, variations: vars, source: v.source, comment };
      const out = await editScriptProposals(id, job.kind === 'add' ? { type: 'add', version } : { type: 'replace', versionId: job.versionId, version });
      if (out.error) {
        const messages = { too_many: 'Er zijn al drie voorstellen.', not_found: 'Voorstel niet gevonden.', already_released: 'De scripts zijn al vrijgegeven aan de klant.' };
        return await fail(id, job, messages[out.error]);
      }
      const label = 'voorstel ' + (slot + 1);
      const commentNote = comment ? ' (met opmerking)' : '';
      const commentPrefix = comment ? 'Opmerking: ' + comment + '\n\n' : '';
      if (job.kind === 'add') {
        const added = historyOf(out.brief).slice(-1)[0];
        await logBriefEvent(id, { actor: 'tfa', type: 'proposal_added', text: 'TFA liet een extra voorstel schrijven' + commentNote, detail: commentPrefix + (added ? describeProposal(added) : '') });
      } else {
        const now = historyOf(out.brief)[slot];
        await logBriefEvent(id, { actor: 'tfa', type: 'proposal_rewritten', text: 'TFA liet ' + label + ' opnieuw schrijven' + commentNote, detail: commentPrefix + 'NIEUW\n' + (now ? describeProposal(now) : '') + '\n\n=====\n\nVERVANGEN\n' + describeProposal(target) });
      }
    }
    await setScriptJob(id, null);
  } catch (err) {
    console.error('[scriptJobs] job failed:', err && err.message);
    try { await fail(id, job, ''); } catch (e) { /* nothing more to do */ }
  }
}
