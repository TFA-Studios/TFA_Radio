// Data layer for the brief/script flow. Ported from the original
// better-sqlite3 db.js, but async throughout and backed by either:
//  - @vercel/postgres, when POSTGRES_URL is set (real, persistent, shared
//    across serverless function instances), or
//  - a plain in-memory array, when it isn't (zero-config local dev, and
//    lets `next build`/`next dev` work with no external services at all).
//
// The in-memory fallback is per-process — fine for local dev, but on
// Vercel serverless each invocation may be a fresh process, so data will
// NOT persist between requests without a real POSTGRES_URL configured.

const { resolveFormProfile, normalizeFormConfig } = require('./formProfile');
const { nanoid } = require('nanoid');
const { applyProposalOp } = require('./scriptProposals');
const { parseEvents, addEvent } = require('./eventLog');

const USE_PG = !!process.env.POSTGRES_URL;

// Cap on how many past script generations are kept per brief — mirrors the
// "max of 3" regenerate limit enforced in app/api/briefs/[id]/generate-script.
const MAX_SCRIPT_HISTORY = 3;

function parseScriptHistory(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Fields the client's brief form is allowed to write.
const ALLOWED_FIELDS = [
  // JSON {questionKey: answer} for the agency's extra questions (see lib/formProfile.js).
  'extraAnswers',
  'companyName',
  'website',
  'companyDescription',
  'contactPerson',
  'contactEmail',
  // JSON string of [{ name, email }] — extra contact people beyond the
  // primary contactPerson/contactEmail above, added via the "+" on the
  // contact step. The confirmation email on submit goes to contactEmail
  // AND every email in here (see lib/email.js's recipientsFor()).
  'additionalContacts',
  'hoofdspotLength',
  'impressions',
  'impressionsCustom',
  'airDate',
  'dateUnknown',
  'airMonth',
  'needsVariations',
  // How many separate variations of the hoofdspot the client wants (as a
  // string count, e.g. '0'..'3') — set on the delivery step once
  // needsVariations is true. needsVariations itself stays the simple
  // yes/no gate; this is the actual number used to size the variation
  // panels on the script step and the "Nx variatie(s)" summary everywhere
  // else (delivery box, overview, email, PDF, reports).
  'variationsCount',
  'disclaimerText',
  // extraNote (optional production-instruction field) was removed from the
  // client-facing brief form — it confused clients ("what goes here?") more
  // than it helped, per Karim. Deliberately dropped from ALLOWED_FIELDS
  // only, not from STRING_COLUMNS/rowToBrief/the DB column below: existing
  // briefs that already have a value keep it (harmless, just no longer
  // shown or settable), and no destructive migration is needed.
  'product',
  'audience',
  'decisionMaker',
  'audienceAgeInterests',
  // 'both' audience only: 'whole' (one commercial aimed at both) or 'variations'
  // (the B2B/B2C difference sits in the variations). Free text ratio such as
  // '30/70' (men/women), interpreted by components/flowData.js parseGenderSplit().
  'audienceBoth',
  'genderSplit',
  'usp',
  'price',
  'priceDetail',
  'mainMessage',
  'cta',
  'slogan',
  'toneOfVoice',
  'variationDetail',
  'scriptApproved',
  'voiceGender',
  'voiceAgeRange',
  'voiceStyleTags',
  'voiceNote',
  'selectedVoiceId',
  'selectedVoiceLabel',
  'selectedVoiceTags',
  'selectedTrackId',
  'selectedTrackTitle',
  'selectedTrackArtist',
  'selectedPlaylistId',
  'selectedPlaylistName',
  'selectedTracks',
];
const BOOL_FIELDS = new Set(['needsVariations', 'dateUnknown', 'scriptApproved']);
// price is tri-state: null (not answered), 0 (no), 1 (yes) — not a plain bool.
const TRISTATE_FIELDS = new Set(['price']);

// Fields the script review step is allowed to write.
// variationScripts is a JSON string of string[] — one entry per requested
// variation (length driven by variationsCount) — replacing the old
// single editedVarScript field now that a brief can have more than one
// variation. editedVarScript/generatedVarScript stay in the schema for any
// old rows but are no longer written or read by the app.
// variationsBase = the main-script text the stored variations are aligned to
// (written by the edit route when the client's main-script edit is carried
// into the variations, see lib/scriptMerge.js).
const EDIT_FIELDS = ['editedScript', 'editedVarScript', 'variationScripts', 'variationsBase'];

// Producer-only workflow status — deliberately NOT in ALLOWED_FIELDS (the
// client-facing brief flow never sees or sets this) and updated through its
// own dedicated updateBriefStatus() below instead of the general patch path.
const STATUS_VALUES = ['todo', 'pending_customer', 'in_progress', 'done'];
const DEFAULT_STATUS = 'todo';

const STRING_COLUMNS = [
  'companyName', 'website', 'companyDescription', 'contactPerson', 'contactEmail', 'additionalContacts', 'hoofdspotLength', 'impressions',
  'impressionsCustom', 'airDate', 'airMonth', 'variationsCount', 'disclaimerText', 'extraNote', 'product',
  'audience', 'decisionMaker', 'audienceAgeInterests', 'audienceBoth', 'genderSplit', 'usp', 'priceDetail', 'mainMessage',
  // Server/producer-written: script alignment + the producer's check of what the
  // client changed (see saveScriptAudit below).
  'variationsBase', 'scriptAuditStatus', 'scriptAuditNote', 'scriptCounterText', 'scriptAuditedAt', 'scriptAuditReply',
  'cta', 'slogan', 'variationDetail', 'generatedScript', 'generatedVarScript', 'variationScripts', 'scriptSource', 'scriptHistory',
  'voiceGender', 'voiceAgeRange', 'voiceStyleTags', 'voiceNote', 'selectedVoiceId',
  'selectedVoiceLabel', 'selectedVoiceTags', 'selectedTrackId', 'selectedTrackTitle',
  'selectedTrackArtist', 'selectedPlaylistId', 'selectedPlaylistName', 'selectedTracks',
  'toneOfVoice',
  // Post-production review workflow — never in ALLOWED_FIELDS (neither is
  // purely client- nor purely producer-writable; each has its own dedicated
  // function below, same separation as status/assignedTo/internalNotes).
  // frameioLink is the ONE master Frame.io link for the whole brief — the
  // client sees the same link every round; what actually changes round to
  // round is the dated folder inside it (see the reviewRounds comment
  // below), so the link itself lives here rather than per-round.
  'productionStatus', 'reviewRounds', 'frameioLink',
  // Final delivery to whoever needs the finished WAV masters (Advision
  // Media today, potentially another agency or a client directly later —
  // deliberately generic, not Advision-specific). Producer-only, set via
  // saveDelivery() below once the client has approved — see the
  // "Uitlevering" tab in DashboardClient.js. deliveryRecipientEmail also
  // gets remembered in the separate delivery_recipients store so it can be
  // offered as a one-click suggestion on the next brief.
  'deliveryLink', 'deliveryRecipientEmail',
  // Which of the client's (up to 3) candidate music tracks actually ended
  // up in the final production — see finalTrackOf() in components/
  // flowData.js for why this can't just be inferred. Producer-only, set via
  // updateBriefTeamMeta() below, same separation as assignedTo/dueDate.
  'usedTrackId',
  // Which referring agency (if any) this brief came in through — resolved
  // once, at creation time, from the `code` posted to POST /api/briefs
  // against the `agencies` table (see findAgencyByCode below) and then
  // frozen onto the brief. Deliberately a snapshot, not a live lookup: if
  // someone later renames an agency or changes its contact email, briefs
  // already created under the old name/email shouldn't silently change —
  // same "capture once" reasoning as deliveryRecipientEmail above.
  // agencyCode is kept mainly for producer reference (which code was used);
  // agencyName/agencyContactEmail are what the client-facing copy and the
  // Uitlevering tab's default recipient actually read. All three stay ''
  // for a brief created with no matching agency code (or before this
  // feature existed) — see agencyNameOf()'s "Advision Media" fallback in
  // components/flowData.js for why that's the right default, not a blank.
  'agencyCode', 'agencyName', 'agencyContactEmail',
  // Stable link to the agencies row (survives a renamed code) — what the
  // agency login scopes on. Frozen at creation, same as the three above.
  'agencyId',
  // Co-branding logos (copied from the agency at creation, kept in sync when it changes).
  'agencyLogoDark', 'agencyLogoLight', 'agencyLogoIcon',
  // Frozen JSON snapshot of the agency's form profile (lib/formProfile.js).
  'formProfile',
];

// Hard character caps on the brief's free-text fields — the real
// enforcement behind the maxLength attributes in app/brief/[id]/details/
// page.js (which only stop a client typing past the limit; this is what
// actually protects against a direct API call with no such limit). Sized
// from real client answers collected across several briefs — see the long
// comment next to FIELD_LIMITS in details/page.js for how these numbers
// were chosen. Keep the two in sync.
const FIELD_MAX_LENGTHS = {
  product: 1200,
  decisionMaker: 200,
  audienceAgeInterests: 1000,
  genderSplit: 60,
  audienceBoth: 20,
  website: 200,
  companyDescription: 300,
  usp: 1200,
  priceDetail: 150,
  mainMessage: 1200,
  cta: 150,
  slogan: 150,
  disclaimerText: 2000,
  extraNote: 1000,
};

function coerceValue(key, value) {
  if (BOOL_FIELDS.has(key)) return value ? 1 : 0;
  if (TRISTATE_FIELDS.has(key)) return value === null || value === undefined ? null : (value ? 1 : 0);
  const str = String(value ?? '');
  const max = FIELD_MAX_LENGTHS[key];
  return max ? str.slice(0, max) : str;
}

function parseInternalNotes(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Post-production review rounds — JSON string of
// [{ id, folderDate, note, createdAt, feedback: [{ id, text, createdAt }], approvedAt }],
// oldest first. Mirrors how TFA actually uses Frame.io: ONE link for the
// whole brief (brief.frameioLink, set/updated the first time a producer
// shares a round), with a new DATED FOLDER added inside that same link each
// time a fresh bounce/mix goes up — a round here is one of those folders,
// not a new link. folderDate defaults to the day the round is shared
// ('YYYY-MM-DD'); note is an optional free-text label ("na klantfeedback",
// "bounce 2") shown alongside the date. A producer starts a round from the
// dashboard (dashboard-only, see addReviewRound below); the client sees it
// on their private review page and can either leave feedback (appended to
// the current/last round's feedback array — a soft-capped revision count,
// not a hard block, per components/flowData.js's INCLUDED_REVISIONS, meant
// to cover 2 rounds included by default) or approve (stamps the current
// round's approvedAt and the brief-level reviewApprovedAt, which triggers
// the final link being sent to TFA's admin inbox).
function parseReviewRounds(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function rowToBrief(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    contactEmail: row.contactEmail,
    additionalContacts: row.additionalContacts || '[]',
    hoofdspotLength: row.hoofdspotLength,
    impressions: row.impressions,
    impressionsCustom: row.impressionsCustom,
    airDate: row.airDate,
    dateUnknown: !!row.dateUnknown,
    airMonth: row.airMonth,
    needsVariations: !!row.needsVariations,
    // '0'..'3' — see the ALLOWED_FIELDS comment above.
    variationsCount: row.variationsCount || (row.needsVariations ? '1' : '0'),
    disclaimerText: row.disclaimerText,
    extraNote: row.extraNote,
    product: row.product,
    audience: row.audience || null,
    decisionMaker: row.decisionMaker,
    audienceAgeInterests: row.audienceAgeInterests,
    audienceBoth: row.audienceBoth || '',
    genderSplit: row.genderSplit || '',
    website: row.website || '',
    companyDescription: row.companyDescription || '',
    variationsBase: row.variationsBase || '',
    // Producer check of what the client changed in the script after TFA's
    // proposals: '' (nothing to check yet) | 'pending' | 'approved' | 'counter'.
    scriptAuditStatus: row.scriptAuditStatus || '',
    scriptAuditNote: row.scriptAuditNote || '',
    scriptCounterText: row.scriptCounterText || '',
    scriptAuditedAt: row.scriptAuditedAt || '',
    scriptAuditReply: row.scriptAuditReply || '',
    usp: row.usp,
    price: row.price === null || row.price === undefined ? null : !!row.price,
    priceDetail: row.priceDetail,
    mainMessage: row.mainMessage,
    cta: row.cta,
    slogan: row.slogan,
    variationDetail: row.variationDetail,
    scriptApproved: !!row.scriptApproved,
    generatedScript: row.generatedScript,
    generatedVarScript: row.generatedVarScript,
    scriptSource: row.scriptSource,
    scriptGeneratedAt: row.scriptGeneratedAt,
    // Up to 3 past AI/template generations for this brief, newest last —
    // JSON string of [{ id, main, variation, source, createdAt }]. Lets the
    // client-flow script step offer "view all responses and pick one"
    // instead of only ever showing the most recent generation.
    scriptHistory: row.scriptHistory || '[]',
    editedScript: row.editedScript,
    editedVarScript: row.editedVarScript,
    // JSON string of string[] — see the EDIT_FIELDS comment above.
    variationScripts: row.variationScripts || '[]',
    voiceGender: row.voiceGender,
    voiceAgeRange: row.voiceAgeRange,
    voiceStyleTags: row.voiceStyleTags,
    voiceNote: row.voiceNote,
    selectedVoiceId: row.selectedVoiceId,
    selectedVoiceLabel: row.selectedVoiceLabel,
    selectedVoiceTags: row.selectedVoiceTags,
    selectedTrackId: row.selectedTrackId,
    selectedTrackTitle: row.selectedTrackTitle,
    selectedTrackArtist: row.selectedTrackArtist,
    selectedPlaylistId: row.selectedPlaylistId,
    selectedPlaylistName: row.selectedPlaylistName,
    selectedTracks: row.selectedTracks,
    toneOfVoice: row.toneOfVoice,
    status: row.status || DEFAULT_STATUS,
    // Team-only workflow metadata — never touched by the client-facing brief
    // flow (not in ALLOWED_FIELDS), set from the dashboard instead via their
    // own dedicated update functions below, same separation as `status`.
    assignedTo: row.assignedTo || '',
    dueDate: row.dueDate || '',
    // Internal producer notes thread — JSON string of
    // [{ id, author, text, createdAt }], newest last. Never shown to the
    // client, only in the dashboard's brief detail view.
    internalNotes: row.internalNotes || '[]',
    // Staff-only history of what happened on this brief (see lib/eventLog.js).
    eventLog: row.eventLog || '[]',
    // Staff-only state of the background script writer (see lib/scriptJobs.js).
    scriptJob: row.scriptJob || '',
    // Post-production review workflow — see the parseReviewRounds comment
    // above. productionStatus is a free-form label ('' | 'awaiting_review' |
    // 'in_revision' | 'approved') driven entirely by addReviewRound/
    // approveReview below, never by the client-facing generic patch.
    productionStatus: row.productionStatus || '',
    reviewRounds: row.reviewRounds || '[]',
    // The single master Frame.io link for this brief — see the
    // reviewRounds comment above. Same link across every round; only the
    // dated folder inside it changes.
    frameioLink: row.frameioLink || '',
    reviewApprovedAt: row.reviewApprovedAt || null,
    adminNotifiedAt: row.adminNotifiedAt || null,
    // Final delivery (WAV masters) — see the STRING_COLUMNS comment above.
    // deliveredAt is null until saveDelivery() actually fires, same shape as
    // reviewApprovedAt/adminNotifiedAt, so the dashboard can tell "approved,
    // not yet delivered" apart from "delivered".
    deliveryLink: row.deliveryLink || '',
    deliveryRecipientEmail: row.deliveryRecipientEmail || '',
    deliveredAt: row.deliveredAt || null,
    // Which candidate track was actually used — see finalTrackOf() in
    // components/flowData.js. Empty string until a producer picks one.
    usedTrackId: row.usedTrackId || '',
    // Referring agency, frozen at creation time — see the STRING_COLUMNS
    // comment above.
    agencyCode: row.agencyCode || '',
    agencyName: row.agencyName || '',
    agencyContactEmail: row.agencyContactEmail || '',
    agencyId: row.agencyId || '',
    agencyLogoDark: row.agencyLogoDark || '',
    agencyLogoLight: row.agencyLogoLight || '',
    agencyLogoIcon: row.agencyLogoIcon || '',
    formProfile: row.formProfile || '',
    extraAnswers: row.extraAnswers || '',
    // Set the first time a producer opens this brief in the dashboard (see
    // updateBriefTeamMeta's `seen` flag, set from the row-click handler in
    // DashboardClient.js) — null until then. Compared against submittedAt
    // to drive the "new, unchecked brief" highlight on the dashboard list:
    // a brief is unseen if it's been submitted but never opened since.
    seenAt: row.seenAt || null,
    // "Brief sent to TFA" — stamped when the client finishes the brief step
    // (step 3) and hands the brief over. Since the copywriter workflow, this
    // is NO LONGER "the whole flow is done": TFA now writes the script
    // proposals after this point (see scriptsReleasedAt/finalizedAt below).
    submittedAt: row.submittedAt,
    // When a producer released the reviewed script drafts (the entries in
    // scriptHistory) to the client from the dashboard. Until then the client
    // only sees a "your copywriter is writing" waiting page and cannot reach
    // the script/voice/music steps. null until released.
    scriptsReleasedAt: row.scriptsReleasedAt || null,
    // Producer-only soft archive ("dashboard opruimen"): hides a brief from
    // the default dashboard view without deleting anything.
    archivedAt: row.archivedAt || null,
    // When the client confirmed everything at the very end (step 7: chosen
    // script, voice and music). Briefs that were submitted under the old
    // instant-script flow are backfilled with finalizedAt = submittedAt by
    // the migration in runMigrations(), so they keep behaving as before.
    finalizedAt: row.finalizedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function freshRow(id, now) {
  const row = { id, createdAt: now, updatedAt: now, submittedAt: null, scriptsReleasedAt: null, finalizedAt: null };
  for (const col of STRING_COLUMNS) row[col] = '';
  row.hoofdspotLength = '20';
  row.selectedTracks = '[]';
  row.toneOfVoice = '[]';
  row.scriptHistory = '[]';
  row.additionalContacts = '[]';
  row.dateUnknown = 0;
  row.needsVariations = 0;
  row.variationsCount = '0';
  row.variationScripts = '[]';
  row.scriptApproved = 0;
  row.price = null;
  row.scriptGeneratedAt = null;
  row.editedScript = null;
  row.editedVarScript = null;
  row.status = DEFAULT_STATUS;
  row.assignedTo = '';
  row.dueDate = '';
  row.internalNotes = '[]';
  row.eventLog = '[]';
  row.scriptJob = '';
  row.productionStatus = '';
  row.reviewRounds = '[]';
  row.reviewApprovedAt = null;
  row.adminNotifiedAt = null;
  row.seenAt = null;
  row.deliveredAt = null;
  return row;
}

// ------------------------------------------------------------------------
// In-memory fallback
// ------------------------------------------------------------------------
const mem = {
  briefs: new Map(),
  sentEmails: [],
  tracks: null, // seeded lazily by lib/library.js
  voices: null,
  // Remembered final-delivery recipients (see saveDelivery/listDeliveryRecipients
  // below) — [{ id, email, label, lastUsedAt }], NOT tied to a single brief,
  // so an address used for one client's delivery is a one-click suggestion
  // for any other brief's delivery too.
  deliveryRecipients: [],
  // Referring agencies (see findAgencyByCode/createAgency etc. below) —
  // [{ id, code, name, contactEmail, createdAt }], managed from the
  // dashboard's Agencies screen. Growing list, same shape/spirit as
  // deliveryRecipients above but producer-curated rather than auto-grown
  // from usage — an agency has to be added deliberately once, since its
  // code is also the access-code a client link is gated on.
  agencies: [],
};

async function memCreateBrief(id, agency) {
  const now = new Date().toISOString();
  const row = freshRow(id, now);
  if (agency) {
    row.agencyCode = agency.usedCode || agency.code || '';
    row.agencyName = agency.name || '';
    row.agencyContactEmail = agency.contactEmail || '';
    row.agencyId = agency.id || '';
    row.formProfile = JSON.stringify(resolveFormProfile(agency));
    row.agencyLogoDark = agency.logoDark || '';
    row.agencyLogoLight = agency.logoLight || '';
    row.agencyLogoIcon = agency.logoIcon || '';
  }
  mem.briefs.set(id, row);
  return rowToBrief(row);
}

// Case-insensitive lookup used by POST /api/briefs to resolve a submitted
// `code` against the agencies list — see the STRING_COLUMNS comment on
// agencyCode above for why the match result gets frozen onto the brief
// rather than looked up again later.
// Every access code an agency answers to: its main code plus any extra ones.
function codesOfAgency(a) {
  return [a.code].concat(String(a.extraCodes || '').split(/[,;\n]+/)).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean);
}
// Case-insensitive match on any of an agency's codes; the code that was
// actually typed is returned as usedCode so the brief records it.
function matchAgencyByCode(list, code) {
  const needle = (code || '').trim().toLowerCase();
  if (!needle) return null;
  const hit = list.find((a) => codesOfAgency(a).includes(needle));
  return hit ? { ...hit, usedCode: (code || '').trim() } : null;
}
// true if any of `codes` already belongs to another agency
function codesClash(list, selfId, codes) {
  const mine = codes.map((c) => c.toLowerCase());
  return list.some((a) => a.id !== selfId && codesOfAgency(a).some((c) => mine.includes(c)));
}

async function memFindAgencyByCode(code) {
  return matchAgencyByCode(mem.agencies, code);
}

async function memFindAgencyByUserEmail(email) {
  const needle = (email || '').trim().toLowerCase();
  if (!needle) return null;
  return mem.agencies.find((a) => String(a.userEmails || '').split(/[,;\n]+/).includes(needle)) || null;
}

async function memListAgencies() {
  return mem.agencies.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// Agency profile fields beyond code/name/contactEmail:
//  userEmails  — logins linked to this agency (comma/newline separated); a
//                signed-in user whose email is listed sees ONLY this agency's
//                briefs, read-only.
//  scriptMode  — 'copywriter' (TFA writes + releases scripts) or 'provided'
//                (the agency supplies a ready script, no drafting).
//  formKey     — which client form template this agency's clients get
//                ('standard' today; custom templates plug in here later).
//  formConfig  — JSON string of per-agency tweaks on top of the template
//                (hidden fields, relabelled questions, extra questions).
// Bundled logos for partners we have a file for (public/agency-logos).
function defaultLogosFor(name) {
  if (/advision/i.test(String(name || ''))) return { logoDark: '/agency-logos/advision-dark.png', logoLight: '/agency-logos/advision-light.png', logoIcon: '/agency-logos/advision-icon.png' };
  return { logoDark: '', logoLight: '', logoIcon: '' };
}

function normAgencyProfile(data, base) {
  const out = {};
  const get = (k, d) => (data && data[k] !== undefined ? data[k] : base ? base[k] : d);
  out.userEmails = String(get('userEmails', '') || '').split(/[,;\n]+/).map((e) => e.trim().toLowerCase()).filter(Boolean).join(', ');
  const sm = String(get('scriptMode', 'copywriter') || 'copywriter');
  out.scriptMode = sm === 'provided' ? 'provided' : 'copywriter';
  out.formKey = (String(get('formKey', 'standard') || 'standard').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'standard');
  out.formConfig = JSON.stringify(normalizeFormConfig(get('formConfig', '{}')));
  // Co-branding: logo for dark backgrounds (sidebar) and for light ones
  // (status pages, emails). Local paths under /agency-logos/ or https URLs.
  const cleanLogo = (v) => { const t = String(v || '').trim(); return /^(\/agency-logos\/[\w.-]+|https:\/\/\S+)$/.test(t) ? t : ''; };
  out.logoDark = cleanLogo(get('logoDark', ''));
  out.logoLight = cleanLogo(get('logoLight', ''));
  // Stand-alone icon, used as a faint background watermark in the client form.
  out.logoIcon = cleanLogo(get('logoIcon', ''));
  // More access codes for the same agency (one code per line / comma separated).
  out.extraCodes = String(get('extraCodes', '') || '').split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean).join(', ');
  return out;
}

async function memCreateAgency({ code, name, contactEmail, ...rest }) {
  const trimmedCode = (code || '').trim();
  const trimmedName = (name || '').trim();
  if (!trimmedCode || !trimmedName) return null;
  const entry = { id: nanoid(10), code: trimmedCode, name: trimmedName, contactEmail: (contactEmail || '').trim(), ...normAgencyProfile(rest), createdAt: new Date().toISOString() };
  if (codesClash(mem.agencies, entry.id, codesOfAgency(entry))) return { error: 'duplicate_code' };
  if (!entry.logoDark && !entry.logoLight && !entry.logoIcon) Object.assign(entry, defaultLogosFor(entry.name));
  mem.agencies.push(entry);
  return entry;
}

async function memUpdateAgency(id, { code, name, contactEmail, ...rest }) {
  const entry = mem.agencies.find((a) => a.id === id);
  if (!entry) return null;
  const candidate = { ...entry, ...normAgencyProfile(rest, entry) };
  if (code !== undefined) candidate.code = (code || '').trim();
  if (codesClash(mem.agencies, id, codesOfAgency(candidate))) return { error: 'duplicate_code' };
  Object.assign(entry, normAgencyProfile(rest, entry));
  for (const row of mem.briefs.values()) {
    if (row.agencyId === entry.id) { row.agencyLogoDark = entry.logoDark || ''; row.agencyLogoLight = entry.logoLight || ''; row.agencyLogoIcon = entry.logoIcon || ''; }
  }
  if (code !== undefined) entry.code = (code || '').trim();
  if (name !== undefined) entry.name = (name || '').trim();
  if (contactEmail !== undefined) entry.contactEmail = (contactEmail || '').trim();
  return entry;
}

async function memDeleteAgency(id) {
  const before = mem.agencies.length;
  mem.agencies = mem.agencies.filter((a) => a.id !== id);
  return mem.agencies.length < before;
}

async function memGetBrief(id) {
  return rowToBrief(mem.briefs.get(id));
}

async function memListBriefs() {
  return Array.from(mem.briefs.values())
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map(rowToBrief);
}

async function memUpdateBrief(id, patch) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const coerced = coerceValue(key, patch[key]);
      row[key] = BOOL_FIELDS.has(key) ? !!coerced : coerced;
    }
  }
  // `submitted` = the client finished the brief step (step 3) and sent the
  // brief to TFA; only the FIRST time counts, so a client who goes back to
  // fix a typo and clicks "send" again never re-stamps (or re-triggers
  // anything keyed on) the original submission. `finalized` = the client
  // confirmed script + voice + music on the last step, which only makes
  // sense once TFA has released the script proposals.
  if (Object.prototype.hasOwnProperty.call(patch, 'submitted') && patch.submitted && !row.submittedAt) {
    row.submittedAt = new Date().toISOString();
    row.productionStatus = 'script_writing';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'finalized') && patch.finalized && !row.finalizedAt && row.scriptsReleasedAt) {
    row.finalizedAt = new Date().toISOString();
    row.productionStatus = '';
    row.status = 'todo';
  }
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

async function memSaveEdit(id, patch) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  for (const key of EDIT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      row[key] = patch[key] === null ? null : String(patch[key]);
    }
  }
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// A draft's per-variation texts (one per requested variation), as the JSON the
// brief's variationScripts column holds. Empty list => '[]' (variations start
// as copies of the main script, as before).
function draftVariationsJson(entry) {
  const list = Array.isArray(entry && entry.variations) ? entry.variations.map((v) => String(v || '')) : [];
  return list.some((v) => v.trim()) ? JSON.stringify(list) : '[]';
}
function normDraftVariations(v) {
  if (Array.isArray(v.variations)) return v.variations.map((x) => String(x || ''));
  return v.variation ? [String(v.variation)] : [];
}

async function memSaveGeneratedScript(id, { main, variation, source }) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const now = new Date().toISOString();
  const history = parseScriptHistory(row.scriptHistory);
  history.push({ id: nanoid(10), main: main || '', variation: variation || '', source: source || '', createdAt: now });
  row.scriptHistory = JSON.stringify(history.slice(-MAX_SCRIPT_HISTORY));
  row.generatedScript = main || '';
  row.generatedVarScript = variation || '';
  row.scriptSource = source || '';
  row.scriptGeneratedAt = now;
  row.editedScript = null;
  row.editedVarScript = null;
  row.variationScripts = '[]';
  row.scriptApproved = false;
  row.variationsBase = '';
  row.updatedAt = now;
  return rowToBrief(row);
}

// Re-points generatedScript/generatedVarScript at one of this brief's
// stored history entries — used when the client picks a previous
// generation instead of the most recent one (the script step's "view all
// responses and pick one").
async function memSelectScriptVersion(id, versionId) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const history = parseScriptHistory(row.scriptHistory);
  const entry = history.find((h) => h.id === versionId);
  if (!entry) return null;
  row.generatedScript = entry.main || '';
  row.generatedVarScript = entry.variation || '';
  row.scriptSource = entry.source || '';
  row.scriptGeneratedAt = entry.createdAt;
  row.editedScript = null;
  row.editedVarScript = null;
  row.variationScripts = draftVariationsJson(entry);
  row.scriptApproved = false;
  row.variationsBase = '';
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Replaces the brief's script history with a fresh set of producer-reviewable
// drafts (the "copywriter" workflow): TFA's server writes up to 3 versions
// the moment the brief is submitted, the producer reviews/edits them in the
// dashboard, and only then are they released to the client (see
// memReleaseScripts). Unlike memSaveGeneratedScript this REPLACES the history
// instead of appending, so "generate new drafts" never hits the old
// MAX_SCRIPT_HISTORY append cap. Each entry gets a distinct createdAt (the
// script step matches the active version by that timestamp).
async function memSaveScriptDrafts(id, versions) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const base = Date.now();
  const history = (versions || []).slice(0, MAX_SCRIPT_HISTORY).map((v, i) => ({
    id: nanoid(10),
    main: v.main || '',
    variation: v.variation || '',
    variations: normDraftVariations(v),
    source: v.source || '',
    createdAt: new Date(base + i).toISOString(),
  }));
  row.scriptHistory = JSON.stringify(history);
  const first = history[0];
  row.generatedScript = first ? first.main : '';
  row.generatedVarScript = first ? first.variation : '';
  row.scriptSource = first ? first.source : '';
  row.scriptGeneratedAt = first ? first.createdAt : null;
  row.editedScript = null;
  row.editedVarScript = null;
  row.variationScripts = draftVariationsJson(first);
  row.scriptApproved = false;
  row.variationsBase = '';
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// TFA's own pick among the proposals ("we lean towards this one, because...").
// At most one entry is recommended; the reason is optional free text. Both
// are stored on the history entries themselves, so no extra columns.
function applyRecommendation(history, entry, recommended, reason) {
  if (typeof recommended === 'boolean') {
    for (const h of history) { if (h !== entry) h.recommended = false; }
    entry.recommended = recommended;
    if (!recommended) entry.reason = '';
  }
  if (typeof reason === 'string' && entry.recommended) entry.reason = reason.slice(0, 600);
}

// Producer edit of one draft's text before release. Refused once released:
// from that point the client is choosing between these exact texts.
async function memUpdateScriptDraft(id, versionId, { main, variation, variations, recommended, reason }) {
  const row = mem.briefs.get(id);
  if (!row || row.scriptsReleasedAt) return null;
  const history = parseScriptHistory(row.scriptHistory);
  const entry = history.find((h) => h.id === versionId);
  if (!entry) return null;
  if (typeof main === 'string') entry.main = main;
  if (typeof variation === 'string') entry.variation = variation;
  if (Array.isArray(variations)) { entry.variations = variations.map((x) => String(x || '')); entry.variation = entry.variations[0] || entry.variation || ''; }
  applyRecommendation(history, entry, recommended, reason);
  row.scriptHistory = JSON.stringify(history);
  if (entry.createdAt === row.scriptGeneratedAt) {
    row.generatedScript = entry.main || '';
    row.generatedVarScript = entry.variation || '';
    if (Array.isArray(variations)) row.variationScripts = draftVariationsJson(entry);
  }
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Releases the reviewed drafts to the client: the waiting page turns into
// the script chooser (and a "scripts ready" email goes out — see the route).
// Needs at least one non-empty draft and is a no-op if already released.
async function memReleaseScripts(id) {
  const row = mem.briefs.get(id);
  if (!row || row.scriptsReleasedAt) return null;
  const history = parseScriptHistory(row.scriptHistory).filter((h) => h.main && h.main.trim());
  if (!history.length) return null;
  const now = new Date().toISOString();
  row.scriptsReleasedAt = now;
  row.productionStatus = 'script_choosing';
  row.status = 'pending_customer';
  row.updatedAt = now;
  return rowToBrief(row);
}

const AUDIT_FIELDS = ['scriptAuditStatus', 'scriptAuditNote', 'scriptCounterText', 'scriptAuditedAt', 'scriptAuditReply'];

// Producer/client bookkeeping for the check of script edits made by the
// client after TFA's proposals. Whitelisted columns only.
async function memSaveScriptAudit(id, patch) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  for (const key of AUDIT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) row[key] = String(patch[key] || '');
  }
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}
async function pgSaveScriptAudit(id, patch) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const sets = []; const values = []; let i = 1;
  for (const key of AUDIT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) { sets.push(`"${key}" = $${i++}`); values.push(String(patch[key] || '')); }
  }
  if (!sets.length) return pgGetBrief(id);
  sets.push(`"updatedAt" = $${i++}`); values.push(new Date().toISOString());
  values.push(id);
  await sql.query(`UPDATE briefs SET ${sets.join(', ')} WHERE id = $${i}`, values);
  return pgGetBrief(id);
}

// Takes released proposals back (the client said none of them fit): the
// brief returns to the copywriter stage so new proposals can be written and
// released again.
async function memReopenScripts(id) {
  const row = mem.briefs.get(id);
  if (!row || !row.scriptsReleasedAt || row.finalizedAt) return null;
  row.scriptsReleasedAt = null;
  row.productionStatus = 'script_writing';
  row.status = 'todo';
  row.scriptAuditStatus = '';
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}
async function pgReopenScripts(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "scriptsReleasedAt", "finalizedAt" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length || !existing.rows[0].scriptsReleasedAt || existing.rows[0].finalizedAt) return null;
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "scriptsReleasedAt" = NULL, "productionStatus" = 'script_writing', "status" = 'todo', "scriptAuditStatus" = '', "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

// Soft archive / restore for a batch of briefs. Never deletes anything.
const MAX_ARCHIVE_BATCH = 500;
async function memSetArchived(ids, archived) {
  const now = new Date().toISOString();
  let n = 0;
  for (const id of ids) {
    const row = mem.briefs.get(id);
    if (!row) continue;
    row.archivedAt = archived ? now : null;
    n += 1;
  }
  return n;
}
async function pgSetArchived(ids, archived) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const value = archived ? new Date().toISOString() : null;
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
  const res = await sql.query(`UPDATE briefs SET "archivedAt" = $1 WHERE id IN (${placeholders})`, [value, ...ids]);
  return res.rowCount || 0;
}
async function setBriefsArchived(ids, archived) {
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 64))).slice(0, MAX_ARCHIVE_BATCH);
  if (!clean.length) return 0;
  return USE_PG ? pgSetArchived(clean, !!archived) : memSetArchived(clean, !!archived);
}

async function memUpdateStatus(id, status) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  row.status = status;
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Team-only workflow metadata — see the comment on rowToBrief's
// assignedTo/dueDate/internalNotes fields above. `seen: true` stamps
// seenAt with now (used when a producer opens the brief in the dashboard —
// see rowToBrief's seenAt comment); there's no way to un-seen a brief from
// here, deliberately, since this only ever fires from a genuine open.
async function memUpdateTeamMeta(id, { assignedTo, dueDate, seen, usedTrackId, airDate }) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  if (airDate !== undefined) { row.airDate = airDate || ''; if (airDate) { row.dateUnknown = false; row.airMonth = ''; } row.updatedAt = new Date().toISOString(); }
  if (assignedTo !== undefined) row.assignedTo = assignedTo || '';
  if (dueDate !== undefined) row.dueDate = dueDate || '';
  if (usedTrackId !== undefined) row.usedTrackId = usedTrackId || '';
  // Deliberately does NOT touch updatedAt — opening a brief to view it
  // isn't a real edit, and bumping updatedAt here would wrongly reshuffle
  // the dashboard's "Laatst gewijzigd" sort just from someone looking at it.
  if (seen) row.seenAt = new Date().toISOString();
  if (assignedTo !== undefined || dueDate !== undefined || usedTrackId !== undefined) row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Saves the final-delivery link + recipient on a brief (stamping
// deliveredAt) and remembers the recipient address for next time — see the
// mem.deliveryRecipients comment above. Sending the actual email is the
// caller's job (see the delivery API route), same separation as
// addReviewRound not sending the client's review-round email itself.
async function memSaveDelivery(id, { link, recipientEmail }) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const now = new Date().toISOString();
  row.deliveryLink = link || '';
  row.deliveryRecipientEmail = recipientEmail || '';
  row.deliveredAt = now;
  row.updatedAt = now;
  const email = (recipientEmail || '').trim();
  if (email) {
    const existing = mem.deliveryRecipients.find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      existing.lastUsedAt = now;
    } else {
      mem.deliveryRecipients.push({ id: nanoid(10), email, label: '', lastUsedAt: now });
    }
  }
  return rowToBrief(row);
}

async function memListDeliveryRecipients() {
  return mem.deliveryRecipients.slice().sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1));
}

async function memAddInternalNote(id, { author, text }) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const notes = parseInternalNotes(row.internalNotes);
  notes.push({ id: nanoid(10), author: author || '', text: text || '', createdAt: new Date().toISOString() });
  row.internalNotes = JSON.stringify(notes);
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Edits the text of an existing internal note in place (dashboard "editable
// internal comment" — the note keeps its id/author/createdAt, only the text
// changes, plus a new editedAt stamp so the UI can show it was edited).
async function memEditInternalNote(id, noteId, text) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const notes = parseInternalNotes(row.internalNotes);
  const note = notes.find((n) => n.id === noteId);
  if (!note) return null;
  note.text = text || '';
  note.editedAt = new Date().toISOString();
  row.internalNotes = JSON.stringify(notes);
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Producer-only: starts a new review round — a new dated folder shared
// inside the brief's one Frame.io link. frameioLink is only really needed
// the first time (it sets/updates the master link on the brief); folderDate
// defaults to today (server-side, 'YYYY-MM-DD') if not given, and note is an
// optional free-text label. Pushes a fresh round (no feedback yet) and
// flips productionStatus to 'awaiting_review' — the client's private review
// page then shows this as the round to react to. Also flips the
// producer-facing workflow `status` to 'pending_customer' — the same status
// already used everywhere else in the dashboard (stat tiles, filters, the
// table's Status column) to mean "waiting on the client" — so a review
// round in flight is visible without opening the brief at all, not just
// inside the Productie & review section.
async function memAddReviewRound(id, { frameioLink, folderDate, note }) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const link = (frameioLink || '').trim();
  if (link) row.frameioLink = link;
  if (!row.frameioLink) return null;
  const rounds = parseReviewRounds(row.reviewRounds);
  rounds.push({
    id: nanoid(10),
    folderDate: folderDate || new Date().toISOString().slice(0, 10),
    note: note || '',
    createdAt: new Date().toISOString(),
    feedback: [],
    approvedAt: null,
  });
  row.reviewRounds = JSON.stringify(rounds);
  row.productionStatus = 'awaiting_review';
  row.status = 'pending_customer';
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Client-only: appends feedback to the current (last) review round. Does
// NOT block on any revision count — lib/flowData.js's INCLUDED_REVISIONS is
// a soft cap the dashboard flags internally, never enforced here. Flips
// `status` back to 'in_progress' — feedback came in, so it's back on TFA's
// plate — same idea as memAddReviewRound's status sync above.
async function memAddReviewFeedback(id, { text }) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const rounds = parseReviewRounds(row.reviewRounds);
  const last = rounds[rounds.length - 1];
  if (!last) return null;
  last.feedback.push({ id: nanoid(10), text: text || '', createdAt: new Date().toISOString() });
  row.reviewRounds = JSON.stringify(rounds);
  row.productionStatus = 'in_revision';
  row.status = 'in_progress';
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

// Client-only: approves the current (last) review round — stamps that
// round's approvedAt plus the brief-level reviewApprovedAt (the signal the
// API route uses to fire the final-link email to TFA's admin inbox). Also
// flips `status` to 'done' — same status sync as the two functions above.
async function memApproveReview(id) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const rounds = parseReviewRounds(row.reviewRounds);
  const last = rounds[rounds.length - 1];
  if (!last) return null;
  const now = new Date().toISOString();
  last.approvedAt = now;
  row.reviewRounds = JSON.stringify(rounds);
  row.productionStatus = 'approved';
  row.status = 'done';
  row.reviewApprovedAt = now;
  row.updatedAt = now;
  return rowToBrief(row);
}

async function memMarkAdminNotified(id) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  row.adminNotifiedAt = new Date().toISOString();
  row.updatedAt = new Date().toISOString();
  return rowToBrief(row);
}

async function memInsertSentEmail({ id, briefId, to, subject, html }) {
  mem.sentEmails.push({ id, briefId, to, subject, html, createdAt: new Date().toISOString() });
}

async function memListSentEmails() {
  return mem.sentEmails.slice().reverse();
}

// ------------------------------------------------------------------------
// Postgres backend
// ------------------------------------------------------------------------
let migrationPromise = null;
// Single-flight: on a cold start many requests arrive together; they all wait on
// the same migration run instead of each firing the ALTER/UPDATE statements
// concurrently. A failed run is not cached, so the next request retries.
function runMigrations() {
  if (!USE_PG) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = migrate().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}

async function migrate() {
  const { sql } = await import('@vercel/postgres');
  await sql`
    CREATE TABLE IF NOT EXISTS briefs (
      id TEXT PRIMARY KEY,
      "companyName" TEXT NOT NULL DEFAULT '',
      "contactPerson" TEXT NOT NULL DEFAULT '',
      "contactEmail" TEXT NOT NULL DEFAULT '',
      "additionalContacts" TEXT NOT NULL DEFAULT '[]',
      "hoofdspotLength" TEXT NOT NULL DEFAULT '20',
      impressions TEXT NOT NULL DEFAULT '',
      "impressionsCustom" TEXT NOT NULL DEFAULT '',
      "airDate" TEXT NOT NULL DEFAULT '',
      "dateUnknown" BOOLEAN NOT NULL DEFAULT false,
      "airMonth" TEXT NOT NULL DEFAULT '',
      "needsVariations" BOOLEAN NOT NULL DEFAULT false,
      "variationsCount" TEXT NOT NULL DEFAULT '0',
      "disclaimerText" TEXT NOT NULL DEFAULT '',
      "extraNote" TEXT NOT NULL DEFAULT '',
      product TEXT NOT NULL DEFAULT '',
      audience TEXT NOT NULL DEFAULT '',
      "decisionMaker" TEXT NOT NULL DEFAULT '',
      "audienceAgeInterests" TEXT NOT NULL DEFAULT '',
      usp TEXT NOT NULL DEFAULT '',
      price BOOLEAN,
      "priceDetail" TEXT NOT NULL DEFAULT '',
      "mainMessage" TEXT NOT NULL DEFAULT '',
      cta TEXT NOT NULL DEFAULT '',
      slogan TEXT NOT NULL DEFAULT '',
      "variationDetail" TEXT NOT NULL DEFAULT '',
      "scriptApproved" BOOLEAN NOT NULL DEFAULT false,
      "generatedScript" TEXT NOT NULL DEFAULT '',
      "generatedVarScript" TEXT NOT NULL DEFAULT '',
      "scriptSource" TEXT NOT NULL DEFAULT '',
      "scriptHistory" TEXT NOT NULL DEFAULT '[]',
      "scriptGeneratedAt" TEXT,
      "editedScript" TEXT,
      "editedVarScript" TEXT,
      "variationScripts" TEXT NOT NULL DEFAULT '[]',
      "voiceGender" TEXT NOT NULL DEFAULT '',
      "voiceAgeRange" TEXT NOT NULL DEFAULT '',
      "voiceStyleTags" TEXT NOT NULL DEFAULT '',
      "voiceNote" TEXT NOT NULL DEFAULT '',
      "selectedVoiceId" TEXT NOT NULL DEFAULT '',
      "selectedVoiceLabel" TEXT NOT NULL DEFAULT '',
      "selectedVoiceTags" TEXT NOT NULL DEFAULT '',
      "selectedTrackId" TEXT NOT NULL DEFAULT '',
      "selectedTrackTitle" TEXT NOT NULL DEFAULT '',
      "selectedTrackArtist" TEXT NOT NULL DEFAULT '',
      "selectedPlaylistId" TEXT NOT NULL DEFAULT '',
      "selectedPlaylistName" TEXT NOT NULL DEFAULT '',
      "selectedTracks" TEXT NOT NULL DEFAULT '[]',
      "toneOfVoice" TEXT NOT NULL DEFAULT '[]',
      "status" TEXT NOT NULL DEFAULT 'todo',
      "assignedTo" TEXT NOT NULL DEFAULT '',
      "dueDate" TEXT NOT NULL DEFAULT '',
      "internalNotes" TEXT NOT NULL DEFAULT '[]',
      "submittedAt" TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );
  `;
  // Backfill for tables created before the status column existed.
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'todo';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "scriptHistory" TEXT NOT NULL DEFAULT '[]';`;
  // Team-only workflow metadata — who's assigned, when it's due, and an
  // internal notes thread, none of it ever exposed to the client-facing
  // brief flow (see ALLOWED_FIELDS, which deliberately excludes all three).
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "assignedTo" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "dueDate" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "internalNotes" TEXT NOT NULL DEFAULT '[]';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "eventLog" TEXT NOT NULL DEFAULT '[]';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "scriptJob" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "additionalContacts" TEXT NOT NULL DEFAULT '[]';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "variationsCount" TEXT NOT NULL DEFAULT '0';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "variationScripts" TEXT NOT NULL DEFAULT '[]';`;
  // Post-production review workflow — see the parseReviewRounds comment
  // near the top of this file.
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "productionStatus" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "reviewRounds" TEXT NOT NULL DEFAULT '[]';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "reviewApprovedAt" TEXT;`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "adminNotifiedAt" TEXT;`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "frameioLink" TEXT NOT NULL DEFAULT '';`;
  // Set the first time a producer opens a brief in the dashboard — see
  // rowToBrief's seenAt comment. Drives the "new, unchecked brief"
  // highlight on the dashboard list.
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "seenAt" TEXT;`;
  // Final delivery (WAV masters) + which candidate track was actually used
  // — see the STRING_COLUMNS/rowToBrief comments above.
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "deliveryLink" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "deliveryRecipientEmail" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "deliveredAt" TEXT;`;
  // Copywriter workflow (see rowToBrief's scriptsReleasedAt/finalizedAt
  // comments). Briefs submitted under the old instant-script flow have a
  // voice/tracks chosen and were never "released": mark them finalized so
  // they keep behaving exactly as before. Briefs on the new flow always
  // either have no voice yet (still being written) or a scriptsReleasedAt,
  // so this can safely run on every cold start.
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "scriptsReleasedAt" TEXT;`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "finalizedAt" TEXT;`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "archivedAt" TEXT;`;
  await sql`UPDATE briefs SET "finalizedAt" = "submittedAt" WHERE "submittedAt" IS NOT NULL AND "finalizedAt" IS NULL AND "scriptsReleasedAt" IS NULL AND "selectedVoiceId" <> '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "usedTrackId" TEXT NOT NULL DEFAULT '';`;
  // Referring agency, frozen at creation time — see the STRING_COLUMNS
  // comment above.
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "agencyCode" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "agencyName" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "agencyContactEmail" TEXT NOT NULL DEFAULT '';`;
  await sql`
    CREATE TABLE IF NOT EXISTS sent_emails (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `;
  // Remembered final-delivery recipients — see the mem.deliveryRecipients
  // comment above. Unique on a case-insensitive email so re-sending to the
  // same address (different casing or not) bumps "lastUsedAt" instead of
  // creating a duplicate suggestion.
  await sql`
    CREATE TABLE IF NOT EXISTS delivery_recipients (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      "lastUsedAt" TEXT NOT NULL
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS delivery_recipients_email_lower_idx ON delivery_recipients (LOWER(email));`;
  // Referring agencies — managed from the dashboard's Agencies screen (see
  // the mem.agencies comment above). Unique on a case-insensitive code so
  // two agencies can't accidentally share (or near-collide on casing of)
  // the same access code.
  await sql`
    CREATE TABLE IF NOT EXISTS agencies (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      "contactEmail" TEXT NOT NULL DEFAULT '',
      "createdAt" TEXT NOT NULL
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS agencies_code_lower_idx ON agencies (LOWER(code));`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "userEmails" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "scriptMode" TEXT NOT NULL DEFAULT 'copywriter';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "formKey" TEXT NOT NULL DEFAULT 'standard';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "formConfig" TEXT NOT NULL DEFAULT '{}';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "agencyId" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "formProfile" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "agencyLogoDark" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "agencyLogoLight" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "logoDark" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "logoLight" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "logoIcon" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS "extraCodes" TEXT NOT NULL DEFAULT '';`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "agencyLogoIcon" TEXT NOT NULL DEFAULT '';`;
  // The Advision logo ships with the app: give any Advision agency without a logo the bundled one.
  await sql`UPDATE agencies SET "logoDark" = '/agency-logos/advision-dark.png', "logoLight" = '/agency-logos/advision-light.png', "logoIcon" = '/agency-logos/advision-icon.png' WHERE "logoDark" = '' AND "logoLight" = '' AND "logoIcon" = '' AND LOWER(name) LIKE '%advision%';`;
  await sql`UPDATE briefs b SET "agencyLogoDark" = a."logoDark", "agencyLogoLight" = a."logoLight", "agencyLogoIcon" = a."logoIcon" FROM agencies a WHERE b."agencyId" = a.id AND (b."agencyLogoDark" <> a."logoDark" OR b."agencyLogoLight" <> a."logoLight" OR b."agencyLogoIcon" <> a."logoIcon");`;
  await sql`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "extraAnswers" TEXT NOT NULL DEFAULT '';`;
  for (const col of ['website', 'companyDescription', 'audienceBoth', 'genderSplit', 'variationsBase', 'scriptAuditStatus', 'scriptAuditNote', 'scriptCounterText', 'scriptAuditedAt', 'scriptAuditReply']) {
    await sql.query(`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS "${col}" TEXT NOT NULL DEFAULT ''`);
  }
  // Link briefs created before agencyId existed to their agency via the code
  // that was frozen on them.
  await sql`UPDATE briefs b SET "agencyId" = a.id FROM agencies a WHERE b."agencyId" = '' AND b."agencyCode" <> '' AND LOWER(b."agencyCode") = LOWER(a.code);`;
  // Indexes for the queries the app actually runs (all IF NOT EXISTS, safe to repeat).
  await sql`CREATE INDEX IF NOT EXISTS briefs_updated_at_idx ON briefs ("updatedAt" DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS briefs_agency_id_idx ON briefs ("agencyId");`;
  await sql`CREATE INDEX IF NOT EXISTS sent_emails_brief_id_idx ON sent_emails (brief_id);`;
}

async function pgCreateBrief(id, agency) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const now = new Date().toISOString();
  await sql`
    INSERT INTO briefs (id, "companyName", "hoofdspotLength", "needsVariations", "disclaimerText", "extraNote", "agencyCode", "agencyName", "agencyContactEmail", "agencyId", "formProfile", "agencyLogoDark", "agencyLogoLight", "agencyLogoIcon", "submittedAt", "createdAt", "updatedAt")
    VALUES (${id}, '', '20', false, '', '', ${agency ? agency.usedCode || agency.code || '' : ''}, ${agency ? agency.name || '' : ''}, ${agency ? agency.contactEmail || '' : ''}, ${agency ? agency.id || '' : ''}, ${agency ? JSON.stringify(resolveFormProfile(agency)) : ''}, ${agency ? agency.logoDark || '' : ''}, ${agency ? agency.logoLight || '' : ''}, ${agency ? agency.logoIcon || '' : ''}, NULL, ${now}, ${now})
  `;
  return pgGetBrief(id);
}

// See memFindAgencyByCode above — same idea, Postgres side.
async function pgFindAgencyByCode(code) {
  await runMigrations();
  if (!(code || '').trim()) return null;
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM agencies`;
  return matchAgencyByCode(rows, code);
}

async function pgFindAgencyByUserEmail(email) {
  await runMigrations();
  const needle = (email || '').trim().toLowerCase();
  if (!needle) return null;
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM agencies`;
  return rows.find((a) => String(a.userEmails || '').split(/[,;\n]+/).includes(needle)) || null;
}

async function pgListAgencies() {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM agencies ORDER BY name ASC`;
  return rows;
}

async function pgCreateAgency({ code, name, contactEmail, ...rest }) {
  await runMigrations();
  const trimmedCode = (code || '').trim();
  const trimmedName = (name || '').trim();
  if (!trimmedCode || !trimmedName) return null;
  const { sql } = await import('@vercel/postgres');
  const entry = { id: nanoid(10), code: trimmedCode, name: trimmedName, contactEmail: (contactEmail || '').trim(), ...normAgencyProfile(rest), createdAt: new Date().toISOString() };
  const all = (await sql`SELECT * FROM agencies`).rows;
  if (codesClash(all, entry.id, codesOfAgency(entry))) return { error: 'duplicate_code' };
  if (!entry.logoDark && !entry.logoLight && !entry.logoIcon) Object.assign(entry, defaultLogosFor(entry.name));
  await sql`
    INSERT INTO agencies (id, code, name, "contactEmail", "userEmails", "scriptMode", "formKey", "formConfig", "logoDark", "logoLight", "logoIcon", "extraCodes", "createdAt")
    VALUES (${entry.id}, ${entry.code}, ${entry.name}, ${entry.contactEmail}, ${entry.userEmails}, ${entry.scriptMode}, ${entry.formKey}, ${entry.formConfig}, ${entry.logoDark}, ${entry.logoLight}, ${entry.logoIcon}, ${entry.extraCodes}, ${entry.createdAt})
  `;
  return entry;
}

async function pgUpdateAgency(id, { code, name, contactEmail, ...rest }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT * FROM agencies WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const sets = [];
  const values = [];
  let i = 1;
  const touched = ['userEmails', 'scriptMode', 'formKey', 'formConfig', 'logoDark', 'logoLight', 'logoIcon', 'extraCodes'].filter((k) => rest[k] !== undefined);
  if (touched.length) {
    const prof = normAgencyProfile(rest, existing.rows[0]);
    for (const k of touched) { sets.push(`"${k}" = $${i++}`); values.push(prof[k]); }
  }
  if (code !== undefined) { sets.push(`code = $${i++}`); values.push((code || '').trim()); }
  if (name !== undefined) { sets.push(`name = $${i++}`); values.push((name || '').trim()); }
  if (contactEmail !== undefined) { sets.push(`"contactEmail" = $${i++}`); values.push((contactEmail || '').trim()); }
  if (!sets.length) return pgGetAgency(id);
  {
    const cur = existing.rows[0];
    const cand = { ...cur, ...(code !== undefined ? { code: (code || '').trim() } : {}), ...(touched.includes('extraCodes') ? { extraCodes: normAgencyProfile(rest, cur).extraCodes } : {}) };
    const all = (await sql`SELECT * FROM agencies`).rows;
    if (codesClash(all, id, codesOfAgency(cand))) return { error: 'duplicate_code' };
  }
  values.push(id);
  await sql.query(`UPDATE agencies SET ${sets.join(', ')} WHERE id = $${i}`, values);
  const updated = await pgGetAgency(id);
  if (updated) await sql`UPDATE briefs SET "agencyLogoDark" = ${updated.logoDark || ''}, "agencyLogoLight" = ${updated.logoLight || ''}, "agencyLogoIcon" = ${updated.logoIcon || ''} WHERE "agencyId" = ${id}`;
  return updated;
}

async function pgGetAgency(id) {
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM agencies WHERE id = ${id}`;
  return rows[0] || null;
}

async function pgDeleteAgency(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rowCount } = await sql`DELETE FROM agencies WHERE id = ${id}`;
  return rowCount > 0;
}

async function pgGetBrief(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM briefs WHERE id = ${id}`;
  return rowToBrief(rows[0]);
}

async function pgListBriefs() {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM briefs ORDER BY "updatedAt" DESC`;
  return rows.map(rowToBrief);
}

// Column names are drawn only from ALLOWED_FIELDS/EDIT_FIELDS (a fixed,
// hard-coded list), never from request input, so building this SQL by
// string interpolation is safe — only the VALUES are parameterized.
async function pgUpdateBrief(id, patch) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;

  const sets = [];
  const values = [];
  let i = 1;
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const coerced = coerceValue(key, patch[key]);
      sets.push(`"${key}" = $${i++}`);
      values.push(BOOL_FIELDS.has(key) ? !!coerced : coerced);
    }
  }
  // See memUpdateBrief for the semantics of `submitted` / `finalized`.
  if (Object.prototype.hasOwnProperty.call(patch, 'submitted') && patch.submitted) {
    const cur = await sql`SELECT "submittedAt" FROM briefs WHERE id = ${id}`;
    if (!cur.rows[0].submittedAt) {
      sets.push(`"submittedAt" = $${i++}`);
      values.push(new Date().toISOString());
      sets.push(`"productionStatus" = 'script_writing'`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'finalized') && patch.finalized) {
    const cur = await sql`SELECT "finalizedAt", "scriptsReleasedAt" FROM briefs WHERE id = ${id}`;
    if (!cur.rows[0].finalizedAt && cur.rows[0].scriptsReleasedAt) {
      sets.push(`"finalizedAt" = $${i++}`);
      values.push(new Date().toISOString());
      sets.push(`"productionStatus" = ''`);
      sets.push(`"status" = 'todo'`);
    }
  }
  if (sets.length === 0) return pgGetBrief(id);

  sets.push(`"updatedAt" = $${i++}`);
  values.push(new Date().toISOString());
  values.push(id);

  const query = `UPDATE briefs SET ${sets.join(', ')} WHERE id = $${i}`;
  await sql.query(query, values);
  return pgGetBrief(id);
}

async function pgSaveEdit(id, patch) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;

  const sets = [];
  const values = [];
  let i = 1;
  for (const key of EDIT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`"${key}" = $${i++}`);
      values.push(patch[key] === null ? null : String(patch[key]));
    }
  }
  if (sets.length === 0) return pgGetBrief(id);

  sets.push(`"updatedAt" = $${i++}`);
  values.push(new Date().toISOString());
  values.push(id);

  const query = `UPDATE briefs SET ${sets.join(', ')} WHERE id = $${i}`;
  await sql.query(query, values);
  return pgGetBrief(id);
}

async function pgSaveGeneratedScript(id, { main, variation, source }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "scriptHistory" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const now = new Date().toISOString();
  const history = parseScriptHistory(existing.rows[0].scriptHistory);
  history.push({ id: nanoid(10), main: main || '', variation: variation || '', source: source || '', createdAt: now });
  const historyJson = JSON.stringify(history.slice(-MAX_SCRIPT_HISTORY));
  await sql`
    UPDATE briefs SET
      "generatedScript" = ${main || ''},
      "generatedVarScript" = ${variation || ''},
      "scriptSource" = ${source || ''},
      "scriptHistory" = ${historyJson},
      "scriptGeneratedAt" = ${now},
      "editedScript" = NULL,
      "editedVarScript" = NULL,
      "variationScripts" = '[]',
      "variationsBase" = '',
      "scriptApproved" = false,
      "updatedAt" = ${now}
    WHERE id = ${id}
  `;
  return pgGetBrief(id);
}

// Re-points generatedScript/generatedVarScript at one of this brief's
// stored history entries — see memSelectScriptVersion for the in-memory
// twin of this function.
async function pgSelectScriptVersion(id, versionId) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "scriptHistory" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const history = parseScriptHistory(existing.rows[0].scriptHistory);
  const entry = history.find((h) => h.id === versionId);
  if (!entry) return null;
  const now = new Date().toISOString();
  const varJson = draftVariationsJson(entry);
  await sql`
    UPDATE briefs SET
      "generatedScript" = ${entry.main || ''},
      "generatedVarScript" = ${entry.variation || ''},
      "scriptSource" = ${entry.source || ''},
      "scriptGeneratedAt" = ${entry.createdAt},
      "editedScript" = NULL,
      "editedVarScript" = NULL,
      "variationScripts" = ${varJson},
      "variationsBase" = '',
      "scriptApproved" = false,
      "updatedAt" = ${now}
    WHERE id = ${id}
  `;
  return pgGetBrief(id);
}

// See memSaveScriptDrafts — same idea, Postgres side.
async function pgSaveScriptDrafts(id, versions) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const base = Date.now();
  const history = (versions || []).slice(0, MAX_SCRIPT_HISTORY).map((v, i) => ({
    id: nanoid(10),
    main: v.main || '',
    variation: v.variation || '',
    variations: normDraftVariations(v),
    source: v.source || '',
    createdAt: new Date(base + i).toISOString(),
  }));
  const first = history[0];
  const now = new Date().toISOString();
  const varJson = draftVariationsJson(first);
  await sql`
    UPDATE briefs SET
      "scriptHistory" = ${JSON.stringify(history)},
      "generatedScript" = ${first ? first.main : ''},
      "generatedVarScript" = ${first ? first.variation : ''},
      "scriptSource" = ${first ? first.source : ''},
      "scriptGeneratedAt" = ${first ? first.createdAt : null},
      "editedScript" = NULL,
      "editedVarScript" = NULL,
      "variationScripts" = ${varJson},
      "variationsBase" = '',
      "scriptApproved" = false,
      "updatedAt" = ${now}
    WHERE id = ${id}
  `;
  return pgGetBrief(id);
}

async function pgUpdateScriptDraft(id, versionId, { main, variation, variations, recommended, reason }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "scriptHistory", "scriptGeneratedAt", "scriptsReleasedAt" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length || existing.rows[0].scriptsReleasedAt) return null;
  const history = parseScriptHistory(existing.rows[0].scriptHistory);
  const entry = history.find((h) => h.id === versionId);
  if (!entry) return null;
  if (typeof main === 'string') entry.main = main;
  if (typeof variation === 'string') entry.variation = variation;
  if (Array.isArray(variations)) { entry.variations = variations.map((x) => String(x || '')); entry.variation = entry.variations[0] || entry.variation || ''; }
  applyRecommendation(history, entry, recommended, reason);
  const now = new Date().toISOString();
  if (entry.createdAt === existing.rows[0].scriptGeneratedAt) {
    if (Array.isArray(variations)) {
      await sql`UPDATE briefs SET "scriptHistory" = ${JSON.stringify(history)}, "generatedScript" = ${entry.main || ''}, "generatedVarScript" = ${entry.variation || ''}, "variationScripts" = ${draftVariationsJson(entry)}, "updatedAt" = ${now} WHERE id = ${id}`;
    } else {
      await sql`UPDATE briefs SET "scriptHistory" = ${JSON.stringify(history)}, "generatedScript" = ${entry.main || ''}, "generatedVarScript" = ${entry.variation || ''}, "updatedAt" = ${now} WHERE id = ${id}`;
    }
  } else {
    await sql`UPDATE briefs SET "scriptHistory" = ${JSON.stringify(history)}, "updatedAt" = ${now} WHERE id = ${id}`;
  }
  return pgGetBrief(id);
}

async function pgReleaseScripts(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "scriptHistory", "scriptsReleasedAt" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length || existing.rows[0].scriptsReleasedAt) return null;
  const history = parseScriptHistory(existing.rows[0].scriptHistory).filter((h) => h.main && h.main.trim());
  if (!history.length) return null;
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "scriptsReleasedAt" = ${now}, "productionStatus" = 'script_choosing', "status" = 'pending_customer', "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

async function pgUpdateStatus(id, status) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "status" = ${status}, "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

// See memUpdateTeamMeta above — same idea, Postgres side. Also mirrors its
// choice not to bump updatedAt for a seen-only update.
async function pgUpdateTeamMeta(id, { assignedTo, dueDate, seen, usedTrackId, airDate }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;

  const sets = [];
  const values = [];
  let i = 1;
  if (assignedTo !== undefined) { sets.push(`"assignedTo" = $${i++}`); values.push(assignedTo || ''); }
  if (dueDate !== undefined) { sets.push(`"dueDate" = $${i++}`); values.push(dueDate || ''); }
  if (usedTrackId !== undefined) { sets.push(`"usedTrackId" = $${i++}`); values.push(usedTrackId || ''); }
  if (airDate !== undefined) {
    sets.push(`"airDate" = $${i++}`); values.push(airDate || '');
    if (airDate) { sets.push(`"dateUnknown" = false`); sets.push(`"airMonth" = ''`); }
    sets.push(`"updatedAt" = $${i++}`); values.push(new Date().toISOString());
  }
  if (seen) { sets.push(`"seenAt" = $${i++}`); values.push(new Date().toISOString()); }
  if (sets.length === 0) return pgGetBrief(id);

  if (assignedTo !== undefined || dueDate !== undefined || usedTrackId !== undefined) {
    sets.push(`"updatedAt" = $${i++}`);
    values.push(new Date().toISOString());
  }
  values.push(id);

  const query = `UPDATE briefs SET ${sets.join(', ')} WHERE id = $${i}`;
  await sql.query(query, values);
  return pgGetBrief(id);
}

// See memSaveDelivery above — same idea, Postgres side. The ON CONFLICT
// targets the case-insensitive unique index created in runMigrations.
async function pgSaveDelivery(id, { link, recipientEmail }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const now = new Date().toISOString();
  await sql`
    UPDATE briefs SET
      "deliveryLink" = ${link || ''},
      "deliveryRecipientEmail" = ${recipientEmail || ''},
      "deliveredAt" = ${now},
      "updatedAt" = ${now}
    WHERE id = ${id}
  `;
  const email = (recipientEmail || '').trim();
  if (email) {
    await sql`
      INSERT INTO delivery_recipients (id, email, label, "lastUsedAt")
      VALUES (${nanoid(10)}, ${email}, '', ${now})
      ON CONFLICT (LOWER(email)) DO UPDATE SET "lastUsedAt" = EXCLUDED."lastUsedAt"
    `;
  }
  return pgGetBrief(id);
}

async function pgListDeliveryRecipients() {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM delivery_recipients ORDER BY "lastUsedAt" DESC`;
  return rows;
}

// See memAddInternalNote above — same idea, Postgres side.
async function pgAddInternalNote(id, { author, text }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "internalNotes" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const notes = parseInternalNotes(existing.rows[0].internalNotes);
  notes.push({ id: nanoid(10), author: author || '', text: text || '', createdAt: new Date().toISOString() });
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "internalNotes" = ${JSON.stringify(notes)}, "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

// See memEditInternalNote above — same idea, Postgres side.
async function pgEditInternalNote(id, noteId, text) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "internalNotes" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const notes = parseInternalNotes(existing.rows[0].internalNotes);
  const note = notes.find((n) => n.id === noteId);
  if (!note) return null;
  note.text = text || '';
  note.editedAt = new Date().toISOString();
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "internalNotes" = ${JSON.stringify(notes)}, "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

// See memAddReviewRound above — Postgres side.
async function pgAddReviewRound(id, { frameioLink, folderDate, note }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "reviewRounds", "frameioLink" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const link = (frameioLink || '').trim();
  const finalLink = link || existing.rows[0].frameioLink || '';
  if (!finalLink) return null;
  const rounds = parseReviewRounds(existing.rows[0].reviewRounds);
  rounds.push({
    id: nanoid(10),
    folderDate: folderDate || new Date().toISOString().slice(0, 10),
    note: note || '',
    createdAt: new Date().toISOString(),
    feedback: [],
    approvedAt: null,
  });
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "reviewRounds" = ${JSON.stringify(rounds)}, "frameioLink" = ${finalLink}, "productionStatus" = 'awaiting_review', "status" = 'pending_customer', "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

// See memAddReviewFeedback above — Postgres side.
async function pgAddReviewFeedback(id, { text }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "reviewRounds" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const rounds = parseReviewRounds(existing.rows[0].reviewRounds);
  const last = rounds[rounds.length - 1];
  if (!last) return null;
  last.feedback.push({ id: nanoid(10), text: text || '', createdAt: new Date().toISOString() });
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "reviewRounds" = ${JSON.stringify(rounds)}, "productionStatus" = 'in_revision', "status" = 'in_progress', "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

// See memApproveReview above — Postgres side.
async function pgApproveReview(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "reviewRounds" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const rounds = parseReviewRounds(existing.rows[0].reviewRounds);
  const last = rounds[rounds.length - 1];
  if (!last) return null;
  const now = new Date().toISOString();
  last.approvedAt = now;
  await sql`UPDATE briefs SET "reviewRounds" = ${JSON.stringify(rounds)}, "productionStatus" = 'approved', "status" = 'done', "reviewApprovedAt" = ${now}, "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

async function pgMarkAdminNotified(id) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT id FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const now = new Date().toISOString();
  await sql`UPDATE briefs SET "adminNotifiedAt" = ${now}, "updatedAt" = ${now} WHERE id = ${id}`;
  return pgGetBrief(id);
}

async function pgInsertSentEmail({ id, briefId, to, subject, html }) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  await sql`
    INSERT INTO sent_emails (id, brief_id, to_email, subject, html, created_at)
    VALUES (${id}, ${briefId}, ${to}, ${subject}, ${html}, ${new Date().toISOString()})
  `;
}

async function pgListSentEmails() {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM sent_emails ORDER BY created_at DESC`;
  return rows;
}

// ------------------------------------------------------------------------
// Public API — picks the backend based on POSTGRES_URL
// ------------------------------------------------------------------------
async function createBrief(id, agency) {
  return USE_PG ? pgCreateBrief(id, agency) : memCreateBrief(id, agency);
}
async function getBrief(id) {
  return USE_PG ? pgGetBrief(id) : memGetBrief(id);
}
async function listBriefs() {
  return USE_PG ? pgListBriefs() : memListBriefs();
}
async function updateBrief(id, patch) {
  return USE_PG ? pgUpdateBrief(id, patch) : memUpdateBrief(id, patch);
}
async function saveEdit(id, patch) {
  return USE_PG ? pgSaveEdit(id, patch) : memSaveEdit(id, patch);
}
async function saveGeneratedScript(id, result) {
  return USE_PG ? pgSaveGeneratedScript(id, result) : memSaveGeneratedScript(id, result);
}
async function insertSentEmail(entry) {
  return USE_PG ? pgInsertSentEmail(entry) : memInsertSentEmail(entry);
}
async function listSentEmails() {
  return USE_PG ? pgListSentEmails() : memListSentEmails();
}
async function updateBriefStatus(id, status) {
  if (!STATUS_VALUES.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${STATUS_VALUES.join(', ')}`);
  }
  return USE_PG ? pgUpdateStatus(id, status) : memUpdateStatus(id, status);
}
// ---- Brief history log ------------------------------------------------
// Never throws into the caller's flow: a failed log write must not break
// the action it describes (the caller wraps it, see logBriefEvent below).
async function memAppendEvent(id, event) {
  const row = mem.briefs.get(id);
  if (!row) return null;
  const now = new Date().toISOString();
  row.eventLog = JSON.stringify(addEvent(parseEvents(row.eventLog), event, nanoid(10), now));
  return true;
}
async function pgAppendEvent(id, event) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "eventLog" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return null;
  const now = new Date().toISOString();
  const list = addEvent(parseEvents(existing.rows[0].eventLog), event, nanoid(10), now);
  await sql`UPDATE briefs SET "eventLog" = ${JSON.stringify(list)} WHERE id = ${id}`;
  return true;
}
// Background script writer state: JSON string, or '' when idle.
async function setScriptJob(id, job) {
  const value = job ? JSON.stringify(job) : '';
  if (!USE_PG) {
    const row = mem.briefs.get(id);
    if (!row) return null;
    row.scriptJob = value;
    return true;
  }
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  await sql`UPDATE briefs SET "scriptJob" = ${value} WHERE id = ${id}`;
  return true;
}
async function logBriefEvent(id, event) {
  try {
    return USE_PG ? await pgAppendEvent(id, event) : await memAppendEvent(id, event);
  } catch (err) {
    console.error('[db] logBriefEvent failed:', err && err.message);
    return null;
  }
}

// ---- Replace / remove / add one script proposal (before release) ----------
function newProposalEntry(v) {
  const entry = {
    id: nanoid(10),
    main: v.main || '',
    variation: '',
    variations: normDraftVariations(v),
    source: v.source || '',
    createdAt: new Date().toISOString(),
  };
  entry.variation = entry.variations[0] || '';
  if (v.comment) entry.comment = String(v.comment).slice(0, 1000);
  return entry;
}
// Returns { brief } or { error }.
async function memEditProposals(id, op) {
  const row = mem.briefs.get(id);
  if (!row) return { error: 'not_found' };
  if (row.scriptsReleasedAt) return { error: 'already_released' };
  const out = applyProposalOp(parseScriptHistory(row.scriptHistory), op.version ? { ...op, version: newProposalEntry(op.version) } : op);
  if (out.error) return out;
  const first = out.history[0];
  row.scriptHistory = JSON.stringify(out.history);
  row.generatedScript = first ? first.main : '';
  row.generatedVarScript = first ? first.variation : '';
  row.scriptSource = first ? first.source : '';
  row.scriptGeneratedAt = first ? first.createdAt : null;
  row.variationScripts = draftVariationsJson(first);
  row.updatedAt = new Date().toISOString();
  return { brief: rowToBrief(row) };
}
async function pgEditProposals(id, op) {
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  const existing = await sql`SELECT "scriptHistory", "scriptsReleasedAt" FROM briefs WHERE id = ${id}`;
  if (!existing.rows.length) return { error: 'not_found' };
  if (existing.rows[0].scriptsReleasedAt) return { error: 'already_released' };
  const out = applyProposalOp(parseScriptHistory(existing.rows[0].scriptHistory), op.version ? { ...op, version: newProposalEntry(op.version) } : op);
  if (out.error) return out;
  const first = out.history[0];
  const now = new Date().toISOString();
  await sql`
    UPDATE briefs SET
      "scriptHistory" = ${JSON.stringify(out.history)},
      "generatedScript" = ${first ? first.main : ''},
      "generatedVarScript" = ${first ? first.variation : ''},
      "scriptSource" = ${first ? first.source : ''},
      "scriptGeneratedAt" = ${first ? first.createdAt : null},
      "variationScripts" = ${draftVariationsJson(first)},
      "updatedAt" = ${now}
    WHERE id = ${id}
  `;
  return { brief: await pgGetBrief(id) };
}
async function editScriptProposals(id, op) {
  return USE_PG ? pgEditProposals(id, op) : memEditProposals(id, op);
}

async function saveScriptDrafts(id, versions) {
  return USE_PG ? pgSaveScriptDrafts(id, versions) : memSaveScriptDrafts(id, versions);
}
async function updateScriptDraft(id, versionId, data) {
  return USE_PG ? pgUpdateScriptDraft(id, versionId, data) : memUpdateScriptDraft(id, versionId, data);
}
async function releaseScripts(id) {
  return USE_PG ? pgReleaseScripts(id) : memReleaseScripts(id);
}
async function selectScriptVersion(id, versionId) {
  return USE_PG ? pgSelectScriptVersion(id, versionId) : memSelectScriptVersion(id, versionId);
}
async function reopenScripts(id) {
  return USE_PG ? pgReopenScripts(id) : memReopenScripts(id);
}
async function saveScriptAudit(id, patch) {
  return USE_PG ? pgSaveScriptAudit(id, patch) : memSaveScriptAudit(id, patch);
}
async function updateBriefTeamMeta(id, meta) {
  return USE_PG ? pgUpdateTeamMeta(id, meta) : memUpdateTeamMeta(id, meta);
}
async function addInternalNote(id, note) {
  return USE_PG ? pgAddInternalNote(id, note) : memAddInternalNote(id, note);
}
async function editInternalNote(id, noteId, text) {
  return USE_PG ? pgEditInternalNote(id, noteId, text) : memEditInternalNote(id, noteId, text);
}
async function addReviewRound(id, data) {
  return USE_PG ? pgAddReviewRound(id, data) : memAddReviewRound(id, data);
}
async function addReviewFeedback(id, data) {
  return USE_PG ? pgAddReviewFeedback(id, data) : memAddReviewFeedback(id, data);
}
async function approveReview(id) {
  return USE_PG ? pgApproveReview(id) : memApproveReview(id);
}
async function markAdminNotified(id) {
  return USE_PG ? pgMarkAdminNotified(id) : memMarkAdminNotified(id);
}
async function saveDelivery(id, data) {
  return USE_PG ? pgSaveDelivery(id, data) : memSaveDelivery(id, data);
}
async function listDeliveryRecipients() {
  return USE_PG ? pgListDeliveryRecipients() : memListDeliveryRecipients();
}
async function findAgencyByCode(code) {
  return USE_PG ? pgFindAgencyByCode(code) : memFindAgencyByCode(code);
}
async function findAgencyByUserEmail(email) {
  return USE_PG ? pgFindAgencyByUserEmail(email) : memFindAgencyByUserEmail(email);
}
async function listAgencies() {
  return USE_PG ? pgListAgencies() : memListAgencies();
}
async function createAgency(data) {
  return USE_PG ? pgCreateAgency(data) : memCreateAgency(data);
}
async function updateAgency(id, data) {
  return USE_PG ? pgUpdateAgency(id, data) : memUpdateAgency(id, data);
}
async function deleteAgency(id) {
  return USE_PG ? pgDeleteAgency(id) : memDeleteAgency(id);
}

// Cheap liveness probe for /api/health: 'memory' when no Postgres is configured.
async function pingDb() {
  if (!USE_PG) return 'memory';
  await runMigrations();
  const { sql } = await import('@vercel/postgres');
  await sql`SELECT 1`;
  return 'postgres';
}

module.exports = {
  pingDb,
  USE_PG,
  runMigrations,
  createBrief,
  getBrief,
  listBriefs,
  updateBrief,
  saveEdit,
  saveGeneratedScript,
  saveScriptDrafts,
  editScriptProposals,
  logBriefEvent,
  setScriptJob,
  updateScriptDraft,
  releaseScripts,
  selectScriptVersion,
  insertSentEmail,
  listSentEmails,
  updateBriefStatus,
  setBriefsArchived,
  updateBriefTeamMeta,
  saveScriptAudit,
  reopenScripts,
  addInternalNote,
  editInternalNote,
  addReviewRound,
  addReviewFeedback,
  approveReview,
  markAdminNotified,
  saveDelivery,
  listDeliveryRecipients,
  findAgencyByCode,
  findAgencyByUserEmail,
  listAgencies,
  createAgency,
  updateAgency,
  deleteAgency,
  ALLOWED_FIELDS,
  BOOL_FIELDS,
  TRISTATE_FIELDS,
  EDIT_FIELDS,
  STATUS_VALUES,
  DEFAULT_STATUS,
  MAX_SCRIPT_HISTORY,
};
