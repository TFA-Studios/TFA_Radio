// Shared static data/constants for the 7-step client brief flow. Ported
// verbatim (ids, labels, ordering) from the original public/*.html pages,
// since they're used across the shared StepShell + useBrief hook approach
// instead of being duplicated per page.

export const STEPS = [
  { n: 1, label: 'Contact', path: 'contact' },
  { n: 2, label: 'Levering', path: 'delivery' },
  { n: 3, label: 'Brief', path: 'details' },
  { n: 4, label: 'Script', path: 'script' },
  { n: 5, label: 'Stem', path: 'voice' },
  { n: 6, label: 'Muziek', path: 'music' },
  { n: 7, label: 'Overzicht', path: 'overview' },
];

// Mirrors applyReachableSteps() duplicated across every original HTML page:
// marks a step reachable once the brief has real data implying the client
// got that far, even if they're currently earlier in the flow (so going
// back never stunts forward navigation).
//
// Step 7 (Overzicht) used to only count as "reached" once brief.submittedAt
// was set — i.e. only after the whole flow was already finished. That meant
// clicking a "Wijzig" link from the overview (which jumps back to an
// earlier step to edit something, well before submitting) made Overzicht
// gray out in the sidebar immediately, since it hadn't been submitted yet —
// the client then had to click all the way forward through every step
// again just to get back to it. Overzicht doesn't collect its own data, so
// it should be reachable as soon as there's enough approved data to show
// there — the exact same check the overview page itself uses to enable its
// "Bevestigen en versturen" button — not only once the whole thing has
// already been sent.
export function computeReached(brief) {
  if (!brief) return {};
  let tracks = [];
  try {
    const parsed = brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
    if (Array.isArray(parsed)) tracks = parsed;
  } catch (e) {}
  const hasScript = !!(brief.generatedScript || brief.editedScript);
  return {
    2: !!(brief.impressions || brief.airDate || brief.dateUnknown),
    3: !!(brief.product || brief.usp || brief.mainMessage),
    4: hasScript,
    5: !!brief.selectedVoiceId,
    6: tracks.length > 0,
    7: !!brief.submittedAt || (hasScript && !!brief.selectedVoiceId && tracks.length > 0),
  };
}

export const TONE_LABELS = {
  energiek: 'Energiek', rustig: 'Rustig', warm: 'Warm', zakelijk: 'Zakelijk',
  urgent: 'Urgent', premium: 'Premium', speels: 'Speels', grappig: 'Grappig',
  betrouwbaar: 'Betrouwbaar', gedurfd: 'Gedurfd', inspirerend: 'Inspirerend',
  nostalgisch: 'Nostalgisch',
};

// The client-facing voice (step 5) and music (step 6) pages used to pick
// from fixed sample pools here (VOICE_POOL, PLAYLISTS) — hard-coded example
// voices/tracks that never reflected anything a producer actually added in
// /dashboard/library. Both pages now fetch the real library over
// GET /api/library/voices and GET /api/library/tracks instead, so those
// pools have been removed. AGE_LABELS stays: it's still the shared display
// mapping for the age-range question/answers on both the library form and
// the voice step, and its keys ('18-34'/'35-54'/'55+') match the real
// voices' ageRange field.
export const AGE_LABELS = { '18-34': '18–34', '35-54': '35–54', '55+': '55+' };

export const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
export const MONTH_NAMES_LOWER = MONTH_NAMES.map((m) => m.toLowerCase());

export function estimateSeconds(words) {
  return (words / 2.7) * 1.05;
}
export function wordCountOf(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

// Number of variations of the hoofdspot a brief has asked for (0 = none).
// variationsCount is the source of truth once set on the delivery step;
// needsVariations (the older yes/no field) is only used as a fallback for
// briefs saved before variationsCount existed, defaulting to 1 in that case
// — matches how those older briefs actually behaved (a single variation).
export function variationsCountOf(brief) {
  if (!brief) return 0;
  if (brief.variationsCount !== undefined && brief.variationsCount !== null && brief.variationsCount !== '') {
    const n = parseInt(brief.variationsCount, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return brief.needsVariations ? 1 : 0;
}

// Short "+ Nx variatie(s)" suffix used everywhere a brief's deliverables are
// summarized (delivery step, overview, confirmation email, team notification
// email, PDF export, dashboard modal) — one place so the wording/pluralization
// stays consistent.
export function variationsSummaryLabel(brief) {
  const n = variationsCountOf(brief);
  if (!n) return '';
  return n === 1 ? ' + 1x variatie' : ' + ' + n + 'x variaties';
}

// ---------------------------------------------------------------------------
// Post-production review workflow (client review page + dashboard "Productie
// & review" section) — see the parseReviewRounds comment in lib/db.js for
// the reviewRounds JSON shape this reads.

// Revision rounds included before the dashboard flags a brief as "over the
// included count" — a soft cap only: feedback is never blocked past this,
// it's purely an internal heads-up for the producer (per the user's explicit
// choice of "soft cap, just flag it internally" over a hard block).
export const INCLUDED_REVISIONS = 2;

export const PRODUCTION_STATUS_LABELS = {
  '': 'Nog niet gestart',
  awaiting_review: 'Wacht op klantreview',
  in_revision: 'Feedback ontvangen',
  approved: 'Goedgekeurd',
};

export function parseReviewRounds(brief) {
  if (!brief || !brief.reviewRounds) return [];
  try {
    const parsed = JSON.parse(brief.reviewRounds);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// The round the client should currently see/react to — always the most
// recent one, or null if production hasn't shared anything yet.
export function currentReviewRound(brief) {
  const rounds = parseReviewRounds(brief);
  return rounds.length ? rounds[rounds.length - 1] : null;
}

// True once the number of rounds started exceeds the included count —
// purely informational (see INCLUDED_REVISIONS above).
export function reviewOverIncludedCap(brief) {
  return parseReviewRounds(brief).length > INCLUDED_REVISIONS;
}
