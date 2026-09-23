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

// Single source of truth for the tone-of-voice vocabulary — used by the
// client-facing brief-form checkboxes (app/brief/[id]/details/page.js), the
// AI script-generation prompt (lib/scriptgen.js, which pairs each key with a
// concrete stylistic instruction in TONE_GUIDE there), the confirmation
// email (lib/email.js) and the producer's report export (lib/reports.js).
// All four used to keep their own separate copy of this object — three
// duplicates drifting independently with no shared import between them —
// consolidated here so a new tone or label change only has to happen once.
export const TONE_LABELS = {
  energiek: 'Energiek', rustig: 'Rustig', warm: 'Warm', zakelijk: 'Zakelijk',
  urgent: 'Urgent', premium: 'Premium', speels: 'Speels', grappig: 'Grappig',
  betrouwbaar: 'Betrouwbaar', gedurfd: 'Gedurfd', inspirerend: 'Inspirerend',
  nostalgisch: 'Nostalgisch', droogkomisch: 'Droogkomisch', vriendelijk: 'Vriendelijk',
  oprecht: 'Oprecht',
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

// The client's requested air/broadcast date from the delivery step (step 2)
// — airDate, or a rough airMonth if they didn't know the exact date yet
// (dateUnknown). This is THE real delivery deadline for a brief: previously
// the dashboard also had a separate, manually-typed-in "internal deadline"
// (dueDate) on the Team tab, but since production always works "as fast as
// possible" rather than against a producer-picked date, that field never
// reflected anything real. It's been replaced everywhere (Levering card,
// Team tab, the dashboard table's Deadline column, the reports "overdue"
// stat and CSV export) with this — the client's own date — so "overdue"
// now means what it should: the brief is now expected on air and isn't
// done yet. Was previously three near-identical copies of this same
// formatting (overview step, confirmation email, PDF export); consolidated
// here for the same reason as TONE_LABELS above.
export function formatAirDate(brief) {
  if (!brief) return 'Nog niet opgegeven';
  if (brief.dateUnknown) {
    if (brief.airMonth) {
      const idx = parseInt(brief.airMonth, 10) - 1;
      const name = MONTH_NAMES_LOWER[idx];
      return name ? 'Nog niet exact bekend, gepland voor ' + name : 'Nog niet bekend';
    }
    return 'Nog niet bekend';
  }
  if (brief.airDate) {
    const d = new Date(brief.airDate + 'T00:00:00');
    if (!isNaN(d.getTime())) return d.getDate() + ' ' + MONTH_NAMES_LOWER[d.getMonth()] + ' ' + d.getFullYear();
    return brief.airDate;
  }
  return 'Nog niet opgegeven';
}

// Dashboard-table/Team-tab display of the delivery deadline above: a short
// label, a color, and whether it's overdue (client's air date has passed
// and the brief isn't done yet — a finished brief with a past air date
// isn't a problem). Deliberately ignores dateUnknown/airMonth for the
// overdue check — a rough "sometime in September" can't be judged overdue
// the way an exact date can, so those just render neutrally.
export function deliveryDeadlineMeta(brief, status) {
  if (!brief || (!brief.airDate && !brief.dateUnknown)) {
    return { label: 'Nog niet opgegeven', color: '#9C9890', overdue: false };
  }
  if (brief.dateUnknown) {
    return { label: formatAirDate(brief), color: '#9C9890', overdue: false };
  }
  const d = new Date(brief.airDate + 'T00:00:00');
  if (isNaN(d.getTime())) return { label: brief.airDate, color: '#9C9890', overdue: false };
  const label = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  const overdue = status !== 'done' && d.getTime() < new Date().setHours(0, 0, 0, 0);
  return { label, color: overdue ? '#C2513F' : '#1D1D1D', overdue };
}

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

// variationScripts holds one entry per requested variation — index i is
// what a client (or producer, on the dashboard) actually approved/edited
// for variation i+1, falling back to the main hoofdspot script wherever a
// slot hasn't been individually edited yet (see EDIT_FIELDS in lib/db.js).
// Was four separate copies of this exact parse (script step, overview step,
// confirmation email, PDF export) — none of them reached the dashboard's
// own Script card, which is why producers couldn't see a brief's variations
// there even though clients could always see them on their own overview
// page and in their confirmation email. Consolidated here so anywhere new
// that needs a brief's variations (the dashboard included) gets them for
// free instead of silently missing this the way the dashboard did.
export function parseVariationScripts(brief) {
  try {
    const parsed = brief && brief.variationScripts ? JSON.parse(brief.variationScripts) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// The client's up-to-3 candidate music picks from the Muziek step (step 6) —
// see MAX_TRACKS in app/brief/[id]/music/page.js. Same parsing repeated
// verbatim in a few places (computeReached above, lib/db.js's rowToBrief
// consumers, DashboardClient.js) — kept here too as the one shared version
// for anything new that needs the parsed array rather than the raw JSON.
export function parseSelectedTracks(brief) {
  try {
    const parsed = brief && brief.selectedTracks ? JSON.parse(brief.selectedTracks) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Which ONE of the client's (up to 3) candidate tracks actually ended up in
// the final production — needed because the client is only ever asked to
// narrow it down to a handful of options, not commit to one, so nothing
// upstream tells you which one TFA actually used. If there's only one
// candidate there's no ambiguity; with more than one, a producer has to
// explicitly mark the used one from the dashboard (brief.usedTrackId, set
// via updateBriefTeamMeta) — this returns null (not a guess) until they do,
// since silently picking "the first one" would be actively wrong here: this
// feeds both the final delivery email to Advision/whoever and, eventually,
// the accountant's invoice, and both need the real answer, not a fallback.
export function finalTrackOf(brief) {
  const tracks = parseSelectedTracks(brief);
  if (!tracks.length) return null;
  if (tracks.length === 1) return tracks[0];
  if (brief && brief.usedTrackId) {
    const match = tracks.find((t) => t.id === brief.usedTrackId);
    if (match) return match;
  }
  return null;
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

// Shared copy for the "included revision rounds" disclaimer — shown in the
// overview step's Voorwaarden box (both the pre-submit and the persisted
// post-submit "thank you" view), mirrored into the confirmation email's own
// Voorwaarden block (lib/email.js's buildTermsBlock), and shown persistently
// on the client's review/status page. One shared string so a client sees the
// same included-rounds expectation wherever they look, not just once in the
// terms they agreed to before submitting.
// Fixed legal/IP clause added to the Voorwaarden list everywhere it's shown
// (overview step, confirmation email, producer PDF, review/status page) —
// per TFA's explicit legal wording, so it stays a single source of truth
// rather than four independent copies drifting apart.
export function ipRightsDisclaimerText() {
  return 'Alle intellectuele eigendomsrechten – waaronder begrepen maar niet beperkt tot auteursrechten, naburige rechten, merkrechten en modelrechten – met betrekking tot de commercial en alle daarvoor ontwikkelde (tussentijdse) materialen, concepten, scripts, beelden en audio, berusten uitsluitend en volledig bij TFA.';
}

export function revisionDisclaimerText() {
  return 'Let op: bij deze productie zijn ' + INCLUDED_REVISIONS + ' rondes revisie inbegrepen. Heb je meer nodig? Neem dan contact op met Advision Media.';
}

// Turns a round's 'YYYY-MM-DD' folderDate into a Dutch long date ("8
// september 2026") — shared by the client review page and the dashboard's
// Productie tab so both show the same wording for "the dated folder inside
// the one Frame.io link" a round represents (see the reviewRounds comment
// in lib/db.js — one link per brief, a new dated folder per round).
export function formatFolderDate(folderDate) {
  if (!folderDate) return '';
  const d = new Date(folderDate + 'T00:00:00');
  if (isNaN(d.getTime())) return folderDate;
  try {
    return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch (e) {
    return folderDate;
  }
}

// Short label for a round used wherever it's listed: "Map van 8 september
// 2026", plus its note in parentheses if the producer added one.
export function formatRoundLabel(round) {
  if (!round) return '';
  const dateLabel = formatFolderDate(round.folderDate);
  const base = dateLabel ? 'Map van ' + dateLabel : 'Map';
  return round.note && round.note.trim() ? base + ' (' + round.note.trim() + ')' : base;
}

// Full date + TIME ("8 sep 2026, 14:32") for an ISO timestamp — used
// wherever it matters exactly WHEN something happened (a round shared,
// feedback left, a round approved), as opposed to formatFolderDate above
// (which is only ever the date-only label matching the Frame.io folder
// name). Distinct on purpose: a client can be quick to respond, so two
// rounds — or a round and its feedback — can easily land on the same
// calendar day, and only the time tells them apart.
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch (e) {
    return iso;
  }
}
