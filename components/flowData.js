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
  // Copywriter workflow: steps 4-7 only exist for the client once TFA has
  // released the script proposals (see briefStageOf below). Until then they
  // stay greyed out in the sidebar even though the brief itself is complete.
  const released = !!brief.scriptsReleasedAt || !!brief.finalizedAt;
  return {
    2: !!(brief.impressions || brief.airDate || brief.dateUnknown),
    3: !!(brief.product || brief.usp || brief.mainMessage),
    4: released && hasScript,
    5: released && !!brief.selectedVoiceId,
    6: released && tracks.length > 0,
    7: !!brief.finalizedAt || (released && hasScript && !!brief.selectedVoiceId && tracks.length > 0),
  };
}

// Where a brief is in the copywriter workflow, from the client's point of
// view. One place so every page/email/dashboard agrees:
//   'filling'  — client is still filling in steps 1-3 (not sent yet)
//   'writing'  — brief sent; TFA's copywriter is writing/reviewing the
//                script proposals (client waits, steps 4-7 locked)
//   'choosing' — TFA released the proposals; client picks a script, then
//                voice and music, then confirms on the overview
//   'final'    — client confirmed everything; TFA is producing
// Briefs from the old instant-script flow are backfilled as 'final' (see the
// finalizedAt migration in lib/db.js).
export function briefStageOf(brief) {
  if (!brief || !brief.submittedAt) return 'filling';
  if (brief.finalizedAt) return 'final';
  if (brief.scriptsReleasedAt) return 'choosing';
  return 'writing';
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
    const label = airMonthLabel(brief);
    return label ? 'Nog niet exact bekend, gepland voor ' + label : 'Nog niet bekend';
  }
  if (brief.airDate) {
    const d = new Date(brief.airDate + 'T00:00:00');
    if (!isNaN(d.getTime())) return d.getDate() + ' ' + MONTH_NAMES_LOWER[d.getMonth()] + ' ' + d.getFullYear();
    return brief.airDate;
  }
  return 'Nog niet opgegeven';
}

// The rough month a client gave when they don't know the exact live date yet.
// New briefs store 'YYYY-MM' (so a campaign planned for March 2027 can be
// entered in November 2026); older briefs only stored the month number of
// the year they were created in.
export function airMonthLabel(brief) {
  const raw = brief && brief.airMonth ? String(brief.airMonth) : '';
  if (!raw) return '';
  let year = null;
  let month = null;
  const m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m) { year = parseInt(m[1], 10); month = parseInt(m[2], 10); }
  else if (/^\d{1,2}$/.test(raw)) {
    month = parseInt(raw, 10);
    const created = brief.createdAt ? new Date(brief.createdAt) : null;
    year = created && !isNaN(created.getTime()) ? created.getFullYear() : null;
  }
  const name = month ? MONTH_NAMES_LOWER[month - 1] : '';
  if (!name) return '';
  return name + (year ? ' ' + year : '');
}

// Month choices for "I don't know the exact date yet": this month and the
// next 17, each with its year, as { value: 'YYYY-MM', label: 'Maart 2027' }.
export function upcomingMonthOptions(count = 18, from = new Date()) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    out.push({ value: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear() });
  }
  return out;
}

// --- Impressions: free text, understood -----------------------------------
// Clients type whatever feels natural: "500.000", "500000", "500k",
// "1,5 miljoen", "2 mln", "750 duizend". Returns { value, ok }: value is the
// whole number (or null when nothing sensible could be read).
export function parseImpressions(text) {
  let t = String(text || '').toLowerCase().trim();
  if (!t) return { value: null, ok: false, empty: true };
  t = t.replace(/(impressies|impressions|imps|stuks|ongeveer|circa|ca\.?|approx|~|±|€)/g, ' ').replace(/\s+/g, ' ').trim();
  let mult = 1;
  const suf = t.match(/^([\d.,'\s]+?)\s*(k|duizend|dzd|m|mln|mio|miljoen|million|mil)\.?$/);
  let numPart = t;
  if (suf) {
    numPart = suf[1].trim();
    mult = /^(k|duizend|dzd)$/.test(suf[2]) ? 1000 : 1000000;
  }
  if (!/^\d[\d.,'\s]*$/.test(numPart)) return { value: null, ok: false };
  let n;
  if (mult > 1) {
    // "1,5 miljoen" / "1.5m" / "2 mln": the separator is a decimal point here.
    const cleaned = numPart.replace(/[\s']/g, '');
    const seps = (cleaned.match(/[.,]/g) || []).length;
    if (seps > 1 && !/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) return { value: null, ok: false };
    n = /^\d{1,3}([.,]\d{3})+$/.test(cleaned) ? parseFloat(cleaned.replace(/[.,]/g, '')) : parseFloat(cleaned.replace(',', '.'));
  } else {
    // Without a suffix a separator followed by exactly three digits is a thousands separator.
    const cleaned = numPart.replace(/[\s']/g, '');
    if (/^\d+$/.test(cleaned)) n = parseInt(cleaned, 10);
    else if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) n = parseInt(cleaned.replace(/[.,]/g, ''), 10);
    else return { value: null, ok: false };
  }
  if (!isFinite(n) || n <= 0) return { value: null, ok: false };
  const value = Math.round(n * mult);
  if (value < 1000 || value > 5000000000) return { value, ok: false, implausible: true };
  return { value, ok: true };
}

export function formatNumberNl(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Numeric value of a brief's impressions: new briefs store the parsed whole
// number in `impressions`; older ones used fixed choices (and 'meer' + a
// typed `impressionsCustom`).
export function impressionsValueOf(brief) {
  if (!brief || !brief.impressions) return null;
  if (/^\d+$/.test(String(brief.impressions))) return parseInt(brief.impressions, 10);
  if (brief.impressions === 'meer') {
    const p = parseImpressions(brief.impressionsCustom);
    return p.ok ? p.value : null;
  }
  return null;
}

// Short form used in tables and CSV: "500.000", "Meer dan 500.000", "—".
export function impressionsShort(brief) {
  if (!brief || !brief.impressions) return '';
  if (brief.impressions === 'meer' && impressionsValueOf(brief) === null) return brief.impressionsCustom || 'Meer dan 500.000';
  const v = impressionsValueOf(brief);
  return v === null ? String(brief.impressions) : formatNumberNl(v);
}

// Long form used in the overview, emails and PDF.
export function formatImpressions(brief) {
  if (!brief || !brief.impressions) return 'Niet opgegeven';
  const short = impressionsShort(brief);
  return short + ' impressies';
}

// Reports bucket (arbitrary numbers grouped into ranges).
export const IMPRESSION_BUCKETS = [
  { key: 'lt50', label: 'Minder dan 50.000', max: 50000 },
  { key: '50-100', label: '50.000 tot 100.000', max: 100000 },
  { key: '100-250', label: '100.000 tot 250.000', max: 250000 },
  { key: '250-500', label: '250.000 tot 500.000', max: 500000 },
  { key: '500-1m', label: '500.000 tot 1 miljoen', max: 1000000 },
  { key: 'gt1m', label: '1 miljoen of meer', max: Infinity },
];
export function impressionsBucketKey(brief) {
  const v = impressionsValueOf(brief);
  if (v === null) return '';
  return IMPRESSION_BUCKETS.find((b) => v < b.max).key;
}

// --- Audience --------------------------------------------------------------
// audience: 'b2b' | 'b2c' | 'both'. For 'both', audienceBoth says whether one
// commercial is aimed at both ('whole') or the B2B/B2C difference only sits in
// the variations ('variations').
export function audienceLabel(brief) {
  if (!brief || !brief.audience) return '';
  if (brief.audience === 'b2b') return 'B2B';
  if (brief.audience === 'b2c') return 'B2C';
  if (brief.audience === 'both') {
    const how = brief.audienceBoth === 'variations' ? ' (verschilt per variatie)' : brief.audienceBoth === 'whole' ? ' (één commercial voor beide)' : '';
    return 'B2B en B2C' + how;
  }
  return '';
}

// One line for emails/PDF/overview: "B2C · 30% mannen en 70% vrouwen (vooral vrouwen)".
export function audienceSummary(brief) {
  const base = audienceLabel(brief);
  if (!base) return '';
  const g = brief.genderSplit ? (describeGenderSplit(brief.genderSplit) || String(brief.genderSplit).trim()) : '';
  return g ? base + ' · ' + g : base;
}

// Gender split typed by the client, e.g. "man / vrouw - 30 / 70" (30% men,
// 70% women), "70% vrouw", "m/v 40/60", "v/m 60/40" or just "30/70" (then the
// Dutch m/v order is assumed). Returns { men, women, assumed } or null.
export function parseGenderSplit(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const nums = (t.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(',', '.')));
  if (!nums.length || nums.length > 2) return null;
  const LABEL = /(mannen|man|heren|male|men|m(?![a-z])|vrouwen|vrouw|dames|female|women|woman|v(?![a-z])|f(?![a-z]))/g;
  const kindOf = (w) => (/^(mannen|man|heren|male|men|m)$/.test(w) ? 'm' : 'v');
  const labels = [];
  let mm;
  const textNoNums = t;
  while ((mm = LABEL.exec(textNoNums))) labels.push({ kind: kindOf(mm[1]), idx: mm.index });
  let men = null;
  let women = null;
  let assumed = false;
  // "70% vrouw" / "vrouw 70%": a number directly next to a label.
  const adj = [];
  const adjRe = /(\d+(?:[.,]\d+)?)\s*%?\s*(mannen|man|heren|male|men|vrouwen|vrouw|dames|female|women|woman)\b|\b(mannen|man|heren|male|men|vrouwen|vrouw|dames|female|women|woman)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/g;
  while ((mm = adjRe.exec(t))) {
    const num = parseFloat((mm[1] || mm[4]).replace(',', '.'));
    adj.push({ kind: kindOf(mm[2] || mm[3]), num });
  }
  if (adj.length) {
    for (const a of adj) { if (a.kind === 'm' && men === null) men = a.num; if (a.kind === 'v' && women === null) women = a.num; }
  } else if (nums.length === 2 && labels.length >= 2 && labels[0].kind !== labels[1].kind) {
    // "man / vrouw - 30 / 70": labels first, numbers in the same order.
    if (labels[0].kind === 'm') { men = nums[0]; women = nums[1]; } else { women = nums[0]; men = nums[1]; }
  } else if (nums.length === 2) {
    men = nums[0]; women = nums[1]; assumed = true;
  } else if (nums.length === 1 && labels.length === 1) {
    if (labels[0].kind === 'm') men = nums[0]; else women = nums[0];
  } else if (nums.length === 1) {
    // A lone number without a label: read it as the share of women? Too
    // ambiguous: don't guess.
    return null;
  }
  if (men === null && women === null) return null;
  if (men === null) men = 100 - women;
  if (women === null) women = 100 - men;
  if (men < 0 || women < 0 || men > 100 || women > 100) return null;
  const sum = men + women;
  if (Math.abs(sum - 100) > 0.5) return { men, women, assumed, off: true };
  return { men, women, assumed };
}

export function describeGenderSplit(text) {
  const g = parseGenderSplit(text);
  if (!g || g.off) return '';
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ','));
  const lead = g.men === g.women ? 'gelijk verdeeld' : g.women > g.men ? 'vooral vrouwen' : 'vooral mannen';
  return fmt(g.men) + '% mannen en ' + fmt(g.women) + '% vrouwen (' + lead + ')';
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

// What the client changed in the scripts after TFA's proposals: the main
// script (editedScript differs from the proposal) and/or variation texts that
// differ from the copywriter's draft variation. Drives the "script check"
// that TFA does before anything counts as approved.
export function scriptChangesOf(brief) {
  const out = { main: false, variations: [], any: false };
  if (!brief || !brief.generatedScript) return out;
  const generated = brief.generatedScript.trim();
  const edited = brief.editedScript !== null && brief.editedScript !== undefined ? brief.editedScript.trim() : generated;
  out.main = edited !== generated;
  const count = variationsCountOf(brief);
  if (count) {
    let drafts = [];
    try {
      const hist = JSON.parse(brief.scriptHistory || '[]');
      const entry = (Array.isArray(hist) ? hist : []).find((h) => h.createdAt === brief.scriptGeneratedAt);
      if (entry) drafts = Array.isArray(entry.variations) && entry.variations.length ? entry.variations : (entry.variation ? [entry.variation] : []);
    } catch (e) {}
    let stored = [];
    try { const p = JSON.parse(brief.variationScripts || '[]'); stored = Array.isArray(p) ? p : []; } catch (e) {}
    for (let i = 0; i < count; i++) {
      const cur = stored[i];
      if (cur === undefined || cur === null || cur === '') continue;
      const orig = drafts[i] !== undefined && drafts[i] !== '' ? drafts[i] : generated;
      // When the main script was edited, the variation is expected to carry
      // that edit too: compare against the main edit applied to the draft.
      if (cur.trim() !== String(orig).trim() && !(out.main && cur.trim() === edited)) out.variations.push(i);
    }
  }
  out.any = out.main || out.variations.length > 0;
  return out;
}

// Where a brief stands in the script check, for badges in the dashboard:
// 'nofit' (client said no proposal fits) | 'pending' (changes to look at) |
// 'counter' (we sent a counter proposal) | '' (nothing to do).
export function scriptCheckState(brief) {
  if (!brief) return '';
  if (brief.scriptAuditStatus === 'nofit' && brief.scriptsReleasedAt && !brief.finalizedAt) return 'nofit';
  if (!brief.finalizedAt) return '';
  if (brief.scriptAuditStatus === 'approved') return '';
  if (brief.scriptAuditStatus === 'counter') return 'counter';
  if (brief.scriptAuditStatus === 'pending' || scriptChangesOf(brief).any) return 'pending';
  return '';
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


// --- What each variation is about -----------------------------------------
// Asked on the brief step (step 3) when the client wants variations, so TFA
// already knows what differs (another branch, another website, another deal,
// another air period ...). Stored as JSON in the existing variationDetail
// column: [{ kind, detail, airing }], one entry per requested variation. A
// plain (non-JSON) legacy string is treated as the detail of variation 1.
export const VARIATION_KINDS = {
  locatie: 'Andere vestiging of locatie',
  website: 'Ander website of webadres',
  aanbod: 'Ander aanbod of andere actie',
  periode: 'Andere uitzendperiode (bijv. Black Friday)',
  doelgroep: 'Andere doelgroep (zakelijk of consument)',
  anders: 'Iets anders',
};

export function parseVariationInfo(brief) {
  const count = variationsCountOf(brief);
  let list = [];
  const raw = brief && brief.variationDetail;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
      else list = [{ kind: '', detail: String(raw), airing: '' }];
    } catch (e) {
      list = [{ kind: '', detail: String(raw), airing: '' }];
    }
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const v = list[i] && typeof list[i] === 'object' ? list[i] : {};
    out.push({
      kind: VARIATION_KINDS[v.kind] ? v.kind : '',
      detail: typeof v.detail === 'string' ? v.detail : '',
      airing: typeof v.airing === 'string' ? v.airing : '',
    });
  }
  return out;
}

// One human-readable line, e.g. "Andere vestiging of locatie: Filiaal Zwolle (uitzending: Black Friday)".
export function variationInfoLabel(info) {
  if (!info) return '';
  const parts = [];
  const head = [info.kind ? VARIATION_KINDS[info.kind] : '', info.detail].filter(Boolean).join(': ');
  if (head) parts.push(head);
  if (info.airing) parts.push('uitzending: ' + info.airing);
  return parts.join(' · ');
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
  script_writing: 'Script wordt geschreven',
  script_choosing: 'Klant kiest script, stem & muziek',
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

// Which agency a brief is attributed to, for display — see the
// agencyCode/agencyName/agencyContactEmail comment in lib/db.js's
// STRING_COLUMNS. Every brief before this feature (and any created with no
// matching agency code) has agencyName === '', and every client-facing
// mention of "who TFA hands the final files to" used to hardcode "Advision
// Media" — so that's the fallback here too, not a blank. A brief tagged
// with a real agency (agencyName set at creation time) shows that instead.
export function agencyNameOf(brief) {
  return (brief && brief.agencyName && brief.agencyName.trim()) || 'Advision Media';
}

// Companion to agencyNameOf — used to default the Uitlevering tab's
// recipient-email field to the brief's own agency contact (see
// DashboardClient.js) rather than always falling back to whatever was
// typed last. No fallback address here (unlike the name above): a blank
// means "no known contact for this brief's agency", which the dashboard
// should show as an empty field, not silently guess an email.
export function agencyContactEmailOf(brief) {
  return (brief && brief.agencyContactEmail && brief.agencyContactEmail.trim()) || '';
}

export function revisionDisclaimerText(brief) {
  return 'Let op: bij deze productie zijn ' + INCLUDED_REVISIONS + ' rondes revisie inbegrepen. Heb je meer nodig? Neem dan contact op met ' + agencyNameOf(brief) + '.';
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

// Compact timestamp for admin tables and lists ("11 okt, 12:24"; the year is
// only added when it is not the current year). Shorter than formatDateTime
// above on purpose: the dashboard table and the Team notes only need a quick
// "when", not the full date.
export function formatShortDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit',
    }).format(d).replace(/\./g, '');
  } catch (e) {
    return iso;
  }
}
